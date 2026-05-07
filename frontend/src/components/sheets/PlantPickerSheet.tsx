import { useState, useMemo } from 'react'
import type { LocalPlant } from '../../data/plants-dataset'
import { LOCAL_PLANTS } from '../../data/plants-dataset'
import { PLANT_ICONS } from '../../constants/plantIcons'

const TYPE_TO_ICON_KEY: Record<string, string> = {
  vaste_plant: 'flower',
  heester: 'shrub',
  klimmer: 'climber',
  gras: 'grass',
  bol: 'bulb',
  eenjarig: 'herb',
  boom: 'tree',
}

interface Props {
  onClose: () => void
  onSelectPlant: (plant: LocalPlant) => void
  onCustomName: (name?: string) => void
}

export default function PlantPickerSheet({ onClose, onSelectPlant, onCustomName }: Props) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    if (!query.trim()) return LOCAL_PLANTS
    const q = query.toLowerCase()
    return LOCAL_PLANTS.filter(
      (p) =>
        p.dutchName.toLowerCase().includes(q) ||
        p.latinName.toLowerCase().includes(q)
    )
  }, [query])

  const handleCustom = () => {
    onCustomName(query.trim() || undefined)
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Sheet */}
      <div
        className="fixed bottom-0 left-0 right-0 bg-surface rounded-t-2xl z-50 animate-slide-up"
        style={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Drag handle */}
        <button
          onClick={onClose}
          aria-label="Sluiten"
          className="block mx-auto mt-3 mb-2 px-6 py-2 -my-1 group flex-shrink-0"
        >
          <div className="w-10 h-1 bg-border rounded-full group-active:bg-text-muted transition-colors" />
        </button>

        <div className="px-5 flex-shrink-0">
          {/* Header */}
          <h3 className="text-base font-bold text-text mb-1">Kies een plant</h3>
          <p className="text-xs text-text-muted mb-3">
            Uit onze database of typ zelf een naam
          </p>

          {/* Search bar */}
          <div className="relative mb-3">
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round"
            >
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Zoek op naam…"
              autoFocus
              className="w-full pl-10 pr-4 py-2.5 rounded-full bg-bg border border-border text-text text-sm
                         placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
            />
          </div>

          {/* Custom name row */}
          <button
            onClick={handleCustom}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-dashed border-border/60
                       hover:border-primary/40 hover:bg-primary/5 transition-colors mb-3"
          >
            <div className="w-9 h-9 rounded-lg bg-bg flex items-center justify-center text-lg shrink-0">
              ✨
            </div>
            <div className="text-left">
              <span className="text-sm font-semibold text-primary">
                {query.trim() ? `"${query.trim()}" toevoegen` : 'Typ zelf een naam…'}
              </span>
              <p className="text-xs text-text-muted">
                Plant niet in de lijst? Voer zelf in.
              </p>
            </div>
          </button>
        </div>

        {/* Plant grid — scrollable, takes remaining space */}
        <div className="flex-1 overflow-y-auto px-5 pb-5 pb-[env(safe-area-inset-bottom)]" style={{ minHeight: 0 }}>
          {filtered.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-text-muted">Geen planten gevonden</p>
              <button
                onClick={handleCustom}
                className="mt-2 text-sm text-primary font-medium hover:underline"
              >
                {query.trim() ? `"${query.trim()}" als nieuwe plant toevoegen` : 'Typ zelf een naam…'}
              </button>
            </div>
          ) : (
            <div
              className="grid gap-2"
              style={{
                gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
              }}
            >
              {filtered.map((plant) => (
                <button
                  key={plant.id}
                  onClick={() => onSelectPlant(plant)}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-bg
                             hover:bg-primary/10 active:scale-[0.97] transition-all text-center"
                >
                  <svg
                    viewBox="0 0 100 100"
                    className="w-10 h-10 shrink-0"
                    dangerouslySetInnerHTML={{
                      __html: PLANT_ICONS[TYPE_TO_ICON_KEY[plant.type]] || PLANT_ICONS['unknown'] || ''
                    }}
                  />
                  <span className="text-xs font-semibold text-text leading-tight line-clamp-2">
                    {plant.dutchName}
                  </span>
                  <span className="text-[10px] text-text-muted italic leading-tight line-clamp-1">
                    {plant.latinName}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
