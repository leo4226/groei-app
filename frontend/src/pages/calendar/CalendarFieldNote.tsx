import { ALMANAC_EN, ALMANAC_NL } from './almanacContent'
import { useT } from '../../context/LanguageContext'

interface Props {
  month1: number
}

export default function CalendarFieldNote({ month1 }: Props) {
  const t = useT()
  const almanac = t.locale === 'en-GB' ? ALMANAC_EN : ALMANAC_NL
  const note = almanac[month1 - 1]

  return (
    <details className="calendar-field-note">
      <summary>
        <span className="calendar-field-note-label">{t.calendar.fieldNote}</span>
        <span className="calendar-field-note-title">
          {note.title} <em>{note.emphasis}</em>
        </span>
      </summary>
      <div className="calendar-field-note-popover">
        <p className="calendar-field-note-month">{note.eye}</p>
        <p className="calendar-field-note-quote">{note.quote}</p>
        <dl>
          {note.rows.map((row) => (
            <div key={row.key}>
              <dt>{row.key}</dt>
              <dd>{row.value}{row.emphasis && <> · <em>{row.emphasis}</em></>}</dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  )
}
