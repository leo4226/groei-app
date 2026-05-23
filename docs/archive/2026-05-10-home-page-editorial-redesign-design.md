# Home Page Editorial Redesign

**Date:** 2026-05-10
**Status:** Approved
**Supersedes:** `docs/plans/completed/2026-05-07-home-screen.md` (the "Handsome Frank" home redesign — kept for history; this spec rebuilds the same `/dashboard` page in the botanical field-guide style established by `Plants.tsx`)

## Goal

Rebuild `/dashboard` so it reads as the front of a botanical field guide that matches the Plants page. Same content as today (greeting, urgency stats, map strip, care tasks, plant fact), new chrome.

Two specific issues to fix along the way:

1. **Background only covers part of the screen.** The page currently wraps everything in `max-w-lg mx-auto` (512px) and gives each section its own coloured background (`bg-fog-canvas`, `bg-cream-canvas`). Outside that column the body warm-paper shows through, and below the last section nothing covers the rest of the viewport. Drop both — let the body's `var(--color-bg)` paper + radial gradients carry the whole viewport.
2. **Visual tone clashes with Plants.** Bright Playfair Display headings, terracotta-orange/navy stat pills, and four overlapping `IconScatter` arrays make the page feel playful and crowded. Plants is quiet, paper, mono eyebrows, italic accents. Match that.

## Constraints

- No new fonts, colors, or design tokens. Use only what `index.css` already exposes (`--color-*`, `--font-heading`, `--font-body`, `--font-mono`, `--radius-*`).
- Keep `Dashboard.tsx` filename and the `Dashboard` default export.
- Keep `/dashboard` route, `loadDashboard()` action, `loadPlantFact()` action, and the data shape of `dashboard.overdue / due_today / upcoming`. No backend changes.
- Mobile-first; verify responsive behavior on a desktop browser per `CLAUDE.md`.

## Page shell

Replace:

```tsx
<div className="max-w-lg mx-auto">
  <section className="bg-fog-canvas …">…</section>
  <section className="bg-cream-canvas …">…</section>
  …
</div>
```

with the Plants pattern:

```tsx
<div style={{ paddingBottom: 80 }}>
  <header className="home-header" style={{ padding: '40px 24px 20px', … }}>…</header>
  <section style={{ padding: '0 24px' }}>…</section>
  …
</div>
```

No `max-w-lg`, no per-section backgrounds. The body provides the warm paper + radial gradients, so the page bleeds edge-to-edge on every viewport.

## Page structure

```
┌────────────────────────────────────────────────────────────┐
│ ── Goedemorgen · Woensdag 7 mei ─────────────              │
│                                                            │
│ Goedemorgen,                              3      2     5   │
│ _Leon_.                                   Te    Va    Op   │
│                                           laat  nd    komst│
│ Een rustige start voor je tuin vandaag.                    │
├────────────────────────────────────────────────────────────┤
│ Toon alle 2 tuinen                          § Mijn Tuinen  │
│                                                  Beheer →  │
│ [card]  [card]  [+ Nieuwe tuin]                            │
├────────────────────────────────────────────────────────────┤
│ 3 taken te laat · 2 vandaag · 5 op komst       § Vandaag   │
│                                                            │
│   Te laat (3)                                              │
│   [task card]                                              │
│   [task card]                                              │
│   [task card]                                              │
│                                                            │
│   Vandaag (2)                                              │
│   [task card]                                              │
│   [task card]                                              │
├────────────────────────────────────────────────────────────┤
│                                            § Wist je dat   │
│ [single fact card]                                         │
└────────────────────────────────────────────────────────────┘
```

Each section is separated by a thin rule (`borderBottom: 1px solid var(--color-border)`) — the same rule Plants uses for its results bar. No SVG flourish divider.

## Section 1 — Hero

Mirrors the Plants header structure exactly.

```tsx
<header className="home-header" style={{
  padding: '40px 24px 20px',
  borderBottom: '1px solid var(--color-border)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-end',
  flexWrap: 'wrap',
  gap: 20,
}}>
  <div>
    {/* Eyebrow rule line */}
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

    {/* Hero heading: greeting + italic name */}
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
        {activeUser?.name}
      </em>.
    </h1>

    {/* Lede */}
    <p style={{
      fontFamily: 'var(--font-heading)',
      fontStyle: 'italic',
      fontSize: 15,
      lineHeight: 1.5,
      color: 'var(--color-text-soft)',
      maxWidth: 440,
      margin: '8px 0 0 0',
    }}>
      {leadCopy(totalUrgent)}
    </p>
  </div>

  <div style={{ display: 'flex', gap: 28 }}>
    <HeroStat count={overdueCount}  label="Te laat" />
    <HeroStat count={dueTodayCount} label="Vandaag" />
    <HeroStat count={upcomingCount} label="Op komst" />
  </div>
</header>
```

`HeroStat` matches Plants' "28 Planten / 6 Categorieen" stat block:

```tsx
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
      }}>{label}</span>
    </div>
  )
}
```

Zero-state: when a count is 0 the number renders in `--color-text-muted` instead of primary green, so the eye lands on the non-zero counts. On a perfectly calm day all three render quiet.

`leadCopy()` returns a single Dutch italic sentence reflecting the load:

| Condition | Copy |
|---|---|
| `overdueCount > 0` | `Drie planten vragen je aandacht vandaag.` (count interpolated) |
| `dueTodayCount > 0` and no overdue | `Een paar taken op de planning voor vandaag.` |
| All zero | `Een rustige dag in de tuin — binnen en buiten.` |

`getGreeting()` and `getDutchDate()` are reused unchanged from the current `Dashboard.tsx`.

`UserSwitcher` stays accessible. Place it in the top-right of the hero, above the stats — same column, smaller and quieter than today (no large pill chrome; the existing component is fine).

## Section 2 — Mijn Tuinen

Pattern:

```
─── header rule ───
Toon alle 2 tuinen                         § Mijn Tuinen
                                                Beheer →
[card] [card] [+ Nieuwe tuin]
```

Implementation:

```tsx
<section style={{ padding: '0 24px' }}>
  <SectionHeader
    leftLede={`Toon ${maps.length === 1 ? 'je tuin' : `alle ${maps.length} tuinen`}`}
    rightMarker="§ Mijn Tuinen"
    rightAction={{ to: '/maps', label: 'Beheer →' }}
  />
  <div style={{ display: 'flex', overflowX: 'auto', gap: 14, paddingBottom: 8 }} className="no-scrollbar">
    {maps.map(map => <MapCard key={map.id} map={map} />)}
    <NewMapCard />
  </div>
</section>
```

`SectionHeader` is shared by all sections and matches the Plants results-bar pattern (see `Plants.tsx` lines 386–420):

```tsx
function SectionHeader({ leftLede, rightMarker, rightAction, badge }: {…}) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      padding: '20px 0 18px',
      borderBottom: '1px solid var(--color-border)',
      marginBottom: 18,
    }}>
      <p style={{
        margin: 0,
        fontFamily: 'var(--font-heading)',
        fontStyle: 'italic',
        fontSize: 15,
        color: 'var(--color-text-soft)',
      }}>
        {leftLede}
      </p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
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
```

`MapCard`:

- `<Link>` wrapped in `.card .card-glow` (existing classes from `index.css`), `borderRadius: 14`, `overflow: hidden`.
- Width: `w-44` (176px), `flex-shrink-0`.
- Thumbnail well: same gradient as Plants' `PlantIconWell` — `linear-gradient(145deg, #FDFAF1 0%, #F4EEDB 100%)`, `borderBottom: 1px solid var(--color-border-soft)`, `aspectRatio: '4 / 3'`. Render the SVG via `<img src={`/api/maps-static/${map.svg_file}`} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '14%' }} />`.
- Below: padding `12px 14px 14px`. Map name in Fraunces 16px, tight ellipsis. Below that, italic Fraunces 12px species-style sub-line: `"Buiten · 5 m × 4 m"` for outdoor, `"Binnen"` for indoor (use map dimensions if present).
- Top-left mono badge: `outdoor` → `BUITEN`, `indoor` → `BINNEN`. Same chrome as Plants' category tag (lines 610–627): mono 8px uppercase, `rgba(251,247,238,0.92)` bg, `1px solid var(--color-border-soft)`, 5px radius, 2px×7px padding. No bright fills.

`NewMapCard`: dashed-border `.card`, same width, same aspect, contents centered: small "+" in `--color-primary`, mono 9px label `NIEUWE TUIN`.

## Section 3 — Vandaag (Care Tasks)

```tsx
<section style={{ padding: '0 24px' }}>
  <SectionHeader
    leftLede={summaryLede(overdue, dueToday, upcoming)}
    rightMarker="§ Vandaag"
  />

  {isLoading && <TaskSkeletons />}
  {!isLoading && totalTasks === 0 && <CalmEmptyState />}
  {!isLoading && totalTasks > 0 && (
    <>
      {overdue.length > 0 && <TaskGroup label="Te laat" tone="overdue" tasks={overdue} />}
      {dueToday.length > 0 && <TaskGroup label="Vandaag" tone="due" tasks={dueToday} />}
      {upcoming.length > 0 && <TaskGroup label="Op komst" tone="upcoming" tasks={upcoming} />}
    </>
  )}
</section>
```

`summaryLede` returns the italic lede for the section header:

| State | Copy |
|---|---|
| Has overdue | `3 taken te laat · 2 vandaag · 5 op komst` (only non-zero parts) |
| No overdue, has due | `2 taken vandaag · 5 op komst` |
| Only upcoming | `5 op komst deze week` |
| All zero | (empty string — the empty-state component below carries the message instead) |

`TaskGroup`:

```tsx
<div style={{ marginBottom: 24 }}>
  <p style={{
    fontFamily: 'var(--font-mono)',
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: '0.2em',
    color: 'var(--color-text-muted)',
    margin: '0 0 10px',
  }}>
    {label} <span style={{ opacity: 0.65, marginLeft: 4 }}>{count}</span>
  </p>
  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
    {tasks.map(t => <TaskCard key={t.schedule_id} task={t} tone={tone} />)}
  </div>
</div>
```

`TaskCard`:

- `.card` (no `.card-glow`), `borderRadius: 14`, `padding: 14px 16px`.
- Left accent border: `borderLeft: 3px solid <toneColor>`. Tone colors:
  - `overdue` → `var(--color-overdue)` (`#B2664A` terra)
  - `due` → `var(--color-due)` (`#D9A418` saffron)
  - `upcoming` → `var(--color-border)` (`#D9CFB8` quiet)
- Layout: `display: flex; align-items: center; gap: 14`.
- Plant thumbnail: 44×44, `borderRadius: 10`. If `task.plant_photo` is set, render it `objectFit: cover`. Otherwise render the same gradient well used by `MapCard` (`linear-gradient(145deg, #FDFAF1 0%, #F4EEDB 100%)`) with no inner content — the field-guide voice prefers a quiet plate over an emoji or icon fallback.
- Middle column: plant name in Fraunces 16px, `var(--color-text)`. Below: care type + location in JetBrains Mono 9px uppercase tracked, e.g. `WATER · KEUKEN`. Use existing `CARE_TYPE_INFO` for the icon/label. Drop the emoji glyph in mono context — keep the label text only.
- Overdue tail line: italic Fraunces 12px in `var(--color-overdue)` — `3 dagen te laat`.
- Upcoming tail line: italic Fraunces 12px in `var(--color-text-muted)` — `over 4 dagen`.
- Right column: outlined "Gedaan" button — same chrome as Plants' "+ Toevoegen" button (lines 266–287): `border: 1px solid var(--color-primary)`, transparent bg, `var(--color-primary)` text, `borderRadius: 100`, `padding: 8px 14px`, mono-equivalent isn't used — `var(--font-body)` 13px, weight 500. On hover: fill `var(--color-primary)`, text `var(--color-surface)`. Suppress for `upcoming` tone.

`CalmEmptyState`:

```tsx
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
```

No bright green, no peacelily SVG.

`TaskSkeletons`: three rows, each a `.card` with three skeleton bars matching the layout (44px square + name bar + meta bar + button shape). Reuse `.skeleton` class.

## Section 4 — Wist je dat (Plant Fact)

```tsx
{plantFact && (
  <section style={{ padding: '0 24px' }}>
    <SectionHeader
      leftLede=""
      rightMarker="§ Wist je dat"
    />
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
```

The card is the `.card` style (paper surface, soft border, subtle shadow) — not the warm-ginger orange block. The plant icon is decoration, not focal point. Fact body is italic Fraunces, matching Plants' lede voice. Footer link uses the dashed top border from Plants' family-name footer.

When `plantFact` is `null`, the entire section is omitted.

## What gets removed

| Removed | Reason |
|---|---|
| `IconScatter` component + `HERO_ICONS`, `MAPS_ICONS`, `TASKS_ICONS`, `FACT_ICONS` arrays | Plants has no decorative scatter; this is the loudest break from the field-guide tone |
| `bg-fog-canvas` / `bg-cream-canvas` per-section backgrounds | Cause the "background only covers part of the screen" issue |
| `max-w-lg mx-auto` wrapper | Forces narrow column; body bg shows in gutters on desktop |
| `StatPill` (bright color block with white text) | Replaced by Plants-style `HeroStat` (number + mono label) |
| `Badge` count chip | Counts now appear inline in the section eyebrow lede |
| `SectionDivider` SVG flourish | Replaced by the thin border-bottom rule Plants uses |
| `getGreeting()`/`getDutchDate()` | Kept (reused) |
| `loadDashboard()`/`loadPlantFact()` | Kept (unchanged) |
| `CareTaskCard` (current implementation) | Replaced by new `TaskCard` matching this spec |
| `Goedemorgen` greeting + `🌱` waving emoji | Greeting text stays; emoji + `animate-[wave_…]` is dropped (silent, editorial tone) |
| Bright `#24e34c` "Gedaan" green button | Replaced by outlined primary-green pill button |
| Bright "Alle planten zijn blij!" Playfair empty state | Replaced by quiet italic Fraunces empty state |

## What stays

- Route `/dashboard` and `/` redirect.
- `BottomNav.tsx` Home tab (already in place).
- All store actions: `loadDashboard`, `loadPlantFact`, `markCareDone`. Surgical optimistic update on done click stays.
- Backend `GET /api/plant-fact` and `dashboard` endpoint. No backend touch.
- `CARE_TYPE_INFO` mapping for care type labels.
- `UserSwitcher` component.

## Implementation notes

- Shared `SectionHeader` component lives inside `Dashboard.tsx` (no separate file). Three call sites.
- The hero is plain JSX in `Dashboard.tsx`; not a separate component.
- Reuse the existing `.no-scrollbar` class for the maps horizontal scroll.
- Verify that Fraunces and JetBrains Mono are loaded from Google Fonts in `groei/frontend/index.html`. If only Fraunces is there (since Plants works), confirm JetBrains Mono is too — if missing, add it.
- Add a `@media (max-width: 720px)` rule in `index.css` for `.home-header` mirroring the existing `.plants-header` rule (smaller padding on mobile).

## Out of scope

- Changing any backend route, DB schema, or care-task logic.
- Adding new tokens to `index.css`. Use the existing palette only.
- Touching `MapPage`, `MapsListPage`, or any page other than `Dashboard.tsx` (plus the one CSS media query).
- Animation work beyond what `.card-glow` and `.skeleton` already provide.
- PWA, offline, or service-worker changes.
- Multi-user / auth changes.

## Follow-up work (separate specs, in order)

The user wants the editorial language applied to every page. Tackled as separate sub-projects after this one ships:

1. **Design-language reference doc** — extract tokens, components, and voice rules from `Plants.tsx` + this spec into a single `docs/reference/design-language.md` so each subsequent restyle spec can cite it instead of re-describing.
2. **Simple pages batch** — `Settings.tsx`, `MapsListPage.tsx`, `PlanningCalendar.tsx`. List/form pages where the Plants pattern translates directly.
3. **Plant-detail flow batch** — `PlantDetail.tsx`, `EditPlant.tsx`, `AddPlant.tsx`, `PlantCareDetail.tsx`. Form-heavy pages; needs its own design call for input/field treatment.
4. **Map chrome (later)** — `MapPage.tsx` toolbars/legends/sheets only. The SVG canvas itself stays untouched.
5. **Layout editor** — out of scope for the editorial pass; specialized UI.
