import { useState, useEffect } from 'react'
import { fetchGardenWaterStatus, logGardenWatering, deleteLatestGardenWatering } from '../api/client'
import type { GardenWaterStatus } from '../api/client'

export interface UseGardenWaterReturn {
  gardenWater: GardenWaterStatus | null
  watering: boolean
  showPicker: boolean
  pickerDate: string
  setPickerDate: (date: string) => void
  openPicker: () => void
  closePicker: () => void
  save: () => Promise<void>
  deleteLast: () => Promise<void>
}

export function useGardenWater(): UseGardenWaterReturn {
  const [gardenWater, setGardenWater] = useState<GardenWaterStatus | null>(null)
  const [watering, setWatering] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [pickerDate, setPickerDate] = useState('')

  // Fetch initial garden water status on mount
  useEffect(() => {
    fetchGardenWaterStatus().catch(() => null)
      .then(data => setGardenWater(data ?? null))
  }, [])

  const openPicker = () => {
    setPickerDate(gardenWater?.watered_at ?? new Date().toISOString().slice(0, 10))
    setShowPicker(true)
  }

  const closePicker = () => {
    setShowPicker(false)
  }

  const save = async () => {
    if (!pickerDate) return

    try {
      setWatering(true)
      await logGardenWatering(pickerDate)
      const updated = await fetchGardenWaterStatus()
      setGardenWater(updated)
      setShowPicker(false)
    } finally {
      setWatering(false)
    }
  }

  const deleteLast = async () => {
    try {
      setWatering(true)
      await deleteLatestGardenWatering()
      const updated = await fetchGardenWaterStatus()
      setGardenWater(updated)
      setShowPicker(false)
    } finally {
      setWatering(false)
    }
  }

  return {
    gardenWater,
    watering,
    showPicker,
    pickerDate,
    setPickerDate,
    openPicker,
    closePicker,
    save,
    deleteLast,
  }
}
