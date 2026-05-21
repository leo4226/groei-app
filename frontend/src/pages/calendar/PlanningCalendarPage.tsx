import { useState } from 'react'
import MonthView from './MonthView'
import PhenologyView from './PhenologyView'
import { useT } from '../../context/LanguageContext'
import { useIsNarrow } from './useIsNarrow'
import './calendar.css'

export type CalendarViewMode = 'month' | 'agenda'

function StandaloneToggle({ view, onSet }: { view: CalendarViewMode; onSet(v: CalendarViewMode): void }) {
  const t = useT()
  return (
    <div className="standalone-toggle-container" style={{
      maxWidth: 1480, margin: '0 auto', padding: 'clamp(16px, 4vw, 48px) clamp(16px, 4vw, 48px) 0',
      display: 'flex', justifyContent: 'flex-end',
    }}>
      <div className="view-toggle">
        <button className={view === 'month' ? 'on' : ''} onClick={() => onSet('month')}>{t.calendar.month}</button>
        <button className={view === 'agenda' ? 'on' : ''} onClick={() => onSet('agenda')}>{t.calendar.agenda}</button>
      </div>
    </div>
  )
}

export default function PlanningCalendarPage() {
  const t = useT()
  const isNarrow = useIsNarrow()
  const [view, setView] = useState<CalendarViewMode>(isNarrow ? 'agenda' : 'month')
  const [env, setEnv] = useState('all')

  return (
    <div className="cal-page">
      {/* ── Environment filter ── */}
      <div style={{
        display: 'flex', gap: 10, padding: '16px 24px 8px',
        flexWrap: 'wrap',
      }}>
        {([
          { id: 'all', label: t.common.all, desc: t.calendar.filterDescAll, icon: '📋' },
          { id: 'tuin', label: t.common.garden, desc: t.calendar.filterDescGarden, icon: '🌿' },
          { id: 'huis', label: t.common.house, desc: t.calendar.filterDescHouse, icon: '🏠' },
        ] as const).map(({ id, label, desc, icon }) => {
          const active = env === id
          return (
            <button
              key={id}
              onClick={() => setEnv(id)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                gap: 2, cursor: 'pointer', textAlign: 'left',
                padding: '10px 18px', borderRadius: 14,
                border: `1.5px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
                background: active ? 'var(--color-primary)' : 'var(--color-surface)',
                color: active ? 'var(--color-surface)' : 'var(--color-text)',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>
                {icon} {label}
              </span>
              <span style={{
                fontSize: 11, lineHeight: 1.3, fontWeight: 400,
                color: active ? 'var(--color-surface)' : 'var(--color-text-muted)',
                opacity: active ? 0.85 : 1,
              }}>
                {desc}
              </span>
            </button>
          )
        })}
      </div>

      {view === 'month' ? (
        <MonthView viewMode={view} onSetView={setView} env={env} />
      ) : (
        <>
          <StandaloneToggle view={view} onSet={setView} />
          <PhenologyView />
        </>
      )}
    </div>
  )
}
