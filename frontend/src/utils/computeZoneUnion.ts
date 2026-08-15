import type { EditorZone } from '../types'

type P = [number, number]

function pKey(p: P): string { return `${p[0]},${p[1]}` }
function getDir(from: P, to: P): 'right' | 'down' | 'left' | 'up' {
  if (to[0] > from[0]) return 'right'
  if (to[0] < from[0]) return 'left'
  if (to[1] > from[1]) return 'down'
  return 'up'
}

const CW_PRIORITY: Record<string, ('right' | 'down' | 'left' | 'up')[]> = {
  right: ['down', 'right', 'up'],
  down:  ['left', 'down', 'right'],
  left:  ['up',   'left', 'down'],
  up:    ['right', 'up',  'left'],
}

export function computeZoneUnion(zones: EditorZone[]): string {
  if (zones.length === 0) return ''

  const allX = [...new Set(zones.flatMap(z => [z.x, z.x + z.width]))].sort((a, b) => a - b)
  const allY = [...new Set(zones.flatMap(z => [z.y, z.y + z.height]))].sort((a, b) => a - b)
  const nX = allX.length - 1
  const nY = allY.length - 1
  if (nX <= 0 || nY <= 0) return ''

  const cov: boolean[][] = Array.from({ length: nY }, (_, iy) =>
    Array.from({ length: nX }, (_, ix) => {
      const cx = (allX[ix] + allX[ix + 1]) / 2
      const cy = (allY[iy] + allY[iy + 1]) / 2
      return zones.some(z => cx >= z.x && cx < z.x + z.width && cy >= z.y && cy < z.y + z.height)
    })
  )

  function isIn(ix: number, iy: number): boolean {
    return ix >= 0 && ix < nX && iy >= 0 && iy < nY && cov[iy][ix]
  }

  const adj = new Map<string, P[]>()
  function addEdge(from: P, to: P) {
    const k = pKey(from)
    if (!adj.has(k)) adj.set(k, [])
    adj.get(k)!.push(to)
  }

  for (let iy = 0; iy <= nY; iy++) {
    for (let ix = 0; ix < nX; ix++) {
      const above = isIn(ix, iy - 1)
      const below = isIn(ix, iy)
      if (!above && below) addEdge([allX[ix], allY[iy]], [allX[ix + 1], allY[iy]])
      if (above && !below) addEdge([allX[ix + 1], allY[iy]], [allX[ix], allY[iy]])
    }
  }
  for (let ix = 0; ix <= nX; ix++) {
    for (let iy = 0; iy < nY; iy++) {
      const left  = isIn(ix - 1, iy)
      const right = isIn(ix, iy)
      if (!left && right) addEdge([allX[ix], allY[iy + 1]], [allX[ix], allY[iy]])
      if (left && !right) addEdge([allX[ix], allY[iy]], [allX[ix], allY[iy + 1]])
    }
  }

  const visitedEdges = new Set<string>()
  const paths: string[] = []

  for (const [startKey, startNeighbors] of adj) {
    for (const firstStep of startNeighbors) {
      const edgeId = `${startKey}|${pKey(firstStep)}`
      if (visitedEdges.has(edgeId)) continue

      const startPt: P = startKey.split(',').map(Number) as P
      const pts: P[] = [startPt, firstStep]
      visitedEdges.add(edgeId)

      let prev = startPt
      let curr = firstStep

      for (let iter = 0; iter < 10_000; iter++) {
        const currKey = pKey(curr)
        if (currKey === startKey) break

        const nexts = adj.get(currKey)
        if (!nexts) break

        const inDir = getDir(prev, curr)
        const available = nexts.filter(n => !visitedEdges.has(`${currKey}|${pKey(n)}`))
        if (available.length === 0) break

        let next: P | undefined
        for (const dir of CW_PRIORITY[inDir]) {
          next = available.find(n => getDir(curr, n) === dir)
          if (next) break
        }
        if (!next) next = available[0]

        visitedEdges.add(`${currKey}|${pKey(next)}`)
        pts.push(next)
        prev = curr
        curr = next
      }

      if (pts.length >= 3) {
        paths.push(
          `M ${pts[0][0]} ${pts[0][1]} ` +
          pts.slice(1).map(p => `L ${p[0]} ${p[1]}`).join(' ') +
          ' Z'
        )
      }
    }
  }

  return paths.join(' ')
}
