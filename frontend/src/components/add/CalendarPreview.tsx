import { useMemo } from 'react'

interface CalendarEvent {
  date: Date
  label: string
  emoji: string
  color: 'water' | 'feed' | 'prune'
  amount?: string
}

interface CalendarPreviewProps {
  waterDays: number
  feedingSchedule: string
  pruningFrequency: string
}

const DAY_HEADERS = ['MA', 'DI', 'WO', 'DO', 'VR', 'ZA', 'ZO']

const MONTHS = [
  'Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni',
  'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December',
]

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

function feedingInterval(schedule?: string): number {
  switch (schedule) {
    case 'weekly': return 7
    case 'monthly': return 30
    case 'seasonal': return 91
    default: return 0
  }
}

function pruningInterval(frequency?: string): number {
  switch (frequency) {
    case 'weekly': return 7
    case 'monthly': return 30
    case 'seasonal': return 91
    default: return 0
  }
}

export default function CalendarPreview({
  waterDays,
  feedingSchedule,
  pruningFrequency,
}: CalendarPreviewProps) {
  const today = useMemo(() => new Date(), [])
  // Normalize today to start of day for consistent comparisons
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())

  const events = useMemo<CalendarEvent[]>(() => {
    const list: CalendarEvent[] = []

    // Water events: every waterDays starting from today
    if (waterDays > 0) {
      for (let d = 0; d < 14; d += waterDays) {
        const date = addDays(todayStart, d)
        if (daysBetween(todayStart, date) < 14) {
          list.push({
            date,
            label: 'Water',
            emoji: '💧',
            color: 'water',
          })
        }
      }
      // Add one more cycle to ensure we cover the full 14 days
      const nextAfter = addDays(todayStart, Math.ceil(14 / waterDays) * waterDays)
      if (daysBetween(todayStart, nextAfter) < 14 && nextAfter.getDate() !== todayStart.getDate()) {
        list.push({
          date: nextAfter,
          label: 'Water',
          emoji: '💧',
          color: 'water',
        })
      }
    }

    // Feeding events
    const feedInterval = feedingInterval(feedingSchedule)
    if (feedInterval > 0) {
      const firstFeed = addDays(todayStart, 1) // start tomorrow
      for (let d = 0; d < 14; d += feedInterval) {
        const date = addDays(firstFeed, d)
        if (daysBetween(todayStart, date) < 14) {
          list.push({ date, label: 'Voeding', emoji: '💪', color: 'feed' })
        }
      }
    }

    // Pruning events
    const pruneInterval = pruningInterval(pruningFrequency)
    if (pruneInterval > 0) {
      const firstPrune = addDays(todayStart, 2) // day after tomorrow
      for (let d = 0; d < 14; d += pruneInterval) {
        const date = addDays(firstPrune, d)
        if (daysBetween(todayStart, date) < 14) {
          list.push({ date, label: 'Snoeien', emoji: '✂️', color: 'prune' })
        }
      }
    }

    return list
  }, [todayStart, waterDays, feedingSchedule, pruningFrequency])

  // Build a 14-day date array starting from today
  const days = useMemo(() => {
    return Array.from({ length: 14 }, (_, i) => addDays(todayStart, i))
  }, [todayStart])

  // Figure out which month to show in the header
  const monthLabel = useMemo(() => {
    const lastDate = days[13]
    if (days[0].getMonth() === lastDate.getMonth()) {
      return `${MONTHS[days[0].getMonth()]} ${days[0].getFullYear()}`
    }
    return `${MONTHS[days[0].getMonth()]} – ${MONTHS[lastDate.getMonth()]} ${lastDate.getFullYear()}`
  }, [days])

  // Group days into weeks for the grid
  const weeks = useMemo(() => {
    const result: (Date | null)[][] = []
    // First day-of-week determines empty leading cells
    const startDow = (days[0].getDay() + 6) % 7 // Monday = 0
    const emptyLeading = startDow

    let currentWeek: (Date | null)[] = []
    // Pad leading empty cells
    for (let i = 0; i < emptyLeading; i++) {
      currentWeek.push(null)
    }
    for (const d of days) {
      currentWeek.push(d)
      if (currentWeek.length === 7) {
        result.push(currentWeek)
        currentWeek = []
      }
    }
    if (currentWeek.length > 0 && currentWeek.some(d => d !== null)) {
      // Pad trailing
      while (currentWeek.length < 7) currentWeek.push(null)
      result.push(currentWeek)
    }
    return result
  }, [days])

  // Map date to events for quick lookup
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const ev of events) {
      const key = `${ev.date.getFullYear()}-${ev.date.getMonth()}-${ev.date.getDate()}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(ev)
    }
    return map
  }, [events])

  const isToday = (d: Date) => {
    return d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
  }

  const eventPipColor: Record<string, string> = {
    water: 'bg-sky',       // matches --sky from design
    feed: 'bg-gold',       // matches --gold
    prune: 'bg-terra',     // matches --terra
  }

  return (
    <section className={`bg-paper border border-border rounded-xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-5 pt-5 pb-3 border-b border-border-soft">
        <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-primary-highlight mb-1">
          § Voorbeeld · Kalender
        </div>
        <h2 className="font-heading text-xl font-medium text-text leading-snug">
          Komende <em className="italic text-primary">weken</em>.
        </h2>
        <p className="text-sm text-text-muted mt-1">
          Zo verschijnt deze plant in jouw Vandaag-blad.
        </p>
      </div>

      {/* Month header */}
      <div className="px-5 pt-4 pb-1 font-heading text-lg text-text">
        <em className="italic text-primary">{monthLabel.split(' ')[0]}</em>{' '}
        {monthLabel.split(' ').slice(1).join(' ')}
      </div>

      {/* Calendar grid */}
      <div className="px-5 pb-4">
        <div className="grid grid-cols-7">
          {/* Day headers */}
          {DAY_HEADERS.map(dh => (
            <div
              key={dh}
              className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted text-center py-1 pb-2 border-b border-border-soft"
            >
              {dh}
            </div>
          ))}

          {/* Day cells */}
          {weeks.map((week, wi) =>
            week.map((day, di) => {
              if (!day) {
                return (
                  <div
                    key={`empty-${wi}-${di}`}
                    className="aspect-square border-r border-b border-border-soft bg-bg/40"
                  />
                )
              }

              const todayClass = isToday(day)
              const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`
              const dayEvents = eventsByDate.get(key) || []

              return (
                <div
                  key={key}
                  className={`aspect-square border-r border-b border-border-soft relative p-1 ${
                    todayClass ? 'bg-terra/5' : 'bg-paper'
                  }`}
                >
                  <span
                    className={`font-mono text-[10px] ${
                      todayClass ? 'text-terra font-medium' : 'text-text-soft'
                    }`}
                  >
                    {day.getDate()}
                  </span>
                  {dayEvents.length > 0 && (
                    <div className="absolute bottom-1 left-1 right-1 flex flex-wrap gap-0.5">
                      {dayEvents.map((ev, i) => (
                        <span
                          key={i}
                          className={`inline-block w-[7px] h-[7px] rounded-full ${eventPipColor[ev.color] || 'bg-text-muted'}`}
                          title={`${ev.label}${ev.amount ? ` · ${ev.amount}` : ''}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="px-5 pb-4 flex items-center gap-4 font-mono text-[10px] uppercase tracking-[0.15em] text-text-muted">
        <span className="flex items-center gap-1.5">
          <span className="w-[7px] h-[7px] rounded-full bg-sky inline-block" />
          Water
        </span>
        {feedingInterval(feedingSchedule) > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="w-[7px] h-[7px] rounded-full bg-gold inline-block" />
            Voeding
          </span>
        )}
        {pruningInterval(pruningFrequency) > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="w-[7px] h-[7px] rounded-full bg-terra inline-block" />
            Snoeien
          </span>
        )}
      </div>

      {/* Upcoming first tasks (simplified) */}
      {events.length > 0 && (
        <div className="px-5 pb-5 border-t border-border-soft">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted pt-3 mb-2">
            § Eerste vijf taken
          </div>
          {events.slice(0, 5).map((ev, i) => {
            const dayNames = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za']
            const d = ev.date
            return (
              <div
                key={i}
                className="flex items-center gap-3 py-2 border-b border-dashed border-border-soft last:border-b-0"
              >
                <div className="font-heading text-xs text-text-muted w-12 text-right leading-tight">
                  <em className="text-text-soft not-italic">{dayNames[d.getDay()]}</em>
                  <br />
                  {d.getDate()} {MONTHS[d.getMonth()].slice(0, 3).toLowerCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-heading text-sm text-text">
                    <em className="italic text-primary">{ev.label}</em>
                    {ev.amount ? ` · ${ev.amount}` : ''}
                  </div>
                </div>
                <span
                  className={`font-mono text-[9px] uppercase tracking-[0.15em] px-2 py-0.5 rounded-full border ${
                    ev.color === 'water'
                      ? 'bg-sky/10 text-sky border-sky/30'
                      : ev.color === 'feed'
                        ? 'bg-gold/10 text-gold border-gold/30'
                        : 'bg-terra/10 text-terra border-terra/30'
                  }`}
                >
                  {ev.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
