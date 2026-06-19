import type { WeatherData, WeatherIcon as WeatherIconType } from '../../hooks/useWeather'
import type { Translations } from '../../i18n/translations'

const WEEKLY_BUDGET: Record<string, number> = {
  winter: 5, spring: 18, summer: 25, autumn: 10,
}

function dailyWaterNeedMm(): number {
  const m = new Date().getMonth()
  const season = m < 2 || m === 11 ? 'winter' : m < 5 ? 'spring' : m < 8 ? 'summer' : 'autumn'
  return WEEKLY_BUDGET[season] / 7
}

const RAIN_OK = 'var(--color-primary)'
const RAIN_DRY = 'var(--color-overdue)'

function WeatherIcon({ icon, size = 22 }: { icon: WeatherIconType; size?: number }) {
  if (icon === 'sun') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#D9A418" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" fill="#F4C542" stroke="none"/>
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>
    </svg>
  )
  if (icon === 'snow') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#6B8FCA" strokeWidth="1.6" strokeLinecap="round">
      <path d="M12 2v20M2 12h20M5 5l14 14M19 5 5 19" opacity=".5"/>
      <circle cx="12" cy="12" r="2" fill="#6B8FCA" stroke="none"/>
    </svg>
  )
  if (icon === 'thunder') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#6B8FCA" strokeWidth="1.6" strokeLinecap="round">
      <path d="M6 14a4 4 0 1 1 1-7.9A5 5 0 0 1 17 7a4 4 0 0 1 0 8H6z" fill="#6B6F9E" stroke="#4A4F7A"/>
      <path d="M12 14l-2 5h3l-1.5 5 3.5-6h-2.5l2-4z" stroke="#F4C542" fill="#F4C542"/>
    </svg>
  )
  if (icon === 'rain') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#6B8FCA" strokeWidth="1.6" strokeLinecap="round">
      <path d="M6 14a4 4 0 1 1 1-7.9A5 5 0 0 1 17 7a4 4 0 0 1 0 8H6z" fill="#C5D4ED" stroke="#6B8FCA"/>
      <path d="M9 18l-1 3M13 18l-1 3M17 18l-1 3"/>
    </svg>
  )
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#8A9482" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="9" cy="10" r="3" fill="#F4C542" stroke="#D9A418"/>
      <path d="M8 16a4 4 0 1 1 1-7.9A5 5 0 0 1 19 9a4 4 0 0 1 0 8H8z" fill="#E8E0CC" stroke="#8A9482"/>
    </svg>
  )
}

export default function WeatherCard({ weather, loading, error, t }: {
  weather: WeatherData | null
  loading: boolean
  error: string | null
  t: Translations
}) {
  return (
    <div className="card weather-card" style={{ borderRadius: 14, overflow: 'hidden', marginBottom: 18 }}>
      <div className="weather-card-header">
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', color: 'var(--color-primary)', marginBottom: 4 }}>{t.dashboard.sections.weather}</div>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 22, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>
          {weather ? (
            <><span className="condition-text"><em style={{ color: 'var(--color-overdue)', fontStyle: 'italic', fontWeight: 400 }}>{weather.currentTemp}°</em> — {weather.currentConditionNl}.</span><br />
            <span style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 14, color: 'var(--color-text-soft)', fontWeight: 400 }}>
              {t.dashboard.weather.tonight}: {weather.tonightMin}°
            </span></>
          ) : loading ? t.dashboard.weather.loading : (error ?? t.dashboard.weather.unavailable)}
        </div>
      </div>
      {weather && (
        <>
          <div className="weather-stats">
            {(() => {
              const need = dailyWaterNeedMm()
              const rainOk = weather.todayRainMm >= need
              const cells = [
                { v: `${weather.currentHumidity}%`, l: t.dashboard.weather.humidity, color: 'var(--color-text)' },
                { v: `${weather.todayRainMm} / ~${need.toFixed(1)} mm`, l: t.dashboard.weather.rain, color: rainOk ? RAIN_OK : RAIN_DRY },
                { v: `${weather.windSpeedKmh} km/u`, l: 'Wind', color: 'var(--color-text)' },
              ]
              return cells.map((cell, i) => (
                <div key={i} className="weather-stats-cell">
                  <span className="weather-stats-value" style={{ color: cell.color }}>{cell.v}</span>
                  <span className="weather-stats-label">{cell.l}</span>
                </div>
              ))
            })()}
          </div>
          <div className="weather-forecast">
            {weather.forecast.map((day, i) => {
              const d = new Date(day.date)
              const dayLabel = d.toLocaleDateString(t.locale, { weekday: 'short' }).slice(0, 2).toLowerCase()
              return (
                <div key={day.date} style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.12em', color: i === 0 ? 'var(--color-overdue)' : 'var(--color-text-muted)', marginBottom: 4 }}>
                    {dayLabel}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 3 }}>
                    <WeatherIcon icon={day.icon} size={18} />
                  </div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontSize: 12, color: i === 0 ? 'var(--color-overdue)' : 'var(--color-text)', fontWeight: i === 0 ? 500 : 400, lineHeight: 1.1 }}>
                    {day.maxTemp}°
                  </div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontSize: 10, color: 'var(--color-text-muted)', fontWeight: 400, lineHeight: 1.1 }}>
                    {day.minTemp}°
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
