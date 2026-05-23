import { useState, useMemo } from 'react'
import type { LocalPlant } from '../../data/plants-dataset'
import { LOCAL_PLANTS } from '../../data/plants-dataset'
import { useT } from '../../context/LanguageContext'
import { resolveIconUrl } from '../../utils/icons'

const TYPE_COLOR: Record<string, string> = {
  vaste_plant: '#d98199',
  heester: '#2544a0',
  klimmer: '#2544a0',
  gras: '#24e34c',
  bol: '#d64e2e',
  eenjarig: '#ff7701',
  boom: '#160572',
}

interface Props {
  onClose: () => void
  onSelectPlant: (plant: LocalPlant) => void
  onCustomName: (name?: string) => void
}

export default function PlantPickerSheet({ onClose, onSelectPlant, onCustomName }: Props) {
  const t = useT()
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
      <div className="fixed bottom-0 left-0 right-0 bg-surface rounded-t-2xl z-50 pb-[calc(4rem+env(safe-area-inset-bottom))] animate-slide-up max-h-[85dvh] flex flex-col">
        {/* Drag handle */}
        <button
          onClick={onClose}
          aria-label={t.plantPicker.close}
          className="block mx-auto mt-3 mb-4 px-6 py-2 -my-1 group"
        >
          <div className="w-10 h-1 bg-border rounded-full group-active:bg-text-muted transition-colors" />
        </button>

        <div className="px-5 pb-8 flex flex-col min-h-0 flex-1 overflow-y-auto">
          {/* Header */}
          <h3 className="text-base font-bold text-text mb-1">{t.plantPicker.title}</h3>
          <p className="text-xs text-text-muted mb-3">
            {t.plantPicker.subtitle}
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
              placeholder={t.plantPicker.searchPlaceholder}
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
                {query.trim() ? t.plantPicker.addCustom(query.trim()) : t.plantPicker.typeName}
              </span>
              <p className="text-xs text-text-muted">
                {t.plantPicker.notInList}
              </p>
            </div>
          </button>

          {/* Plant grid */}
          {filtered.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-text-muted">{t.plantPicker.noResults}</p>
              <button
                onClick={handleCustom}
                className="mt-2 text-sm text-primary font-medium hover:underline"
              >
                {query.trim() ? t.plantPicker.addAsNew(query.trim()) : t.plantPicker.typeName}
              </button>
            </div>
          ) : (
            <div
              className="grid gap-2 pb-2"
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
                  {plant.iconKey ? (
                    <img
                      src={resolveIconUrl(plant.iconKey)!}
                      alt={plant.dutchName}
                      className="w-8 h-8 object-contain"
                    />
                  ) : (
                    <div
                      className="w-8 h-8 rounded-md shrink-0"
                      style={{ background: TYPE_COLOR[plant.type] ?? '#909090' }}
                    />
                  )}
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
