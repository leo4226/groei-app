import os
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from auth import get_current_account
from database import db_dep
from services.db_adapter import DbAdapter

router = APIRouter()

GITHUB_REPO = os.getenv("BUG_REPORT_REPO", "leo4226/groei-app")
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
GITHUB_API = "https://api.github.com"


class ChatMessage(BaseModel):
    role: str
    content: str


class DeviceInfo(BaseModel):
    user_agent: str = ""
    screen_size: str = ""


class BugReportRequest(BaseModel):
    conversation: list[ChatMessage]
    page: str = ""
    device: DeviceInfo = DeviceInfo()


class BugReportResponse(BaseModel):
    success: bool
    issue_url: str | None = None
    issue_number: int | None = None
    error: str | None = None


@router.post("/bug-report", response_model=BugReportResponse)
async def submit_bug_report(
    req: BugReportRequest,
    account=Depends(get_current_account),
    db: DbAdapter = Depends(db_dep),
):
    """Create a GitHub issue from Stekkie bug report conversation."""
    if not GITHUB_TOKEN:
        raise HTTPException(status_code=500, detail="Bug report token not configured")

    # Fetch account name
    rows = await db.execute_fetchall(
        "SELECT name FROM accounts WHERE id = ?", (account["account_id"],)
    )
    account_name = rows[0]["name"] if rows else "Unknown"

    # Extract user answers — filter out assistant messages and the bug report header
    user_answers = [
        m.content for m in req.conversation
        if m.role == "user"
    ]

    # Build structured GitHub issue body
    from datetime import datetime, timezone
    date_str = datetime.now(timezone.utc).isoformat()[:10]

    device_lines = []
    if req.device.user_agent:
        device_lines.append(f"**Device:** {req.device.user_agent[:200]}")
    if req.device.screen_size:
        device_lines.append(f"**Screen:** {req.device.screen_size}")

    body_parts = [
        "## Bug Report (via Stekkie)",
        "",
        f"**What were you doing?** {user_answers[0] if len(user_answers) > 0 else 'N/A'}",
        "",
        f"**What happened?** {user_answers[1] if len(user_answers) > 1 else 'N/A'}",
        "",
        f"**Last step before the bug:** {user_answers[2] if len(user_answers) > 2 else 'N/A'}",
        "",
        "---",
        f"*Reported by: {account_name} (account #{account['account_id']})*",
        f"*Page: {req.page or 'N/A'}*",
        f"*Date: {date_str}*",
        "",
    ] + device_lines

    # Generate title: combine context (Q1) + symptom (Q2), capped at 120 chars
    title = "Bug report (no details)"
    if len(user_answers) >= 2:
        combined = f"{user_answers[0][:60]} — {user_answers[1][:60]}"
        title = combined[:120]
    elif user_answers:
        title = user_answers[0][:120]

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{GITHUB_API}/repos/{GITHUB_REPO}/issues",
                json={
                    "title": title,
                    "body": "\n".join(body_parts),
                    "labels": ["bug", "stekkie", "user-reported", "needs-triage"],
                },
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
            )

    except httpx.RequestError as e:
        raise HTTPException(
            status_code=502,
            detail=f"GitHub API unreachable: {e}",
        )
