import { useEffect, useId, useRef, useState } from 'react'
import { species as speciesApi } from '../../api/client'
import type { SpeciesSearchHit } from '../../types'
import { speciesChanged, speciesHitLabel, speciesValueFor } from './speciesPickerModel'
import { useT } from '../../context/LanguageContext'
import Glyph from '../ui/Glyph'

interface Props {
  value: string
  onChange: (value: string) => void
  /** The species the plant is stored as, so a pending change can be flagged. */
  original: string | null
  placeholder?: string
}

/**
 * Species field with autocomplete against `plant_species`, plus an explicit way
 * to say "I don't know".
 *
 * This is the most consequential field in the edit form and it was a bare text
 * input. Saving a changed value re-identifies the plant: `update_plant` relinks
 * `species_id`, adopts the new species' care thresholds, regenerates the
 * phenology calendar and retracts the BioCLIP anchors this plant contributed
 * (#866). None of that was signposted, and there was no way to reach the
 * un-identify path deliberately (#886 §4.3).
 *
 * Free text is still allowed on purpose — a species the catalog does not have
 * yet is created in the background rather than refused.
 */
export default function SpeciesPicker({ value, onChange, original, placeholder }: Props) {
  const t = useT()
  const isEN = t.locale?.startsWith('en') ?? false
  const listId = useId()
  const [hits, setHits] = useState<SpeciesSearchHit[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  // Set when the user picks a hit or clears the field, so choosing an exact
  // match does not immediately reopen the list on the resulting value change.
  const suppressRef = useRef(false)

  useEffect(() => {
    const query = value.trim()
    if (suppressRef.current) {
      suppressRef.current = false
      return
    }
    if (query.length < 2) {
      setHits([])
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      speciesApi.search(query, controller.signal)
        .then(res => {
          setHits(res.results)
          setActive(-1)
        })
        // An aborted or failed lookup must never block typing: the field still
        // accepts free text and the backend creates unknown species itself.
        .catch(() => setHits([]))
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [value])

  // Clicking away closes the list without choosing anything.
  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function choose(hit: SpeciesSearchHit) {
    suppressRef.current = true
    onChange(speciesValueFor(hit))
    setOpen(false)
    setHits([])
  }

  function clear() {
    suppressRef.current = true
    onChange('')
    setOpen(false)
    setHits([])
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (!open || hits.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive(i => (i + 1) % hits.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive(i => (i <= 0 ? hits.length - 1 : i - 1))
    } else if (event.key === 'Enter' && active >= 0) {
      // Only intercept Enter when a suggestion is highlighted, so the form can
      // still be submitted from this field.
      event.preventDefault()
      choose(hits[active])
    }
  }

  const changed = speciesChanged(original, value)
  const showList = open && hits.length > 0

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-paper px-3 py-2 font-heading text-sm text-text placeholder:text-text-muted/50 focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
      />

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-border bg-paper shadow-lg"
        >
          {hits.map((hit, i) => {
            const { primary, secondary } = speciesHitLabel(hit, isEN)
            return (
              <li key={hit.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(hit)}
                  className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors ${
                    i === active ? 'bg-primary/10' : 'bg-transparent'
                  }`}
                >
                  <span className="font-heading text-sm italic text-text">{primary}</span>
                  {secondary && <span className="text-xs text-text-muted">{secondary}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {value.trim() !== '' && (
          <button
            type="button"
            onClick={clear}
            className="text-xs font-semibold text-text-muted underline decoration-dotted underline-offset-2 hover:text-text"
          >
            {t.editPlant.speciesUnknown}
          </button>
        )}
        {changed && (
          <p className="flex items-center gap-1.5 text-xs text-text-soft">
            <Glyph name="refresh" size={12} aria-hidden />
            {value.trim() === ''
              ? t.editPlant.speciesWillUnlink
              : t.editPlant.speciesWillRelink}
          </p>
        )}
      </div>
    </div>
  )
}
