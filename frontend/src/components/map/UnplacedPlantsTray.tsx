import { useState } from 'react'
import type { Plant } from '../../types'
import { useT } from '../../context/LanguageContext'
import { plantDisplayName } from '../../utils/plantDisplayName'

interface Props {
  plants: Plant[]
  onPlace: (plantId: number) => void
}

export default function UnplacedPlantsTray({ plants, onPlace }: Props) {
  const t = useT()
  const [open, setOpen] = useState(false)

  if (plants.length === 0) return null

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-full bg-paper/90 backdrop-blur border border-border px-3 py-1.5 font-heading text-xs text-text-soft shadow-sm"
      >
        🪴 {t.mapPage.unplacedCount(plants.length)}
      </button>
      {open && (
        <div className="flex flex-col gap-1 rounded-2xl bg-paper/95 backdrop-blur border border-border p-2 shadow-md max-h-[40vh] overflow-y-auto">
          <span className="px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-text-muted">
            {t.mapPage.unplacedTitle}
          </span>
          {plants.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPlace(p.id)}
              className="text-left rounded-lg px-3 py-2 font-heading text-sm text-text hover:bg-primary/10 transition-all"
            >
              {plantDisplayName(p, t.locale)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
