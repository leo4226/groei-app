/**
 * Layout guard — renders the app at real phone widths and fails if anything
 * is clipped or pushed off screen.
 *
 * Three mobile bugs reached Leon's phone in one day, and every existing check
 * passed on all of them: tsc, the production build, 738 unit tests and the
 * i18n guard have no idea what a viewport is. The bugs were
 *   - a control added to the desktop header only (#913),
 *   - the same control then pushing "Selecteer" off the right edge (#916),
 *   - a watering line laid out as its own box in the middle of a card (#905).
 * The first two are mechanical and belong here. The third is taste and never
 * will be — that one still needs eyes.
 *
 * WHAT THIS IS NOT: a screenshot-diff suite. Those break on font rendering and
 * teach people to click "approve" on real regressions. This asserts one thing
 * a machine can be certain about — no element spills outside its own box, and
 * nothing sits past the right edge of the screen — across the widths people
 * actually hold.
 *
 * ENGINE CAVEAT: this runs headless Chromium. Every browser on iOS, including
 * Leon's Firefox, is WebKit, so this approximates rather than reproduces what
 * he sees. Layout maths agrees closely; `dvh`, safe-area insets and sticky
 * headers are where the two engines drift, and this repo uses all three. A
 * pass here is evidence, not proof.
 *
 * Run:  npm run test:layout          (add SHOTS=1 to also write PNGs)
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'

const DIST = resolve(process.cwd(), 'dist')
// Port 0 = let the OS pick a free one. A fixed port collides with a
// previous run that has not exited, which fails as EADDRINUSE at startup.
const PORT = Number(process.env.LAYOUT_PORT || 0)
const SHOTS = process.env.SHOTS === '1'
const SHOT_DIR = resolve(process.cwd(), 'tests/visual/shots')

/** Widths people actually hold. Labels are load-bearing: they explain a failure. */
const WIDTHS = [
  [320, 'iPhone SE 1st gen / small Android — the narrowest still in use'],
  [360, 'Galaxy S / Pixel — the most common Android width'],
  [393, "iPhone 15 — Leon's phone"],
  [430, 'iPhone 15 Pro Max'],
  [1280, 'desktop'],
]

/** Routes worth guarding. Each must render without a real backend. */
const ROUTES = ['/plants', '/photo-round', '/calendar', '/settings']

/**
 * Known offenders, kept in the same spirit as the i18n guard's ignore list:
 * this list must only shrink. Each entry is a substring matched against the
 * finding, with a note on why it is tolerated.
 */
const BASELINE = [
  // A 44px launcher whose icon measures 46px. Two pixels, no visual effect,
  // and it predates this guard. Remove the entry when the button is next touched.
  'button.help-assistant-launcher',
]

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.json': 'application/json', '.woff2': 'font/woff2',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
}

/** Static server with SPA fallback — no dependency on vite preview being free. */
function serve() {
  return new Promise(ok => {
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
    server.listen(PORT, () => ok(server))
  })
}

/**
 * Enough shape for the pages to render. Deliberately fixtures, not a login to
 * production: a session holding real credentials is a session that can leak
 * them, and fixed data means a change in a rendering is a change in the code.
 */
const PLANTS = [1, 2, 3].map(id => ({
  id, name: ['Hortensia', 'Lavendel', 'Buxus'][id - 1],
  species: null, species_common_name_nl: null, species_common_name_en: null,
  location_id: null, location_name: null, location_icon: null,
  map_id: 1, map_x: 10, map_y: 10, photo_path: null, acquired_date: null,
  pot_size_cm: null, container_id: null, last_repotted: null, notes: null,
  is_active: true, is_locked: false, created_at: null, sown_date: null,
  sun_requirement: null, measured_sun_hours: null, plant_type: 'shrub',
  icon_key: null, icon_requested: false, phase: 'established', quantity: 1,
  form_type: null, pot_material: null, pot_diameter_cm: null, pot_height_cm: null,
  has_drainage: null, substrate: [], acquired_from: null, mulch: null,
  species_id: id === 3 ? null : 42, phenology: null, care_schedules: [],
  care_status: 'good', temp_status: 'comfortable',
}))

const FIXTURES = {
  '/api/plants': PLANTS,
  '/api/photo-round': PLANTS.map(p => ({
    plant_id: p.id, name: p.name, map_id: 1, map_name: 'Tuin',
    map_x: 10, map_y: 10, icon_key: null, species_id: p.species_id,
    photo_count: 0, last_photo_at: null,
  })),
  '/api/maps': [{
    id: 1, name: 'Tuin', slug: 'tuin', svg_file: '', viewbox: '0 0 100 100',
    scale_info: null, sort_order: 0, canvas_data: null, thumbnail_file: null,
    map_type: 'outdoor', lat: 52.37, lon: 4.85, bearing: 0,
  }],
}

/**
 * Find elements that spill past their own box, or past the right edge.
 *
 * A page-level `document.scrollWidth > clientWidth` check does NOT catch this:
 * when the offending row sits inside a clipping parent the document stays the
 * right width and the control is simply invisible. That is exactly how #916
 * shipped.
 */
const PROBE = () => {
  const found = []
  for (const el of document.querySelectorAll('body *')) {
    const box = el.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) continue
    const cls = typeof el.className === 'string' && el.className
      ? '.' + el.className.trim().split(/\s+/)[0] : ''
    const id = `${el.tagName.toLowerCase()}${cls}`
    if (el.scrollWidth > Math.ceil(box.width) + 1) {
      found.push(`${id} overflows its box (${Math.round(box.width)} → ${el.scrollWidth}px)`)
    }
    if (box.right > window.innerWidth + 1 && box.width < window.innerWidth) {
      const text = (el.textContent || '').trim().slice(0, 24)
      found.push(`${id} sits past the right edge (right=${Math.round(box.right)}, viewport=${window.innerWidth})${text ? ` — "${text}"` : ''}`)
    }
  }
  return [...new Set(found)]
}

const server = await serve()
const port = server.address().port
const browser = await chromium.launch({ args: ['--no-sandbox'] })
const failures = []
if (SHOTS) await mkdir(SHOT_DIR, { recursive: true })

for (const [width, label] of WIDTHS) {
  const mobile = width < 900
  const ctx = await browser.newContext({
    viewport: { width, height: mobile ? 844 : 900 },
    deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile,
    // The PWA service worker precaches the whole bundle on install. With a
    // fresh context per width that is the entire dist, five times over, and it
    // dominates the run. Layout does not depend on it.
    serviceWorkers: 'block',
  })
  await ctx.addInitScript(() => localStorage.setItem('floreren-token', 'layout-guard'))
  const page = await ctx.newPage()
  // Route everything, not just /api. Anything off this host — fonts, R2
  // images, tiles — has no route out of a sandbox and stalls until it times
  // out, which turned a 2-second page load into a 2-minute one at zero CPU.
  // Blocking them also makes the run deterministic and offline-safe.
  await page.route('**', route => {
    const url = new URL(route.request().url())
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      return route.abort()
    }
    if (!url.pathname.startsWith('/api/')) return route.continue()
    const key = Object.keys(FIXTURES).find(k => url.pathname.startsWith(k))
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(key ? FIXTURES[key] : []),
    })
  })

  for (const route of ROUTES) {
    // Hard bound. A stalled navigation must fail the run, not hang it: an
    // unbounded goto in CI sits until the job timeout, hours later.
    await page.goto(`http://localhost:${port}${route}`, {
      waitUntil: 'domcontentloaded', timeout: 15000,
    })
    await page.waitForTimeout(700)
    const found = (await page.evaluate(PROBE))
      .filter(f => !BASELINE.some(b => f.includes(b)))
    if (SHOTS) {
      await page.screenshot({
        path: join(SHOT_DIR, `${route.replace(/\//g, '') || 'root'}-${width}.png`),
        fullPage: false,
      })
    }
    const tag = `${route} @ ${width}px (${label})`
    if (found.length) {
      failures.push(`${tag}\n    ${found.join('\n    ')}`)
      console.log(`FAIL  ${tag}`)
      found.forEach(f => console.log(`      ${f}`))
    } else {
      console.log(`ok    ${tag}`)
    }
  }
  await ctx.close()
}

await browser.close()
server.close()

if (SHOTS) console.log(`\nScreenshots in ${SHOT_DIR}`)

if (failures.length) {
  console.error(`\n${failures.length} layout problem(s):\n\n${failures.join('\n\n')}\n`)
  console.error('Something is clipped or off screen at a real phone width.')
  console.error('If it is genuinely harmless, add a substring to BASELINE in this file with a reason — that list must only shrink.')
  process.exit(1)
}
console.log('\nNothing clipped at any tested width.')
