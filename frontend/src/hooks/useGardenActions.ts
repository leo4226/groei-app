import { useState, useEffect } from 'react'
import { garden } from '../api/client'
import type { GardenWaterStatus, GardenFertilizeStatus } from '../api/client'

interface GardenActionConfig<TStatus> {
  fetchStatus: () => Promise<TStatus>
  log: (date: string) => Promise<unknown>
  deleteLast: () => Promise<void>
  getLastDoneAt: (status: TStatus | null) => string | null | undefined
}

function useGardenAction<TStatus>(config: GardenActionConfig<TStatus>) {
  const [status, setStatus] = useState<TStatus | null>(null)
  const [operating, setOperating] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [pickerDate, setPickerDate] = useState('')

  useEffect(() => {
    config.fetchStatus().catch(() => null).then(data => setStatus(data ?? null))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const closePicker = () => setShowPicker(false)

  const togglePicker = () => {
    if (showPicker) {
      setShowPicker(false)
    } else {
      setPickerDate(config.getLastDoneAt(status) ?? new Date().toISOString().slice(0, 10))
      setShowPicker(true)
    }
  }

  const save = async () => {
    if (!pickerDate) return
    try {
      setOperating(true)
      await config.log(pickerDate)
      setStatus(await config.fetchStatus())
      setShowPicker(false)
    } finally {
      setOperating(false)
    }
  }

  const deleteLast = async () => {
    try {
      setOperating(true)
      await config.deleteLast()
      setStatus(await config.fetchStatus())
      setShowPicker(false)
    } finally {
      setOperating(false)
    }
  }

  return { status, operating, showPicker, pickerDate, setPickerDate, closePicker, togglePicker, save, deleteLast }
}

export function useGardenWater() {
  const { status: gardenWater, operating: watering, ...rest } = useGardenAction<GardenWaterStatus>({
    fetchStatus: garden.waterStatus,
    log: garden.logWater,
    deleteLast: garden.deleteWater,
    getLastDoneAt: (s) => s?.watered_at,
  })
  return { gardenWater, watering, ...rest }
}

export function useGardenFertilize() {
  const { status: fertilize, operating: fertilizing, closePicker: _closePicker, ...rest } = useGardenAction<GardenFertilizeStatus>({
    fetchStatus: garden.fertilizeStatus,
    log: garden.logFertilize,
    deleteLast: garden.deleteFertilize,
    getLastDoneAt: (s) => s?.fertilized_at,
  })
  return { fertilize, fertilizing, ...rest }
}
