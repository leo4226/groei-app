# Home Page Editorial Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `/dashboard` (the home page) in the botanical field-guide style established by `Plants.tsx`, and fix the "background only covers part of the screen" bug by dropping `max-w-lg` + per-section colored backgrounds in favor of the body's warm-paper bg.

**Architecture:** Single-file rewrite of `groei/frontend/src/pages/Dashboard.tsx` plus one mobile media-query rule appended to `groei/frontend/src/index.css`. No backend changes, no other pages touched. All design tokens (`--color-*`, `--font-*`, `--radius-*`) and Google Fonts (Fraunces, Inter, JetBrains Mono — already preloaded in `index.html` line 10) are reused as-is.

**Tech Stack:** React 19 + TypeScript, Vite dev server, Zustand store (`useGroeiStore`), Tailwind via PostCSS, inline-style design tokens. No new dependencies.

**Spec:** `docs/specs/in-progress/2026-05-10-home-page-editorial-redesign-design.md`

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `groei/frontend/src/pages/Dashboard.tsx` | **Rewrite** | The home page. New editorial layout: hero + maps + tasks + fact. |
| `groei/frontend/src/index.css` | **Modify** | Append a `@media (max-width: 720px)` rule for `.home-header` matching the existing `.plants-header` rule (lines 175–185). |

No new files. No deletions. Sub-components (`HeroStat`, `SectionHeader`, `MapCard`, `NewMapCard`, `TaskGroup`, `TaskCard`, `TaskSkeletons`, `CalmEmptyState`) all live inside `Dashboard.tsx` — same pattern Plants.tsx uses for its helpers.

**Note on testing:** This codebase has no tests for page-level UI; verification is a desktop browser smoke test per `groei/CLAUDE.md`. The plan substitutes manual smoke-test checkpoints for unit-test steps.

---

## Task 1: Rewrite Dashboard.tsx

**Files:**
- Modify (full rewrite): `groei/frontend/src/pages/Dashboard.tsx`

- [ ] **Step 1: Confirm existing imports and store API are still valid**

The new file uses these existing exports — verify they are still present before pasting the new file:

```bash
grep -n "loadPlantFact\|loadDashboard\|markCareDone\|plantFact\|maps\b" groei/frontend/src/store/useGroeiStore.ts
grep -n "CARE_TYPE_INFO\|CareTask\|MapInfo\|PlantFactOut" groei/frontend/src/types/index.ts
```

Expected: every name appears at least once in its respective file. If anything is missing the store/types have drifted and the rewrite will fail to type-check — stop and report.

- [ ] **Step 2: Replace the entire contents of `Dashboard.tsx` with the new implementation**

Use the Write tool (this is a full rewrite, not an edit) with the following content:

```tsx
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useGroeiStore } from '../store/useGroeiStore'
import { CARE_TYPE_INFO } from '../types'
import type { CareTask, MapInfo } from '../types'
import UserSwitcher from '../components/UserSwitcher'

const CARE_LABEL_NL: Record<string, string> = {
  water: 'Water',
  fertilize: 'Bemesten',
  mist: 'Sproeien',
  rotate: 'Draaien',
  repot_check: 'Verpotten',
  prune: 'Snoeien',
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return 'Goedenacht'
  if (hour < 12) return 'Goedemorgen'
  if (hour < 18) return 'Goedemiddag'
  return 'Goedenavond'
}

function getDutchDate(): string {
  return new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })
}

function leadCopy(overdue: number, due: number): string {
  if (overdue > 0) {
    return `${overdue} ${overdue === 1 ? 'plant vraagt' : 'planten vragen'} je aandacht vandaag.`
  }
  if (due > 0) {
    return `Een paar taken op de planning voor vandaag.`
  }
  return `Een rustige dag in de tuin — binnen en buiten.`
}

function summaryLede(overdue: number, due: number, upcoming: number): string {
  const parts: string[] = []
  if (overdue > 0) parts.push(`${overdue} ${overdue === 1 ? 'taak' : 'taken'} te laat`)
  if (due > 0) parts.push(`${due} vandaag`)
  if (upcoming > 0) parts.push(`${upcoming} op komst`)
  return parts.join(' · ')
}

export default function Dashboard() {
  const { dashboard, activeUserId, users, maps, plantFact, loadDashboard, loadPlantFact, isLoading } = useGroeiStore()
  const activeUser = users.find((u) => u.id === activeUserId)

  useEffect(() => {
    loadDashboard()
    loadPlantFact()
  }, [loadDashboard, loadPlantFact])

  const overdueCount = dashboard?.overdue.length ?? 0
  const dueTodayCount = dashboard?.due_today.length ?? 0
  const upcomingCount = dashboard?.upcoming.length ?? 0
  const totalTasks = overdueCount + dueTodayCount + upcomingCount

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* ── Hero ── */}
      <header className="home-header" style={{
        padding: '40px 24px 20px',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        flexWrap: 'wrap',
        gap: 20,
      }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'var(--color-text-muted)',
            margin: '0 0 8px 0',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}>
            <span style={{ width: 24, height: 1, background: 'var(--color-border)', flex: 'none' }} />
            {getGreeting()} · {getDutchDate()}
            <span style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
          </p>
          <h1 style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: 500,
            fontSize: 'clamp(36px, 5vw, 56px)',
            lineHeight: 0.95,
            letterSpacing: '-0.02em',
            color: 'var(--color-text)',
            margin: 0,
          }}>
            {getGreeting()},{' '}
            <em style={{ fontStyle: 'italic', color: 'var(--color-primary)', fontWeight: 400 }}>
              {activeUser?.name ?? '...'}
            </em>.
          </h1>
          <p style={{
            fontFamily: 'var(--font-heading)',
            fontStyle: 'italic',
            fontSize: 15,
            lineHeight: 1.5,
            color: 'var(--color-text-soft)',
            maxWidth: 440,
            margin: '8px 0 0 0',
          }}>
            {leadCopy(overdueCount, dueTodayCount)}
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 16 }}>
          <UserSwitcher />
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 28 }}>
            <HeroStat count={overdueCount} label="Te laat" />
            <HeroStat count={dueTodayCount} label="Vandaag" />
            <HeroStat count={upcomingCount} label="Op komst" />
          </div>
        </div>
      </header>

      {/* ── Mijn Tuinen ── */}
      <section style={{ padding: '0 24px' }}>
        <SectionHeader
          leftLede={maps.length === 0 ? 'Nog geen tuinen' : maps.length === 1 ? 'Toon je tuin' : `Toon alle ${maps.length} tuinen`}
          rightMarker="§ Mijn Tuinen"
          rightAction={{ to: '/maps', label: 'Beheer →' }}
        />
        {maps.length > 0 ? (
          <div className="no-scrollbar" style={{ display: 'flex', overflowX: 'auto', gap: 14, margin: '0 -24px', padding: '0 24px 8px' }}>
            {maps.map((map) => <MapCard key={map.id} map={map} />)}
            <NewMapCard />
          </div>
        ) : (
          <Link to="/maps" style={{
            display: 'flex',
            width: '100%',
            height: 132,
            border: '1px dashed var(--color-border)',
            borderRadius: 14,
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-text-muted)',
            background: 'var(--color-surface)',
            textDecoration: 'none',
            marginBottom: 18,
          }}>
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: 28, color: 'var(--color-primary)' }}>+</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.2em', marginTop: 6 }}>Voeg een tuin toe</span>
          </Link>
        )}
      </section>

      {/* ── Vandaag ── */}
      <section style={{ padding: '0 24px' }}>
        <SectionHeader
          leftLede={summaryLede(overdueCount, dueTodayCount, upcomingCount)}
          rightMarker="§ Vandaag"
        />
        {isLoading && <TaskSkeletons />}
        {!isLoading && totalTasks === 0 && <CalmEmptyState />}
        {!isLoading && dashboard && totalTasks > 0 && (
          <>
            {overdueCount > 0 && <TaskGroup label="Te laat" tone="overdue" tasks={dashboard.overdue} />}
            {dueTodayCount > 0 && <TaskGroup label="Vandaag" tone="due" tasks={dashboard.due_today} />}
            {upcomingCount > 0 && <TaskGroup label="Op komst" tone="upcoming" tasks={dashboard.upcoming} />}
          </>
        )}
      </section>

      {/* ── Wist je dat ── */}
      {plantFact && (
        <section style={{ padding: '0 24px' }}>
          <SectionHeader leftLede="" rightMarker="§ Wist je dat" />
          <article className="card" style={{
            borderRadius: 14,
            padding: '24px 24px 20px',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {plantFact.icon_key && (
              <img
                src={`/api/icons/${plantFact.icon_key}.svg`}
                alt=""
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: -12,
                  right: -12,
                  width: 96,
                  height: 96,
                  opacity: 0.18,
                  pointerEvents: 'none',
                }}
              />
            )}
            <p style={{
              fontFamily: 'var(--font-heading)',
              fontStyle: 'italic',
              fontSize: 22,
              color: 'var(--color-primary)',
              lineHeight: 1.1,
              margin: '0 0 12px',
            }}>
              Wist je dat…
            </p>
            <p style={{
              fontFamily: 'var(--font-heading)',
              fontStyle: 'italic',
              fontSize: 15,
              lineHeight: 1.55,
              color: 'var(--color-text-soft)',
              margin: '0 0 18px',
            }}>
              {plantFact.fact_nl}
            </p>
            <div style={{
              paddingTop: 12,
              borderTop: '1px dashed var(--color-border)',
            }}>
              <Link
                to={`/plants/${plantFact.plant_id}`}
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                  fontWeight: 500,
                  color: 'var(--color-primary)',
                  textDecoration: 'none',
                }}
              >
                Meer over {plantFact.plant_name} →
              </Link>
            </div>
          </article>
        </section>
      )}
    </div>
  )
}

// ── Helper components ──

function HeroStat({ count, label }: { count: number; label: string }) {
  const isZero = count === 0
  return (
    <div style={{ textAlign: 'right' }}>
      <span style={{
        fontFamily: 'var(--font-heading)',
        fontSize: 34,
        fontWeight: 500,
        lineHeight: 1,
        color: isZero ? 'var(--color-text-muted)' : 'var(--color-primary)',
        display: 'block',
      }}>{count}</span>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        textTransform: 'uppercase',
        letterSpacing: '0.15em',
        color: 'var(--color-text-muted)',
        marginTop: 4,
        display: 'block',
      }}>{label}</span>
    </div>
  )
}

function SectionHeader({
  leftLede,
  rightMarker,
  rightAction,
}: {
  leftLede: string
  rightMarker: string
  rightAction?: { to: string; label: string }
}) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      padding: '20px 0 18px',
      borderBottom: '1px solid var(--color-border)',
      marginBottom: 18,
      gap: 12,
    }}>
      <p style={{
        margin: 0,
        fontFamily: 'var(--font-heading)',
        fontStyle: 'italic',
        fontSize: 15,
        color: 'var(--color-text-soft)',
        flex: 1,
        minWidth: 0,
      }}>
        {leftLede}
      </p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexShrink: 0 }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.2em',
          color: 'var(--color-text-muted)',
        }}>{rightMarker}</span>
        {rightAction && (
          <Link to={rightAction.to} style={{
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            color: 'var(--color-primary)',
            textDecoration: 'none',
          }}>{rightAction.label}</Link>
        )}
      </div>
    </div>
  )
}

function MapCard({ map }: { map: MapInfo }) {
  const dimensionsLabel = map.map_type === 'outdoor' ? 'Buiten' : 'Binnen'
  return (
    <Link
      to={`/map/${map.slug}`}
      className="card card-glow"
      style={{
        flexShrink: 0,
        width: 176,
        borderRadius: 14,
        overflow: 'hidden',
        textDecoration: 'none',
        color: 'inherit',
        position: 'relative',
      }}
    >
      <div style={{
        aspectRatio: '4 / 3',
        background: 'linear-gradient(145deg, #FDFAF1 0%, #F4EEDB 100%)',
        borderBottom: '1px solid var(--color-border-soft)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '14%',
      }}>
        <img
          src={`/api/maps-static/${map.svg_file}`}
          alt={map.name}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </div>
      <span style={{
        position: 'absolute',
        top: 8,
        left: 8,
        fontFamily: 'var(--font-mono)',
        fontSize: 8,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        color: 'var(--color-text-muted)',
        background: 'rgba(251,247,238,0.92)',
        padding: '2px 7px',
        borderRadius: 5,
        border: '1px solid var(--color-border-soft)',
      }}>
        {dimensionsLabel}
      </span>
      <div style={{ padding: '12px 14px 14px' }}>
        <h3 style={{
          margin: 0,
          fontFamily: 'var(--font-heading)',
          fontWeight: 500,
          fontSize: 16,
          lineHeight: 1.15,
          color: 'var(--color-text)',
          letterSpacing: '-0.01em',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {map.name}
        </h3>
      </div>
    </Link>
  )
}

function NewMapCard() {
  return (
    <Link
      to="/maps"
      style={{
        flexShrink: 0,
        width: 176,
        borderRadius: 14,
        border: '1px dashed var(--color-border)',
        background: 'var(--color-surface)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-text-muted)',
        textDecoration: 'none',
        aspectRatio: '4 / 3.4',
      }}
    >
      <span style={{ fontFamily: 'var(--font-heading)', fontSize: 28, color: 'var(--color-primary)' }}>+</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', marginTop: 6 }}>Nieuwe tuin</span>
    </Link>
  )
}

function TaskGroup({ label, tone, tasks }: { label: string; tone: 'overdue' | 'due' | 'upcoming'; tasks: CareTask[] }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <p style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        textTransform: 'uppercase',
        letterSpacing: '0.2em',
        color: 'var(--color-text-muted)',
        margin: '0 0 10px',
      }}>
        {label}
        <span style={{ opacity: 0.65, marginLeft: 6 }}>{tasks.length}</span>
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {tasks.map((t) => <TaskCard key={t.schedule_id} task={t} tone={tone} />)}
      </div>
    </div>
  )
}

function TaskCard({ task, tone }: { task: CareTask; tone: 'overdue' | 'due' | 'upcoming' }) {
  const markCareDone = useGroeiStore((s) => s.markCareDone)
  const careLabel = CARE_LABEL_NL[task.care_type] ?? CARE_TYPE_INFO[task.care_type as keyof typeof CARE_TYPE_INFO]?.label ?? task.care_type

  const accentColor =
    tone === 'overdue' ? 'var(--color-overdue)' :
    tone === 'due' ? 'var(--color-due)' :
    'var(--color-border)'

  return (
    <div className="card" style={{
      borderRadius: 14,
      padding: '14px 16px',
      borderLeft: `3px solid ${accentColor}`,
      display: 'flex',
      alignItems: 'center',
      gap: 14,
    }}>
      {task.plant_photo ? (
        <img src={task.plant_photo} alt="" style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          objectFit: 'cover',
          flexShrink: 0,
        }} />
      ) : (
        <div style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          background: 'linear-gradient(145deg, #FDFAF1 0%, #F4EEDB 100%)',
          border: '1px solid var(--color-border-soft)',
          flexShrink: 0,
        }} />
      )}

      <Link to={`/plants/${task.plant_id}`} style={{
        flex: 1,
        minWidth: 0,
        textDecoration: 'none',
        color: 'inherit',
      }}>
        <p style={{
          margin: 0,
          fontFamily: 'var(--font-heading)',
          fontWeight: 500,
          fontSize: 16,
          color: 'var(--color-text)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>{task.plant_name}</p>
        <p style={{
          margin: '4px 0 0',
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          textTransform: 'uppercase',
          letterSpacing: '0.15em',
          color: 'var(--color-text-muted)',
        }}>
          {careLabel}{task.location ? ` · ${task.location}` : ''}
        </p>
        {tone === 'overdue' && (
          <p style={{
            margin: '4px 0 0',
            fontFamily: 'var(--font-heading)',
            fontStyle: 'italic',
            fontSize: 12,
            color: 'var(--color-overdue)',
          }}>
            {task.days_overdue} {task.days_overdue === 1 ? 'dag' : 'dagen'} te laat
          </p>
        )}
        {tone === 'upcoming' && task.days_overdue < 0 && (
          <p style={{
            margin: '4px 0 0',
            fontFamily: 'var(--font-heading)',
            fontStyle: 'italic',
            fontSize: 12,
            color: 'var(--color-text-muted)',
          }}>
            over {-task.days_overdue} {-task.days_overdue === 1 ? 'dag' : 'dagen'}
          </p>
        )}
      </Link>

      {tone !== 'upcoming' && (
        <button
          onClick={() => markCareDone(task.plant_id, task.care_type)}
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--color-primary)',
            border: '1px solid var(--color-primary)',
            borderRadius: 100,
            background: 'transparent',
            padding: '8px 14px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-primary)'; e.currentTarget.style.color = 'var(--color-surface)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-primary)' }}
        >
          Gedaan
        </button>
      )}
    </div>
  )
}

function TaskSkeletons() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[1, 2, 3].map((i) => (
        <div key={i} className="card" style={{ borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="skeleton" style={{ width: 44, height: 44, borderRadius: 10 }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton" style={{ height: 16, width: '60%', marginBottom: 6 }} />
            <div className="skeleton" style={{ height: 10, width: '40%' }} />
          </div>
          <div className="skeleton" style={{ width: 70, height: 32, borderRadius: 100 }} />
        </div>
      ))}
    </div>
  )
}

function CalmEmptyState() {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <p style={{
        fontFamily: 'var(--font-heading)',
        fontStyle: 'italic',
        fontSize: 18,
        color: 'var(--color-text-soft)',
        margin: '0 0 8px',
      }}>
        Een rustige dag in de tuin.
      </p>
      <p style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.2em',
        color: 'var(--color-text-muted)',
        margin: 0,
      }}>
        Geen taken op dit moment
      </p>
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

Run from `groei/frontend/`:

```bash
npx tsc --noEmit
```

Expected: zero errors. If errors mention `markCareDone`, `plantFact`, `MapInfo`, `CareTask`, or `PlantFactOut` not existing, the store/types are out of sync — stop and report.

- [ ] **Step 4: Commit**

```bash
git add groei/frontend/src/pages/Dashboard.tsx
git commit -m "feat(home): rebuild dashboard in Plants editorial style"
```

---

## Task 2: Add `.home-header` mobile media query

**Files:**
- Modify: `groei/frontend/src/index.css` (append, do not edit existing rules)

- [ ] **Step 1: Append the rule to the existing `@media (max-width: 720px)` block**

Find the existing block at `groei/frontend/src/index.css:175-185`:

```css
@media (max-width: 720px) {
  .plants-header {
    padding: 24px 16px 14px !important;
  }

  .plants-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)) !important;
    gap: 10px !important;
    padding: 0 16px !important;
  }
}
```

Replace it with the same block plus a `.home-header` rule:

```css
@media (max-width: 720px) {
  .plants-header {
    padding: 24px 16px 14px !important;
  }

  .plants-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)) !important;
    gap: 10px !important;
    padding: 0 16px !important;
  }

  .home-header {
    padding: 24px 16px 14px !important;
  }
}
```

Use the Edit tool — match `old_string` on the entire existing block to ensure uniqueness.

- [ ] **Step 2: Commit**

```bash
git add groei/frontend/src/index.css
git commit -m "feat(home): mobile padding for editorial home-header"
```

---

## Task 3: Smoke test in browser

**Files:** none (manual verification only)

- [ ] **Step 1: Start the dev server**

From `groei/`:

```bash
npm run dev
```

Expected: Vite reports frontend on `http://localhost:5173`, FastAPI reports backend on `http://localhost:8000`. If port 5173 is already in use, kill the previous process — do not run on a different port (the dev proxy hardcodes 5173).

- [ ] **Step 2: Load `/dashboard` and verify the four sections render**

Open `http://localhost:5173/dashboard` (or `/`, which redirects there). Confirm:

1. **Hero**: thin mono rule line "GOEDEMORGEN · WOENSDAG …", big serif "Goedemorgen, _Leon_." with the name in italic green, italic Fraunces lede sentence below. Right side: UserSwitcher above three big numbers labeled "TE LAAT / VANDAAG / OP KOMST".
2. **§ Mijn Tuinen**: italic "Toon alle N tuinen" left, "§ Mijn Tuinen   Beheer →" right, then a horizontal scroll of map cards each with a paper gradient thumbnail well, top-left mono "BUITEN" / "BINNEN" badge, and Fraunces map name. Last card is a dashed "+ NIEUWE TUIN".
3. **§ Vandaag**: italic summary lede left, "§ Vandaag" right, then Te laat / Vandaag / Op komst groups (only the non-empty ones) with task cards. Each task card has a 3-px left accent border, plant thumbnail or paper plate, Fraunces plant name, mono care label, and an outlined green "Gedaan" pill (only on Te laat / Vandaag).
4. **§ Wist je dat**: italic "Wist je dat…" in green inside a paper card, italic fact body, dashed-top footer "Meer over [plant] →".

- [ ] **Step 3: Verify the background bleeds edge-to-edge**

Resize the browser window from narrow (375px) to wide (1400px) and back. Confirm:

- The warm-paper background fills the entire viewport at every width — **no white or off-color stripe** appears outside the content column. (This is the "background only covers part of the screen" bug fix; if a stripe appears, the rewrite still has a `max-w-lg` or `bg-fog-canvas` somewhere — re-check Step 2 of Task 1.)
- The content stays readable at narrow widths thanks to `clamp()` on the hero heading.
- At ≤720px, the hero padding tightens (Task 2 media query). If it doesn't, the className isn't `home-header` — re-check Task 1 / Step 2.

- [ ] **Step 4: Verify behavior on the calm path**

Click "Gedaan" on every visible task. As the dashboard empties:

- The hero stat numbers transition from green to muted gray when they hit 0 (zero-state styling).
- When all tasks are cleared, the Vandaag section shows "Een rustige dag in de tuin." in italic Fraunces over "GEEN TAKEN OP DIT MOMENT" in mono — no bright green "Alle planten zijn blij!", no peacelily SVG.
- The hero lede sentence updates to the rest-of-day variant.

- [ ] **Step 5: Verify the BottomNav still highlights Home correctly**

Confirm the leftmost bottom-nav tab (house icon) is highlighted in primary green when on `/dashboard`, and switches off when navigating to `/plants`. No code change needed — just confirm we didn't regress the existing BottomNav behavior.

- [ ] **Step 6: Stop the dev server**

`Ctrl+C` in the terminal running `npm run dev`.

---

## Task 4: Move spec and plan to `completed/` once shipped

**Files:**
- Move: `docs/specs/in-progress/2026-05-10-home-page-editorial-redesign-design.md` → `docs/specs/completed/2026-05-10-home-page-editorial-redesign-design.md`
- Move: `docs/plans/in-progress/2026-05-10-home-page-editorial-redesign.md` → `docs/plans/completed/2026-05-10-home-page-editorial-redesign.md`

- [ ] **Step 1: Move both files**

```bash
mv "docs/specs/in-progress/2026-05-10-home-page-editorial-redesign-design.md" "docs/specs/completed/2026-05-10-home-page-editorial-redesign-design.md"
mv "docs/plans/in-progress/2026-05-10-home-page-editorial-redesign.md" "docs/plans/completed/2026-05-10-home-page-editorial-redesign.md"
```

- [ ] **Step 2: Commit**

```bash
git add "docs/specs/completed/2026-05-10-home-page-editorial-redesign-design.md" "docs/plans/completed/2026-05-10-home-page-editorial-redesign.md"
git commit -m "docs: archive shipped home-page editorial redesign"
```

---

## Self-review notes

- **Spec coverage:** Each spec section maps to code in Task 1: page shell (root `<div>`), Hero (header), Mijn Tuinen (`MapCard` + `NewMapCard`), Vandaag (`TaskGroup` + `TaskCard` + `CalmEmptyState` + `TaskSkeletons`), Wist je dat (article block), removals (no `IconScatter`, no `bg-fog-canvas`, no `max-w-lg`, no `StatPill`, no `Badge`, no `SectionDivider`).
- **Type signatures:** `markCareDone(plant_id, care_type)` matches the existing call in the prior `Dashboard.tsx`. `MapInfo`, `CareTask`, `PlantFactOut` come from `types/index.ts`. `useGroeiStore` already exposes `dashboard`, `maps`, `plantFact`, `loadDashboard`, `loadPlantFact`, `markCareDone`, `isLoading`, `users`, `activeUserId` — all confirmed via grep in Task 1 / Step 1.
- **Out-of-scope guard:** No backend, no other pages, no new tokens, no new fonts (Fraunces / Inter / JetBrains Mono already in `index.html:10`).
- **Voice copy:** All Dutch. Lede and summary functions return concrete strings the engineer doesn't have to invent.
