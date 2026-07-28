import type { WeatherWarningGroupOut } from '../../types'

export function partitionWeatherWarnings(warnings: WeatherWarningGroupOut[]): {
  active: WeatherWarningGroupOut[]
  seen: WeatherWarningGroupOut[]
} {
  const active: WeatherWarningGroupOut[] = []
  const seen: WeatherWarningGroupOut[] = []
  for (const warning of warnings) {
    if (warning.acknowledged_at) seen.push(warning)
    else active.push(warning)
  }
  return { active, seen }
}

export function activeWeatherWarningCount(warnings: WeatherWarningGroupOut[]): number {
  return warnings.reduce((count, warning) => count + (warning.acknowledged_at ? 0 : 1), 0)
}

export function weatherWarningPlantIds(warning: WeatherWarningGroupOut): Set<number> {
  return new Set(warning.affected_plant_ids)
}
