# Admin Page — Design Spec
_2026-05-21_

## Overview

A professional admin panel for Floreren, accessible only to `leon_korbee@hotmail.com`. Uses a sidebar-nav layout: persistent left nav, top bar with branding and logged-in email, scrollable main content area. Matches the Floreren botanical design language (warm paper palette, Fraunces/Inter/JetBrains Mono typography, green primary accent).

The panel lives at `/admin` and is a single-page React app that renders different section views based on the active nav item. It is completely separate from the main user-facing app — no bottom nav, no PageDecor, its own layout shell.

---

## Architecture

### Frontend

**Route:** `/admin` — protected by a gate component that checks the current account's email against `leon_korbee@hotmail.com`. Anyone else is redirected to `/dashboard`.

**File:** `frontend/src/pages/AdminPage.tsx`

A single file containing:
- `AdminPage` — top-level layout: topbar + sidebar + content area
- `AdminNav` — sidebar navigation, drives `activeSection` state
- One view component per section: `OverviewView`, `UsersView`, `PlantsView`, `SpeciesView`, `ToolsView`, `ActivityView`

Each view fetches its own data on mount. No shared state store — admin data is ephemeral and only needed while the panel is open.

### Backend

New router: `backend/routers/admin_panel.py`, registered at prefix `/admin-panel`. All endpoints require the request's account to be `leon_korbee@hotmail.com` — enforced by a shared `require_admin` dependency.

Existing `/admin/*` endpoints (backfill tools) are left as-is and reused from the Tools view.

---

## Sections

### 1. Overview
Landing page of the admin panel.

**Stats row (4 cards):**
- Total accounts
- Total plants
- Total maps
- Plants with missing icons (icon_key IS NULL)

**Two-column body:**
- Recent accounts table (last 10 signups) — name, household, join date, status pill (Admin / Active / No plants)
- Recent activity feed (last 10 events) — new registrations, icon requests, tool runs

**Quick tools strip** — Run buttons for the two existing backfill endpoints, with inline success/error feedback.

Backend endpoint: `GET /admin-panel/overview` — returns all stats and recent rows in one call to avoid waterfall fetches.

### 2. Users
Full account list across all households.

**Table columns:** Name · Email · Household · Plants · Maps · Join date · Actions

**Actions per row:**
- View detail drawer (household members, plants count, maps count, last care log)
- Delete account — confirmation modal, cascades deletion of the entire household (plants, maps, care logs, users). Uses existing `DELETE /admin/accounts/{id}`.

**Filter bar:** search by name/email, filter by "No plants" or "No maps" to spot inactive accounts.

Backend endpoint: `GET /admin-panel/users` — accounts joined with household stats (plant count, map count, last activity).

### 3. Plants
Browse all plants across all households.

**Table columns:** Name · Species · Household · Map · Icon · Thresholds · Phase

**Filters:** by household, by missing icon (`icon_requested = true`), by missing thresholds.

No destructive actions here — read-only view to spot data quality gaps.

Backend endpoint: `GET /admin-panel/plants` — all active plants with household name, icon_key, has_thresholds boolean.

### 4. Species
Browse the species catalogue.

**Table columns:** Scientific name · Common name · Icon · Plants using it · Care intervals · Thresholds cached

**Filters:** missing icon, missing thresholds.

Read-only. Useful for spotting gaps in the species catalogue before adding new icons.

Backend endpoint: `GET /admin-panel/species` — all species with plant count and coverage flags.

### 5. Tools
Full maintenance toolbox.

**Tool cards (each with Run button + last-run timestamp + result summary):**
- Backfill thresholds — generate care thresholds for plants missing them
- Backfill care schedules — seed water schedules for plants with thresholds but no schedule

Each Run shows an inline spinner, then a result summary (e.g. "12 plants updated, 0 failures"). Results are shown inline — no page reload.

Uses existing `POST /admin/backfill-thresholds` and `POST /admin/backfill-care-schedules` endpoints unchanged.

### 6. Activity
Chronological log of platform events.

**Event types shown:**
- New account registered
- Plant added
- Icon requested (`icon_requested = true` plants, ordered by created_at)
- Care log entries (watered, fertilized, etc.) — most recent 50

**Filter:** by event type, by household.

Backend endpoint: `GET /admin-panel/activity` — aggregates recent rows from `accounts`, `plants`, and `care_logs`. No new tables required.

---

## Access Control

**Frontend gate:** `AdminGuard` component wraps the `/admin` route. On mount it reads the current JWT, decodes the email, and redirects to `/dashboard` if it is not `leon_korbee@hotmail.com`. No loading flicker — uses the already-loaded auth state from the store.

**Backend:** All `/admin-panel/*` endpoints share a `require_admin` FastAPI dependency:
```python
async def require_admin(account=Depends(get_current_account)):
    if account["email"] != "leon_korbee@hotmail.com":
        raise HTTPException(403, "Forbidden")
    return account
```

---

## Navigation

No link to `/admin` is shown in the main app's BottomNav or Settings for non-admin users. For the admin account, a small "Admin" link is added to the Settings page footer.

---

## Design language

Matches Floreren's palette exactly:
- Background: `--color-bg` (#F5F0E3), surface: `--color-surface` (#FBF7EE)
- Primary: `--color-primary` (#2F5D3A) for sidebar active state, top bar, buttons
- Typography: Fraunces for headings, Inter for body, JetBrains Mono for labels/badges
- Borders: `--color-border` (#D9CFB8)
- Status pills: green (active), amber (warning), red (overdue) — consistent with main app

---

## What is NOT in scope

- Editing species or plants from the admin panel (read-only for now)
- Email sending or user invitations
- Role management (there is exactly one admin)
- Charts or time-series graphs (counts only)
- Pagination (the app has few users — a simple list is fine for now)
