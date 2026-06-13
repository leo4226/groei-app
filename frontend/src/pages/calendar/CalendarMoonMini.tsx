import { moonPhaseFor, MOON_PHASE_KEY } from './moon'
import { useT } from '../../context/LanguageContext'

interface Props { year: number; month1: number; todayDay: number }

export default function CalendarMoonMini({ year, month1, todayDay }: Props) {
  const t = useT()
  const { lit, waxing, phase } = moonPhaseFor(new Date(year, month1 - 1, todayDay))
  const pct = Math.round(lit * 100)
  const grad = waxing
    ? `linear-gradient(90deg, #2A2A2A ${100 - pct}%, #F0E4C8 ${100 - pct}%)`
    : `linear-gradient(90deg, #F0E4C8 ${pct}%, #2A2A2A ${pct}%)`

  return (
    <div className="moon-mini" aria-label={t.calendar[MOON_PHASE_KEY[phase]] as string}>
      <div className="moon-mini-dot" style={{ background: grad }} />
      <span className="moon-mini-label">{t.calendar[MOON_PHASE_KEY[phase]] as string}</span>
    </div>
  )
}
