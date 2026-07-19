import { useEffect, useMemo, useState } from 'react'
import { calendar } from '../../api/client'
import { useT } from '../../context/LanguageContext'
import type {
  WaterOutlook,
  WaterPressureLevel,
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
  const earlyChecks = maps.flatMap(map => map.plants
    .filter(plant => (
      map.weather_status === 'fresh'
      && plant.recommended_check_date < plant.next_due
      && (generatedAt === '' || plant.next_due >= generatedAt)
    ))
    .map(plant => ({ plant, mapType: map.map_type })))
  const alertLevel = earlyChecks.reduce<WaterPressureLevel>((level, { plant }) => (
    LEVEL_RANK[plant.level] > LEVEL_RANK[level] ? plant.level : level
  ), 'unknown')
  const earliestCheckDate = earlyChecks.reduce<string | null>((earliest, { plant }) => (
    !earliest || plant.recommended_check_date < earliest ? plant.recommended_check_date : earliest
  ), null)
  const hasOutdoorAlert = earlyChecks.some(({ mapType }) => mapType === 'outdoor')
  const hasIndoorAlert = earlyChecks.some(({ mapType }) => mapType === 'indoor')
  const hasFreshWeather = maps.some(map => map.weather_status === 'fresh')

  const levelLabel = ({
    high: t.calendar.waterOutlookLevelHigh,
    elevated: t.calendar.waterOutlookLevelElevated,
    normal: t.calendar.waterOutlookLevelNormal,
    unknown: t.calendar.waterOutlookLevelUnknown,
  })[alertLevel]

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
    <section
      className="side-card water-outlook-card"
      data-calendar-context="weather"
      aria-labelledby="water-outlook-title"
    >
      <div className="sc-head">
        <div>
          <p className="sc-eye">{t.calendar.weatherContext}</p>
          <h2 className="sc-title" id="water-outlook-title">{t.calendar.waterOutlookTitle}</h2>
        </div>
        {earliestCheckDate && (
          <span className={`water-outlook-badge water-outlook-badge--${alertLevel}`}>
            {levelLabel}
          </span>
        )}
      </div>
      <p className="water-outlook-scope">{t.calendar.waterOutlookScope}</p>
      <div className={`water-outlook-alert ${earliestCheckDate ? 'is-early' : 'is-normal'}`}>
        <p className="water-outlook-summary">
          {earliestCheckDate
            ? hasOutdoorAlert && hasIndoorAlert
              ? t.calendar.waterOutlookGlobalMixed
              : hasIndoorAlert
                ? t.calendar.waterOutlookGlobalIndoor
                : t.calendar.waterOutlookGlobalOutdoor
            : hasFreshWeather
              ? t.calendar.waterOutlookGlobalNormal
              : t.calendar.waterOutlookGlobalUnavailable}
        </p>
        <p className="water-outlook-meta">
          {earliestCheckDate && (
            <>{t.calendar.waterOutlookCheckDateShort(formatIsoDate(earliestCheckDate, t.locale))} · </>
          )}
          {t.calendar.waterOutlookDeadlinesUnchanged}
        </p>
      </div>
    </section>
  )
}
