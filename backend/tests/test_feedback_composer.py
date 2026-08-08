import pytest

from services import feedback_composer as fc


class TestTruncateWords:
    def test_leaves_short_text_alone(self):
        assert fc.truncate_words("Short title", 100) == "Short title"

    def test_collapses_whitespace(self):
        assert fc.truncate_words("a  b\n c", 100) == "a b c"

    def test_cuts_on_a_word_boundary(self):
        result = fc.truncate_words("the quick brown fox jumps over", 15)
        assert result == "the quick brown"
        assert not result.endswith(" ")

    def test_falls_back_when_one_word_exceeds_the_limit(self):
        assert fc.truncate_words("supercalifragilistic", 10) == "supercalif"

    def test_strips_dangling_punctuation(self):
        assert fc.truncate_words("water button broken, and also", 22) == "water button broken"


class TestFallbackDraft:
    def test_uses_the_first_sentence_as_the_title(self):
        draft = fc.fallback_draft("Water button does nothing. I tapped it twice.")
        assert draft.title == "Water button does nothing"
        assert draft.composed_by == "fallback"
        assert draft.kind == "bug"

    def test_keeps_the_full_report_as_the_body(self):
        report = "Line one.\nLine two."
        assert fc.fallback_draft(report).body == report

    def test_never_produces_an_empty_title(self):
        assert fc.fallback_draft("...").title

    def test_honours_an_explicit_kind(self):
        assert fc.fallback_draft("I wish it had dark mode", kind="feature").kind == "feature"


class TestParseLlmDraft:
    def test_parses_a_valid_reply(self):
        draft = fc.parse_llm_draft(
            '{"kind":"feature","title":"Add dark mode","body":"User wants dark mode.",'
            '"difficulty":"medium"}'
        )
        assert draft is not None
        assert draft.kind == "feature"
        assert draft.title == "Add dark mode"
        assert draft.difficulty == "medium"
        assert draft.composed_by == "llm"

    def test_strips_a_markdown_fence(self):
        draft = fc.parse_llm_draft(
            '```json\n{"kind":"bug","title":"Map is blank","body":"The map does not render."}\n```'
        )
        assert draft is not None
        assert draft.title == "Map is blank"

    def test_drops_an_invalid_difficulty_but_keeps_the_draft(self):
        draft = fc.parse_llm_draft(
            '{"kind":"bug","title":"T","body":"B","difficulty":"trivial"}'
        )
        assert draft is not None
        assert draft.difficulty is None

    def test_truncates_an_overlong_title(self):
        draft = fc.parse_llm_draft(
            '{"kind":"bug","title":"%s","body":"B"}' % ("word " * 60).strip()
        )
        assert draft is not None
        assert len(draft.title) <= fc.TITLE_MAX

    @pytest.mark.parametrize(
        "content",
        [
            "",
            "not json at all",
            '{"kind":"wontfix","title":"T","body":"B"}',
            '{"kind":"bug","body":"B"}',
            '{"kind":"bug","title":"   ","body":"B"}',
            '{"kind":"bug","title":"T","body":""}',
            '["bug","T","B"]',
        ],
    )
    def test_rejects_unusable_replies(self, content):
        assert fc.parse_llm_draft(content) is None


class TestFormatTranscript:
    def test_labels_each_speaker(self):
        out = fc.format_transcript(
            [{"role": "user", "content": "hi"}, {"role": "assistant", "content": "hello"}]
        )
        assert out == "User: hi\nStekkie: hello"

    def test_skips_empty_and_unknown_roles(self):
        out = fc.format_transcript(
            [
                {"role": "user", "content": "  "},
                {"role": "system", "content": "ignore me"},
                {"role": "user", "content": "real"},
            ]
        )
        assert out == "User: real"

    def test_keeps_only_the_last_messages(self):
        messages = [{"role": "user", "content": f"m{i}"} for i in range(30)]
        out = fc.format_transcript(messages)
        assert len(out.splitlines()) == fc.MAX_TRANSCRIPT_MESSAGES
        assert "m29" in out
        assert "m0:" not in out

    def test_handles_an_empty_conversation(self):
        assert fc.format_transcript([]) == ""


class TestBuildPrompt:
    def test_includes_the_report_and_context(self):
        prompt = fc.build_prompt("map is blank", page="/map/tuin", transcript="User: help")
        assert "map is blank" in prompt
        assert "/map/tuin" in prompt
        assert "User: help" in prompt

    def test_omits_context_sections_when_absent(self):
        prompt = fc.build_prompt("map is blank")
        assert "App page" not in prompt
        assert "Preceding conversation" not in prompt


@pytest.mark.asyncio
class TestComposeDraft:
    async def test_falls_back_when_no_api_key(self, monkeypatch):
        monkeypatch.setattr(fc, "LLM_API_KEY", "")
        draft = await fc.compose_draft("water button broken")
        assert draft.composed_by == "fallback"
        assert draft.title == "water button broken"

    async def test_uses_the_llm_reply_when_it_parses(self, monkeypatch):
        monkeypatch.setattr(fc, "LLM_API_KEY", "test-key")
        _install_fake_llm(
            monkeypatch,
            status=200,
            payload={
                "choices": [
                    {
                        "message": {
                            "content": '{"kind":"feature","title":"Add dark mode",'
                            '"body":"User wants a dark theme.","difficulty":"medium"}'
                        }
                    }
                ]
            },
        )
        draft = await fc.compose_draft("ik wil graag een donkere modus")
        assert draft.composed_by == "llm"
        assert draft.kind == "feature"
        assert draft.title == "Add dark mode"

    async def test_falls_back_on_a_non_200(self, monkeypatch):
        monkeypatch.setattr(fc, "LLM_API_KEY", "test-key")
        _install_fake_llm(monkeypatch, status=500, payload={})
        draft = await fc.compose_draft("map is blank")
        assert draft.composed_by == "fallback"
        assert draft.body == "map is blank"

    async def test_falls_back_on_unparseable_content(self, monkeypatch):
        monkeypatch.setattr(fc, "LLM_API_KEY", "test-key")
        _install_fake_llm(
            monkeypatch,
            status=200,
            payload={"choices": [{"message": {"content": "sorry, I can't help"}}]},
        )
        draft = await fc.compose_draft("map is blank")
        assert draft.composed_by == "fallback"

    @pytest.mark.parametrize(
        "payload",
        [
            {"choices": None},
            {"choices": []},
            {"choices": [{"message": None}]},
            {"choices": [{}]},
            {},
            {"choices": "not-a-list"},
            [],
        ],
    )
    async def test_falls_back_on_a_200_with_the_wrong_shape(self, monkeypatch, payload):
        """A malformed-but-valid-JSON 200 must not escape as a 500."""
        monkeypatch.setattr(fc, "LLM_API_KEY", "test-key")
        _install_fake_llm(monkeypatch, status=200, payload=payload)
        draft = await fc.compose_draft("map is blank")
        assert draft.composed_by == "fallback"
        assert draft.body == "map is blank"

    async def test_falls_back_on_a_network_error(self, monkeypatch):
        import httpx

        monkeypatch.setattr(fc, "LLM_API_KEY", "test-key")

        class ExplodingClient:
            def __init__(self, *a, **k):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return False

            async def post(self, *a, **k):
                raise httpx.ConnectError("boom")

        monkeypatch.setattr(fc.httpx, "AsyncClient", ExplodingClient)
        draft = await fc.compose_draft("map is blank")
        assert draft.composed_by == "fallback"


def _install_fake_llm(monkeypatch, *, status: int, payload: dict):
    class FakeResponse:
        status_code = status

        def json(self):
            return payload

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, *a, **k):
            return FakeResponse()

    monkeypatch.setattr(fc.httpx, "AsyncClient", FakeClient)
