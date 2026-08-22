/**
 * Vertical fit guard for the game screens.
 *
 * Leon, on an iPhone 15: "the plant rounds just don't fit in length, so I have
 * to scroll down to press RONDE overslaan while there is more than enough
 * space left above it."
 *
 * Two separate causes, and the sibling guard (layout-check.mjs) caught neither
 * because it only asks about WIDTH:
 *
 *  1. `min-h-screen` is `100vh`, and on iOS `100vh` is the LARGE viewport —
 *     the height the page would have if the browser chrome were hidden. The
 *     visible area is 100–190px shorter while the toolbars show. A column
 *     sized to 100vh with its action at the bottom therefore puts that action
 *     below the fold, with the slack sitting in the middle of the screen,
 *     which is exactly the "space left above it" in the report.
 *
 *  2. Even sized correctly, three of these screens grow with the party: the
 *     lobby's player list, the round view's player-status card, and the
 *     leaderboard's per-round breakdown. At eight guests the action falls off
 *     the bottom again. Those screens pin their actions and scroll the middle.
 *
 * WHAT THIS CANNOT SEE: headless Chromium has no browser chrome, so `dvh` and
 * `vh` resolve identically here and cause (1) is invisible to any rendering
 * check. `assertNoViewportUnits` below is what actually guards it, by reading
 * the source. Rendering guards cause (2).
 *
 * ENGINE CAVEAT: this is Chromium; every iOS browser is WebKit. Layout maths
 * agrees closely, but `dvh` and safe-area insets are where they drift. A pass
 * here is evidence, not proof.
 *
 * Run:  npm run test:game-fit
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'

const DIST = resolve(process.cwd(), 'dist')
const SRC = resolve(process.cwd(), 'src')

/**
 * Visible heights on a 393px-wide iPhone 15, with browser chrome showing.
 * The device is 852pt tall; none of these is 852, and that gap is the bug.
 */
const HEIGHTS = [
  [660, "Firefox, both bars — Leon's phone"],
  [693, 'Safari, both bars'],
  [734, 'Safari, top bar only'],
]

/** Small game and full-house game: the second is what pushed actions off. */
const PARTIES = [
  { players: 3, rounds: 3, label: 'a small game' },
  { players: 8, rounds: 10, label: 'a full house' },
]

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
}

function serve() {
  return new Promise((ok) => {
    const server = createServer(async (req, res) => {
      const path = decodeURIComponent((req.url || '/').split('?')[0])
      let file = join(DIST, path)
      if (!existsSync(file) || !extname(file)) file = join(DIST, 'index.html')
      try {
        const body = await readFile(file)
        res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' })
        res.end(body)
      } catch {
        res.writeHead(404).end('not found')
      }
    })
    server.listen(0, () => ok(server))
  })
}

const NAMES = ['Leon', 'Lisbeth', 'Jasper', 'Marieke', 'Bram', 'Sanne', 'Thijs', 'Fleur']

function fixtures({ players, rounds }) {
  const PLAYERS = NAMES.slice(0, players).map((n, i) => ({
    id: i + 1, player_name: n, score: 250 - i * 20,
    answered_current_round: i % 2 === 1, is_guest: i > 0,
  }))
  const CLUE = {
    round_index: 0, plant_name_nl: 'Gatenplant', plant_name_en: 'Swiss cheese plant',
    clue_photo_url: null, map_name: 'Tuin', map_type: 'outdoor',
    target_species: 'Monstera deliciosa', options: null,
  }
  const state = (over = {}) => ({
    session: {
      id: 1, join_code: 'AB12CD', status: 'active', current_round: 0,
      total_rounds: rounds, map_name: 'Tuin', map_slug: 'tuin', host_name: 'Leon',
      clue_mode: 'name', pacing: 'race', round_seconds: 120, seconds_remaining: 47,
      maps: [{ id: 1, name: 'Tuin', map_type: 'outdoor' }],
      forfeit: 'een shotje Hierbas', max_wrong_attempts: 2,
      ...(over.session || {}),
    },
    players: PLAYERS, current_clue: CLUE, rounds: [CLUE],
    my_answer: null, my_player_id: 1, is_host: true, round_stats: null,
    // `session` is merged above; spreading `over` wholesale would clobber it.
    ...Object.fromEntries(Object.entries(over).filter(([k]) => k !== 'session')),
  })
  return { state, PLAYERS }
}

function scenes(cfg) {
  const { state } = fixtures(cfg)
  return [
    ['host · lobby',        '/game/AB12CD/host', state({ session: { status: 'waiting' } })],
    ['host · round (name)', '/game/AB12CD/host', state()],
    ['host · round (photo)','/game/AB12CD/host', state({ session: { clue_mode: 'photo' } })],
    ['host · leaderboard',  '/game/AB12CD/host', state({
      session: { status: 'finished' },
      round_stats: Array.from({ length: cfg.rounds }, (_, i) => ({
        round_index: i, plant_name_nl: 'Gatenplant', plant_name_en: 'Swiss cheese plant',
        answered_count: 2, avg_seconds: 41, match_kinds: { photo: 2 },
      })),
    })],
    ['player · clue',       '/game/AB12CD',      state({ is_host: false, my_player_id: 2 })],
    ['player · answered',   '/game/AB12CD',      state({
      is_host: false, my_player_id: 2,
      my_answer: {
        is_correct: true, points_awarded: 150, answered_at: '2026-08-22T09:00:00',
        finish_rank: 1, wrong_attempts: 0, attempts_left: 2, locked: false,
      },
    })],
    ['player · locked out', '/game/AB12CD',      state({
      is_host: false, my_player_id: 2,
      my_answer: {
        is_correct: false, points_awarded: 0, answered_at: '2026-08-22T09:00:00',
        finish_rank: null, wrong_attempts: 2, attempts_left: 0, locked: true,
      },
    })],
    ['join screen',         '/game?code=AB12CD', null],
  ]
}

/**
 * Every visible action on the page, excluding the app's bottom nav.
 * `bottom` is what matters: an action whose bottom edge is past the viewport
 * is one the user must scroll to reach.
 */
const PROBE = () => {
  const nav = document.querySelector('nav')
  const acts = Array.from(document.querySelectorAll('button, a[href]'))
    .filter((b) => !(nav && nav.contains(b)) && b.offsetParent !== null
      && b.getBoundingClientRect().height >= 28)
    .map((b) => ({
      label: (b.textContent || '').trim().slice(0, 26) || '(icon)',
      bottom: Math.round(b.getBoundingClientRect().bottom),
    }))
  return {
    acts,
    crashed: (document.body.innerText || '').includes('kon niet geladen')
      || (document.body.innerText || '').includes('could not load'),
  }
}

/**
 * The check headless Chromium cannot perform. `vh` and `dvh` are identical
 * without browser chrome, so the iOS large-viewport trap is invisible to
 * rendering and has to be read out of the source instead.
 */
async function assertNoViewportUnits() {
  const dir = join(SRC, 'pages')
  const gameFiles = [
    ...(await readdir(dir)).filter((f) => f.startsWith('Game')).map((f) => join(dir, f)),
    join(SRC, 'components/game/GameLeaderboard.tsx'),
  ]
  const bad = []
  for (const file of gameFiles) {
    const text = await readFile(file, 'utf8')
    text.split('\n').forEach((line, i) => {
      if (/\b(min-h-screen|h-screen|\[100vh\])\b/.test(line)) {
        bad.push(`${file.replace(SRC, 'src')}:${i + 1}  ${line.trim().slice(0, 80)}`)
      }
    })
  }
  return bad
}

const server = await serve()
const port = server.address().port
const browser = await chromium.launch({ args: ['--no-sandbox'] })
const failures = []

for (const cfg of PARTIES) {
  for (const [height, who] of HEIGHTS) {
    for (const [label, path, st] of scenes(cfg)) {
      const ctx = await browser.newContext({
        viewport: { width: 393, height }, deviceScaleFactor: 2,
        isMobile: true, hasTouch: true, serviceWorkers: 'block',
      })
      await ctx.addInitScript(() => {
        localStorage.setItem('floreren-token', 'game-fit-guard')
        localStorage.setItem('floreren_lang', 'nl')
      })
      const page = await ctx.newPage()
      await page.route('**', (route) => {
        const u = new URL(route.request().url())
        // The production build points at api.floreren.app, so intercepting
        // only same-origin /api aborts every call and renders an empty shell.
        const isApi = u.pathname.startsWith('/api/') || u.hostname.startsWith('api.')
        if (!isApi && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') return route.abort()
        if (!isApi) return route.continue()
        const P = u.pathname.startsWith('/api/') ? u.pathname : '/api' + u.pathname
        let body = []
        if (P.startsWith('/api/games/') && P.endsWith('/preview')) {
          body = { status: 'waiting', map_name: 'Tuin', host_name: 'Leon', player_count: cfg.players }
        } else if (P.startsWith('/api/games/') && st) body = st
        else if (P === '/api/users') body = [{ id: 1, name: 'Leon', language: 'nl' }]
        else if (P === '/api/auth/me') {
          body = {
            id: 1, household_id: 1, email: 'x', name: 'Leon', avatar: null, is_admin: true,
            household_name: 'H', role: 'owner',
            capabilities: { can_edit: true, can_manage_household: true },
          }
        }
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
      })

      await page.goto(`http://localhost:${port}${path}`, {
        waitUntil: 'domcontentloaded', timeout: 15000,
      })
      await page.waitForTimeout(900)
      const { acts, crashed } = await page.evaluate(PROBE)
      const tag = `${label} · ${cfg.label} @ ${height}px (${who})`

      if (crashed) {
        // A fixture that stopped matching the code is a broken guard, not a
        // pass. Fail loudly rather than quietly checking nothing.
        failures.push(`${tag}\n    the page crashed — fixture no longer matches the component`)
        console.log(`FAIL  ${tag} (crashed)`)
      } else {
        const cut = acts.filter((a) => a.bottom > height)
        if (cut.length) {
          failures.push(`${tag}\n    ` + cut
            .map((a) => `"${a.label}" ends at ${a.bottom}px, ${a.bottom - height}px below the fold`)
            .join('\n    '))
          console.log(`FAIL  ${tag}`)
          cut.forEach((a) => console.log(`      "${a.label}" ${a.bottom}px > ${height}px`))
        } else {
          console.log(`ok    ${tag}`)
        }
      }
      await ctx.close()
    }
  }
}

await browser.close()
server.close()

const viewportUnits = await assertNoViewportUnits()
if (viewportUnits.length) {
  failures.push('viewport-height units in the game screens:\n    ' + viewportUnits.join('\n    '))
  console.log('\nFAIL  vh-based height units found (use dvh):')
  viewportUnits.forEach((b) => console.log(`      ${b}`))
} else {
  console.log('\nok    no vh-based height units in the game screens')
}

if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n\n${failures.join('\n\n')}\n`)
  console.error('A game action sits below the fold on a real phone, or a screen is sized in vh.')
  console.error('vh is the iOS LARGE viewport — use dvh, and pin actions on screens that grow with the party.')
  process.exit(1)
}
console.log('\nEvery game action is reachable without scrolling, at every tested height.')
