import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useFloreren } from '../../store/useFloreren'
import { useT } from '../../context/LanguageContext'
import { resolveIconUrl } from '../../utils/icons'
import Glyph from '../ui/Glyph'
import type { RecentLogEntry } from '../../types'

// Tag colours per care type — mirrors the dashboard's LOG_TAG palette.
const LOG_TAG: Record<string, { text: string; bg: string; border: string }> = {
  water:       { text: 'var(--color-primary)',    bg: 'rgba(47,93,58,.08)',     border: 'rgba(47,93,58,.2)' },
  fertilize:   { text: 'var(--color-primary)',    bg: 'rgba(47,93,58,.08)',     border: 'rgba(47,93,58,.2)' },
  repot: { text: 'var(--color-text-soft)',  bg: 'rgba(74,90,71,.06)',     border: 'var(--color-border)' },
  prune:       { text: 'var(--color-text-soft)',  bg: 'rgba(74,90,71,.06)',     border: 'var(--color-border)' },
  mist:        { text: 'var(--color-primary)',    bg: 'rgba(47,93,58,.08)',     border: 'rgba(47,93,58,.2)' },
  rotate:      { text: 'var(--color-text-muted)', bg: 'rgba(138,148,130,.08)', border: 'var(--color-border-soft)' },
}

/**
 * Recent-care feed for the Plants page. Reads the shared dashboardV2.recent_log
 * from the store (Phase 3 of map-as-home: care history belongs with plants,
 * not on a separate dashboard). Self-contained / Tailwind-styled so it doesn't
 * depend on the dashboard's page-scoped CSS. Renders nothing when empty.
 */
export default function RecentCareSection() {
  const t = useT()
  const dashboardV2 = useFloreren((s) => s.dashboardV2)
  const loadDashboardV2 = useFloreren((s) => s.loadDashboardV2)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!dashboardV2) loadDashboardV2()
  }, [dashboardV2, loadDashboardV2])

  const entries = dashboardV2?.recent_log ?? []
  if (entries.length === 0) return null

  const latest = entries[0]
  const latestAction = t.care[latest.care_type as keyof typeof t.care] ?? latest.care_type
  const latestDate = new Date(latest.done_at).toLocaleDateString(t.locale, { day: 'numeric', month: 'short' })

  return (
    <section className="mt-6 mb-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full px-3.5 py-2.5 rounded-xl border border-border-soft bg-surface text-left"
      >
        <span className="min-w-0 truncate font-heading text-[13px] text-text-soft">
          <span className="font-mono text-[10px] uppercase tracking-widest text-text-muted mr-2">{t.plantsPage.recentCare}</span>
          <span className="text-text-muted">{latestDate}</span> · {latestAction} · {latest.plant_name}
        </span>
        <span className="ml-3 shrink-0 font-mono text-[10px] uppercase tracking-wider text-text-muted">
          {open ? '↑' : `↓ ${entries.length}`}
        </span>
      </button>

      {open && (
        <div className="card mt-2 rounded-2xl overflow-hidden">
          {entries.map((entry, i) => (
            <LogRow key={entry.id} entry={entry} first={i === 0} locale={t.locale} actionLabel={t.care[entry.care_type as keyof typeof t.care] ?? entry.care_type} />
          ))}
          <div className="border-t border-border-soft px-4 py-3 flex justify-end">
            <Link to="/log" className="font-mono text-[10px] uppercase tracking-widest text-primary no-underline">
              {t.dashboard.actions.fullLog}
            </Link>
          </div>
        </div>
      )}
    </section>
  )
}

function LogRow({ entry, first, locale, actionLabel }: {
  entry: RecentLogEntry
  first: boolean
  locale: string
  actionLabel: string
}) {
  const tag = LOG_TAG[entry.care_type] ?? LOG_TAG.water
  const dateStr = new Date(entry.done_at).toLocaleDateString(locale, { day: 'numeric', month: 'long' })
  const timeStr = new Date(entry.done_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  return (
    <div className={`flex items-start gap-3 px-4 py-3 ${first ? '' : 'border-t border-border-soft'}`}>
      <div className="w-12 h-12 rounded-lg shrink-0 overflow-hidden flex items-center justify-center border border-border-soft"
        style={{ background: 'linear-gradient(145deg, #FDFAF1, #EDE5D1)' }}>
        {entry.icon_key
          ? <img src={resolveIconUrl(entry.icon_key)!} alt="" className="w-[80%] h-[80%] object-contain" />
          : <Glyph name="leaf" size={20} className="text-text-muted" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[10px] uppercase tracking-widest text-text-muted mb-0.5 truncate">{dateStr} · {timeStr}</div>
        <div className="font-heading text-sm text-text truncate">
          {actionLabel} · <em className="text-primary">{entry.plant_name}</em>
        </div>
        {entry.notes && (
          <p className="m-0 mt-0.5 font-heading italic text-xs text-text-soft leading-snug line-clamp-2 break-words">{entry.notes}</p>
        )}
      </div>
      <span
        className="shrink-0 font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full whitespace-nowrap"
        style={{ color: tag.text, background: tag.bg, border: `1px solid ${tag.border}` }}
      >
        {actionLabel}
      </span>
    </div>
  )
}
