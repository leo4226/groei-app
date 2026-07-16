export type WaterPressureLevel = 'unknown' | 'normal' | 'elevated' | 'high'
export type WaterWeatherStatus = 'fresh' | 'stale' | 'unavailable' | 'missing_coordinates'

export interface WaterPressurePlant {
  plant_id: number
  plant_name: string
  schedule_id: number
  environment: 'outdoor_container' | 'outdoor_ground' | 'indoor'
  next_due: string
  recommended_check_date: string
  level: WaterPressureLevel
  score: number
  reason_nl: string
  reason_en: string
  factors: Record<string, number | string>
}

export interface WaterPressureMap {
  map_id: number
  map_name: string
  map_type: 'outdoor' | 'indoor'
  level: WaterPressureLevel
  weather_status: WaterWeatherStatus
  temperature_source: 'own_map' | 'outdoor_proxy' | 'none'
  source_timestamp: string | null
  high_count: number
  elevated_count: number
  plants: WaterPressurePlant[]
}

export interface WaterOutlook {
  generated_at: string
  maps: WaterPressureMap[]
}
