import { useState, useEffect } from 'react'

const WMO_NL: Record<number, string> = {
  0: 'helder',
  1: 'overwegend helder',
  2: 'gedeeltelijk bewolkt',
  3: 'bewolkt',
  45: 'mist',
  48: 'rijpmist',
  51: 'lichte motregen',
  53: 'motregen',
  55: 'dichte motregen',
  61: 'lichte regen',
  63: 'regen',
  65: 'zware regen',
  71: 'lichte sneeuwval',
  73: 'sneeuwval',
  75: 'zware sneeuwval',
  80: 'lichte buien',
  81: 'buien',
  82: 'zware buien',
  95: 'onweer',
  96: 'onweer met hagel',
  99: 'zwaar onweer met hagel',
}

export type WeatherIcon = 'sun' | 'partly' | 'rain' | 'snow' | 'thunder'

function wmoToIcon(code: number): WeatherIcon {
  if (code <= 1) return 'sun'
  if (code <= 3) return 'partly'
  if (code >= 95) return 'thunder'
  if (code >= 71 && code <= 77) return 'snow'
  return 'rain'
}

export interface WeatherDay {
  date: string
  maxTemp: number
  minTemp: number
  icon: WeatherIcon
  conditionNl: string
}

export interface WeatherData {
  currentTemp: number
  currentHumidity: number
  currentConditionNl: string
  currentIcon: WeatherIcon
  sunrise: string
  sunset: string
  todayRainMm: number
  windSpeedKmh: number
  tonightMin: number
  forecast: WeatherDay[]
}

const FALLBACK_LAT = 52.3715
const FALLBACK_LON = 4.8499

export function useWeather(lat: number | null, lon: number | null): {
  weather: WeatherData | null
  loading: boolean
  error: string | null
} {
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const resolvedLat = lat ?? FALLBACK_LAT
  const resolvedLon = lon ?? FALLBACK_LON

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const params = new URLSearchParams({
      latitude: String(resolvedLat),
      longitude: String(resolvedLon),
      current: 'temperature_2m,relative_humidity_2m,weather_code',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,sunrise,sunset',
      timezone: 'Europe/Amsterdam',
      forecast_days: '7',
    })

    fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
      .then(r => {
        if (!r.ok) throw new Error(`Open-Meteo: ${r.status}`)
        return r.json()
      })
      .then(data => {
        if (cancelled) return
        const cur = data.current
        const daily = data.daily

        const forecast: WeatherDay[] = (daily.time as string[]).map((d, i) => ({
          date: d,
          maxTemp: Math.round(daily.temperature_2m_max[i]),
          minTemp: Math.round(daily.temperature_2m_min[i]),
          icon: wmoToIcon(daily.weather_code[i]),
          conditionNl: WMO_NL[daily.weather_code[i]] ?? 'onbekend',
        }))

        setWeather({
          currentTemp: Math.round(cur.temperature_2m),
          currentHumidity: Math.round(cur.relative_humidity_2m),
          currentConditionNl: WMO_NL[cur.weather_code] ?? 'onbekend',
          currentIcon: wmoToIcon(cur.weather_code),
          sunrise: daily.sunrise[0],
          sunset: daily.sunset[0],
          todayRainMm: daily.precipitation_sum[0] ?? 0,
          windSpeedKmh: Math.round(daily.wind_speed_10m_max[0] ?? 0),
          tonightMin: Math.round(daily.temperature_2m_min[0]),
          forecast,
        })
        setLoading(false)
      })
      .catch(e => {
        if (cancelled) return
        setError(e.message)
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [resolvedLat, resolvedLon])

  return { weather, loading, error }
}
