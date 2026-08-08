import pytest

from routers import bug_report
from services.feedback_composer import FeedbackDraft


@pytest.fixture
def github_capture(monkeypatch):
    """Stub the GitHub issues API and capture what we would have filed."""
    monkeypatch.setattr(bug_report, "GITHUB_TOKEN", "test-token")
    captured: dict = {}

    class FakeResponse:
        status_code = 201
        text = ""

        def json(self):
            return {"html_url": "https://github.com/leo4226/groei-app/issues/1", "number": 1}

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, json, headers):
            captured["url"] = url
            captured["json"] = json
            return FakeResponse()

    monkeypatch.setattr(bug_report.httpx, "AsyncClient", FakeClient)
    return captured


def _stub_compose(monkeypatch, draft: FeedbackDraft):
    async def fake_compose(report, *, page="", conversation=None):
        return draft

    monkeypatch.setattr(bug_report, "compose_draft", fake_compose)


@pytest.mark.asyncio
async def test_draft_endpoint_composes_without_filing(client, seeded_db, auth_header, monkeypatch):
    _stub_compose(
        monkeypatch,
        FeedbackDraft(
            kind="feature",
            title="Add dark mode",
            body="User wants a dark theme.",
            difficulty="medium",
            composed_by="llm",
        ),
    )

    resp = await client.post(
        "/api/bug-report/draft",
        json={"report": "ik wil graag een donkere modus", "page": "/settings"},
        headers=auth_header,
    )

    assert resp.status_code == 200
    assert resp.json() == {
        "kind": "feature",
        "title": "Add dark mode",
        "body": "User wants a dark theme.",
        "difficulty": "medium",
        "composed_by": "llm",
    }


@pytest.mark.asyncio
async def test_draft_endpoint_rejects_an_empty_report(client, seeded_db, auth_header):
    resp = await client.post("/api/bug-report/draft", json={"report": "   "}, headers=auth_header)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_draft_endpoint_requires_auth(client, seeded_db):
    resp = await client.post("/api/bug-report/draft", json={"report": "broken"})
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_submit_files_a_bug_with_bug_labels(client, seeded_db, auth_header, github_capture):
    resp = await client.post(
        "/api/bug-report",
        json={
            "report": "de waterknop doet niks",
            "kind": "bug",
            "title": "Water button does nothing",
            "body": "Tapping the water button has no effect.",
            "difficulty": "easy",
            "page": "/plants/1",
        },
        headers=auth_header,
    )

    assert resp.status_code == 200
    assert resp.json()["success"] is True
    assert resp.json()["kind"] == "bug"

    sent = github_capture["json"]
    assert sent["title"] == "🐛 Water button does nothing"
    assert sent["labels"] == ["bug", "stekkie", "user-reported", "needs-triage", "difficulty: easy"]


@pytest.mark.asyncio
async def test_submit_files_a_feature_with_enhancement_labels(
    client, seeded_db, auth_header, github_capture
):
    resp = await client.post(
        "/api/bug-report",
        json={
            "report": "ik wil een donkere modus",
            "kind": "feature",
            "title": "Add dark mode",
            "body": "User wants a dark theme.",
        },
        headers=auth_header,
    )

    assert resp.status_code == 200
    sent = github_capture["json"]
    assert sent["title"] == "✨ Add dark mode"
    assert "enhancement" in sent["labels"]
    assert "bug" not in sent["labels"]


@pytest.mark.asyncio
async def test_submit_ignores_client_supplied_labels_and_unknown_kinds(
    client, seeded_db, auth_header, github_capture
):
    resp = await client.post(
        "/api/bug-report",
        json={
            "report": "something",
            "kind": "wontfix",
            "title": "T",
            "body": "B",
            "labels": ["critical", "p0"],
        },
        headers=auth_header,
    )

    assert resp.status_code == 200
    sent = github_capture["json"]
    # Unknown kind falls back to bug; client-supplied labels never reach GitHub.
    assert sent["labels"] == ["bug", "stekkie", "user-reported", "needs-triage"]
    assert "critical" not in sent["labels"]


@pytest.mark.asyncio
async def test_submit_includes_source_context_and_verbatim_report(
    client, seeded_db, auth_header, github_capture
):
    resp = await client.post(
        "/api/bug-report",
        json={
            "report": "de kaart is leeg",
            "kind": "bug",
            "title": "Map renders blank",
            "body": "The garden map renders blank.",
            "page": "/map/tuin",
            "device": {"user_agent": "Mozilla/5.0 (iPhone)", "screen_size": "390x844"},
            "conversation": [
                {"role": "user", "content": "waarom is mijn kaart leeg?"},
                {"role": "assistant", "content": "Dat zou niet moeten gebeuren."},
            ],
        },
        headers=auth_header,
    )

    assert resp.status_code == 200
    body = github_capture["json"]["body"]
    assert "/map/tuin" in body
    assert "account #1" in body
    assert "Mozilla/5.0 (iPhone)" in body
    assert "390x844" in body
    # The composed summary, the user's own words, and the chat all survive.
    assert "The garden map renders blank." in body
    assert "> de kaart is leeg" in body
    assert "User: waarom is mijn kaart leeg?" in body
    assert "Stekkie: Dat zou niet moeten gebeuren." in body


@pytest.mark.asyncio
async def test_submit_attributes_a_fallback_draft_to_the_reporter_not_the_ai(
    client, seeded_db, auth_header, github_capture
):
    """When drafting fell back, the issue must not claim Stekkie wrote it."""
    resp = await client.post(
        "/api/bug-report",
        json={
            "report": "de kaart is leeg",
            "kind": "bug",
            "title": "de kaart is leeg",
            "body": "de kaart is leeg",
            "composed_by": "fallback",
        },
        headers=auth_header,
    )

    assert resp.status_code == 200
    body = github_capture["json"]["body"]
    assert "reporter (AI unavailable)" in body
    assert "Stekkie (AI)" not in body


@pytest.mark.asyncio
async def test_submit_attributes_an_llm_draft_to_stekkie(
    client, seeded_db, auth_header, github_capture
):
    resp = await client.post(
        "/api/bug-report",
        json={
            "report": "de kaart is leeg",
            "kind": "bug",
            "title": "Map renders blank",
            "body": "The garden map renders blank.",
            "composed_by": "llm",
        },
        headers=auth_header,
    )

    assert resp.status_code == 200
    assert "Stekkie (AI)" in github_capture["json"]["body"]


@pytest.mark.asyncio
async def test_submit_does_not_claim_ai_authorship_when_provenance_is_absent(
    client, seeded_db, auth_header, github_capture
):
    """An unknown provenance must not be upgraded to 'written by AI'."""
    resp = await client.post(
        "/api/bug-report",
        json={"report": "x", "kind": "bug", "title": "T", "body": "B"},
        headers=auth_header,
    )

    assert resp.status_code == 200
    assert "Stekkie (AI)" not in github_capture["json"]["body"]


@pytest.mark.asyncio
async def test_submit_composes_when_the_caller_skips_the_preview(
    client, seeded_db, auth_header, github_capture, monkeypatch
):
    _stub_compose(
        monkeypatch,
        FeedbackDraft(
            kind="feature",
            title="Composed server-side",
            body="Body written server-side.",
            composed_by="llm",
        ),
    )

    resp = await client.post(
        "/api/bug-report", json={"report": "een idee"}, headers=auth_header
    )

    assert resp.status_code == 200
    assert github_capture["json"]["title"] == "✨ Composed server-side"


@pytest.mark.asyncio
async def test_submit_lets_the_user_override_the_composed_kind(
    client, seeded_db, auth_header, github_capture, monkeypatch
):
    _stub_compose(
        monkeypatch,
        FeedbackDraft(kind="bug", title="Mislabelled", body="B", composed_by="llm"),
    )

    resp = await client.post(
        "/api/bug-report",
        json={"report": "eigenlijk een wens", "kind": "feature"},
        headers=auth_header,
    )

    assert resp.status_code == 200
    assert github_capture["json"]["title"].startswith("✨")
    assert "enhancement" in github_capture["json"]["labels"]


@pytest.mark.asyncio
async def test_submit_accepts_the_legacy_conversation_only_shape(
    client, seeded_db, auth_header, github_capture, monkeypatch
):
    """Older clients sent only the 3-answer wizard transcript, no `report`."""
    _stub_compose(
        monkeypatch,
        FeedbackDraft(kind="bug", title="Legacy report", body="B", composed_by="fallback"),
    )

    resp = await client.post(
        "/api/bug-report",
        json={
            "conversation": [
                {"role": "assistant", "content": "Waar was je?"},
                {"role": "user", "content": "Op de plantenpagina"},
                {"role": "assistant", "content": "Wat gebeurde er?"},
                {"role": "user", "content": "Niks"},
            ],
            "page": "/plants",
        },
        headers=auth_header,
    )

    assert resp.status_code == 200
    body = github_capture["json"]["body"]
    assert "Op de plantenpagina" in body
    assert "Niks" in body


@pytest.mark.asyncio
async def test_submit_rejects_an_empty_report(client, seeded_db, auth_header, github_capture):
    resp = await client.post("/api/bug-report", json={"report": ""}, headers=auth_header)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_submit_reports_a_github_failure(client, seeded_db, auth_header, monkeypatch):
    monkeypatch.setattr(bug_report, "GITHUB_TOKEN", "test-token")

    class FailingResponse:
        status_code = 422
        text = "Validation Failed"

        def json(self):
            return {}

    class FailingClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, *a, **k):
            return FailingResponse()

    monkeypatch.setattr(bug_report.httpx, "AsyncClient", FailingClient)

    resp = await client.post(
        "/api/bug-report",
        json={"report": "x", "kind": "bug", "title": "T", "body": "B"},
        headers=auth_header,
    )
    assert resp.status_code == 502
