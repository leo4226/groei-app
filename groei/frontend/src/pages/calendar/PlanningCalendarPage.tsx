import { useState } from 'react'
import MonthView from './MonthView'
import PhenologyView from './PhenologyView'
import './calendar.css'

export type CalendarViewMode = 'month' | 'agenda'

function StandaloneToggle({ view, onSet }: { view: CalendarViewMode; onSet(v: CalendarViewMode): void }) {
  return (
    <div style={{
      maxWidth: 1480, margin: '0 auto', padding: '24px 48px 0',
      display: 'flex', justifyContent: 'flex-end',
    }}>
      <div className="view-toggle">
        <button className={view === 'month' ? 'on' : ''} onClick={() => onSet('month')}>Maand</button>
        <button className={view === 'agenda' ? 'on' : ''} onClick={() => onSet('agenda')}>Agenda</button>
      </div>
    </div>
  )
}

export default function PlanningCalendarPage() {
  const [view, setView] = useState<CalendarViewMode>('month')
  return (
    <div className="cal-page">
      {view === 'month' ? (
        <MonthView viewMode={view} onSetView={setView} />
      ) : (
        <>
          <StandaloneToggle view={view} onSet={setView} />
          <PhenologyView />
        </>
      )}
    </div>
  )
}
