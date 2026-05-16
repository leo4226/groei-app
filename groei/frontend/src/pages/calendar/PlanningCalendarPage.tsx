import { useState } from 'react'
import PhenologyView from './PhenologyView'

export type CalendarViewMode = 'month' | 'agenda'

export default function PlanningCalendarPage() {
  const [view, setView] = useState<CalendarViewMode>('agenda')

  // For now only 'agenda' (phenology) renders. MonthView is wired in Task D11.
  void view
  void setView

  return <PhenologyView />
}
