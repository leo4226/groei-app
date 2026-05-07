export interface FixedPlant {
  id: string
  name: string
  x: number              // SVG coordinates
  y: number
  displayRadiusCm: number
  markerColor: string
  note?: string
}

export const FIXED_PLANTS: FixedPlant[] = []
