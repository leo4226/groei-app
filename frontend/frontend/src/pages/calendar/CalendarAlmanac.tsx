import { ALMANAC_NL } from './almanacContent'

export default function CalendarAlmanac({ month1 }: { month1: number }) {
  const a = ALMANAC_NL[month1 - 1]
  return (
    <section className="side-card almanac-side">
      <div className="sc-head">
        <div className="sc-eye">§ {a.eye}</div>
        <h2 className="sc-title">{a.title} <em>{a.emphasis}</em>.</h2>
      </div>
      <div className="almanac-body">
        <p className="alm-q">{a.quote}</p>
        <div className="almanac-rows">
          {a.rows.map((r, i) => (
            <div key={i} className="alm-line">
              <span className="k">{r.key}</span>
              <span>{r.value}{r.emphasis && <> · <em>{r.emphasis}</em></>}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
