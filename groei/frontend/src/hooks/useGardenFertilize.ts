import { useState, useEffect } from 'react'
import { fetchGardenFertilizeStatus, logGardenFertilizing, deleteLatestGardenFertilizing } from '../api/client'
import type { GardenFertilizeStatus } from '../api/client'

export interface UseGardenFertilizeReturn {
  fertilize: GardenFertilizeStatus | null
  fertilizing: boolean
  showPicker: boolean
  pickerDate: string
  setPickerDate: (date: string) => void
  openPicker: () => void
  closePicker: () => void
  save: () => Promise<void>
  deleteLast: () => Promise<void>
}

export function useGardenFertilize(): UseGardenFertilizeReturn {
  const [fertilize, setFertilize] = useState<GardenFertilizeStatus | null>(null)
  const [fertilizing, setFertilizing] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [pickerDate, setPickerDate] = useState('')

  useEffect(() => {
    fetchGardenFertilizeStatus().catch(() => null)
      .then(data => setFertilize(data ?? null))
  }, [])

  const openPicker = () => {
    setPickerDate(fertilize?.fertilized_at ?? new Date().toISOString().slice(0, 10))
    setShowPicker(true)
  }

  const closePicker = () => {
    setShowPicker(false)
  }

  const save = async () => {
    if (!pickerDate) return
    try {
      setFertilizing(true)
      await logGardenFertilizing(pickerDate)
      const updated = await fetchGardenFertilizeStatus()
      setFertilize(updated)
      setShowPicker(false)
    } finally {
      setFertilizing(false)
    }
  }

  const deleteLast = async () => {
    try {
      setFertilizing(true)
      await deleteLatestGardenFertilizing()
      const updated = await fetchGardenFertilizeStatus()
      setFertilize(updated)
      setShowPicker(false)
    } finally {
      setFertilizing(false)
    }
  }

  return {
    fertilize,
    fertilizing,
    showPicker,
    pickerDate,
    setPickerDate,
    openPicker,
    closePicker,
    save,
    deleteLast,
  }
}
