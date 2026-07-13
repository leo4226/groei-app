import { Link, useInRouterContext } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { CalendarEvent } from './calendarTypes'

export function calendarEventHref(
  event: CalendarEvent,
  mapSlugs: ReadonlyMap<number, string>,
): string | null {
  if (event.grouped) {
    if (event.map_id === null) return null
    const slug = mapSlugs.get(event.map_id)
    return slug ? `/map/${slug}` : null
  }

  return event.plant_id === null ? null : `/plants/${event.plant_id}`
}

interface Props {
  event: CalendarEvent
  mapSlugs: ReadonlyMap<number, string>
  children: ReactNode
  className?: string
}

export default function CalendarEventLink({ event, mapSlugs, children, className }: Props) {
  const inRouter = useInRouterContext()
  const href = inRouter ? calendarEventHref(event, mapSlugs) : null
  if (!href) return <span className={className}>{children}</span>

  return <Link className={className} to={href}>{children}</Link>
}
