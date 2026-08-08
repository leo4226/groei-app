import os
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_account
from database import db_dep
from services.db_adapter import DbAdapter
from services.feedback_composer import (
    VALID_DIFFICULTIES,
    VALID_KINDS,
    FeedbackDraft,
    compose_draft,
    format_transcript,
    truncate_words,
)

router = APIRouter()

GITHUB_REPO = os.getenv("BUG_REPORT_REPO", "leo4226/groei-app")
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
GITHUB_API = "https://api.github.com"

# Labels are derived server-side from the validated `kind` — never taken from
# the client — so a caller can't attach arbitrary labels to the tracker.
KIND_LABELS: dict[str, list[str]] = {
    "bug": ["bug", "stekkie", "user-reported", "needs-triage"],
    "feature": ["enhancement", "stekkie", "user-reported", "needs-triage"],
}
KIND_TITLE_PREFIX = {"bug": "🐛 ", "feature": "✨ "}
GITHUB_TITLE_MAX = 120


class ChatMessage(BaseModel):
    role: str
    content: str


class DeviceInfo(BaseModel):
    user_agent: str = ""
    screen_size: str = ""


class FeedbackDraftRequest(BaseModel):
    """One free-text box, plus whatever context the app can add for free."""
    report: str = ""
    conversation: list[ChatMessage] = []
    page: str = ""
    device: DeviceInfo = DeviceInfo()


class FeedbackDraftResponse(BaseModel):
    kind: str
    title: str
    body: str
    difficulty: str | None = None
    composed_by: str


class BugReportRequest(FeedbackDraftRequest):
    # Sent back from the preview the user confirmed. When absent (a legacy
    # client, or a caller that wants one-shot filing) the server composes.
    kind: str | None = None
    title: str | None = None
    body: str | None = None
    difficulty: str | None = None


class BugReportResponse(BaseModel):
    success: bool
    issue_url: str | None = None
    issue_number: int | None = None
    error: str | None = None
    kind: str | None = None


def _effective_report(req: FeedbackDraftRequest) -> str:
    """The user's own words.

    Normally `report` — the single free-text box. Falls back to the user turns
    of `conversation` so older clients (which only ever sent the 3-answer
    wizard transcript) keep working against this endpoint.
    """
    if req.report.strip():
        return req.report.strip()
    answers = [m.content.strip() for m in req.conversation if m.role == "user" and m.content.strip()]
    return "\n\n".join(answers)


async def _account_name(db: DbAdapter, account_id: int) -> str:
    rows = await db.execute_fetchall(
        "SELECT name FROM accounts WHERE id = ?", (account_id,)
    )
    return rows[0]["name"] if rows else "Unknown"


def _build_issue_body(
    draft: FeedbackDraft,
    *,
    account_name: str,
    account_id: int,
    page: str,
    device: DeviceInfo,
    report: str,
    transcript: str,
) -> str:
    date_str = datetime.now(timezone.utc).isoformat()[:10]

    parts = [
        "## Source",
        "",
        "- **Reported by:** User via Stekkie",
        f"- **Account:** {account_name} (account #{account_id})",
        f"- **Page/context:** {page or 'Unknown'}",
        f"- **Reported at:** {date_str}",
        f"- **Issue text written by:** {'Stekkie (AI)' if draft.composed_by == 'llm' else 'reporter (AI unavailable)'}",
    ]
    if device.user_agent:
        parts.append(f"- **Device:** {device.user_agent[:200]}")
    if device.screen_size:
        parts.append(f"- **Screen:** {device.screen_size}")

    parts += ["", "---", "", draft.body, "", "---", "", "## Reporter's own words", ""]
    parts += [f"> {line}" if line.strip() else ">" for line in report.splitlines()]

    if transcript:
        parts += ["", "## Conversation with Stekkie", "", "```", transcript, "```"]

    return "\n".join(parts)


@router.post("/bug-report/draft", response_model=FeedbackDraftResponse)
async def draft_bug_report(
    req: FeedbackDraftRequest,
    account=Depends(get_current_account),
):
    """Compose (but do not file) a GitHub issue from a free-text report.

    The user confirms the result before anything is created, so this endpoint
    is deliberately side-effect free.
    """
    report = _effective_report(req)
    if not report:
        raise HTTPException(status_code=422, detail="empty_report")

    draft = await compose_draft(
        report,
        page=req.page,
        conversation=[m.model_dump() for m in req.conversation],
    )
    return FeedbackDraftResponse(
        kind=draft.kind,
        title=draft.title,
        body=draft.body,
        difficulty=draft.difficulty,
        composed_by=draft.composed_by,
    )


@router.post("/bug-report", response_model=BugReportResponse)
async def submit_bug_report(
    req: BugReportRequest,
    account=Depends(get_current_account),
    db: DbAdapter = Depends(db_dep),
):
    """File a user's bug report or feature request as a GitHub issue."""
    if not GITHUB_TOKEN:
        raise HTTPException(status_code=500, detail="Bug report token not configured")

    report = _effective_report(req)
    if not report:
        raise HTTPException(status_code=422, detail="empty_report")

    # Prefer the draft the user actually saw and confirmed; compose only if the
    # caller skipped the preview step.
    if req.title and req.title.strip() and req.body and req.body.strip():
        draft = FeedbackDraft(
            kind=req.kind if req.kind in VALID_KINDS else "bug",
            title=truncate_words(req.title.strip().replace("\n", " "), GITHUB_TITLE_MAX),
            body=req.body.strip(),
            difficulty=req.difficulty if req.difficulty in VALID_DIFFICULTIES else None,
            composed_by="llm",
        )
    else:
        draft = await compose_draft(
            report,
            page=req.page,
            conversation=[m.model_dump() for m in req.conversation],
        )
        # The user may still have overridden the kind in the preview.
        if req.kind in VALID_KINDS:
            draft.kind = req.kind

    transcript = format_transcript([m.model_dump() for m in req.conversation])
    body = _build_issue_body(
        draft,
        account_name=await _account_name(db, account["account_id"]),
        account_id=account["account_id"],
        page=req.page,
        device=req.device,
        report=report,
        transcript=transcript,
    )

    labels = list(KIND_LABELS[draft.kind])
    if draft.difficulty:
        labels.append(f"difficulty: {draft.difficulty}")

    title = f"{KIND_TITLE_PREFIX[draft.kind]}{draft.title}"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{GITHUB_API}/repos/{GITHUB_REPO}/issues",
                json={"title": title, "body": body, "labels": labels},
                headers={
                    "Authorization": f"Bearer {GITHUB_TOKEN}",
                    "Accept": "application/vnd.github+json",
                    "User-Agent": "floreren-bug-report/1.0",
                },
            )
            if resp.status_code not in (201,):
                detail = resp.text[:300]
                raise HTTPException(
                    status_code=502,
                    detail=f"GitHub API error ({resp.status_code}): {detail}",
                )

            data = resp.json()
            return BugReportResponse(
                success=True,
                issue_url=data.get("html_url"),
                issue_number=data.get("number"),
                kind=draft.kind,
            )

    except httpx.RequestError as e:
        raise HTTPException(
            status_code=502,
            detail=f"GitHub API unreachable: {e}",
        )
