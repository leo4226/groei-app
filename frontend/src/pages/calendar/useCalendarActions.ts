import { useEffect, useState } from 'react'
import { gardenCare } from '../../api/client'
import { useT } from '../../context/LanguageContext'
import { useFloreren } from '../../store/useFloreren'
import type { CalendarEvent } from './calendarTypes'

export function useCalendarActions(
  events: CalendarEvent[],
  onGroupChange?: () => void,
) {
  const t = useT()
  const { markCareDone, skipCare, activeUserId } = useFloreren()
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState<string | null>(null)
  const [gardenOperationId, setGardenOperationId] = useState<number | null>(null)
  const [undoMsg, setUndoMsg] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    setDoneIds(new Set())
  }, [events])

  async function handleDone(event: CalendarEvent) {
    setActionError(null)
    if (
      event.grouped
      && event.map_id !== null
      && event.group_member_schedule_ids
      && event.group_member_schedule_ids.length > 0
      && activeUserId !== null
    ) {
      setSaving(event.id)
      setUndoMsg(null)
      try {
        const completedAt = new Date().toISOString().slice(0, 10)
        const result = await gardenCare.complete(
          event.type,
          activeUserId,
          event.map_id,
          completedAt,
        )
        setGardenOperationId(result.operation_id)
        setDoneIds(previous => new Set([...previous, event.id]))
        setUndoMsg(t.calendar.completedGroup)
        onGroupChange?.()
      } catch (error) {
        console.error('gardenCare.complete failed:', error)
        setActionError(t.common.error)
      } finally {
        setSaving(null)
      }
      return
    }
    if (!event.plant_id) return
    setSaving(event.id)
    try {
      await markCareDone(event.plant_id, event.type)
      setDoneIds(previous => new Set([...previous, event.id]))
    } catch (error) {
      console.error('markCareDone failed:', error)
      setActionError(t.common.error)
    } finally {
      setSaving(null)
    }
  }

  async function handleGardenUndo() {
    if (!gardenOperationId) return
    setActionError(null)
    setSaving('undo-garden')
    try {
      await gardenCare.undo(gardenOperationId)
      setGardenOperationId(null)
      setUndoMsg(null)
      setDoneIds(new Set())
      onGroupChange?.()
    } catch (error) {
      console.error('gardenCare.undo failed:', error)
      setActionError(t.common.error)
    } finally {
      setSaving(null)
    }
  }

  async function handleSkip(event: CalendarEvent) {
    if (!event.plant_id) return
    setActionError(null)
    setSaving(event.id)
    try {
      await skipCare(event.plant_id, event.type)
      setDoneIds(previous => new Set([...previous, event.id]))
    } catch (error) {
      console.error('skipCare failed:', error)
      setActionError(t.common.error)
    } finally {
      setSaving(null)
    }
  }

  return {
    actionError,
    doneIds,
    handleDone,
    handleGardenUndo,
    handleSkip,
    saving,
    undoMsg,
  }
}
