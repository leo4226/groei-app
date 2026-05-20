import { isoWeek, dowMon } from './dateUtils'
import { moonPhaseFor, MOON_PHASE_KEY } from './moon'
import { useT } from '../../context/LanguageContext'

interface Props { year: number; month1: number; todayDay: number }

export default function CalendarMoon({ year, month1, todayDay }: Props) {
  const t = useT()
  const dow = dowMon(year, month1, todayDay)
  const monStart = new Date(year, month1 - 1, todayDay - dow)
  const cells = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(monStart)
    d.setDate(monStart.getDate() + i)
    return d
  })
  const wk = isoWeek(monStart.getFullYear(), monStart.getMonth() + 1, monStart.getDate())
  const todayIso = new Date(year, month1 - 1, todayDay).toDateString()
  const center = moonPhaseFor(new Date(year, month1 - 1, todayDay))

  return (
    <section className="side-card">
      <div className="sc-head">
        <div className="sc-eye">{t.calendar.moonPhase}</div>
        <h2 className="sc-title">{t.calendar.week} <em>{wk}</em>.</h2>
        <p className="sc-sub">{t.calendar[MOON_PHASE_KEY[center.phase]]}.</p>
      </div>
      <div className="moon-strip">
        <div className="moon-row">
          {cells.map((d, i) => {
            const { lit, waxing } = moonPhaseFor(d)
            const pct = Math.round(lit * 100)
            const grad = waxing
              ? `linear-gradient(90deg, #2A2A2A ${100 - pct}%, #F0E4C8 ${100 - pct}%)`
              : `linear-gradient(90deg, #F0E4C8 ${pct}%, #2A2A2A ${pct}%)`
            const isNow = d.toDateString() === todayIso
            return (
              <div key={i} className={`moon-cell ${isNow ? 'now' : ''}`}>
                <div className="day-letter">{t.calendar.dayLetters[i]}</div>
                <div className="moon-dot" style={{ background: grad }} />
                <div className="moon-date">{d.getDate()}</div>
              </div>
            )
          })}
        </div>
        <p className="moon-phase-label">{t.calendar[MOON_PHASE_KEY[center.phase]]}.</p>
      </div>
    </section>
  )
}
