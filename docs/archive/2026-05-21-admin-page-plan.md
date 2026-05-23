# Admin Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a professional admin panel at `/admin` with sidebar nav, gated to `leon_korbee@hotmail.com`, covering Overview, Users, Plants, Species, Tools, and Activity sections.

**Architecture:** New backend router `admin_panel.py` adds five read endpoints + a `/me` check under `/api/admin-panel/*`, all guarded by a `require_admin` FastAPI dependency that does a DB lookup for the email. The frontend is a single file `AdminPage.tsx` with its own layout shell (no BottomNav, no PageDecor), an `AdminGuard` that calls `/me` on mount, and one view component per section. API functions are added to the existing `client.ts`.

**Tech Stack:** React 19 + TypeScript, FastAPI + asyncpg, inline styles matching Floreren's CSS variable palette, existing `api()` helper in `client.ts`.

---

## File map

| File | Action | Purpose |
|---|---|---|
| `backend/routers/admin_panel.py` | Create | All `/admin-panel/*` endpoints + `require_admin` dependency |
| `backend/main.py` | Modify | Register `admin_panel` router |
| `frontend/src/api/client.ts` | Modify | Add admin panel types + fetch functions |
| `frontend/src/pages/AdminPage.tsx` | Create | Full admin panel — layout, nav, all 6 section views |
| `frontend/src/App.tsx` | Modify | Add `/admin` lazy route |
| `frontend/src/pages/Settings.tsx` | Modify | Add "Admin panel" link for admin account only |

---

## Task 1: Backend router scaffold — `require_admin`, `/me`, register

**Files:**
- Create: `backend/routers/admin_panel.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Create `backend/routers/admin_panel.py` with the router, constant, and `require_admin` dependency**

```python
# backend/routers/admin_panel.py
from fastapi import APIRouter, Depends, HTTPException
from database import db_dep
from auth import get_current_account

router = APIRouter(tags=["admin-panel"])

ADMIN_EMAIL = "leon_korbee@hotmail.com"


async def require_admin(account=Depends(get_current_account), db=Depends(db_dep)):
    """Dependency — verifies the logged-in account is the admin. Returns account dict with email."""
    rows = await db.execute_fetchall(
        "SELECT email FROM accounts WHERE id = ?", (account["account_id"],)
    )
    if not rows or rows[0]["email"] != ADMIN_EMAIL:
        raise HTTPException(403, "Forbidden")
    return {**account, "email": rows[0]["email"]}


@router.get("/admin-panel/me")
async def admin_me(admin=Depends(require_admin)):
    return {"email": admin["email"], "is_admin": True}
```

- [ ] **Step 2: Register the router in `backend/main.py`**

Add to the imports block (after the existing `admin` import):
```python
from routers import admin_panel
```

Add after `app.include_router(admin.router, prefix="/api")`:
```python
app.include_router(admin_panel.router, prefix="/api")
```

- [ ] **Step 3: Start the backend and verify `/api/admin-panel/me` returns 401 without a token**

```bash
curl -s http://localhost:1415/api/admin-panel/me
# Expected: {"detail":"Not authenticated"} with status 403 or 401
```

- [ ] **Step 4: Commit**

```bash
git add backend/routers/admin_panel.py backend/main.py
git commit -m "feat: add admin_panel router with require_admin dependency and /me endpoint"
```

---

## Task 2: Backend — `/overview` endpoint

**Files:**
- Modify: `backend/routers/admin_panel.py`

- [ ] **Step 1: Add the `/overview` endpoint to `admin_panel.py`**

```python
@router.get("/admin-panel/overview")
async def admin_overview(admin=Depends(require_admin), db=Depends(db_dep)):
    total_accounts = (await db.execute_fetchall("SELECT COUNT(*) as n FROM accounts"))[0]["n"]
    total_plants = (await db.execute_fetchall(
        "SELECT COUNT(*) as n FROM plants WHERE is_active = 1"
    ))[0]["n"]
    total_maps = (await db.execute_fetchall("SELECT COUNT(*) as n FROM maps"))[0]["n"]
    missing_icons = (await db.execute_fetchall(
        "SELECT COUNT(*) as n FROM plants WHERE is_active = 1 AND (icon_key IS NULL OR icon_key = '')"
    ))[0]["n"]

    recent_accounts = await db.execute_fetchall("""
        SELECT a.id, a.name, a.email, a.created_at, h.name as household_name,
               (SELECT COUNT(*) FROM plants p
                WHERE p.household_id = a.household_id AND p.is_active = 1) as plant_count
        FROM accounts a
        JOIN households h ON a.household_id = h.id
        ORDER BY a.created_at DESC
        LIMIT 10
    """)

    new_accounts = await db.execute_fetchall("""
        SELECT 'account_registered' as kind, a.name as label, h.name as household,
               a.created_at::text as ts
        FROM accounts a JOIN households h ON a.household_id = h.id
        ORDER BY a.created_at DESC LIMIT 5
    """)
    new_plants = await db.execute_fetchall("""
        SELECT 'plant_added' as kind, p.name as label, h.name as household,
               p.created_at::text as ts
        FROM plants p JOIN households h ON p.household_id = h.id
        WHERE p.is_active = 1
        ORDER BY p.created_at DESC LIMIT 5
    """)
    icon_requests = await db.execute_fetchall("""
        SELECT 'icon_requested' as kind, p.name as label, h.name as household,
               p.created_at::text as ts
        FROM plants p JOIN households h ON p.household_id = h.id
        WHERE p.icon_requested = TRUE
        ORDER BY p.created_at DESC LIMIT 5
    """)

    activity = sorted(
        [dict(r) for r in new_accounts] +
        [dict(r) for r in new_plants] +
        [dict(r) for r in icon_requests],
        key=lambda x: x["ts"] or "",
        reverse=True,
    )[:10]

    return {
        "total_accounts": total_accounts,
        "total_plants": total_plants,
        "total_maps": total_maps,
        "missing_icons": missing_icons,
        "recent_accounts": [dict(r) for r in recent_accounts],
        "recent_activity": activity,
    }
```

- [ ] **Step 2: Test the endpoint with curl (with a valid admin token)**

```bash
curl -s -H "Authorization: Bearer <token>" http://localhost:1415/api/admin-panel/overview | python -m json.tool
# Expected: JSON with total_accounts, total_plants, total_maps, missing_icons, recent_accounts[], recent_activity[]
```

- [ ] **Step 3: Commit**

```bash
git add backend/routers/admin_panel.py
git commit -m "feat: add /admin-panel/overview endpoint"
```

---

## Task 3: Backend — `/users`, `/plants`, `/species`, `/activity` endpoints

**Files:**
- Modify: `backend/routers/admin_panel.py`

- [ ] **Step 1: Add `/users` endpoint**

```python
@router.get("/admin-panel/users")
async def admin_users(admin=Depends(require_admin), db=Depends(db_dep)):
    rows = await db.execute_fetchall("""
        SELECT
            a.id, a.name, a.email, a.created_at::text as created_at,
            h.id as household_id, h.name as household_name,
            (SELECT COUNT(*) FROM plants p
             WHERE p.household_id = a.household_id AND p.is_active = 1) as plant_count,
            (SELECT COUNT(*) FROM maps m
             WHERE m.household_id = a.household_id) as map_count,
            (SELECT MAX(cl.done_at)::text FROM care_log cl
             JOIN plants p ON cl.plant_id = p.id
             WHERE p.household_id = a.household_id) as last_activity
        FROM accounts a
        JOIN households h ON a.household_id = h.id
        ORDER BY a.created_at DESC
    """)
    return [dict(r) for r in rows]
```

- [ ] **Step 2: Add `/plants` endpoint**

```python
@router.get("/admin-panel/plants")
async def admin_plants(admin=Depends(require_admin), db=Depends(db_dep)):
    rows = await db.execute_fetchall("""
        SELECT
            p.id, p.name, p.species, p.icon_key, p.phase,
            p.icon_requested,
            (p.care_thresholds IS NOT NULL) as has_thresholds,
            h.name as household_name,
            p.created_at::text as created_at
        FROM plants p
        JOIN households h ON p.household_id = h.id
        WHERE p.is_active = 1
        ORDER BY p.created_at DESC
    """)
    return [dict(r) for r in rows]
```

- [ ] **Step 3: Add `/species` endpoint**

```python
@router.get("/admin-panel/species")
async def admin_species(admin=Depends(require_admin), db=Depends(db_dep)):
    rows = await db.execute_fetchall("""
        SELECT
            ps.id, ps.scientific_name, ps.common_name_nl, ps.icon_key,
            (ps.care_thresholds IS NOT NULL) as has_thresholds,
            (SELECT COUNT(*) FROM plants p
             WHERE p.species_id = ps.id AND p.is_active = 1) as plant_count
        FROM plant_species ps
        ORDER BY ps.scientific_name
    """)
    return [dict(r) for r in rows]
```

- [ ] **Step 4: Add `/activity` endpoint**

```python
@router.get("/admin-panel/activity")
async def admin_activity(admin=Depends(require_admin), db=Depends(db_dep)):
    new_accounts = await db.execute_fetchall("""
        SELECT 'account_registered' as kind, a.name as label, h.name as household,
               a.created_at::text as ts
        FROM accounts a JOIN households h ON a.household_id = h.id
        ORDER BY a.created_at DESC LIMIT 20
    """)
    new_plants = await db.execute_fetchall("""
        SELECT 'plant_added' as kind, p.name as label, h.name as household,
               p.created_at::text as ts
        FROM plants p JOIN households h ON p.household_id = h.id
        WHERE p.is_active = 1
        ORDER BY p.created_at DESC LIMIT 20
    """)
    icon_requests = await db.execute_fetchall("""
        SELECT 'icon_requested' as kind, p.name as label, h.name as household,
               p.created_at::text as ts
        FROM plants p JOIN households h ON p.household_id = h.id
        WHERE p.icon_requested = TRUE
        ORDER BY p.created_at DESC LIMIT 20
    """)
    care_logs = await db.execute_fetchall("""
        SELECT 'care_log' as kind,
               (cl.care_type || ' · ' || p.name) as label,
               h.name as household,
               cl.done_at::text as ts
        FROM care_log cl
        JOIN plants p ON cl.plant_id = p.id
        JOIN households h ON p.household_id = h.id
        ORDER BY cl.done_at DESC LIMIT 20
    """)

    all_events = (
        [dict(r) for r in new_accounts] +
        [dict(r) for r in new_plants] +
        [dict(r) for r in icon_requests] +
        [dict(r) for r in care_logs]
    )
    all_events.sort(key=lambda x: x["ts"] or "", reverse=True)
    return all_events[:50]
```

- [ ] **Step 5: Commit**

```bash
git add backend/routers/admin_panel.py
git commit -m "feat: add /users, /plants, /species, /activity admin panel endpoints"
```

---

## Task 4: Frontend — API types and fetch functions in `client.ts`

**Files:**
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: Add admin panel types and fetch functions at the end of `client.ts`**

```typescript
// ── Admin panel ──────────────────────────────────────────────────────────────

export interface AdminUserRow {
  id: number
  name: string
  email: string
  created_at: string
  household_id: number
  household_name: string
  plant_count: number
  map_count: number
  last_activity: string | null
}

export interface AdminActivityEvent {
  kind: string
  label: string
  household: string
  ts: string | null
}

export interface AdminOverview {
  total_accounts: number
  total_plants: number
  total_maps: number
  missing_icons: number
  recent_accounts: AdminUserRow[]
  recent_activity: AdminActivityEvent[]
}

export interface AdminPlantRow {
  id: number
  name: string
  species: string | null
  icon_key: string | null
  phase: string
  icon_requested: boolean
  has_thresholds: boolean
  household_name: string
  created_at: string
}

export interface AdminSpeciesRow {
  id: number
  scientific_name: string
  common_name_nl: string | null
  icon_key: string | null
  has_thresholds: boolean
  plant_count: number
}

export const fetchAdminOverview = () =>
  api<AdminOverview>('GET', '/admin-panel/overview')

export const fetchAdminUsers = () =>
  api<AdminUserRow[]>('GET', '/admin-panel/users')

export const fetchAdminPlants = () =>
  api<AdminPlantRow[]>('GET', '/admin-panel/plants')

export const fetchAdminSpecies = () =>
  api<AdminSpeciesRow[]>('GET', '/admin-panel/species')

export const fetchAdminActivity = () =>
  api<AdminActivityEvent[]>('GET', '/admin-panel/activity')

export const runBackfillThresholds = () =>
  api<{ processed: number; succeeded: number; failed: number }>('POST', '/admin/backfill-thresholds')

export const runBackfillCareSchedules = () =>
  api<{ checked: number; seeded: number }>('POST', '/admin/backfill-care-schedules')
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
# Expected: no errors
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/client.ts
git commit -m "feat: add admin panel API types and fetch functions"
```

---

## Task 5: Frontend — `AdminPage.tsx` layout shell, guard, and nav

**Files:**
- Create: `frontend/src/pages/AdminPage.tsx`

- [ ] **Step 1: Create `AdminPage.tsx` with the guard, layout shell, and sidebar nav**

```tsx
// frontend/src/pages/AdminPage.tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchAdminOverview, fetchAdminUsers, fetchAdminPlants,
  fetchAdminSpecies, fetchAdminActivity,
  runBackfillThresholds, runBackfillCareSchedules,
  deleteAdminAccount,
  type AdminOverview, type AdminUserRow, type AdminPlantRow,
  type AdminSpeciesRow, type AdminActivityEvent,
} from '../api/client'

type Section = 'overview' | 'users' | 'plants' | 'species' | 'tools' | 'activity'

const NAV: { id: Section; icon: string; label: string }[] = [
  { id: 'overview', icon: '📊', label: 'Overview' },
  { id: 'users',    icon: '👥', label: 'Users' },
  { id: 'plants',   icon: '🌿', label: 'Plants' },
  { id: 'species',  icon: '🔬', label: 'Species' },
  { id: 'tools',    icon: '🔧', label: 'Tools' },
  { id: 'activity', icon: '📋', label: 'Activity' },
]

export default function AdminPage() {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)
  const [email, setEmail] = useState('')
  const [section, setSection] = useState<Section>('overview')

  useEffect(() => {
    const token = localStorage.getItem('floreren-token')
    if (!token) { navigate('/dashboard', { replace: true }); return }
    fetch('/api/admin-panel/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        if (!r.ok) { navigate('/dashboard', { replace: true }); return null }
        return r.json()
      })
      .then(d => { if (d) { setEmail(d.email); setChecking(false) } })
      .catch(() => navigate('/dashboard', { replace: true }))
  }, [navigate])

  if (checking) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: 'var(--color-bg)', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text-muted)', letterSpacing: '.15em', textTransform: 'uppercase' }}>
      Checking access…
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: 'var(--color-bg)' }}>
      {/* Top bar */}
      <div style={{ background: 'var(--color-primary)', color: '#fff', height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', flexShrink: 0 }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 15, display: 'flex', alignItems: 'center', gap: 10 }}>
          🌿 Floreren
          <span style={{ background: 'rgba(255,255,255,.15)', borderRadius: 4, padding: '2px 8px', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase' }}>Admin</span>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, opacity: .7 }}>{email}</span>
      </div>

      {/* Shell */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <aside style={{ width: 200, background: 'var(--color-surface)', borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', padding: '16px 0', flexShrink: 0, overflowY: 'auto' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.2em', color: 'var(--color-text-muted)', padding: '0 16px 8px' }}>Platform</div>
          {NAV.slice(0, 4).map(item => (
            <NavItem key={item.id} item={item} active={section === item.id} onClick={() => setSection(item.id)} />
          ))}
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.2em', color: 'var(--color-text-muted)', padding: '16px 16px 8px' }}>System</div>
          {NAV.slice(4).map(item => (
            <NavItem key={item.id} item={item} active={section === item.id} onClick={() => setSection(item.id)} />
          ))}
        </aside>

        {/* Main */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
          {section === 'overview'  && <OverviewView onNavigate={setSection} />}
          {section === 'users'     && <UsersView />}
          {section === 'plants'    && <PlantsView />}
          {section === 'species'   && <SpeciesView />}
          {section === 'tools'     && <ToolsView />}
          {section === 'activity'  && <ActivityView />}
        </main>
      </div>
    </div>
  )
}

function NavItem({ item, active, onClick }: { item: typeof NAV[0]; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', width: '100%', textAlign: 'left',
      fontFamily: 'var(--font-body)', fontSize: 13, cursor: 'pointer', border: 'none',
      borderLeft: active ? '3px solid var(--color-primary)' : '3px solid transparent',
      background: active ? 'var(--color-bg-warm)' : 'transparent',
      color: active ? 'var(--color-primary)' : 'var(--color-text-soft)',
      fontWeight: active ? 600 : 400,
      transition: 'all .12s',
    }}>
      <span style={{ width: 16, textAlign: 'center' }}>{item.icon}</span>
      {item.label}
    </button>
  )
}

// Shared helpers
function PageHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ marginBottom: 24, paddingBottom: 18, borderBottom: '1px solid var(--color-border)' }}>
      <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 26, letterSpacing: '-.02em', margin: '0 0 4px' }}>{title}</h1>
      <p style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 13, color: 'var(--color-text-soft)', margin: 0 }}>{sub}</p>
    </div>
  )
}

function Pill({ label, tone }: { label: string; tone: 'green' | 'amber' | 'red' | 'muted' }) {
  const styles: Record<string, { color: string; bg: string; border: string }> = {
    green: { color: 'var(--color-primary)',    bg: 'rgba(47,93,58,.1)',      border: 'rgba(47,93,58,.2)' },
    amber: { color: '#9A7010',                 bg: 'rgba(217,164,24,.12)',   border: 'rgba(217,164,24,.25)' },
    red:   { color: 'var(--color-overdue)',    bg: 'rgba(178,102,74,.1)',    border: 'rgba(178,102,74,.2)' },
    muted: { color: 'var(--color-text-muted)', bg: 'rgba(138,148,130,.08)', border: 'var(--color-border-soft)' },
  }
  const s = styles[tone]
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.1em', color: s.color, background: s.bg, border: `1px solid ${s.border}` }}>
      {label}
    </span>
  )
}

function SectionCard({ title, action, children }: { title: string; action?: { label: string; onClick: () => void }; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
      <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.18em', color: 'var(--color-text-soft)' }}>{title}</span>
        {action && <button onClick={action.onClick} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '.1em' }}>{action.label}</button>}
      </div>
      {children}
    </div>
  )
}

function AdminTable({ heads, children }: { heads: string[]; children: React.ReactNode }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {heads.map(h => (
            <th key={h} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.15em', color: 'var(--color-text-muted)', padding: '10px 18px', textAlign: 'left', borderBottom: '1px solid var(--color-border-soft)' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  )
}

function Td({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <td style={{ padding: '10px 18px', fontSize: 12, fontFamily: mono ? 'var(--font-mono)' : 'var(--font-body)', color: 'var(--color-text)', borderBottom: '1px dashed var(--color-border-soft)', verticalAlign: 'middle' }}>
      {children}
    </td>
  )
}

function Loading() {
  return <div style={{ padding: '40px 18px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-muted)', letterSpacing: '.15em', textTransform: 'uppercase' }}>Loading…</div>
}

function ErrorMsg({ msg }: { msg: string }) {
  return <div style={{ padding: '16px 18px', color: 'var(--color-overdue)', fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 13 }}>{msg}</div>
}

// ── Section views (stubs — filled in subsequent tasks) ────────────────────────
function OverviewView(_: { onNavigate: (s: Section) => void }) { return <div><PageHeader title="Overview" sub="Platform health at a glance" /><Loading /></div> }
function UsersView() { return <div><PageHeader title="Users" sub="All accounts" /><Loading /></div> }
function PlantsView() { return <div><PageHeader title="Plants" sub="All plants" /><Loading /></div> }
function SpeciesView() { return <div><PageHeader title="Species" sub="Species catalogue" /><Loading /></div> }
function ToolsView() { return <div><PageHeader title="Tools" sub="Maintenance" /><Loading /></div> }
function ActivityView() { return <div><PageHeader title="Activity" sub="Recent events" /><Loading /></div> }
```

- [ ] **Step 2: Verify TypeScript compiles with no errors**

```bash
cd frontend && npx tsc --noEmit
# Expected: no errors
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/AdminPage.tsx
git commit -m "feat: add AdminPage layout shell with guard, sidebar nav, and shared helpers"
```

---

## Task 6: Frontend — Wire route + Settings link, then fill `OverviewView` and `ToolsView`

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/pages/Settings.tsx`
- Modify: `frontend/src/pages/AdminPage.tsx`

- [ ] **Step 1: Add the `/admin` lazy route to `App.tsx`**

Add to the lazy imports at the top of `App.tsx`:
```typescript
const AdminPage = lazy(() => import('./pages/AdminPage'))
```

Add inside `<Routes>` after the `/login` route:
```tsx
<Route
  path="/admin"
  element={
    <RequireAuth>
      <AdminPage />
    </RequireAuth>
  }
/>
```

- [ ] **Step 2: Add "Admin panel" link to `Settings.tsx`**

Find where `adminAccounts` is rendered in `Settings.tsx`. Below the last element in the settings page (before the closing `</div>`), add:

```tsx
{adminAccounts !== null && (
  <div style={{ marginTop: 32, paddingTop: 20, borderTop: '1px solid var(--color-border-soft)', textAlign: 'center' }}>
    <a
      href="/admin"
      style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.15em', color: 'var(--color-text-muted)', textDecoration: 'none' }}
    >
      Admin panel →
    </a>
  </div>
)}
```

- [ ] **Step 3: Replace `OverviewView` stub in `AdminPage.tsx` with the real implementation**

Replace the stub `function OverviewView(...)`:

```tsx
function OverviewView({ onNavigate }: { onNavigate: (s: Section) => void }) {
  const [data, setData] = useState<AdminOverview | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    fetchAdminOverview().then(setData).catch(e => setErr(e.message))
  }, [])

  if (err) return <div><PageHeader title="Overview" sub="Platform health at a glance" /><ErrorMsg msg={err} /></div>
  if (!data) return <div><PageHeader title="Overview" sub="Platform health at a glance" /><Loading /></div>

  const statCards = [
    { label: 'Accounts',      value: data.total_accounts, color: 'var(--color-primary)' },
    { label: 'Plants',        value: data.total_plants,   color: 'var(--color-text)' },
    { label: 'Maps',          value: data.total_maps,     color: 'var(--color-text)' },
    { label: 'Missing icons', value: data.missing_icons,  color: data.missing_icons > 0 ? 'var(--color-overdue)' : 'var(--color-text-muted)' },
  ]

  return (
    <div>
      <PageHeader title="Overview" sub={`Platform health at a glance — ${new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`} />

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        {statCards.map(c => (
          <div key={c.label} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.18em', color: 'var(--color-text-muted)', marginBottom: 8 }}>{c.label}</div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 32, fontWeight: 500, lineHeight: 1, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Two-col: recent accounts + activity */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 20 }}>
        <SectionCard title="Recent accounts" action={{ label: 'View all →', onClick: () => onNavigate('users') }}>
          <AdminTable heads={['Name', 'Household', 'Plants', 'Status']}>
            {data.recent_accounts.map(a => (
              <tr key={a.id}>
                <Td><strong>{a.name}</strong></Td>
                <Td>{a.household_name}</Td>
                <Td mono>{a.plant_count}</Td>
                <Td><Pill label={a.email === 'leon_korbee@hotmail.com' ? 'Admin' : a.plant_count === 0 ? 'No plants' : 'Active'} tone={a.email === 'leon_korbee@hotmail.com' ? 'green' : a.plant_count === 0 ? 'amber' : 'green'} /></Td>
              </tr>
            ))}
          </AdminTable>
        </SectionCard>

        <SectionCard title="Recent activity" action={{ label: 'Full log →', onClick: () => onNavigate('activity') }}>
          <div>
            {data.recent_activity.map((ev, i) => (
              <ActivityRow key={i} event={ev} />
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  )
}

function ActivityRow({ event }: { event: AdminActivityEvent }) {
  const dot: Record<string, string> = {
    account_registered: 'var(--color-primary)',
    plant_added:        'var(--color-primary)',
    icon_requested:     'var(--color-due)',
    care_log:           'var(--color-border)',
  }
  const dotColor = dot[event.kind] ?? 'var(--color-border)'
  const ts = event.ts ? new Date(event.ts).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) : '—'
  return (
    <div style={{ display: 'flex', gap: 12, padding: '10px 18px', borderBottom: '1px dashed var(--color-border-soft)', alignItems: 'flex-start' }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0, marginTop: 4 }} />
      <div>
        <div style={{ fontSize: 12, lineHeight: 1.4 }}>{event.label} <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>· {event.household}</span></div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-muted)', marginTop: 2 }}>{ts}</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Replace `ToolsView` stub**

```tsx
function ToolsView() {
  const [thresholdsResult, setThresholdsResult] = useState<string>('')
  const [thresholdsRunning, setThresholdsRunning] = useState(false)
  const [schedulesResult, setSchedulesResult] = useState<string>('')
  const [schedulesRunning, setSchedulesRunning] = useState(false)

  async function handleBackfillThresholds() {
    setThresholdsRunning(true)
    setThresholdsResult('')
    try {
      const r = await runBackfillThresholds()
      setThresholdsResult(`✓ ${r.succeeded} updated · ${r.failed} failed out of ${r.processed}`)
    } catch (e) {
      setThresholdsResult(`✗ ${e instanceof Error ? e.message : 'Failed'}`)
    } finally {
      setThresholdsRunning(false)
    }
  }

  async function handleBackfillSchedules() {
    setSchedulesRunning(true)
    setSchedulesResult('')
    try {
      const r = await runBackfillCareSchedules()
      setSchedulesResult(`✓ ${r.seeded} schedules seeded out of ${r.checked} checked`)
    } catch (e) {
      setSchedulesResult(`✗ ${e instanceof Error ? e.message : 'Failed'}`)
    } finally {
      setSchedulesRunning(false)
    }
  }

  const tools = [
    {
      title: 'Backfill thresholds',
      desc: 'Generate care thresholds via Claude Haiku for all plants that are missing them.',
      running: thresholdsRunning, result: thresholdsResult, onRun: handleBackfillThresholds,
    },
    {
      title: 'Backfill care schedules',
      desc: 'Seed water schedules for plants that have thresholds but no active schedule.',
      running: schedulesRunning, result: schedulesResult, onRun: handleBackfillSchedules,
    },
  ]

  return (
    <div>
      <PageHeader title="Tools" sub="One-off maintenance operations" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {tools.map(tool => (
          <div key={tool.title} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '18px 20px' }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 16, margin: '0 0 6px' }}>{tool.title}</h3>
            <p style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 13, color: 'var(--color-text-soft)', margin: '0 0 14px', lineHeight: 1.5 }}>{tool.desc}</p>
            <button
              onClick={tool.onRun}
              disabled={tool.running}
              style={{ background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontFamily: 'var(--font-mono)', fontSize: 11, cursor: tool.running ? 'not-allowed' : 'pointer', opacity: tool.running ? .6 : 1 }}
            >
              {tool.running ? 'Running…' : 'Run'}
            </button>
            {tool.result && (
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, marginTop: 10, color: tool.result.startsWith('✓') ? 'var(--color-primary)' : 'var(--color-overdue)' }}>
                {tool.result}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Verify the app compiles and navigating to `/admin` shows the panel with real overview data (after logging in)**

```bash
cd frontend && npx tsc --noEmit
# Expected: no errors
```

Open `http://localhost:1414/admin` in the browser while logged in as `leon_korbee@hotmail.com`. Confirm the overview stats and recent accounts appear.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.tsx frontend/src/pages/Settings.tsx frontend/src/pages/AdminPage.tsx
git commit -m "feat: wire /admin route, Settings link, and implement OverviewView + ToolsView"
```

---

## Task 7: Frontend — `UsersView` with delete confirmation

**Files:**
- Modify: `frontend/src/pages/AdminPage.tsx`

- [ ] **Step 1: Replace `UsersView` stub**

```tsx
function UsersView() {
  const [users, setUsers] = useState<AdminUserRow[] | null>(null)
  const [err, setErr] = useState('')
  const [search, setSearch] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [confirmId, setConfirmId] = useState<number | null>(null)

  useEffect(() => {
    fetchAdminUsers().then(setUsers).catch(e => setErr(e.message))
  }, [])

  async function handleDelete(id: number) {
    setDeletingId(id)
    try {
      await deleteAdminAccount(id)
      setUsers(u => u ? u.filter(x => x.id !== id) : u)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeletingId(null)
      setConfirmId(null)
    }
  }

  const filtered = (users ?? []).filter(u =>
    !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <PageHeader title="Users" sub={`${users?.length ?? '…'} accounts across all households`} />

      {/* Search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search by name or email…"
        style={{ width: '100%', maxWidth: 360, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', fontFamily: 'var(--font-body)', fontSize: 13, marginBottom: 18, boxSizing: 'border-box' }}
      />

      {err && <ErrorMsg msg={err} />}
      {!users && !err && <Loading />}

      {users && (
        <SectionCard title={`${filtered.length} accounts`}>
          <AdminTable heads={['Name', 'Email', 'Household', 'Plants', 'Maps', 'Joined', 'Actions']}>
            {filtered.map(u => {
              const joined = new Date(u.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
              return (
                <tr key={u.id}>
                  <Td><strong>{u.name}</strong></Td>
                  <Td mono>{u.email}</Td>
                  <Td>{u.household_name}</Td>
                  <Td mono>{u.plant_count}</Td>
                  <Td mono>{u.map_count}</Td>
                  <Td mono>{joined}</Td>
                  <Td>
                    {u.email !== 'leon_korbee@hotmail.com' && (
                      confirmId === u.id ? (
                        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-overdue)' }}>Delete all data?</span>
                          <button onClick={() => handleDelete(u.id)} disabled={deletingId === u.id}
                            style={{ background: 'var(--color-overdue)', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 8px', fontFamily: 'var(--font-mono)', fontSize: 9, cursor: 'pointer' }}>
                            {deletingId === u.id ? '…' : 'Yes'}
                          </button>
                          <button onClick={() => setConfirmId(null)}
                            style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 4, padding: '3px 8px', fontFamily: 'var(--font-mono)', fontSize: 9, cursor: 'pointer', color: 'var(--color-text-muted)' }}>
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmId(u.id)}
                          style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 4, padding: '3px 10px', fontFamily: 'var(--font-mono)', fontSize: 9, cursor: 'pointer', color: 'var(--color-text-muted)' }}>
                          Delete
                        </button>
                      )
                    )}
                  </Td>
                </tr>
              )
            })}
          </AdminTable>
        </SectionCard>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/AdminPage.tsx
git commit -m "feat: implement UsersView with search and inline delete confirmation"
```

---

## Task 8: Frontend — `PlantsView`, `SpeciesView`, `ActivityView`

**Files:**
- Modify: `frontend/src/pages/AdminPage.tsx`

- [ ] **Step 1: Replace `PlantsView` stub**

```tsx
function PlantsView() {
  const [plants, setPlants] = useState<AdminPlantRow[] | null>(null)
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState<'all' | 'no_icon' | 'no_thresholds'>('all')

  useEffect(() => {
    fetchAdminPlants().then(setPlants).catch(e => setErr(e.message))
  }, [])

  const filtered = (plants ?? []).filter(p => {
    if (filter === 'no_icon') return !p.icon_key
    if (filter === 'no_thresholds') return !p.has_thresholds
    return true
  })

  return (
    <div>
      <PageHeader title="Plants" sub={`${plants?.length ?? '…'} active plants across all households`} />

      <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
        {(['all', 'no_icon', 'no_thresholds'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: '5px 12px', borderRadius: 99, fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.1em', cursor: 'pointer', border: '1px solid var(--color-border)', background: filter === f ? 'var(--color-primary)' : 'var(--color-surface)', color: filter === f ? '#fff' : 'var(--color-text-muted)', transition: 'all .12s' }}>
            {f === 'all' ? 'All' : f === 'no_icon' ? 'No icon' : 'No thresholds'}
          </button>
        ))}
      </div>

      {err && <ErrorMsg msg={err} />}
      {!plants && !err && <Loading />}

      {plants && (
        <SectionCard title={`${filtered.length} plants`}>
          <AdminTable heads={['Name', 'Species', 'Household', 'Phase', 'Icon', 'Thresholds']}>
            {filtered.map(p => (
              <tr key={p.id}>
                <Td><strong>{p.name}</strong></Td>
                <Td>{p.species ?? <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>—</span>}</Td>
                <Td>{p.household_name}</Td>
                <Td mono>{p.phase}</Td>
                <Td>{p.icon_key ? <Pill label={p.icon_key} tone="green" /> : <Pill label="missing" tone={p.icon_requested ? 'amber' : 'red'} />}</Td>
                <Td><Pill label={p.has_thresholds ? 'yes' : 'no'} tone={p.has_thresholds ? 'green' : 'red'} /></Td>
              </tr>
            ))}
          </AdminTable>
        </SectionCard>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Replace `SpeciesView` stub**

```tsx
function SpeciesView() {
  const [species, setSpecies] = useState<AdminSpeciesRow[] | null>(null)
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState<'all' | 'no_icon' | 'no_thresholds'>('all')

  useEffect(() => {
    fetchAdminSpecies().then(setSpecies).catch(e => setErr(e.message))
  }, [])

  const filtered = (species ?? []).filter(s => {
    if (filter === 'no_icon') return !s.icon_key
    if (filter === 'no_thresholds') return !s.has_thresholds
    return true
  })

  return (
    <div>
      <PageHeader title="Species" sub={`${species?.length ?? '…'} species in the catalogue`} />

      <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
        {(['all', 'no_icon', 'no_thresholds'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: '5px 12px', borderRadius: 99, fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.1em', cursor: 'pointer', border: '1px solid var(--color-border)', background: filter === f ? 'var(--color-primary)' : 'var(--color-surface)', color: filter === f ? '#fff' : 'var(--color-text-muted)', transition: 'all .12s' }}>
            {f === 'all' ? 'All' : f === 'no_icon' ? 'No icon' : 'No thresholds'}
          </button>
        ))}
      </div>

      {err && <ErrorMsg msg={err} />}
      {!species && !err && <Loading />}

      {species && (
        <SectionCard title={`${filtered.length} species`}>
          <AdminTable heads={['Scientific name', 'Common name', 'Plants', 'Icon', 'Thresholds']}>
            {filtered.map(s => (
              <tr key={s.id}>
                <Td><em>{s.scientific_name}</em></Td>
                <Td>{s.common_name_nl ?? <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>—</span>}</Td>
                <Td mono>{s.plant_count}</Td>
                <Td>{s.icon_key ? <Pill label={s.icon_key} tone="green" /> : <Pill label="missing" tone="red" />}</Td>
                <Td><Pill label={s.has_thresholds ? 'yes' : 'no'} tone={s.has_thresholds ? 'green' : 'red'} /></Td>
              </tr>
            ))}
          </AdminTable>
        </SectionCard>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Replace `ActivityView` stub**

```tsx
function ActivityView() {
  const [events, setEvents] = useState<AdminActivityEvent[] | null>(null)
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    fetchAdminActivity().then(setEvents).catch(e => setErr(e.message))
  }, [])

  const kinds = ['all', 'account_registered', 'plant_added', 'icon_requested', 'care_log']
  const filtered = (events ?? []).filter(e => filter === 'all' || e.kind === filter)

  const kindLabel: Record<string, string> = {
    account_registered: 'New account',
    plant_added:        'Plant added',
    icon_requested:     'Icon requested',
    care_log:           'Care log',
  }

  return (
    <div>
      <PageHeader title="Activity" sub="Recent events across all households" />

      <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
        {kinds.map(k => (
          <button key={k} onClick={() => setFilter(k)} style={{ padding: '5px 12px', borderRadius: 99, fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.1em', cursor: 'pointer', border: '1px solid var(--color-border)', background: filter === k ? 'var(--color-primary)' : 'var(--color-surface)', color: filter === k ? '#fff' : 'var(--color-text-muted)', transition: 'all .12s' }}>
            {k === 'all' ? 'All' : kindLabel[k] ?? k}
          </button>
        ))}
      </div>

      {err && <ErrorMsg msg={err} />}
      {!events && !err && <Loading />}

      {events && (
        <SectionCard title={`${filtered.length} events`}>
          {filtered.map((ev, i) => <ActivityRow key={i} event={ev} />)}
          {filtered.length === 0 && <div style={{ padding: '20px 18px', fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center' }}>No events.</div>}
        </SectionCard>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
# Expected: no errors
```

- [ ] **Step 5: Open the admin panel and click through all 6 sections — confirm data loads with no console errors**

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/AdminPage.tsx
git commit -m "feat: implement PlantsView, SpeciesView, and ActivityView"
```
