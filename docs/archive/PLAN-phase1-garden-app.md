# 🌱 Groei — Phase 1 Planning Document

**Garden & Plant Care App — Phase 1: Core Plant Registry + Watering Reminders**

Working title: **Groei** (Dutch for "grow" — short, memorable, works for both of you)

---

## Goal

A mobile-first PWA where Leon and Lisbeth can:

1. Register all their plants (houseplants, balcony pots, moestuin beds)
2. See a daily dashboard of what needs attention
3. Mark care tasks as done (and see who did it)
4. Get timely push notifications for overdue watering

Phase 1 is deliberately focused: get the daily loop right before adding encyclopedias and growth tracking.

---

## Tech Stack

| Layer        | Choice                | Rationale                                              |
| ------------ | --------------------- | ------------------------------------------------------ |
| Frontend     | React 18 + TypeScript + Vite | Same stack as budget app, known workflow          |
| Styling      | Tailwind CSS          | Fast mobile-first styling, utility classes             |
| Backend      | FastAPI (Python)      | Already used in settlement predictor, async-friendly   |
| Database     | SQLite + aiosqlite    | Simple, no infra needed, file-based backup             |
| Auth         | Lightweight — household PIN or simple user toggle | No passwords for phase 1, just identify who's who |
| Hosting      | Local / Tailscale     | Access from both phones via Tailscale (like your other projects), optional Fly.io later |
| PWA          | Vite PWA plugin       | Service worker for offline support + push notifications |

---

## Data Model

### `users`

Simple — just two entries for now.

```sql
CREATE TABLE users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,        -- 'Leon' / 'Lisbeth'
    avatar      TEXT,                         -- emoji or color identifier
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### `locations`

Where in the house / garden the plant lives.

```sql
CREATE TABLE locations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,               -- 'Woonkamer', 'Balkon', 'Moestuin', 'Slaapkamer'
    icon        TEXT,                         -- emoji: 🏠 🌿 🌻 🛏️
    sort_order  INTEGER DEFAULT 0
);
```

### `plants`

The core entity.

```sql
CREATE TABLE plants (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,            -- User-given name: 'Big Monstera', 'Balkon Basilicum'
    species         TEXT,                     -- Scientific/common: 'Monstera deliciosa'
    location_id     INTEGER REFERENCES locations(id),
    photo_path      TEXT,                     -- Path to uploaded photo
    acquired_date   DATE,                     -- When you got it
    pot_size_cm     INTEGER,                  -- Diameter in cm
    last_repotted   DATE,
    notes           TEXT,                     -- Free text
    is_active       BOOLEAN DEFAULT 1,        -- Soft delete / archive for dead plants 🪦
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### `care_schedules`

Defines recurring care tasks per plant.

```sql
CREATE TABLE care_schedules (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    plant_id        INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
    care_type       TEXT NOT NULL,            -- 'water', 'fertilize', 'mist', 'rotate', 'repot_check'
    interval_days   INTEGER NOT NULL,         -- Base interval: e.g. 7 for weekly watering
    season_adjust   TEXT,                     -- JSON: {"winter": 1.5, "summer": 0.7} multiplier
    next_due        DATE NOT NULL,
    last_done       DATETIME,
    last_done_by    INTEGER REFERENCES users(id),
    notes           TEXT,                     -- "Likes bottom watering"
    is_active       BOOLEAN DEFAULT 1,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Season adjustment logic:** `effective_interval = interval_days * season_multiplier`. In winter, a plant with `interval_days=7` and `winter=1.5` becomes every ~10 days. In summer with `summer=0.7`, every ~5 days.

Season definitions (Amsterdam):
- Spring: Mar 21 – Jun 20
- Summer: Jun 21 – Sep 22
- Autumn: Sep 23 – Dec 20
- Winter: Dec 21 – Mar 20

### `care_log`

Immutable record of every care action.

```sql
CREATE TABLE care_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    plant_id        INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
    care_type       TEXT NOT NULL,
    done_by         INTEGER NOT NULL REFERENCES users(id),
    done_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes           TEXT,                     -- "Leaves looked droopy", "Gave extra water"
    skipped         BOOLEAN DEFAULT 0         -- Mark as "checked, didn't need it"
);
```

---

## API Routes

### Auth / Users

```
GET    /api/users                    → List users
POST   /api/users/select/{user_id}  → Set active user (cookie/session)
```

### Plants

```
GET    /api/plants                   → List all plants (with next_due info)
GET    /api/plants/{id}              → Plant detail + care history
POST   /api/plants                   → Add new plant
PUT    /api/plants/{id}              → Update plant
DELETE /api/plants/{id}              → Archive plant (soft delete)
POST   /api/plants/{id}/photo       → Upload plant photo
```

### Locations

```
GET    /api/locations                → List locations
POST   /api/locations                → Add location
```

### Care

```
GET    /api/dashboard                → Today's care tasks (sorted by urgency)
GET    /api/dashboard/upcoming       → Next 7 days overview
POST   /api/care/done                → Mark task as done { plant_id, care_type, user_id, notes? }
POST   /api/care/skip                → Mark as checked/skipped
GET    /api/care/log/{plant_id}      → Care history for a plant
```

### Dashboard Response Shape

```json
{
  "overdue": [
    {
      "plant_id": 1,
      "plant_name": "Big Monstera",
      "plant_photo": "/photos/monstera.jpg",
      "location": "Woonkamer",
      "care_type": "water",
      "days_overdue": 2,
      "last_done_by": "Lisbeth",
      "last_done_at": "2026-04-02T09:30:00"
    }
  ],
  "due_today": [...],
  "upcoming": [...]
}
```

---

## Frontend Components

### Pages

```
/                   → Dashboard (daily care overview)
/plants             → Plant collection grid
/plants/add         → Add new plant form
/plants/:id         → Plant detail + care log
/settings           → User selection, locations, preferences
```

### Component Tree

```
App
├── BottomNav                        # Mobile tab bar: Dashboard | Plants | Add (+) | Settings
├── UserSwitcher                     # Top bar — shows active user, tap to switch
│
├── DashboardPage
│   ├── DayGreeting                  # "Goedemorgen Leon 🌱 — 3 plants need you"
│   ├── OverdueSection               # Red/urgent cards
│   │   └── CareTaskCard             # Plant photo, name, care type, days overdue, [Done] button
│   ├── DueTodaySection              # Normal priority cards
│   │   └── CareTaskCard
│   └── UpcomingPreview              # Compact list of next 3 days
│
├── PlantsPage
│   ├── LocationFilter               # Horizontal scroll pills: All | Woonkamer | Balkon | Moestuin
│   └── PlantGrid                    # Cards with photo, name, status dot (green/yellow/red)
│       └── PlantCard
│
├── PlantDetailPage
│   ├── PlantHeader                  # Photo, name, species, location
│   ├── CareScheduleList             # Current schedules with next due dates
│   ├── QuickActions                 # [Water Now] [Fertilize] [Add Note]
│   └── CareHistory                  # Timeline of past care actions
│
├── AddPlantPage
│   ├── PhotoUpload                  # Camera / gallery picker
│   ├── PlantInfoForm                # Name, species, location, pot size
│   └── CareScheduleSetup            # Set watering interval, fertilize interval, etc.
│
└── SettingsPage
    ├── UserManagement               # Switch user, edit names
    ├── LocationManager              # Add/edit/reorder locations
    └── NotificationPrefs            # Enable/disable push, quiet hours
```

### Key UX Decisions

- **Dashboard-first**: The app opens to "what needs doing today" — not a plant list
- **One-tap done**: Swipe or tap to mark a task as done, no extra confirmation
- **Who did it**: Every action is tagged with the user — prevents double-watering
- **Color coding**: 🔴 Overdue (2+ days past due) → 🟡 Due today → 🟢 All good
- **Mobile-first**: Designed for phone use in the garden with wet hands — big tap targets, simple flows

---

## Design Direction

**Aesthetic: Organic & warm — not clinical**

Think: a beautiful plant journal, not a task manager.

- Warm earthy palette: deep greens, terracotta, cream/linen backgrounds, warm grays
- Rounded cards with subtle shadows (feels tactile, like pots)
- Photography-forward: plant photos are the hero element
- Typography: a friendly serif or rounded sans-serif for headings, clean sans for body
- Subtle botanical illustrations or leaf patterns as decorative accents
- Season-aware: the UI could shift slightly with seasons (warmer tones in summer, cooler in winter)

**Color tokens (starting point):**

```css
--color-bg:         #FAF6F1;   /* warm linen */
--color-surface:    #FFFFFF;
--color-primary:    #2D6A4F;   /* deep plant green */
--color-secondary:  #B7654B;   /* terracotta accent */
--color-text:       #2C2C2C;
--color-text-muted: #8B8577;
--color-overdue:    #C1443E;   /* warm red */
--color-due:        #D4A843;   /* amber */
--color-good:       #5B9A6F;   /* healthy green */
```

---

## PWA & Notifications

### Service Worker Setup

Use `vite-plugin-pwa` with:
- **Precaching** of app shell (HTML, CSS, JS, icons)
- **Runtime caching** for plant photos (cache-first strategy)
- **Background sync** for offline care logging (mark as done while in garden → syncs when back online)

### Push Notifications

For Phase 1, use a simple approach:
1. Backend runs a daily check at a configurable time (e.g., 08:00)
2. If there are overdue or due-today tasks → send push notification
3. Use Web Push API with VAPID keys
4. Message format: "🌱 3 plants need water today — Monstera is 2 days overdue!"

**Alternative (simpler start):** skip push notifications in Phase 1a and rely on the dashboard. Add push in Phase 1b once the core loop is solid.

---

## File & Folder Structure

```
groei/
├── frontend/
│   ├── public/
│   │   ├── manifest.json
│   │   └── icons/                   # PWA icons
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/
│   │   │   └── client.ts            # Fetch wrapper for API calls
│   │   ├── components/
│   │   │   ├── BottomNav.tsx
│   │   │   ├── UserSwitcher.tsx
│   │   │   ├── CareTaskCard.tsx
│   │   │   ├── PlantCard.tsx
│   │   │   ├── PhotoUpload.tsx
│   │   │   └── ...
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Plants.tsx
│   │   │   ├── PlantDetail.tsx
│   │   │   ├── AddPlant.tsx
│   │   │   └── Settings.tsx
│   │   ├── hooks/
│   │   │   ├── usePlants.ts
│   │   │   ├── useDashboard.ts
│   │   │   └── useActiveUser.ts
│   │   ├── types/
│   │   │   └── index.ts
│   │   └── styles/
│   │       └── globals.css          # Tailwind + CSS variables
│   ├── index.html
│   ├── tailwind.config.ts
│   ├── vite.config.ts
│   └── package.json
│
├── backend/
│   ├── main.py                      # FastAPI app entry
│   ├── database.py                  # SQLite setup, migrations
│   ├── models.py                    # Pydantic models
│   ├── routers/
│   │   ├── plants.py
│   │   ├── care.py
│   │   ├── dashboard.py
│   │   ├── locations.py
│   │   └── users.py
│   ├── services/
│   │   ├── scheduling.py            # Season-adjusted interval calc
│   │   └── notifications.py         # Push notification logic
│   ├── photos/                      # Uploaded plant photos
│   ├── groei.db                     # SQLite database
│   └── requirements.txt
│
├── PLAN-phase1-garden-app.md        # This file
├── PLAN-phase2-encyclopedia.md      # Future
└── README.md
```

---

## Implementation Order

Work through these in sequence. Each step results in something usable:

### Step 1 — Project scaffold + database (Day 1)
- [ ] Init Vite + React + TS frontend
- [ ] Init FastAPI backend
- [ ] Create SQLite schema (all tables above)
- [ ] Seed with 2 users (Leon, Lisbeth) and 4 default locations
- [ ] Verify API starts and returns empty plant list

### Step 2 — Add plants (Day 1-2)
- [ ] `POST /api/plants` endpoint with validation
- [ ] `GET /api/plants` with location join
- [ ] AddPlant page: form with name, species, location picker, pot size
- [ ] Photo upload (camera/gallery → store in backend/photos/)
- [ ] Plants grid page showing all plants with photos

### Step 3 — Care schedules (Day 2)
- [ ] Care schedule CRUD tied to plant creation
- [ ] Default schedules: prompt user for watering frequency on add
- [ ] Season adjustment calculation in `services/scheduling.py`
- [ ] `next_due` auto-calculation on schedule creation

### Step 4 — Dashboard (Day 2-3)
- [ ] `GET /api/dashboard` endpoint: query care_schedules, bucket by overdue/today/upcoming
- [ ] Dashboard page with sections and CareTaskCards
- [ ] "Mark as done" flow → POST /api/care/done → updates next_due → refreshes dashboard
- [ ] User switcher in top bar

### Step 5 — Plant detail + care history (Day 3)
- [ ] Plant detail page with photo, info, active schedules
- [ ] Care log timeline (who did what, when)
- [ ] Quick action buttons (water now, add note)
- [ ] Edit plant info

### Step 6 — Polish + PWA (Day 3-4)
- [ ] Tailwind theming with the earthy color palette
- [ ] Bottom navigation with active states
- [ ] PWA manifest + service worker
- [ ] Responsive polish (test on phone via Tailscale)
- [ ] Loading states, empty states, error handling

### Step 7 (optional) — Push notifications (Day 4+)
- [ ] VAPID key generation
- [ ] Notification permission request flow
- [ ] Daily scheduler that sends push for overdue/due plants
- [ ] Notification click → opens dashboard

---

## Default Care Types & Suggested Intervals

Pre-populate these as suggestions when adding a plant:

| Care Type      | Icon | Typical Indoor | Typical Outdoor | Notes                        |
| -------------- | ---- | -------------- | --------------- | ---------------------------- |
| Water          | 💧   | 7 days         | 2-3 days        | Most variable by season      |
| Fertilize      | 🧪   | 14-30 days     | 14 days         | Only during growing season   |
| Mist           | 🌫️   | 3 days         | —               | Tropical plants              |
| Rotate         | 🔄   | 14 days        | —               | For even light exposure      |
| Repot check    | 🪴   | 180 days       | 365 days        | "Is it root bound?"          |
| Prune          | ✂️   | 90 days        | 30 days         | Season dependent             |

---

## Notes for Claude Code Implementation

When working in Claude Code, reference this plan:
- Start each session by reviewing this file and the current state
- Commit after each step with descriptive messages
- Keep the budget app patterns: similar API client structure, similar page layouts
- Test on phone early (Step 4) — the dashboard UX is the make-or-break

---

## Future Phases (not in scope now)

- **Phase 2**: Plant encyclopedia + Claude AI tips integration
- **Phase 3**: Growth tracking with photo timeline
- **Phase 4**: Stekjes / propagation guides, moestuin harvest tracking
- **Phase 5**: Weather API integration (Amsterdam forecast → "extra water needed this week")
