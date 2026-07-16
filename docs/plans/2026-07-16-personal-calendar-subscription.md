# Personal Calendar Subscription Implementation Plan

> **For Hermes:** Implement task-by-task with strict red-green-refactor TDD.

**Goal:** Add a private, revocable, read-only ICS feed and one-time ICS snapshot that mirror Floreren's grouped actionable Calendar work without creating a second source of care truth.

**Architecture:** A pure serializer converts existing Calendar events to RFC 5545 all-day VEVENTs. A hashed opaque token plus JSON filter configuration exposes the same event projection through a public GET-only feed; authenticated endpoints manage lifecycle and snapshot download. A Care-planning Settings card manages filters, privacy, copy/download, and revoke/regenerate.

**Tech stack:** FastAPI, asyncpg/Alembic, React/TypeScript, Vitest, pytest, `icalendar` as an independent compatibility parser in tests.

---

### Task 1: Serializer tracer

**Files:**
- Create `backend/services/calendar_ics.py`
- Create `backend/tests/test_calendar_ics.py`
- Modify `backend/requirements.txt`

1. Write a failing parser-based test for valid VCALENDAR output, all-day DTSTART/DTEND, localized summary/description, escaped Unicode text, deep link, and stable UID after rescheduling.
2. Run the focused test and confirm the missing-module failure.
3. Implement the smallest pure serializer and stable UID helper.
4. Run the focused test green.

### Task 2: Token persistence and lifecycle API

**Files:**
- Create `backend/alembic/versions/0047_add_calendar_subscription.py`
- Modify `backend/tests/conftest.py`
- Create `backend/routers/calendar_subscription.py`
- Create `backend/tests/test_calendar_subscription.py`
- Modify `backend/main.py`

1. Write failing tests for create/status/revoke, household-owned map validation, raw-token one-time response, hash-only persistence, and revoked-token rejection.
2. Add the migration and API implementation.
3. Run focused tests green.

### Task 3: Feed and snapshot behavior

**Files:**
- Modify `backend/routers/calendar_subscription.py`
- Modify `backend/tests/test_calendar_subscription.py`

1. Add failing tests for public read-only feed, actionable-context filtering, map/care filters, privacy mode, NL/EN output, ETag/304, private cache headers, and authenticated snapshot download.
2. Reuse `routers.calendar.list_calendar_events` with explicit date range and grouping; filter before serialization.
3. Run parser and API tests green.

### Task 4: Settings card

**Files:**
- Create `frontend/src/pages/settings/CalendarSubscriptionSettings.tsx`
- Create `frontend/src/pages/settings/CalendarSubscriptionSettings.test.ts`
- Modify `frontend/src/pages/Settings.tsx`
- Modify `frontend/src/api/client.ts`
- Modify `frontend/src/i18n/translations.ts`, `en.ts`, `nl.ts`

1. Write failing component tests for semantic title, security warning, filters, generate/copy/download/revoke, and one-time URL behavior.
2. Add typed API methods and the bilingual Settings card under Care planning.
3. Run focused Vitest and exact TypeScript gate.

### Task 5: Provider guidance and verification

**Files:**
- Modify the Settings card/tests as needed.

1. Add bilingual Google/Outlook/Apple guidance that distinguishes subscription from import and states provider-controlled refresh timing.
2. Run backend full pytest, frontend Vitest, i18n lint, `tsc -b --force`, and production build.
3. Perform authenticated visual QA in NL/EN at phone and desktop widths.
4. Run independent security/logic review, commit with `Closes #628`, push, and open the PR.
