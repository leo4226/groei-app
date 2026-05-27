# AddPlant Page Redesign — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Upgrade `AddPlant.tsx` from a simple single-column form to a rich two-column layout matching the `/mnt/c/Users/leon_/Downloads/Floreren Toevoegen.html` design — card-based sections, tile/chip/slider controls, zone picker, calendar preview, and sticky action bar.

**Architecture:** The page already has all data state (name, species, icon, location, potSize, schedules, etc.) wired to `useFloreren` store. We keep the same data flow — only the visual layer changes. New reusable components for shared UI patterns (tile grid, chip cluster, frequency slider, zone card). CSS stays in Tailwind v4 with the existing theme tokens.

**Tech Stack:** React 19 + TypeScript, Tailwind v4, Zustand (useFloreren), Vite

**Current page:** `frontend/src/pages/AddPlant.tsx` (704 lines)
**Design reference:** `/mnt/c/Users/leon_/Downloads/Floreren Toevoegen.html` (2200 lines, includes CSS + JS for demo interactivity)

**Theme mapping (design CSS vars → existing Tailwind tokens):**

| Design var | Tailwind token | Value |
|---|---|---|
| `--ink` | `text` | `#1F2A1E` |
| `--ink-soft` | `text-soft` | `#4A5A44` |
| `--ink-faint` | `text-muted` | `#8A9482` |
| `--accent` | `primary` | `#2F5D3A` |
| `--accent-dk` | `primary-dark` | `#1E3F26` |
| `--accent-hl` | `primary-highlight` | `#8FA882` |
| `--terra` | `secondary` | `#B2664A` |
| `--rule` | `border` | `#D9CFB8` |
| `--rule-soft` | `border-soft` | `#E5DCC3` |
| `--paper` | **MISSING — needs adding** | `#FFFEF9` |

**Fonts:** Fraunces, Inter, JetBrains Mono — **already loaded** in `index.html` and defined as Tailwind `--font-heading`, `--font-body`, `--font-mono`.

---

## Phase 1: Foundation — CSS tokens + card component

### Task 1: Add `--color-paper` to theme

**Files:** `frontend/src/index.css`

Add `--color-paper: #FFFEF9` to the `@theme` block so cards use the lighter paper color from the design.

```css
--color-paper: #FFFEF9;
```

**Verify:** `npm run dev`, inspect a card element — paper color should be available as Tailwind class `bg-paper`.

### Task 2: Create `<Card>` layout component

**Files:** Create `frontend/src/components/ui/Card.tsx`

The design uses a consistent card pattern with optional header (eyebrow + title + subtitle + action link). Extract this as a reusable component.

```tsx
interface CardProps {
  eyebrow?: string        // "§ I · Identiteit"
  title?: React.ReactNode // "Geef haar <em>een naam</em>."
  subtitle?: string
  action?: React.ReactNode // right-aligned action (link/button)
  children: React.ReactNode
  className?: string
}
```

Renders: a `<section>` with `bg-paper border border-border rounded-xl overflow-hidden`. Optional header row with eyebrown/title/subtitle left, action right.

**Verify:** Use `<Card eyebrow="§ Test" title="Test <em>card</em>.">content</Card>` in any page, check it renders.

### Task 3: Create `<FormRow>` layout component

**Files:** Create `frontend/src/components/ui/FormRow.tsx`

Every form field in the design follows a two-column pattern: label column (name + description) and control column (input/buttons). Extract this.

```tsx
interface FormRowProps {
  label: string         // e.g. "Bijnaam"
  description?: string  // e.g. "Hoe je haar noemt"
  help?: string         // help text below the control
  children: React.ReactNode
}
```

Left column: `label` in `font-medium text-sm text-text`, `description` in smaller muted. Right column: `children` + optional `help` text below in small muted with italic accents.

---

## Phase 2: Page shell — Masthead + two-column grid

### Task 4: Add masthead with breadcrumb + stepper

**Files:** Modify `frontend/src/pages/AddPlant.tsx`

Replace current simple header (`← Add Plant`) with the design masthead:

- Navigation bar: links to Vandaag/Tuinkaart/Collectie/Kalender/Instellingen (reuse existing nav if there's a shared component; otherwise hardcode links)
- Title row: eyebrow "§ Collectie → Toevoegen", big Fraunces title, lede text
- Stepper: vertical step list (I-IV) showing progress — static for now, only step II is "on"

**Width:** Constrain to `max-w-[1380px] mx-auto` with horizontal padding.

**Verify:** Navigate to `/add`, see the masthead with breadcrumb, title, and stepper. Stepper shows step II as active.

### Task 5: Set up two-column form grid

**Files:** Modify `frontend/src/pages/AddPlant.tsx`

After the masthead, wrap form content in a two-column CSS grid:

```html
<div class="grid grid-cols-[1fr_420px] gap-8 max-w-[1380px] mx-auto px-12">
  <div class="space-y-6">
    <!-- LEFT: Identity, Placement, Care, Album cards -->
  </div>
  <div class="space-y-6">
    <!-- RIGHT: Calendar preview, Species reference cards -->
  </div>
</div>
```

Right column fixed at 420px, left column flexible. On mobile (`<1180px`): single column.

**Verify:** Open `/add` at desktop width — see two columns. Resize to mobile — single column.

---

## Phase 3: Entry Banner

### Task 6: Build entry banner with Route A/B tabs

**Files:** Create `frontend/src/components/add/EntryBanner.tsx`

Two horizontal tab cards side by side. "Route A: Uit database" shows a list icon with "Bladeren door 2 891 soorten". "Route B: Met foto" shows camera icon with "Herkend uit foto · veldwerk".

Active tab gets the `.on` style: `border-primary bg-primary/5`. Tabs switch between the "from database" view and the "from photo" view for the body below.

**Body:** When "from database" tab active, show: species icon large + species name + sci name + meta stats + alternative species. When "from photo" tab active, show: photo preview with focus corners + same ID card format but with confidence scores.

Tab state: use `isFromDatabase` / `isFromIdentify` props passed from parent.

**Verify:** On `/add?from=identify`, Route B is active showing photo + identification results. On manual/database entry, Route A is active.

---

## Phase 4: Identity Card (§ I)

### Task 7: Replace name/species/icon/phase fields with Identity card

**Files:** Modify `frontend/src/pages/AddPlant.tsx`

Wrap the existing name, species, icon, and phase fields in a `<Card>` component. Replace current Tailwind inputs with the design's styled inputs:

- **Nickname row:** Two inputs side by side — "Lente-orchidee" (main) + "ORCH-048" (code, mono font). Code input is auto-generated from species + plant number.
- **Species row:** Two inputs — Dutch name + Latin name (italic).
- **Form tiles:** "In pot" / "In de grond" / "Zaailing" / "Boomvorm" — each with SVG icon + Dutch label + English subtitle. Only two needed for MVP: "In pot" and "In de grond". Use existing `tile` button pattern from design.
- **Life phase:** Segmented control with `seed | sprout | seedling | young | established`. Maps to existing `phase` state.
- **Acquisition:** Date input + location text (e.g. "Tuincentrum Overvecht").

**Reuse existing state variables:** `name`, `species`, `phase`, `acquiredDateInput`. No new state.

**Verify:** Fill in the Identity card fields, submit — values reach the backend correctly.

### Task 8: Create tile and segmented-control components

**Files:** Create `frontend/src/components/ui/TileGrid.tsx`, `frontend/src/components/ui/SegmentedControl.tsx`

**TileGrid:** A row of `<button>` tiles, each with optional SVG glyph + title + subtitle. Only one can be `on` at a time (unless `multi`). Props: `options: {id, glyph, title, subtitle}[]`, `value`, `onChange`.

```tsx
<TileGrid
  options={[
    { id: 'pot', glyph: <PotSVG />, title: 'In pot', subtitle: 'Potted' },
    { id: 'ground', glyph: <GroundSVG />, title: 'In de grond', subtitle: 'Bare' },
  ]}
  value={formType}
  onChange={setFormType}
/>
```

**SegmentedControl:** Horizontal row of `<button>` segments. Props: `options: {id, label}[]`, `value`, `onChange`.

```tsx
<SegmentedControl
  options={[
    { id: 'seed', label: 'Zaad' },
    { id: 'sprout', label: 'Kiem' },
    { id: 'seedling', label: 'Zaailing' },
    { id: 'young', label: 'Jong' },
    { id: 'established', label: 'Volwassen' },
  ]}
  value={phase}
  onChange={setPhase}
/>
```

**Verify:** Click tiles and segments — selection updates, only one active at a time. Visual style matches design.

---

## Phase 5: Placement Card (§ II)

### Task 9: Build zone picker

**Files:** Create `frontend/src/components/add/ZonePicker.tsx`

Shows available zones as cards: each has a mini colored square (indoor = warm tone, outdoor zones A/B/C = green tones) + zone name + description + plant count. "Slaapkamer · raam oost" with "Binnen · 19-22°C" subtitle and "3 planten" count. Plus a "+ Nieuwe ruimte" card at the end.

Below the zone cards: a small advice box with species-specific placement tip (e.g. "Tip voor Phalaenopsis: oost-raam is bijna ideaal...").

Props: `zones: {id, name, description, plantCount, isIndoor}[]`, `value`, `onChange`, `advice?: string`.

**Verify:** Click a zone card — it highlights. The selected zone ID updates the parent's `locationId` state.

### Task 10: Build light measurement tiles + pot/substrate controls

**Files:** Modify `frontend/src/pages/AddPlant.tsx`

**Light tiles:** Use `<TileGrid>` with 5 options: Donker (≤500 lx), Schaduw (500–2k), Indirect (2–10k), Helder (10–25k), Vol zon (>25k). Each with an SVG sun icon of increasing intensity. Maps to `sunRequirement` state.

**Pot material tiles:** Terracotta / Plastic / Keramiek / Mand·vlecht — each with SVG pot icon. Below tiles: two number inputs (cm Ø, cm hoog) + "Heeft drainagegat" checkbox styled as chip. Maps to `potSize` (we currently only have one pot size field — this is a design upgrade: consider adding `pot_material` and `pot_has_drainage` to the backend if important, or just make these visual-only for MVP).

**Substrate chips:** Multi-select chip cluster: "Orchideeën-bast", "Universele potgrond", "Kokosvezel", "Perliet", "Sphagnum", "Akadama", "Kalkrijk", "Zandig", "+ Anders". Each chip toggles on/off. Create `<ChipCluster>` component (see Task 11).

**Verify:** Select light/pot/substrate — visual feedback works. Values don't need to persist to backend for MVP unless user explicitly wants them.

### Task 11: Create ChipCluster component

**Files:** Create `frontend/src/components/ui/ChipCluster.tsx`

Multi-select pill buttons. Props: `options: string[]`, `selected: string[]`, `onChange: (selected: string[]) => void`. Each chip shows a ✓ prefix when selected. Styled with `rounded-full border px-3 py-1.5 font-heading text-sm`.

**Verify:** Click chips — they toggle on/off independently. Multiple can be selected.

---

## Phase 6: Care Card (§ III)

### Task 12: Build frequency slider component

**Files:** Create `frontend/src/components/add/FrequencySlider.tsx`

A horizontal track with draggable knob. Shows fill from left edge to knob position. Tick marks below at regular intervals (Day, 3d, Week, 10d, 2wk, Month). Right side shows current value ("7 days") + unit ("≈ 120 ml").

Props: `value: number`, `onChange: (value: number) => void`, `marks: {label, value}[]`, `unit?: string`, `showAmount?: boolean`.

For MVP: use click-to-set (click anywhere on track) + mouse drag. Touch support nice-to-have.

**Verify:** Drag the slider — fill and knob move smoothly. Value display updates. Default at "Week" (value=7).

### Task 13: Wire care schedules into sliders

**Files:** Modify `frontend/src/pages/AddPlant.tsx`

Replace the current checkbox + number-input care schedule UI with:
- **Water:** `<FrequencySlider>` with marks (Day, 3d, Week, 10d, 2wk, Month) + amount input (ml) + method toggle (Gieter/Onderdompelen/Verstuiven). Below: advice box with species-specific watering tip.
- **Voeding:** `<FrequencySlider>` with marks (Wekelijks, 2wk, 3wk, 4wk, 6wk, Nooit) + season note. Below: `<ChipCluster>` for fertilizer type.
- **Snoeien:** `<SegmentedControl>` (Niet nodig, Maandelijks, Per seizoen, Jaarlijks).
- **Verpotten:** `<SegmentedControl>` (Jaarlijks, Om de 2 jaar, Om de 3 jaar, Aan de wortels). Below: last repot date info + button.
- **Bescherming:** `<ChipCluster>` for alert triggers (Onder 12°C, Boven 28°C, etc.).
- **Foto-ritme:** `<SegmentedControl>` (Wekelijks, Tweewekelijks, Maandelijks, Bij bloei, Nooit).

Map slider/segment values back to `schedules` state object (days + enabled).

**Verify:** Adjust water frequency slider to "Week" → schedule.water.enabled=true, schedule.water.days=7. Submit — backend receives correct intervals.

---

## Phase 7: Right Column

### Task 14: Build calendar preview

**Files:** Create `frontend/src/components/add/CalendarPreview.tsx`

Two parts:
1. **Month grid:** A 7-column calendar grid for the current month. Day names header. Muted cells for previous/next month days. Today highlighted. Pips (colored dots) on days with scheduled tasks. Navigation arrows to switch months.
2. **Upcoming tasks:** List of first 5 tasks with: date (e.g. "Do 14 mei"), task description (e.g. "Onderdompelen · 120 ml"), subtitle, colored badge (Water/Voed/Snoei/etc.).

Data source: compute from current `schedules` state + start date (acquired date or today).

**Verify:** Enter a plant with water=7d, feeding=21d → calendar shows water pips every 7 days, feeding pips every 21 days. Upcoming tasks list shows first 5 correctly.

### Task 15: Build species reference card

**Files:** Create `frontend/src/components/add/SpeciesReference.tsx`

A `<Card>` showing key facts about the selected species: Familie, Herkomst, Levensduur, Volle hoogte, Bloeiperiode, Voorkeursvocht, Voorkeurstemp, Minimum, Giftig voor, Moeilijkheid. Each fact is a horizontal row: monospace label + Fraunces value.

Data source: `prefill` object (LocalPlant or IdentifyCommitResult). For IdentifyCommitResult, extract what's available from the match result. For database prefill, use LocalPlant fields. For manual entry, show placeholder ("— selecteer een soort —").

**Verify:** Navigate from database (Phalaenopsis) → species card shows Orchidaceae, Indonesië·Filipijnen, 10-15 jaar, etc.

---

## Phase 8: Action Bar + Photo/Notes

### Task 16: Build sticky action bar

**Files:** Modify `frontend/src/pages/AddPlant.tsx`

Fixed bottom bar with:
- Left: plant icon (small) + name/species + location/pot summary
- Center: task count ("27 taken gepland over 12 maanden — eerste op donderdag 14 mei")
- Right: "Annuleren" (ghost), "Bewaar als concept" (outline), "Toevoegen aan collectie" (primary with checkmark icon)

Wire: cancel → `navigate(-1)`, save concept → just close (save nothing for MVP), add → `handleSubmit`.

**Verify:** Scroll the page — action bar stays fixed at bottom. Click cancel → navigates back. Click add → submits form.

### Task 17: Album card (§ IV)

**Files:** Modify `frontend/src/pages/AddPlant.tsx`

Photo strip: 4 square thumbnails. First one shows the uploaded photo (or placeholder with "— vandaag —"). Others are "+ foto" placeholders. Below: notes textarea with placeholder.

**Verify:** Upload a photo via the entry banner or album card — first thumbnail shows preview. Type notes → textarea fills.

---

## Phase 9: Integration & Polish

### Task 18: Wire existing identify flow into new design

**Files:** Modify `frontend/src/pages/AddPlant.tsx`

Ensure the three entry flows work:
- **from='identify':** Route B tab active, entry banner shows photo + BioCLIP identification result with confidence scores + alternatives
- **from='pick':** Still shows PlantPickerSheet first, then form with database prefill → Route A tab active
- **from='manual':** Empty form, Route A tab active (but shows "manual entry" instead of database stats)

**Verify:** Go through each flow — `/identify` → photo → identify → AddPlant shows results. Database pick → AddPlant shows species info. Manual → empty form.

### Task 19: Mobile responsive

**Files:** Modify `frontend/src/pages/AddPlant.tsx`

At `<1180px`: single column, stepper moves below title (horizontal), action bar stacks vertically. At `<640px`: further reduce padding, tiles become 2-column grid instead of 4/5.

**Verify:** Resize browser to iPhone SE width → form is usable, no horizontal overflow, action bar buttons accessible.

### Task 20: Remove old form code + typecheck

**Files:** Modify `frontend/src/pages/AddPlant.tsx`

After all sections are migrated, remove the old form JSX (the simple `<form>` with Tailwind inputs). Run `npx tsc --noEmit` in `frontend/` to verify no type errors.

**Verify:** `npx tsc --noEmit` passes. `npm run dev` — page loads without errors.

---

## Risks & Tradeoffs

1. **Backend fields:** Design introduces `pot_material`, `pot_has_drainage`, `substrate`, `fertilizer_type`, `protection_alerts` — none exist in the backend. For MVP, make these visual-only (don't persist). Add backend fields later if needed.

2. **Calendar preview:** Computing schedule dates clientside duplicates backend logic. Acceptable for preview — the actual schedule is still computed server-side on plant creation.

3. **Mobile PWA:** The design is desktop-first. Mobile adaptations use the existing PWA layout patterns (`mobile-pwa-layout` skill). Test thoroughly on narrow viewports.

4. **Performance:** 2200 lines of CSS in the design are mostly layout + decorative. Tailwind's utility classes will handle most of this without custom CSS — we only need `index.css` additions for the paper color and any complex selectors (focus corners, frequency slider track).

5. **Scope creep:** The design has many nice-to-haves (animated tab switching, drag-to-reorder alternatives, month navigation in calendar). MVP should skip animations and focus on static but beautiful layout.

---

## Files Summary

| File | Action | Purpose |
|---|---|---|
| `frontend/src/index.css` | Modify | Add `--color-paper` |
| `frontend/src/pages/AddPlant.tsx` | Major rewrite | New page layout |
| `frontend/src/components/ui/Card.tsx` | Create | Card container |
| `frontend/src/components/ui/FormRow.tsx` | Create | Two-column form row |
| `frontend/src/components/ui/TileGrid.tsx` | Create | Tile selector |
| `frontend/src/components/ui/SegmentedControl.tsx` | Create | Segmented button row |
| `frontend/src/components/ui/ChipCluster.tsx` | Create | Multi-select chips |
| `frontend/src/components/add/EntryBanner.tsx` | Create | Route A/B tabs + species display |
| `frontend/src/components/add/ZonePicker.tsx` | Create | Location zone picker |
| `frontend/src/components/add/FrequencySlider.tsx` | Create | Care schedule slider |
| `frontend/src/components/add/CalendarPreview.tsx` | Create | Month grid + upcoming tasks |
| `frontend/src/components/add/SpeciesReference.tsx` | Create | Species fact sheet |
