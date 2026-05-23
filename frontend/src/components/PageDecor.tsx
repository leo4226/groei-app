import { resolveIconUrl } from '../utils/icons'

type DecorIcon = { id: number; name: string; left: string; top: string; size: number; rotate: number; opacity: number }

// Small seeded PRNG — deterministic so icons don't shift on re-render
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

const PLANT_POOL = [
  // trees (large, low opacity)
  { names: ['oak', 'maple', 'birch', 'beech'], size: [90, 150], opacity: [0.03, 0.05] },
  // flowers (medium)
  { names: ['daisy', 'crocus', 'poppy', 'peony', 'rose', 'foxglove', 'sunflower', 'marigold', 'pansy', 'petunia'], size: [30, 75], opacity: [0.05, 0.07] },
  // bare / unpotted (medium)
  { names: ['lavender_bare', 'bostonfern_bare', 'silvergrass_bare', 'strawberry_bare'], size: [40, 85], opacity: [0.05, 0.07] },
  // herbs & grasses (small-medium)
  { names: ['ajuga', 'rosemary', 'bamboo', 'holly', 'mint', 'basil', 'lavender'], size: [28, 60], opacity: [0.05, 0.07] },
  // structural (medium-large)
  { names: ['ivy', 'laurel', 'boxwood', 'clematis', 'buddleja', 'hydrangea', 'camellia', 'dahlia'], size: [40, 80], opacity: [0.04, 0.06] },
]

const allPlants = PLANT_POOL.flatMap(g => g.names)
function plantConfig(name: string) {
  for (const g of PLANT_POOL) {
    const idx = g.names.indexOf(name)
    if (idx >= 0) return g
  }
  return PLANT_POOL[1] // fallback: flowers
}

function generateDecor(count: number): DecorIcon[] {
  const rand = mulberry32(Date.now())
  const icons: DecorIcon[] = []
  let nextId = 0
  const shuffled = [...allPlants].sort(() => rand() - 0.5)

  // Pre-compute candidates: random plant + random size, sorted largest-first
  // so big trees claim space before small flowers fill gaps
  type Candidate = { name: string; size: number; opacity: number }
  const candidates: Candidate[] = []
  for (let i = 0; i < count; i++) {
    const name = shuffled[i % shuffled.length]
    const cfg = plantConfig(name)
    const sMin = cfg.size[0], sMax = cfg.size[1]
    const oMin = cfg.opacity[0], oMax = cfg.opacity[1]
    candidates.push({
      name,
      size: Math.round(sMin + rand() * (sMax - sMin)),
      opacity: parseFloat((oMin + rand() * (oMax - oMin)).toFixed(2)),
    })
  }
  candidates.sort((a, b) => b.size - a.size)

  // Collision detection: treat each icon as a circle with radius in %-units
  // Reference width ~1200px → 1% = 12px → radius% = (size/2) / 12
  const PADDING_PCT = 0.8
  const placed: { left: number; top: number; radiusPct: number }[] = []

  function overlaps(left: number, top: number, radiusPct: number): boolean {
    for (const p of placed) {
      const dx = left - p.left
      const dy = top - p.top
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < p.radiusPct + radiusPct + PADDING_PCT) return true
    }
    return false
  }

  for (const c of candidates) {
    const radiusPct = (c.size / 2) / 12
    let left: number, top: number
    let placed_ok = false

    for (let attempt = 0; attempt < 30; attempt++) {
      left = rand() * 97 - 2
      top = rand() * 97 - 2
      // Keep away from extreme edges
      if (top < -radiusPct || top > 98 - radiusPct) continue
      if (!overlaps(left, top, radiusPct)) {
        placed_ok = true
        break
      }
    }

    if (!placed_ok) {
      // Last resort: just place it somewhere
      left = rand() * 97 - 2
      top = rand() * 97 - 2
    }

    placed.push({ left, top, radiusPct })
    icons.push({
      id: nextId++, name: c.name,
      left: `${left.toFixed(1)}%`,
      top: `${Math.max(0, Math.min(98, top)).toFixed(1)}%`,
      size: c.size,
      rotate: Math.round((rand() - 0.5) * 50),
      opacity: c.opacity,
    })
  }

  return icons
}

const PAGE_DECOR = generateDecor(100)

export default function PageDecor() {
  return (
    <div aria-hidden="true" style={{
      position: 'absolute',
      inset: 0,
      overflow: 'hidden',
      pointerEvents: 'none',
      zIndex: 0,
    }}>
      {PAGE_DECOR.map((d) => (
        <img
          key={d.id}
          src={resolveIconUrl(d.name)!}
          alt=""
          style={{
            position: 'absolute',
            left: d.left,
            top: d.top,
            width: d.size,
            height: d.size,
            transform: `rotate(${d.rotate}deg)`,
            opacity: d.opacity,
            userSelect: 'none',
          }}
        />
      ))}
    </div>
  )
}
