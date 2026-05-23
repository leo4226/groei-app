import { useState, useRef, useEffect } from 'react'
import type { RestoreInfo } from './useMapData'

interface UseUndoableRemoveReturn {
  toast: { label: string; canUndo: boolean } | null
  trigger: (info: RestoreInfo) => void
  dismiss: () => void
  undo: () => Promise<void>
}

export function useUndoableRemove(): UseUndoableRemoveReturn {
  const [toast, setToast] = useState<{ label: string; canUndo: boolean } | null>(null)
  const restoreRef = useRef<(() => Promise<void>) | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const dismiss = () => {
    setToast(null)
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const trigger = (info: RestoreInfo) => {
    // Clear any pending timer
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    // Store restore function and show toast
    restoreRef.current = info.restore
    setToast({ label: info.label, canUndo: info.canUndo })

    // Start 4-second timer
    timerRef.current = setTimeout(() => {
      dismiss()
    }, 4000)
  }

  const undo = async () => {
    if (restoreRef.current) {
      await restoreRef.current()
    }
    dismiss()
  }

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  return {
    toast,
    trigger,
    dismiss,
    undo,
  }
}
