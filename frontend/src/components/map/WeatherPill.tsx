import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWeather } from '../../hooks/useWeather'
import { useT } from '../../context/LanguageContext'
import WeatherIcon from '../weather/WeatherIcon'

interface Props {
  lat: number
  lon: number
}

/**
 * Compact, frosted weather pill for outdoor maps. Collapsed: current icon +
 * temperature. Tapped: a small popover with sun times, today's rain, and a
 * 7-day forecast strip, plus a link to the planning calendar. Weather is
 * inherently spatial (sun/rain over *this* garden), which is why it lives on
 * the map rather than on a separate dashboard.
 */
export default function WeatherPill({ lat, lon }: Props) {
  const t = useT()
  const navigate = useNavigate()
  const { weather } = useWeather(lat, lon)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  // Keep the map clean until we have data.
  if (!weather) return null

  const time = (iso: string) => new Date(iso).toLocaleTimeString(t.locale, { hour: '2-digit', minute: '2-digit' })
  const conditionLabel = t.mapPage.weatherConditions[weather.currentIcon]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 md:px-4 py-1.5 md:py-2 bg-surface/85 rounded-full border border-border/60 shadow-lg text-sm md:text-base font-semibold text-text hover:bg-surface transition-colors"
        style={{ backdropFilter: 'blur(10px)' }}
        aria-label={`${weather.currentTemp}° ${conditionLabel}`}
      >
        <WeatherIcon icon={weather.currentIcon} size={18} />
        <span>{weather.currentTemp}°</span>
        <span className="text-text-muted text-xs font-normal">☀ {time(weather.sunset)}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-[260px] bg-surface border border-border rounded-xl shadow-lg p-3 z-50">
          {/* Current conditions */}
          <div className="flex items-center gap-2 mb-2">
            <WeatherIcon icon={weather.currentIcon} size={28} />
            <div className="min-w-0">
              <div className="font-heading text-lg leading-none text-text">
                {weather.currentTemp}° <span className="text-text-soft font-normal italic text-sm">{conditionLabel}</span>
              </div>
              <div className="text-[11px] text-text-muted mt-1">
                {t.dashboard.weather.tonight}: {weather.tonightMin}°
              </div>
            </div>
          </div>

          {/* Sun times + rain */}
          <div className="flex items-center justify-between text-[11px] text-text-soft border-t border-border-soft pt-2">
            <span>☀ {time(weather.sunrise)} — {time(weather.sunset)}</span>
            <span>{t.mapPage.weatherTodayRain}: {weather.todayRainMm} mm</span>
          </div>

          {/* 7-day forecast */}
          <div className="grid grid-cols-7 gap-1 border-t border-border-soft mt-2 pt-2">
            {weather.forecast.map((day, i) => {
              const label = new Date(day.date).toLocaleDateString(t.locale, { weekday: 'short' }).slice(0, 2)
              return (
                <div key={day.date} className="text-center">
                  <div className={`font-mono text-[8px] uppercase tracking-wider mb-1 ${i === 0 ? 'text-overdue' : 'text-text-muted'}`}>
                    {label}
                  </div>
                  <div className="flex justify-center mb-0.5">
                    <WeatherIcon icon={day.icon} size={16} />
                  </div>
                  <div className={`font-heading text-[11px] leading-none ${i === 0 ? 'text-overdue font-medium' : 'text-text'}`}>
                    {day.maxTemp}°
                  </div>
                  <div className="font-heading text-[9px] text-text-muted leading-tight">{day.minTemp}°</div>
                </div>
              )
            })}
          </div>

          {/* Calendar link */}
          <button
            onClick={() => { setOpen(false); navigate('/calendar') }}
            className="w-full text-right mt-2 pt-2 border-t border-border-soft font-mono text-[10px] uppercase tracking-widest text-primary"
          >
            {t.mapPage.weatherForecastLink}
          </button>
        </div>
      )}
    </div>
  )
}
