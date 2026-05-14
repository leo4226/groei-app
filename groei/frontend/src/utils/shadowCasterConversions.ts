import type { ShadowCaster } from '../types'

export type Kant = 'links' | 'rechts' | 'boven' | 'onder'

export type GardenBounds = { minX: number; minY: number; maxX: number; maxY: number }

export const PRESET_OPACITIES = {
  'lichte-boom': 0.25,
  'dichte-boom': 0.60,
  'gebouw': 1.0,
} as const

export type DichtheidPreset = keyof typeof PRESET_OPACITIES

export function detectKant(caster: ShadowCaster & { type: 'rect' }, bounds: GardenBounds): Kant {
  const { x, y, width, height } = caster
  if (x + width <= bounds.minX) return 'links'
  if (x >= bounds.maxX) return 'rechts'
  if (y + height <= bounds.minY) return 'boven'
  if (y >= bounds.maxY) return 'onder'
  return 'links'
}

export function rectToDisplay(
  caster: ShadowCaster & { type: 'rect' },
  bounds: GardenBounds,
  scalePxPerM: number,
): { kant: Kant; afstandM: number; dikteM: number } {
  const kant = detectKant(caster, bounds)
  let afstandPx: number
  let diktePx: number
  switch (kant) {
    case 'links':
      afstandPx = bounds.minX - (caster.x + caster.width)
      diktePx = caster.width
      break
    case 'rechts':
      afstandPx = caster.x - bounds.maxX
      diktePx = caster.width
      break
    case 'boven':
      afstandPx = bounds.minY - (caster.y + caster.height)
      diktePx = caster.height
      break
    case 'onder':
      afstandPx = caster.y - bounds.maxY
      diktePx = caster.height
      break
  }
  return {
    kant,
    afstandM: Math.max(0, afstandPx / scalePxPerM),
    dikteM: Math.max(0.5, diktePx / scalePxPerM),
  }
}

export function displayToRect(
  kant: Kant,
  afstandM: number,
  dikteM: number,
  bounds: GardenBounds,
  scalePxPerM: number,
): { x: number; y: number; width: number; height: number } {
  const afstandPx = Math.round(afstandM * scalePxPerM)
  const diktePx = Math.round(dikteM * scalePxPerM)
  const gardenW = bounds.maxX - bounds.minX
  const gardenH = bounds.maxY - bounds.minY
  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerY = (bounds.minY + bounds.maxY) / 2
  switch (kant) {
    case 'links': {
      const w = diktePx
      const h = gardenH * 3
      return { x: Math.round(bounds.minX - afstandPx - w), y: Math.round(centerY - h / 2), width: w, height: h }
    }
    case 'rechts': {
      const w = diktePx
      const h = gardenH * 3
      return { x: Math.round(bounds.maxX + afstandPx), y: Math.round(centerY - h / 2), width: w, height: h }
    }
    case 'boven': {
      const w = gardenW * 3
      const h = diktePx
      return { x: Math.round(centerX - w / 2), y: Math.round(bounds.minY - afstandPx - h), width: w, height: h }
    }
    case 'onder': {
      const w = gardenW * 3
      const h = diktePx
      return { x: Math.round(centerX - w / 2), y: Math.round(bounds.maxY + afstandPx), width: w, height: h }
    }
  }
}

export function circleToDisplay(
  caster: ShadowCaster & { type: 'circle' },
  scalePxPerM: number,
): { xM: number; yM: number; straalM: number } {
  return {
    xM: Math.round((caster.cx / scalePxPerM) * 100) / 100,
    yM: Math.round((caster.cy / scalePxPerM) * 100) / 100,
    straalM: Math.max(0.5, Math.round((caster.radius / scalePxPerM) * 100) / 100),
  }
}

export function displayToCircle(
  xM: number,
  yM: number,
  straalM: number,
  scalePxPerM: number,
): { cx: number; cy: number; radius: number } {
  return {
    cx: Math.round(xM * scalePxPerM),
    cy: Math.round(yM * scalePxPerM),
    radius: Math.max(1, Math.round(straalM * scalePxPerM)),
  }
}

export function opacityToPreset(opacity: number): DichtheidPreset {
  if (opacity < 0.4) return 'lichte-boom'
  if (opacity <= 0.8) return 'dichte-boom'
  return 'gebouw'
}
