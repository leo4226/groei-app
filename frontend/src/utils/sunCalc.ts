import SunCalc from 'suncalc'

export const GARDEN_LAT = 52.3715
export const GARDEN_LNG = 4.8499

export interface SunPosition {
  azimuthDeg: number   // compass bearing: 0=N, 90=E, 180=S, 270=W
  altitudeDeg: number  // degrees above horizon
  isUp: boolean
}

/**
 * Get sun position for a given date at the garden location.
 * Converts suncalc's south-clockwise radians to compass degrees.
 */
export function getSunPosition(date: Date, lat = GARDEN_LAT, lng = GARDEN_LNG): SunPosition {
  const pos = SunCalc.getPosition(date, lat, lng)
  // suncalc azimuth: radians from south, clockwise (0=S, π/2=W, π/-π=N, -π/2=E)
  // Convert to compass degrees: 0=N, 90=E, 180=S, 270=W
  const azimuthDeg = ((pos.azimuth * 180 / Math.PI) + 180) % 360
  const altitudeDeg = pos.altitude * 180 / Math.PI
  return {
    azimuthDeg,
    altitudeDeg,
    isUp: altitudeDeg > 0,
  }
}

export function getSunTimes(date: Date, lat = GARDEN_LAT, lng = GARDEN_LNG) {
  return SunCalc.getTimes(date, lat, lng)
}
