# Stekkie Bug Report Feature — Design

> **Status:** Approved, ready for implementation
> **Date:** 2026-05-30

## Overview

Users can report bugs conversationally via Stekkie. A "Report a bug" button starts a guided 3-question flow; after answering, a Submit button files the report as a GitHub issue in `leo4226/groei-app`.

---

## User Flow

1. User opens Stekkie chat sheet
2. Taps **"Report a bug"** button at the bottom
3. Chat clears, bug-report mode activates
4. Stekkie asks 3 questions one at a time:
   - Q1: "What went wrong?"
   - Q2: "What did you expect to happen?"
   - Q3: "How can we reproduce it?"
5. After 3rd answer, a **"Submit to GitHub"** button appears
6. User taps Submit → issue filed → Stekkie confirms with link → chat resets after 3s

---

## Frontend (`frontend/src/components/HelpAssistant.tsx`)

New state:
```typescript
const [bugReportMode, setBugReportMode] = useState(false)
const [bugTurnCount, setBugTurnCount] = useState(0)
```

- "Report a bug" button at bottom of sheet (next to dismiss)
- Clicking it: clears messages, sets `bugReportMode = true`, sends `"START_BUG_REPORT"` to `/api/chat` (hidden from UI — replaced by a "Bug report" header label)
- Each user message *after* the trigger increments `bugTurnCount` (trigger itself does not count)
- When `bugTurnCount >= 3`: show **"Submit to GitHub"** button
- Submit: calls `POST /api/bug-report` with `{ conversation: messages, page: window.location.pathname }`
- On success: Stekkie shows confirmation message with issue URL, resets to normal after 3s
- On error: Stekkie shows error message, stays in bug mode

New API call in `frontend/src/api/chat.ts`:
```typescript
export async function submitBugReport(
  conversation: ChatMessage[],
  page: string,
): Promise<{ url: string }>
```

---

## Backend (`backend/routers/bug_report.py`)

New router, registered in `main.py` as `app.include_router(..., prefix="/api")`.

**Endpoint:** `POST /api/bug-report`
- Auth: `get_current_account` (same pattern as all other routers)
- Body: `{ conversation: list[ChatMessage], page: str }`
- Extracts the 3 user answers: all messages where `role == "user"` except the first one (`START_BUG_REPORT`)
- Calls `POST https://api.github.com/repos/leo4226/groei-app/issues`
- Returns `{ url: str }` (the HTML URL of the created issue)

**Issue format:**
```
Title: <first 60 chars of answer 1>

## Bug Report (via Stekkie)

**What went wrong:** <answer 1>
**Expected behavior:** <answer 2>
**Steps to reproduce:** <answer 3>

---
*Reported by: <account name> | Page: <page> | Date: <ISO date>*
```

**Fly secret required:** `GITHUB_TOKEN` — personal access token with `repo` scope (or fine-grained `issues: write` on `leo4226/groei-app`).

Set with:
```bash
flyctl secrets set GITHUB_TOKEN=<token> -a floreren-api
```

---

## Stekkie System Prompt Addition (`C:\Projects\leonnetje-server\app.py`)

Add to system prompt:
```
When the user's message is exactly "START_BUG_REPORT", respond only with:
"What went wrong?" — nothing else, no intro.
After the user's first answer, ask only: "What did you expect to happen?"
After the second answer, ask only: "How can we reproduce it?"
After the third answer, respond only with: "Got it, I'll file this now."
Stay in this pattern — no extra commentary during the bug report flow.
```

---

## Deployment Steps

1. Create GitHub personal access token (`repo` or `issues:write` scope)
2. `flyctl secrets set GITHUB_TOKEN=<token> -a floreren-api`
3. Deploy backend: `flyctl deploy -a floreren-api`
4. Deploy frontend: `npx vercel deploy --prod --yes` (from `frontend/`)
5. Restart local Stekkie server (updated system prompt)
