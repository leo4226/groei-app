# Floreren — Plant Care PWA

Mobile-first PWA for Leon & Lisbeth (Amsterdam) to track plants, log care, and visualise their garden and indoor spaces. Built to eventually support other users with their own gardens.

## Dev

All commands run from the repo root:

```
npm run dev          # starts both frontend (port 5173) and backend (port 8000)
npm run dev:frontend
npm run dev:backend
```

Verify features in a desktop browser. Mobile testing not required during development.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS |
| State | Zustand — `useFloreren` (FlorerStore) |
| Backend | FastAPI + Python + asyncpg (prod: PostgreSQL, dev: SQLite) |
| PWA | vite-plugin-pwa |

## Project structure

```
Floreren/
  frontend/src/
    pages/          # route-level components
    components/
      map/          # map view (read-only garden/indoor display)
      editor/       # layout editor (draw zones, rooms, walls)
      sheets/       # bottom sheet panels
      sun/          # sun position + heatmap overlays
    store/          # useFloreren.ts (Zustand)
    utils/          # coordinate math, sun calc, shadow geometry
    hooks/
  backend/
    routers/        # FastAPI route modules
    models.py       # Pydantic response models
    main.py
    groei.db        # local SQLite (dev only)
```

## Routes

| Path | Page |
|---|---|
| `/maps` | Map list |
| `/maps/:id/edit-layout` | Layout editor |
| `/map/:slug` | Garden/indoor map view |
| `/dashboard` | Daily care overview |
| `/plants` | Plant list |
| `/calendar` | Planning calendar |
| `/settings` | Settings |

## Map system

### Map types

Every map has a `type: 'outdoor' | 'indoor'`:

- **garden** — outdoor space. Has `lat`, `lon`, compass `bearing` (direction the map's "up" points), and real-world dimensions. Sun overlay and shadow simulation apply.
- **indoor** — floor plan with rooms, walls, doors, windows. No GPS, no sun features.

### SVG canvas

- The SVG `viewBox` comes from `map.viewbox` in the DB — never hardcode it.
- The SVG scales to fill its container using `preserveAspectRatio="xMidYMid meet"` (letterbox, no rotation).
- On mobile, the SVG container uses a 90° CSS rotation (`rotate(-90deg) translateX(-100%)`) to present landscape maps in portrait. `screenToSVG()` handles this via `getScreenCTM()` — no manual rotation math needed.
- Scale is `PX_PER_M = 46` (46 px = 1 m). This will become per-map; do not assume it is fixed.

### Coordinate system

SVG coordinates are the source of truth. `screenToSVG()` converts pointer events to SVG space. Do not apply manual rotation transforms when computing coordinates.

### Shadow casters

Shadow casters are derived per-map from canvas data via `deriveAllShadowCasters()` in `utils/gardenFromCanvas.ts`. The function combines fence casters, structure casters (both computed from zones), and per-map `shadowCasters` stored in canvas data. The editor supports adding/editing/deleting shadow casters per map. Sun overlays (`SunDebugOverlay`, `SunDirectionArrow`, `SunHeatmap`, `DebugSvfOverlay`) now take `gardenBounds` (and bearing/lat/lon where relevant) as required per-map props — there is no hardcoded garden constant left. The remaining hardcoded scale is `PX_PER_M = 46` in `gardenStructures.ts`; it is still assumed fixed across maps.

## New garden onboarding

When a user creates a new garden, the minimum required fields are:
- Name
- Dimensions (width × depth in metres)
- GPS location (lat/lon) — for sun position
- Compass bearing of the map's "up" direction

Indoor maps only need a name and dimensions.

## Users

JWT-based auth (`jose` library, `sub=account_id`). Accounts belong to one Household. Leon's garden: Amsterdam, 52.3715°N 4.8499°E.

## Deployment

### Backend — Fly.io

App: `floreren-api`, region `ams`, `shared-cpu-1x` / 256 MB. Neon Postgres (connection string in Fly secrets). Release command runs `alembic upgrade head` on every deploy.

```bash
# Set a secret (auto-restarts machines)
flyctl secrets set KEY=value -a floreren-api --remote-only

# Deploy (builds Docker image, rolls new machines)
flyctl deploy -a floreren-api --remote-only

# Health check
curl https://floreren-api.fly.dev/health
```

Fly binary: `~/.fly/bin/flyctl` (export PATH). Never use `--local-only` — always `--remote-only`.

Key Fly secrets:
| Secret | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string |
| `JWT_SECRET` | JWT signing key |
| `BIOCLIP_WORKER_URL` | `https://bioclip.floreren.app` — remote GPU worker |
| `ANTHROPIC_API_KEY` | Care threshold generation (Claude Haiku) |
| `RESEND_API_KEY` | Transactional email |
| `PLANTNET_API_KEY` | PlantNet fallback identification |
| `R2_*` | Cloudflare R2 for image uploads |

### Frontend — Vercel

```bash
cd frontend
npx vercel deploy --prod --yes           # deploys production build
npx vercel alias <deploy-url> floreren.app  # point domain to new deploy
```

### BioCLIP Worker

Runs on **Windows** (Leon's desktop, AMD Ryzen 7 5800X, RTX 2070, 16 GB) on port `8001`. WSL accesses it at `localhost:8001`. Health: `GET /health` → `{"status":"ok","model_loaded":true,"embeddings_loaded":true,"device":"cuda"}`.

The Fly backend offloads plant identification to this worker via `BIOCLIP_WORKER_URL`. When the env var is set (production), `main.py` skips local BioCLIP preloading — the backend image does not include torch/open_clip.

### Cloudflare Tunnel (bioclip.floreren.app)

Permanent named tunnel exposing the BioCLIP worker securely to the internet. Setup:

| Component | Detail |
|---|---|
| Tunnel name | `bioclip-worker` |
| Tunnel ID | `d3e07eaa-19d7-43a7-9314-5526adb16173` |
| Domain | `bioclip.floreren.app` |
| DNS | CNAME → `d3e07eaa-19d7-43a7-9314-5526adb16173.cfargotunnel.com` (proxied) |
| Service | Windows service `Cloudflared` — auto-starts at boot |
| Config path | `C:\Windows\System32\config\systemprofile\.cloudflared\config.yml` |
| Ingress | `bioclip.floreren.app` → `http://localhost:8001`, default → 404 |

**Config file** (`config.yml`):
```yaml
tunnel: d3e07eaa-19d7-43a7-9314-5526adb16173
credentials-file: C:\Windows\System32\config\systemprofile\.cloudflared\d3e07eaa-19d7-43a7-9314-5526adb16173.json

ingress:
  - hostname: bioclip.floreren.app
    service: http://localhost:8001
  - service: http_status:404
```

**Windows service management:**
```cmd
sc query Cloudflared       # check status
sc stop Cloudflared        # stop
sc start Cloudflared       # start
taskkill /F /IM cloudflared.exe   # force kill if hung
```

**Tunnel lifecycle** (if re-creating from scratch):
```cmd
cloudflared tunnel login                  # one-time: browser auth, saves cert.pem
cloudflared tunnel create bioclip-worker  # creates credentials JSON
cloudflared tunnel route dns bioclip-worker bioclip.floreren.app
cloudflared service install               # registers as Windows service
```

Credentials (`cert.pem`, `config.yml`, `<tunnel-id>.json`) must live in BOTH:
- `%USERPROFILE%\.cloudflared\` (for `cloudflared tunnel` CLI commands)
- `C:\Windows\System32\config\systemprofile\.cloudflared\` (for the `LocalSystem` service)

### DNS

`floreren.app` on Cloudflare (NS: `emerie.ns.cloudflare.com`, `garrett.ns.cloudflare.com`). Apex → Vercel. `api.floreren.app` → Fly. `bioclip.floreren.app` → Cloudflare Tunnel (CNAME proxied).

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`leo4226/groei-app`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — `CONTEXT.md` + `docs/adr/` at repo root. See `docs/agents/domain.md`.
