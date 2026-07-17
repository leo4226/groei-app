import { useEffect, useState } from 'react'
import { gardenCare, moistureChecks } from '../../api/client'
import { useT } from '../../context/LanguageContext'
import { useFloreren } from '../../store/useFloreren'
import type { CalendarEvent } from './calendarTypes'
import { agendaPlantName } from './workAgendaModel'

export type CalendarCompletion =
  | { kind: 'plant'; plantId: number; plantName: string | null; careLogId: number | null }
  | { kind: 'map'; mapId: number; mapName: string | null }

export function useCalendarActions(
  events: CalendarEvent[],
  onGroupChange?: () => void,
  navigationKey?: string,
) {
  const t = useT()
  const { markCareDone, skipCare, activeUserId } = useFloreren()
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState<string | null>(null)
  const [gardenOperationId, setGardenOperationId] = useState<number | null>(null)
  const [undoMsg, setUndoMsg] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [completion, setCompletion] = useState<CalendarCompletion | null>(null)
  const [pendingWaterRound, setPendingWaterRound] = useState<CalendarEvent | null>(null)
  const [pendingMoistureCheck, setPendingMoistureCheck] = useState<CalendarEvent | null>(null)
  const [moistureNotice, setMoistureNotice] = useState<string | null>(null)

  useEffect(() => {
    setDoneIds(new Set())
    setPendingWaterRound(null)
    setPendingMoistureCheck(null)
  }, [events])

  useEffect(() => {
    setCompletion(null)
    setPendingWaterRound(null)
    setPendingMoistureCheck(null)
    setMoistureNotice(null)
  }, [navigationKey])

  async function completeGroupedEvent(
    event: CalendarEvent,
    scheduleIds?: number[],
  ): Promise<boolean> {
    if (event.map_id === null || activeUserId === null) return false
    setSaving(event.id)
    setUndoMsg(null)
    try {
      const completedAt = new Date().toISOString().slice(0, 10)
      const result = await gardenCare.complete(
        event.type,
        activeUserId,
        event.map_id,
        completedAt,
        scheduleIds,
      )
      setGardenOperationId(result.operation_id)
      setDoneIds(previous => new Set([...previous, event.id]))
      setUndoMsg(t.calendar.completedGroup)
      setCompletion({ kind: 'map', mapId: event.map_id, mapName: event.map_name })
      onGroupChange?.()
      return true
    } catch (error) {
      console.error('gardenCare.complete failed:', error)
      setActionError(t.common.error)
      return false
    } finally {
      setSaving(null)
    }
  }

  async function handleDone(event: CalendarEvent) {
    setActionError(null)
    setCompletion(null)
    setMoistureNotice(null)
    if (
      event.grouped
      && event.map_id !== null
      && event.group_member_schedule_ids
      && event.group_member_schedule_ids.length > 0
      && activeUserId !== null
    ) {
      if (event.type === 'moisture_check' && event.group_members && event.group_members.length > 0) {
        setPendingMoistureCheck(event)
        return
      }
      if (event.type === 'water' && event.group_members && event.group_members.length > 0) {
        setPendingWaterRound(event)
        return
      }
      await completeGroupedEvent(event)
      return
    }
    if (!event.plant_id) return
    setSaving(event.id)
    try {
      const result = await markCareDone(event.plant_id, event.type)
      setDoneIds(previous => new Set([...previous, event.id]))
      setCompletion({
        kind: 'plant',
        plantId: event.plant_id,
        plantName: agendaPlantName(event, t.locale),
        careLogId: result?.care_log_id ?? null,
      })
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
      setCompletion(null)
      setDoneIds(new Set())
      onGroupChange?.()
    } catch (error) {
      console.error('gardenCare.undo failed:', error)
      setActionError(t.common.error)
    } finally {
      setSaving(null)
    }
  }

  async function confirmWaterRound(scheduleIds: number[]) {
    if (!pendingWaterRound || scheduleIds.length === 0) return
    const allowed = new Set(
      pendingWaterRound.group_members?.map((member) => member.schedule_id) ?? [],
    )
    if (scheduleIds.some((scheduleId) => !allowed.has(scheduleId))) return
    setActionError(null)
    setCompletion(null)
    if (await completeGroupedEvent(pendingWaterRound, scheduleIds)) {
      setPendingWaterRound(null)
    }
  }

  async function resolveMoistureCheck(
    scheduleIds: number[],
    outcome: 'still_moist' | 'watered',
  ) {
    if (
      !pendingMoistureCheck
      || pendingMoistureCheck.map_id === null
      || activeUserId === null
      || scheduleIds.length === 0
    ) return
    const allowed = new Set(
      pendingMoistureCheck.group_members?.map(member => member.schedule_id) ?? [],
    )
    if (scheduleIds.some(scheduleId => !allowed.has(scheduleId))) return

    setActionError(null)
    setCompletion(null)
    setSaving(pendingMoistureCheck.id)
    try {
      await moistureChecks.resolve(
        pendingMoistureCheck.map_id,
        scheduleIds,
        outcome,
        new Date().toISOString().slice(0, 10),
        activeUserId,
      )
      setDoneIds(previous => new Set([...previous, pendingMoistureCheck.id]))
      setMoistureNotice(
        outcome === 'still_moist'
          ? t.calendar.moistureCheckResolvedStillMoist
          : t.calendar.moistureCheckResolvedWatered,
      )
      setPendingMoistureCheck(null)
      onGroupChange?.()
    } catch (error) {
      console.error('moistureChecks.resolve failed:', error)
      setActionError(t.common.error)
    } finally {
      setSaving(null)
    }
  }

  async function handleSkip(event: CalendarEvent) {
    if (!event.plant_id) return
    setActionError(null)
    setCompletion(null)
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
    cancelMoistureCheck: () => setPendingMoistureCheck(null),
    cancelWaterRound: () => setPendingWaterRound(null),
    clearCompletion: () => setCompletion(null),
    completion,
    confirmWaterRound,
    doneIds,
    handleDone,
    handleGardenUndo,
    handleSkip,
    moistureNotice,
    pendingMoistureCheck,
    pendingWaterRound,
    resolveMoistureCheck,
    saving,
    undoMsg,
  }
}
