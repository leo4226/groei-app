# Floreren Cloud Migration — Roadmap

Reference document for the 3-phase migration from local-only to a multi-tenant cloud app.
Each phase has its own executable plan in `docs/plans/in-progress/`.

## Decisions (locked 2026-05-16)

| # | Decision | Choice |
|---|---|---|
| 1 | Multi-tenancy shape | Single shared instance; one URL, isolated households |
| 2 | Stack | Vercel (frontend) + Fly.io (backend) + Neon (Postgres) + Cloudflare R2 (uploads) |
| 3 | Database | Postgres everywhere — Docker locally, Alembic migrations, fresh data |
| 4 | File storage | R2 for user uploads; icons moved into frontend bundle, served by Vercel CDN |
| 5 | Registration | Invite-only via tokens; Resend for transactional email (password reset) |
| 6 | Domain | Buy on Cloudflare Registrar; product name = **Floreren** |
| 7 | Accounts | One household, multiple accounts; household-scoped invites |
| 8 | Deploy | Git push → auto-deploy. Vercel previews on. Secrets via Fly/Vercel dashboards |
| 9 | Tenant isolation | Explicit per-route filtering + isolation tests; RLS as future hardening |
| 10 | PWA install | iOS-aware in-app install prompt; icon/splash polish before launch |
| 11 | Sequencing | 3 phases below |

## Phases

### Phase 1 — Deploy for Leon only
**Plan:** `docs/plans/in-progress/2026-05-16-phase1-postgres-and-deploy.md`

Stand up Postgres locally, migrate the backend SQL, move uploads to R2, containerise the backend, deploy to Fly.io + Neon + R2, deploy frontend to Vercel, wire DNS for `floreren.app`. **Single user (Leon) lives on the cloud version for ~1 week** before Phase 2. No tenant isolation, no invites, no auth UI yet.

**Done when:** Leon can do everything on `floreren.app` that he can do on `localhost:5173` today.

### Phase 2 — Lock the doors
**Plan:** (to be written after Phase 1)

Audit and fix the ~10 routers that don't filter by `household_id`. Add tenant-isolation tests. Build the invite-token flow (`/invite/:token` route, `invites` table, "invite someone" UI). Integrate Resend for password reset emails. Replace the `UserSwitcher` (hardcoded Leon/Lisbeth toggle) with proper login / logout / forgot-password screens.

**Done when:** A test proves household B can't see household A's data, and a real email arrives when "forgot password" is clicked.

### Phase 3 — Onboard the parents
**Plan:** (to be written after Phase 2)

Build the iOS-aware in-app install prompt. Polish app icon and splash screen. Generate first invite, text it to your mum, walk her through Add-to-Home-Screen. Mum invites your dad. Watch logs for a week.

**Done when:** Both parents have Floreren installed on their home screens and have logged at least one care action each.

## Cost estimate (steady state)

| Service | Cost |
|---|---|
| Cloudflare domain | ~€10–14/year |
| Neon free tier | €0 |
| Fly.io | €0 (3 free shared-CPU machines) — €5/mo if we outgrow |
| Cloudflare R2 | €0 (10 GB free, no egress fees) |
| Vercel hobby tier | €0 |
| Resend | €0 (3,000 emails/month free) |
| **Total** | **~€1/month** (amortized domain) |

## Glossary for the unfamiliar

- **Fly.io** — a host that runs your Docker container close to users worldwide. Like a VPS but simpler.
- **Vercel** — a host for the frontend (React/Vite). Auto-deploys on git push, gives you a CDN for free.
- **Neon** — managed Postgres as-a-service. Free tier. Backups + branching included.
- **Cloudflare R2** — object storage (think Dropbox for your code). S3-compatible API. No egress fees.
- **Resend** — transactional email service. You call an API, they deliver email.
- **Alembic** — Python's standard tool for versioning database schema changes (migrations).
- **Docker Compose** — runs services (like a Postgres database) locally with one command.
- **PWA** — Progressive Web App. A website that can install to a phone's home screen and behave like a native app.
