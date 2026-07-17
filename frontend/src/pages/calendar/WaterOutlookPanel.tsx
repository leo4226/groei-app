import { useEffect, useMemo, useState } from 'react'
import { calendar } from '../../api/client'
import { useT } from '../../context/LanguageContext'
import type {
  WaterOutlook,
  WaterPressureLevel,
  WaterPressureMap,
  WaterPressurePlant,
} from './waterOutlookTypes'

interface Props {
  env: string
}

const LEVEL_RANK: Record<WaterPressureLevel, number> = {
  unknown: 0,
  normal: 1,
  elevated: 2,
  high: 3,
}

function formatIsoDate(value: string, locale: string): string {
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

function summaryPlant(map: WaterPressureMap): WaterPressurePlant | null {
  return map.plants.reduce<WaterPressurePlant | null>((best, plant) => {
    if (!best) return plant
    const rankDelta = LEVEL_RANK[plant.level] - LEVEL_RANK[best.level]
    return rankDelta > 0 || (rankDelta === 0 && plant.score > best.score) ? plant : best
  }, null)
}

export default function WaterOutlookPanel({ env }: Props) {
  const t = useT()
  const [outlook, setOutlook] = useState<WaterOutlook | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    calendar.waterOutlook()
      .then(data => {
        if (!cancelled) setOutlook(data)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [attempt])

  const maps = useMemo(() => (outlook?.maps ?? []).filter(map => {
    if (env === 'tuin') return map.map_type === 'outdoor'
    if (env === 'huis') return map.map_type === 'indoor'
    return true
  }), [env, outlook])
  const generatedAt = outlook?.generated_at ?? ''

  const levelLabel = (level: WaterPressureLevel) => ({
    high: t.calendar.waterOutlookLevelHigh,
    elevated: t.calendar.waterOutlookLevelElevated,
    normal: t.calendar.waterOutlookLevelNormal,
    unknown: t.calendar.waterOutlookLevelUnknown,
  })[level]

  const statusMessage = (map: WaterPressureMap) => {
    if (map.weather_status === 'stale') return t.calendar.waterOutlookStale
    if (map.weather_status === 'missing_coordinates') return t.calendar.waterOutlookMissingCoordinates
    if (map.weather_status === 'unavailable') return t.calendar.waterOutlookUnavailable
    return null
  }

  if (loading) {
    return (
      <section className="side-card water-outlook-card" aria-busy="true">
        <p className="water-outlook-loading" role="status">{t.calendar.waterOutlookLoading}</p>
      </section>
    )
  }

  if (error) {
    return (
      <section className="side-card water-outlook-card">
        <div className="water-outlook-error" role="alert">{t.calendar.waterOutlookError}</div>
        <button type="button" className="water-outlook-retry" onClick={() => setAttempt(value => value + 1)}>
          {t.calendar.waterOutlookRetry}
        </button>
      </section>
    )
  }

  if (maps.length === 0) return null

  return (
    <section className="side-card water-outlook-card" aria-labelledby="water-outlook-title">
      <div className="sc-head">
        <div>
          <p className="sc-eye">{t.calendar.weatherContext}</p>
          <h2 className="sc-title" id="water-outlook-title">{t.calendar.waterOutlookTitle}</h2>
        </div>
      </div>
      <p className="water-outlook-scope">{t.calendar.waterOutlookScope}</p>
      <div className="water-outlook-list">
        {maps.map(map => {
          const plant = summaryPlant(map)
          if (!plant) return null
          const weatherMessage = statusMessage(map)
          const explanation = t.locale.startsWith('en') ? plant.reason_en : plant.reason_nl
          const isEarly = plant.recommended_check_date < plant.next_due
          const isOverdue = generatedAt !== '' && plant.next_due < generatedAt
          const dateLabel = formatIsoDate(
            isEarly ? plant.recommended_check_date : plant.next_due,
            t.locale,
          )
          return (
            <article className="water-outlook-map" key={map.map_id}>
              <div className="water-outlook-map-head">
                <h3>{map.map_name}</h3>
                <span className={`water-outlook-badge water-outlook-badge--${map.level}`}>
                  {levelLabel(map.level)}
                </span>
              </div>
              <p className="water-outlook-plant">{plant.plant_name}</p>
              <p className="water-outlook-date">
                {isOverdue
                  ? t.calendar.waterOutlookOverdueDate(dateLabel)
                  : isEarly
                  ? t.calendar.waterOutlookCheckDate(dateLabel)
                  : t.calendar.waterOutlookSavedDate(dateLabel)}
              </p>
              {map.temperature_source === 'outdoor_proxy' && (
                <p className="water-outlook-proxy">{t.calendar.waterOutlookProxy}</p>
              )}
              <p className="water-outlook-reason">{weatherMessage ?? explanation}</p>
            </article>
          )
        })}
      </div>
    </section>
  )
}
