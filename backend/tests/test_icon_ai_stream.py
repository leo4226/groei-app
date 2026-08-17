"""Icon generation streams, and tolerates what gateways actually send (#890).

Every icon in the last admin run fell back to procedural art with a Cloudflare
524: Nous sits behind Cloudflare, which allows an origin 100 seconds to *start*
responding, and a non-streamed reasoning completion sends nothing until it has
finished thinking. Streaming puts bytes on the wire immediately.

The parsing is where a stream can still go wrong, so it lives in pure functions
and is pinned here — an SSE frame we mishandle is one lost drawing, and the
failure looks exactly like a model that could not draw.
"""
import json

import httpx
import pytest

from services import icon_ai
from services.icon_ai import (
    MAX_TOKENS,
    NON_STREAM_TIMEOUT,
    STREAM_TIMEOUT,
    content_from_sse,
    parse_icon_payload,
)

ICON_JSON = '{"plant_svg": "<g><path d=\\"M 0 0\\"/></g>", "cat": "herb"}'


@pytest.fixture(autouse=True)
def _configured_key(monkeypatch):
    """A key is present unless a test says otherwise — CI has none."""
    monkeypatch.setattr(icon_ai, "LLM_API_KEY", "test-key")


def frame(content=None, **extra):
    delta = {} if content is None else {"content": content}
    delta.update(extra)
    return "data: " + json.dumps({"choices": [{"delta": delta}]})


# ── the timeouts are the actual fix ────────────────────────────────────────

def test_every_timeout_sits_under_cloudflares_window():
    # The old client waited 180s — longer than Cloudflare's ~100s — so it could
    # never fire, and a slow generation always came back as an opaque 524
    # instead of a timeout we could recognise.
    for timeout in (STREAM_TIMEOUT, NON_STREAM_TIMEOUT):
        assert timeout.connect < 100
        assert timeout.read < 100
        assert timeout.write < 100


def test_token_budget_is_in_line_with_the_other_llm_callers():
    # Retained name, inverted meaning — renaming a test reads as deleting one.
    #
    # This used to assert `<= 4000`, on the grounds that 12000 was 3-8x every
    # other caller and the comment defending it ("asks for TWO full SVGs") was
    # stale. The comment was stale; the budget was not. Icons are deliberately
    # *out* of line with the other callers: they run on the pro model and ask
    # for an SVG, which reasons far longer than a fun fact or a care threshold.
    # Being in line with them is what broke it — see the reasoning tests below.
    assert MAX_TOKENS > 4000


def test_the_request_asks_for_a_stream():
    body = icon_ai._request_body("hi", stream=True)
    assert body["stream"] is True
    assert body["max_tokens"] == MAX_TOKENS


# ── SSE assembly ───────────────────────────────────────────────────────────

def test_joins_the_content_deltas_in_order():
    assert content_from_sse([frame("<g>"), frame("</g>"), "data: [DONE]"]) == "<g></g>"


def test_stops_at_done_and_ignores_anything_after():
    assert content_from_sse([frame("a"), "data: [DONE]", frame("b")]) == "a"


def test_skips_keepalives_comments_and_blank_lines():
    lines = ["", ": ping", frame("a"), "   ", "event: message", frame("b")]
    assert content_from_sse(lines) == "ab"


def test_skips_a_malformed_frame_rather_than_losing_the_drawing():
    assert content_from_sse([frame("a"), "data: {not json", frame("b")]) == "ab"


def test_ignores_frames_with_no_content():
    # Reasoning models put thinking in a separate field, and the closing frame
    # usually carries only finish_reason.
    lines = [
        frame(None, reasoning_content="thinking..."),
        frame("real"),
        "data: " + json.dumps({"choices": [{"delta": {}, "finish_reason": "stop"}]}),
    ]
    assert content_from_sse(lines) == "real"


def test_survives_a_frame_with_no_choices():
    assert content_from_sse([json.dumps({"foo": 1}), frame("a")]) == "a"
    assert content_from_sse(["data: " + json.dumps({"choices": []}), frame("a")]) == "a"


def test_empty_stream_yields_empty_string():
    assert content_from_sse([]) == ""
    assert content_from_sse(["data: [DONE]"]) == ""


# ── payload parsing ────────────────────────────────────────────────────────

def test_parses_the_documented_shape():
    out = parse_icon_payload(ICON_JSON)
    assert out["plant_svg"].startswith("<g>")
    assert out["cat"] == "herb"


def test_strips_the_code_fence_the_model_adds_anyway():
    assert parse_icon_payload(f"```json\n{ICON_JSON}\n```")["cat"] == "herb"
    assert parse_icon_payload(f"```\n{ICON_JSON}\n```")["cat"] == "herb"


def test_digs_the_json_out_of_surrounding_prose():
    # Cheaper than losing a whole generation to a stray sentence.
    assert parse_icon_payload(f"Here you go:\n{ICON_JSON}\nHope that helps!")["cat"] == "herb"


def test_defaults_the_category_when_the_model_omits_it():
    assert parse_icon_payload('{"plant_svg": "<g/>"}')["cat"] == "unknown"


@pytest.mark.parametrize("bad", ['{"cat": "herb"}', '{"plant_svg": ""}', "[]"])
def test_rejects_a_reply_with_no_drawing(bad):
    with pytest.raises((ValueError, json.JSONDecodeError)):
        parse_icon_payload(bad)


# ── end to end over a stubbed transport ────────────────────────────────────

@pytest.mark.asyncio
async def test_streams_a_drawing(monkeypatch):
    body = "\n".join([frame(ICON_JSON), "data: [DONE]"])

    def handler(request: httpx.Request) -> httpx.Response:
        assert json.loads(request.content)["stream"] is True
        return httpx.Response(200, text=body)

    _patch_transport(monkeypatch, handler)
    out = await icon_ai.generate_icon_variants(name="Munt", sci="Mentha")
    assert out["cat"] == "herb"


@pytest.mark.asyncio
async def test_falls_back_to_blocking_when_streaming_is_refused(monkeypatch):
    # A gateway that rejects `stream: true` must not take icon generation down.
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        streaming = json.loads(request.content)["stream"]
        seen.append(streaming)
        if streaming:
            return httpx.Response(400, json={"error": "stream unsupported"})
        return httpx.Response(200, json={
            "choices": [{"message": {"content": ICON_JSON}}],
        })

    _patch_transport(monkeypatch, handler)
    out = await icon_ai.generate_icon_variants(name="Munt")
    assert seen == [True, False]
    assert out["cat"] == "herb"


@pytest.mark.asyncio
async def test_an_empty_stream_raises_so_the_caller_can_retry(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        if json.loads(request.content)["stream"]:
            return httpx.Response(200, text="data: [DONE]")
        return httpx.Response(200, json={"choices": [{"message": {"content": ""}}]})

    _patch_transport(monkeypatch, handler)
    with pytest.raises(ValueError):
        await icon_ai.generate_icon_variants(name="Munt")


# ── the reasoning channel ──────────────────────────────────────────────────

def test_collects_reasoning_alongside_content():
    reply = icon_ai.reply_from_sse([
        frame(None, reasoning_content="let me think"),
        frame(None, reasoning=" harder"),
        frame("answer"),
    ])
    assert reply.content == "answer"
    assert reply.reasoning == "let me think harder"


def test_records_a_truncated_finish_reason():
    done = "data: " + json.dumps({"choices": [{"delta": {}, "finish_reason": "length"}]})
    assert icon_ai.reply_from_sse([frame("a"), done]).truncated is True
    assert icon_ai.reply_from_sse([frame("a")]).truncated is False


def test_finds_the_drawing_inside_a_reasoning_transcript():
    # The budget ran out before the model copied its answer into `content`, so
    # the finished drawing is sitting in the thinking. It is already paid for.
    transcript = f"I'll use three leaves.\nSo the answer is:\n{ICON_JSON}\nDone."
    assert parse_icon_payload(transcript)["cat"] == "herb"


def test_prefers_the_last_drawing_when_the_model_revised_itself():
    # A brace-depth scan, not find('{')/rfind('}') — the span across both blobs
    # is not valid JSON, and the second one is the settled answer.
    first = '{"plant_svg": "<g id=\\"draft\\"/>", "cat": "flower"}'
    transcript = f"Draft:\n{first}\nActually a herb:\n{ICON_JSON}"
    out = parse_icon_payload(transcript)
    assert out["cat"] == "herb"
    assert "draft" not in out["plant_svg"]


def test_a_brace_inside_an_svg_path_does_not_unbalance_the_scan():
    payload = '{"plant_svg": "<g><path d=\\"M 0 0\\" data-x=\\"{oops}\\"/></g>", "cat": "fern"}'
    assert parse_icon_payload(f"here:\n{payload}\nbye")["cat"] == "fern"


@pytest.mark.asyncio
async def test_recovers_a_drawing_stranded_in_the_reasoning_channel(monkeypatch):
    # The whole of the last admin run: content empty, budget spent thinking.
    body = "\n".join([
        frame(None, reasoning_content=f"pondering...{ICON_JSON}"),
        "data: " + json.dumps({"choices": [{"delta": {}, "finish_reason": "length"}]}),
        "data: [DONE]",
    ])
    _patch_transport(monkeypatch, lambda request: httpx.Response(200, text=body))
    assert (await icon_ai.generate_icon_variants(name="Munt"))["cat"] == "herb"


@pytest.mark.asyncio
async def test_says_so_when_the_budget_ran_out_with_nothing_usable(monkeypatch):
    # `ValueError: LLM returned empty content` alone sent Leon hunting for bad
    # plant data; the cause was the token budget and the message never said so.
    body = "\n".join([
        frame(None, reasoning_content="thinking with nothing to show for it"),
        "data: " + json.dumps({"choices": [{"delta": {}, "finish_reason": "length"}]}),
        "data: [DONE]",
    ])
    _patch_transport(monkeypatch, lambda request: httpx.Response(200, text=body))
    with pytest.raises(ValueError, match="budget exhausted while reasoning"):
        await icon_ai.generate_icon_variants(name="Munt")


@pytest.mark.asyncio
async def test_a_connection_failure_still_reaches_the_blocking_path(monkeypatch):
    # Not every "streaming is broken" arrives as an HTTP status. A transport or
    # protocol error used to escape the fallback clause entirely.
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        streaming = json.loads(request.content)["stream"]
        seen.append(streaming)
        if streaming:
            raise httpx.ConnectError("connection reset", request=request)
        return httpx.Response(200, json={"choices": [{"message": {"content": ICON_JSON}}]})

    _patch_transport(monkeypatch, handler)
    assert (await icon_ai.generate_icon_variants(name="Munt"))["cat"] == "herb"
    assert seen == [True, False]


@pytest.mark.asyncio
async def test_a_timeout_is_not_retried_blocking(monkeypatch):
    # While streaming, `read` is per-chunk: a timeout means no token arrived for
    # 45s, so the upstream is slow rather than un-streamable. Repeating the same
    # request without streaming burns another 90s to fail identically — the
    # caller's backoff loop is the right place to retry.
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content)["stream"])
        raise httpx.ReadTimeout("too slow", request=request)

    _patch_transport(monkeypatch, handler)
    with pytest.raises(httpx.ReadTimeout):
        await icon_ai.generate_icon_variants(name="Munt")
    assert seen == [True]


@pytest.mark.asyncio
async def test_a_missing_api_key_fails_by_name(monkeypatch):
    # An empty key produced `Authorization: Bearer `, which httpx rejects as an
    # illegal header value — an error naming neither the key nor the config,
    # logged once per retry.
    monkeypatch.setattr(icon_ai, "LLM_API_KEY", "")
    with pytest.raises(RuntimeError, match="NOUS_API_KEY"):
        await icon_ai.generate_icon_variants(name="Munt")


def _patch_transport(monkeypatch, handler):
    """Route every AsyncClient in icon_ai through a MockTransport."""
    real_init = httpx.AsyncClient.__init__

    def init(self, *args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        real_init(self, *args, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "__init__", init)
