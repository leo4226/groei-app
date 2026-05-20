import { useState, useEffect, useRef } from 'react'
import type { PlantIcon } from '../types'
import { fetchIconCatalog } from '../api/client'
import { useCategoryLabels, useFormLabels } from '../constants/plantLabels'
import { useT } from '../context/LanguageContext'

interface Props {
  value: string | null
  onChange: (iconKey: string | null) => void
}

export default function IconPicker({ value, onChange }: Props) {
  const CATEGORY_LABELS = useCategoryLabels()
  const FORM_LABELS = useFormLabels()
  const t = useT()
  const [open, setOpen] = useState(false)
  const [icons, setIcons] = useState<PlantIcon[]>([])
  const [search, setSearch] = useState('')
  const [formFilter, setFormFilter] = useState<'all' | 'potted' | 'bare' | 'other'>('all')
  const [loading, setLoading] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = icons.find((i) => i.id === value) ?? null

  useEffect(() => {
    if (!open) return
    if (icons.length > 0) {
      setTimeout(() => searchRef.current?.focus(), 80)
      return
    }
    setLoading(true)
    fetchIconCatalog()
      .then(setIcons)
      .catch(console.error)
      .finally(() => {
        setLoading(false)
        setTimeout(() => searchRef.current?.focus(), 80)
      })
  }, [open])

  const filtered = icons.filter((icon) => {
    if (formFilter !== 'all') {
      const matchesForm =
        formFilter === 'other'
          ? icon.form !== 'potted' && icon.form !== 'bare'
          : icon.form === formFilter
      if (!matchesForm) return false
    }
    if (!search) return true
    const q = search.toLowerCase()
    return (
      icon.id.includes(q) ||
      icon.name.toLowerCase().includes(q) ||
      (icon.sci || '').toLowerCase().includes(q) ||
      (icon.cat || '').includes(q)
    )
  })

  function handleSelect(icon: PlantIcon) {
    onChange(icon.id === value ? null : icon.id)
    setOpen(false)
    setSearch('')
  }

  function handleClose() {
    setOpen(false)
    setSearch('')
    setFormFilter('all')
  }

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-surface border border-border text-left transition-all hover:border-primary/40"
      >
        {selected ? (
          <>
            <img
              src={`/icons/${selected.id}.svg`}
              alt={selected.name}
              className="w-9 h-9 flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text truncate">{selected.name}</p>
              <p className="text-xs text-text-muted truncate">{selected.sci}</p>
            </div>
            <span
              className="text-text-muted text-lg leading-none flex-shrink-0"
              onClick={(e) => {
                e.stopPropagation()
                onChange(null)
              }}
            >
              ×
            </span>
          </>
        ) : (
          <>
            <div className="w-9 h-9 rounded-lg bg-bg border border-dashed border-border flex items-center justify-center text-text-muted flex-shrink-0">
              <span className="text-xl">🌿</span>
            </div>
            <span className="text-sm text-text-muted">{t.iconPicker.title}</span>
          </>
        )}
      </button>

      {/* Full-screen picker overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-bg">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 pt-safe-top pt-4 pb-3 border-b border-border bg-surface flex-shrink-0">
            <button
              type="button"
              onClick={handleClose}
              className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-text flex-shrink-0"
            >
              ←
            </button>
            <h2 className="text-lg font-bold flex-1">{t.iconPicker.title}</h2>
            {value && (
              <button
                type="button"
                onClick={() => { onChange(null); handleClose() }}
                className="text-xs text-text-muted underline"
              >
                {t.iconPicker.clear}
              </button>
            )}
          </div>

          {/* Search */}
          <div className="px-4 pt-3 pb-2 flex-shrink-0">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.iconPicker.searchPlaceholder}
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-border text-text placeholder:text-text-muted/50 focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
            />
          </div>

          {/* Form filter tabs */}
          <div className="px-4 pb-3 flex-shrink-0">
            <div className="flex gap-2">
              {(Object.keys(FORM_LABELS) as Array<keyof typeof FORM_LABELS>).map((form) => (
                <button
                  key={form}
                  type="button"
                  onClick={() => setFormFilter(form as typeof formFilter)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    formFilter === form
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border bg-surface text-text-muted hover:border-primary/40'
                  }`}
                >
                  {FORM_LABELS[form]}
                </button>
              ))}
            </div>
          </div>

          {/* Grid */}
          <div className="flex-1 overflow-y-auto px-4 pb-8">
            {loading && (
              <div className="flex justify-center pt-12 text-text-muted text-sm">{t.common.loading}</div>
            )}
            {!loading && filtered.length === 0 && (
              <div className="flex justify-center pt-12 text-text-muted text-sm">{t.iconPicker.noResults}</div>
            )}
            {!loading && filtered.length > 0 && (
              <div className="grid grid-cols-4 gap-3">
                {filtered.map((icon) => (
                  <button
                    key={icon.id}
                    type="button"
                    onClick={() => handleSelect(icon)}
                    className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all ${
                      icon.id === value
                        ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                        : 'border-border bg-surface hover:border-primary/40 hover:bg-primary/5'
                    }`}
                  >
                    <img
                      src={`/icons/${icon.id}.svg`}
                      alt={icon.name}
                      className="w-12 h-12"
                      loading="lazy"
                    />
                    <span className="text-[10px] text-text-muted text-center leading-tight line-clamp-2">
                      {icon.name}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Category legend */}
            {!loading && !search && (
              <div className="mt-6 pt-4 border-t border-border">
                <p className="text-xs font-medium text-text-muted mb-2">Categorieën</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(CATEGORY_LABELS).map(([cat, label]) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSearch(cat)}
                      className="text-xs px-2.5 py-1 rounded-full bg-surface border border-border text-text-muted hover:border-primary/40 transition-colors"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
