import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense, Component, type MouseEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { plantPassportSwipeDirection } from '../../utils/plantPassportSwipe'
import { useT } from '../../context/LanguageContext'
import { useFloreren } from '../../store/useFloreren'
import { discoveries as discoveriesApi, species as speciesApi, type PlantDiscovery } from '../../api/client'
import { buildDiscoveryJournalEntry, discoveryDisplayName, discoveryFunFact } from '../../utils/discoveryJournal'
import { captureDiscoveryLocation } from '../../utils/discoveryLocation'
import { countPlaces, type GeoEntry } from '../../utils/expeditionGeo'
import type { EcologyOut } from '../../types'
import WikipediaLink from './WikipediaLink'
import ExpeditionMap from './ExpeditionMap'

// The GL map (maplibre + tiles) is its own lazy chunk; the bundled SVG map is
// both the loading state and the fallback when the chunk or WebGL fails.
const ExpeditionMapGL = lazy(() => import('./ExpeditionMapGL'))

class MapErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}
import { useIsMobile } from '../../hooks/useIsMobile'
import Glyph from '../ui/Glyph'
import PageDecor from '../PageDecor'

export type DiscoveryStats = { finds: number; species: number; places: number }

interface Props {
  /** Reports finds/species/places so a host page can show masthead stats. */
  onStats?: (stats: DiscoveryStats) => void
}

const FIT_RANK: Record<string, number> = { perfect: 4, acceptable: 3, marginal: 2, tolerated: 1 }
const FIT_COLOR: Record<string, string> = { perfect: '#24e34c', acceptable: '#a3e635', marginal: '#f59e0b', tolerated: '#6b7280' }
/** Device-local view scope for the field journal: all household finds or mine. */
const SCOPE_KEY = 'floreren-fieldguide-scope'

type FitVerdicts = Array<{ sun_fit: string | null }>

function bestFit(verdicts: FitVerdicts | undefined): string | null {
  if (!verdicts?.length) return null
  const best = verdicts.reduce((b, v) =>
    (FIT_RANK[v.sun_fit ?? ''] ?? 0) > (FIT_RANK[b.sun_fit ?? ''] ?? 0) ? v : b,
    verdicts[0]
  )
  return best.sun_fit
}

function formatDate(iso: string, locale: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat(locale || 'nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
    .format(d).replace(/\./g, '')
}

function formatCoords(lat: number, lon: number, isEN: boolean): string {
  const ns = lat >= 0 ? 'N' : (isEN ? 'S' : 'Z')
  const ew = lon >= 0 ? (isEN ? 'E' : 'O') : 'W'
  return `${Math.abs(lat).toFixed(2)}°${ns} ${Math.abs(lon).toFixed(2)}°${ew}`
}

function mapUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps?q=${lat},${lon}`
}

/** "Amsterdam, NL" when reverse-geocoded, else null (callers fall back to coords). */
function placeLabel(d: PlantDiscovery): string | null {
  if (!d.place_name) return null
  return d.country_code ? `${d.place_name}, ${d.country_code}` : d.place_name
}

/** Decorative machine-readable zone, mirroring the Plant Passport hero. */
function mrz(common: string, latin: string | null): string {
  return `V<FLO<<${common}<<${latin ?? ''}`
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]/g, '<')
    .padEnd(36, '<')
    .slice(0, 36)
}

type Chip = { tone: 'native' | 'invasive' | 'bee' | 'bloom'; label: string }

const CHIP_CLASS: Record<Chip['tone'], string> = {
  native:   'bg-good/12 text-good',
  invasive: 'bg-overdue/13 text-overdue',
  bee:      'bg-due/14 text-[#8a6a10]',
  bloom:    'bg-type-flower/16 text-[#7a2c44]',
}
const CHIP_DOT: Record<Chip['tone'], string> = {
  native: 'var(--color-good)', invasive: 'var(--color-overdue)',
  bee: 'var(--color-due)', bloom: 'var(--color-type-flower)',
}

function EcologyChips({ chips, max }: { chips: Chip[]; max?: number }) {
  const shown = max != null ? chips.slice(0, max) : chips
  if (shown.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((c, i) => (
        <span key={i} className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${CHIP_CLASS[c.tone]}`}>
          <i className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: CHIP_DOT[c.tone] }} />
          {c.label}
        </span>
      ))}
    </div>
  )
}

export default function DiscoveriesSection({ onStats }: Props) {
  const t = useT()
  const navigate = useNavigate()
  const isEN = (t.locale ?? 'nl-NL').toLowerCase().startsWith('en')
  const refreshTick = useFloreren((s) => s.refreshTick)
  // Smaller SVG canvas on phones so pins keep a tappable on-screen size.
  const isNarrow = useIsMobile(720)
  const [items, setItems] = useState<PlantDiscovery[]>([])
  const [loading, setLoading] = useState(true)
  const [fitMap, setFitMap] = useState<Record<string, FitVerdicts>>({})
  const [ecologyMap, setEcologyMap] = useState<Record<number, EcologyOut>>({})
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [filter, setFilter] = useState<string>('all')
  // View scope for the whole section (list, map pins, stats): all household
  // finds or only the calling account's own. Persisted per device.
  const [scope, setScope] = useState<'all' | 'mine'>(() =>
    localStorage.getItem(SCOPE_KEY) === 'mine' ? 'mine' : 'all'
  )
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const [locationCapturing, setLocationCapturing] = useState(false)
  const [locationError, setLocationError] = useState(false)
  const [funFactFailedId, setFunFactFailedId] = useState<number | null>(null)

  // refreshTick: re-fetch on pull-to-refresh / app-foreground refresh. Only
  // the initial run shows the loading state; refreshes swap data in place.
  // Scope changes refetch too; a cancelled guard drops stale responses so a
  // quick all→mine→all toggle can't land out of order.
  useEffect(() => {
    let cancelled = false
    discoveriesApi.list(scope)
      .then(items => { if (!cancelled) setItems(items) })
      .catch(() => { if (!cancelled) setItems([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [refreshTick, scope])

  useEffect(() => {
    const ids = [...new Set(items.flatMap(i => i.species_id != null ? [i.species_id] : []))]
    if (ids.length === 0) return
    speciesApi.gardenFitBatch(ids, isEN ? 'en' : 'nl').then(setFitMap).catch(() => {})
    // Ecology per unique species — served from the backend cache, so a burst
    // of parallel GETs is fine for journal-sized collections.
    Promise.allSettled(ids.map(id => speciesApi.ecology(id).then(e => [id, e] as const)))
      .then(results => {
        const map: Record<number, EcologyOut> = {}
        for (const r of results) if (r.status === 'fulfilled') map[r.value[0]] = r.value[1]
        setEcologyMap(map)
      })
    // isEN: the fit reasons are localized server-side, so a language switch
    // has to refetch them or the chips keep the previous language.
  }, [items, isEN])

  // Chronological numbering: oldest find = nr. 1
  const orderIndex = useMemo(() => {
    const sorted = [...items].sort(
      (a, b) => new Date(a.discovered_at).getTime() - new Date(b.discovered_at).getTime()
    )
    return new Map(sorted.map((d, i) => [d.id, i + 1]))
  }, [items])

  const geoEntries: GeoEntry[] = useMemo(() =>
    [...items]
      .filter(d => d.location_lat != null && d.location_lon != null)
      .map(d => ({ id: d.id, lat: d.location_lat!, lon: d.location_lon!, index: orderIndex.get(d.id) ?? 0, place: d.place_name ?? undefined }))
      .sort((a, b) => a.index - b.index),
    [items, orderIndex])

  const stats: DiscoveryStats = useMemo(() => ({
    finds: items.length,
    species: new Set(items.map(d => d.species_id ?? `n:${(d.latin_name ?? d.common_name).toLowerCase()}`)).size,
    places: countPlaces(geoEntries),
  }), [items, geoEntries])

  useEffect(() => { onStats?.(stats) }, [stats, onStats])

  const years = useMemo(() =>
    [...new Set(items.map(d => new Date(d.discovered_at).getFullYear()).filter(y => !isNaN(y)))]
      .sort((a, b) => b - a),
    [items])

  function chipsFor(d: PlantDiscovery): Chip[] {
    const eco = d.species_id != null ? ecologyMap[d.species_id] : undefined
    if (!eco) return []
    const chips: Chip[] = []
    if (eco.native_to_nl === true) chips.push({ tone: 'native', label: t.discovery.nativeNl })
    if (eco.invasive_nl === true) chips.push({ tone: 'invasive', label: t.discovery.invasiveNl })
    if ((eco.pollinator_value ?? 0) >= 2) chips.push({ tone: 'bee', label: t.discovery.pollinatorGood })
    if (eco.flowering_months && eco.flowering_months.length > 0) {
      const fmt = new Intl.DateTimeFormat(t.locale, { month: 'short' })
      const label = (m: number) => fmt.format(new Date(2026, m - 1, 1)).replace('.', '')
      const lo = Math.min(...eco.flowering_months)
      const hi = Math.max(...eco.flowering_months)
      chips.push({ tone: 'bloom', label: `${t.discovery.bloomShort} ${lo === hi ? label(lo) : `${label(lo)}–${label(hi)}`}` })
    }
    return chips
  }

  const visible = useMemo(() => items.filter(d => {
    if (filter === 'all') return true
    if (filter === 'native') {
      const eco = d.species_id != null ? ecologyMap[d.species_id] : undefined
      return eco?.native_to_nl === true
    }
    return new Date(d.discovered_at).getFullYear() === Number(filter)
  }), [items, filter, ecologyMap])

  const selected = selectedId != null ? items.find(d => d.id === selectedId) ?? null : null

  // Self-healing fun facts: entries whose species predates the journal's
  // fun-fact columns (or whose fact generation failed at identify time) fetch
  // one on open — the endpoint generates via the LLM and caches on the species.
  async function loadMissingFunFact(item: PlantDiscovery) {
    if (item.species_id == null) return
    setFunFactFailedId(null)
    const speciesId = item.species_id
    try {
      const r = await speciesApi.funFact(speciesId)
      if (!r.fun_fact_nl && !r.fun_fact_en) throw new Error('Empty fun fact')
      setItems(prev => prev.map(d => d.species_id === speciesId
          ? { ...d, fun_fact_nl: r.fun_fact_nl || d.fun_fact_nl, fun_fact_en: r.fun_fact_en || d.fun_fact_en }
          : d))
    } catch {
      setFunFactFailedId(item.id)
    }
  }

  useEffect(() => {
    const item = selectedId != null ? items.find(d => d.id === selectedId) : undefined
    if (!item || item.species_id == null || item.fun_fact_nl || item.fun_fact_en) return
    void loadMissingFunFact(item)
  }, [selectedId])

  // Flat order of the cards as the grid actually paints them, so the detail
  // view's prev/next and swipe move to the neighbour the user can see (#884).
  const navOrder = useMemo(() => {
    if (!(filter === 'all' && years.length > 1)) return visible
    return years.flatMap(year =>
      visible.filter(d => new Date(d.discovered_at).getFullYear() === year))
  }, [visible, years, filter])

  const navIndex = selectedId != null ? navOrder.findIndex(d => d.id === selectedId) : -1
  const prevEntry = navIndex > 0 ? navOrder[navIndex - 1] : null
  const nextEntry = navIndex >= 0 && navIndex < navOrder.length - 1 ? navOrder[navIndex + 1] : null

  const stepEntry = useCallback((dir: 'prev' | 'next') => {
    setSelectedId(current => {
      if (current == null) return current
      const i = navOrder.findIndex(d => d.id === current)
      if (i === -1) return current
      const target = dir === 'prev' ? navOrder[i - 1] : navOrder[i + 1]
      if (!target) return current
      setEditingNotes(false)
      setLocationError(false)
      return target.id
    })
  }, [navOrder])

  // Escape closes; arrows page through the guide like a real one.
  useEffect(() => {
    if (selectedId == null) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (editingNotes) return
      if (e.key === 'Escape') { setSelectedId(null); return }
      if (e.key === 'ArrowLeft') { e.preventDefault(); stepEntry('prev') }
      if (e.key === 'ArrowRight') { e.preventDefault(); stepEntry('next') }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [selectedId, editingNotes, stepEntry])

  // Keep the page behind the modal still on phones.
  useEffect(() => {
    if (selectedId == null) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [selectedId])

  // Swipe left/right pages through the guide, matching the plant passport's
  // gesture (#884). Reuses the shared classifier so a diagonal drag stays a
  // scroll rather than flipping the entry.
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  const onCardTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    swipeStart.current = { x: touch.clientX, y: touch.clientY }
  }
  const onCardTouchEnd = (e: React.TouchEvent) => {
    const start = swipeStart.current
    swipeStart.current = null
    if (!start || editingNotes) return
    const touch = e.changedTouches[0]
    const direction = plantPassportSwipeDirection(start.x, start.y, touch.clientX, touch.clientY)
    if (direction) stepEntry(direction)
  }

  function openEntry(id: number) {
    setSelectedId(id)
    setEditingNotes(false)
    setLocationCapturing(false)
    setLocationError(false)
  }

  function handleMapSelect(ids: number[]) {
    // A cluster opens its most recent find
    openEntry(ids[ids.length - 1])
  }

  async function handleDelete(id: number) {
    if (!window.confirm(t.discovery.journalDeleteConfirm)) return
    await discoveriesApi.delete(id).catch(() => {})
    setItems(prev => prev.filter(d => d.id !== id))
    setSelectedId(prev => prev === id ? null : prev)
  }

  async function handleShare(item: PlantDiscovery) {
    const title = discoveryDisplayName(item, t.locale)
    const fact = discoveryFunFact(item, t.locale)
    // Mint (or reuse) the public specimen-card link — the page carries OG tags,
    // so chat apps render a rich preview (photo + name + fact). If the request
    // fails (offline), fall back to sharing text only.
    let url: string | undefined
    try {
      url = (await discoveriesApi.share(item.id)).share_url
    } catch { /* text-only share below */ }
    const text = [`${title}${item.latin_name ? ` (${item.latin_name})` : ''} 🌿`, fact]
      .filter(Boolean).join(' — ')
    if (typeof navigator.share === 'function') {
      await navigator.share(url ? { title, text, url } : { title, text }).catch(() => {})
    } else {
      try {
        await navigator.clipboard.writeText(url ? `${text}\n${url}` : text)
        setCopiedId(item.id)
        setTimeout(() => setCopiedId(null), 2000)
      } catch {
        // clipboard unavailable — fail silently
      }
    }
  }

  function handleAddToGarden(item: PlantDiscovery) {
    navigate('/plants/add', {
      state: {
        prefill: {
          name: discoveryDisplayName(item, t.locale),
          scientific_name: item.latin_name ?? undefined,
          species_id: item.species_id ?? undefined,
        },
        from: 'journal',
      },
    })
  }

  async function handleSaveNotes(item: PlantDiscovery) {
    setNotesSaving(true)
    try {
      const updated = await discoveriesApi.updateNotes(item.id, notesDraft.trim() || null)
      setItems(prev => prev.map(d => d.id === item.id ? { ...d, notes: updated.notes } : d))
      setEditingNotes(false)
    } catch {
      // keep the editor open so the text isn't lost
    } finally {
      setNotesSaving(false)
    }
  }

  async function handleCaptureLocation(item: PlantDiscovery) {
    setLocationCapturing(true)
    setLocationError(false)
    try {
      const location = await captureDiscoveryLocation()
      if (!location) {
        setLocationError(true)
        return
      }
      const updated = await discoveriesApi.updateLocation(item.id, location)
      setItems(prev => prev.map(d => d.id === item.id ? updated : d))
    } catch {
      setLocationError(true)
    } finally {
      setLocationCapturing(false)
    }
  }

  function stopAction(e: MouseEvent, action: () => void) {
    e.stopPropagation()
    action()
  }

  function exportCsv() {
    const esc = (v: unknown) => {
      const str = v == null ? '' : String(v)
      return /[",\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str
    }
    const header = ['nr', 'date', 'name', 'latin_name', 'place', 'country', 'lat', 'lon', 'notes']
    const rows = [...items]
      .sort((a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0))
      .map(d => [
        orderIndex.get(d.id), d.discovered_at.slice(0, 10), discoveryDisplayName(d, t.locale),
        d.latin_name ?? '', d.place_name ?? '', d.country_code ?? '',
        d.location_lat ?? '', d.location_lon ?? '', d.notes ?? '',
      ])
    const csv = [header, ...rows].map(r => r.map(esc).join(',')).join('\n')
    // BOM so Excel opens UTF-8 (place names, notes) correctly
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'veldgids-floreren.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const scopeOptions = [
    { id: 'all', label: t.discovery.scopeAll },
    { id: 'mine', label: t.discovery.scopeMine },
  ] as const

  function handleScopeChange(next: 'all' | 'mine') {
    setScope(next)
    localStorage.setItem(SCOPE_KEY, next)
  }

  const scopeToggle = (
    <div className="mb-5 flex justify-center">
      <div className="flex items-center gap-1 rounded-full border border-border bg-paper p-1">
        {scopeOptions.map(opt => (
          <button
            key={opt.id}
            type="button"
            onClick={() => handleScopeChange(opt.id)}
            aria-pressed={scope === opt.id}
            className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
              scope === opt.id
                ? 'bg-primary text-white'
                : 'text-text-soft hover:text-primary'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="px-6 py-10 text-center">
        <p className="font-heading text-[15px] italic text-text-soft">{t.discovery.journalEmptyHint}</p>
      </div>
    )
  }

  if (items.length === 0) {
    // scope=mine with no own finds yet: keep the toggle visible so the user
    // can switch back to the household-wide view. scope=all empty is the true
    // empty state (there is nothing to switch to).
    if (scope === 'mine') {
      return (
        <>
          {scopeToggle}
          <div className="px-6 py-10 text-center">
            <p className="m-0 font-heading text-[15px] italic text-text-soft">{t.discovery.journalEmptyMine}</p>
          </div>
        </>
      )
    }
    return (
      <div className="relative overflow-hidden px-6 py-14 text-center min-h-[340px] flex flex-col items-center justify-center">
        <PageDecor variant="sparse" />
        <div className="relative mb-3 text-text-muted"><Glyph name="leaf" size={40} /></div>
        <p className="relative m-0 font-heading text-lg italic text-text-soft">{t.discovery.journalEmpty}</p>
        <p className="relative mx-auto mt-1.5 max-w-[380px] text-[13px] text-text-muted">{t.discovery.journalEmptyHint}</p>
      </div>
    )
  }

  const compass: [string, string, string, string] = isEN ? ['N', 'S', 'E', 'W'] : ['N', 'Z', 'O', 'W']

  return (
    <>
      {/* ── Scope switch: my finds vs all household finds ── */}
      {scopeToggle}

      {/* ── Expedition map ── */}
      {geoEntries.length > 0 && (
        <section className="mb-8">
          <p className="mb-3 font-mono text-[11px] font-bold uppercase tracking-widest text-text-muted">
            {t.discovery.expeditionMap}
          </p>
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            {(() => {
              const svgFallback = (
                <ExpeditionMap
                  entries={geoEntries}
                  onSelect={handleMapSelect}
                  compass={compass}
                  width={isNarrow ? 380 : 760}
                  height={isNarrow ? 250 : 400}
                />
              )
              return (
                <MapErrorBoundary fallback={svgFallback}>
                  <Suspense fallback={svgFallback}>
                    <ExpeditionMapGL entries={geoEntries} onSelect={handleMapSelect} compass={compass} />
                  </Suspense>
                </MapErrorBoundary>
              )
            })()}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-border px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
              <span>{t.discovery.mapClickHint}</span>
            </div>
          </div>
        </section>
      )}

      {/* ── Filters ── */}
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <p className="m-0 font-mono text-[11px] font-bold uppercase tracking-widest text-text-muted">
          {t.discovery.statFinds} — {visible.length}
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'all', label: t.discovery.filterAll },
            ...years.map(y => ({ id: String(y), label: String(y) })),
            { id: 'native', label: t.discovery.filterNative },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                filter === f.id
                  ? 'border border-primary bg-primary text-white'
                  : 'border border-border bg-paper text-text-soft hover:border-primary-highlight'
              }`}
            >
              {f.label}
            </button>
          ))}
          <button
            onClick={exportCsv}
            className="cursor-pointer rounded-full border border-dashed border-border bg-transparent px-3.5 py-1.5 text-xs font-medium text-text-muted transition-colors hover:border-primary hover:text-primary"
          >
            ↓ {t.discovery.exportCsv}
          </button>
        </div>
      </div>

      {/* ── Specimen card grid, grouped per year on the "Alles" filter ── */}
      {(filter === 'all' && years.length > 1 ? years : [null]).map(year => {
        const group = year == null ? visible : visible.filter(d => new Date(d.discovered_at).getFullYear() === year)
        if (group.length === 0) return null
        return (
        <div key={year ?? 'all'} className="mb-6">
          {year != null && (
            <p className="mb-3 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
              <span className="h-px w-6 flex-none bg-border" />
              {year}
              <span className="h-px min-w-[24px] max-w-[80px] flex-1 bg-border" />
            </p>
          )}
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
        {group.map(item => {
          const entry = buildDiscoveryJournalEntry(item, t.locale)
          const nr = orderIndex.get(item.id)
          return (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => openEntry(item.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEntry(item.id) }
              }}
              className="card card-glow cursor-pointer overflow-hidden"
            >
              <div className="relative h-36 border-b border-border-soft" style={{ background: 'linear-gradient(145deg, #FDFAF1 0%, #F4EEDB 100%)' }}>
                {entry.image_url ? (
                  <img src={entry.image_url} alt={entry.title} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-text-muted"><Glyph name="leaf" size={30} /></div>
                )}
                {nr != null && (
                  <span className="absolute bottom-2.5 left-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-secondary font-mono text-[11px] font-bold text-white ring-[3px] ring-paper/85">
                    {nr}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1.5 px-3.5 pb-3.5 pt-3">
                <h3 className="m-0 truncate font-heading text-[17px] font-medium leading-tight text-text">{entry.title}</h3>
                {entry.subtitle && (
                  <p className="m-0 truncate font-heading text-[13px] italic text-primary">{entry.subtitle}</p>
                )}
                <p className="m-0 truncate font-mono text-[10px] uppercase tracking-[0.08em] text-text-muted">
                  {formatDate(entry.occurred_at, t.locale)}
                  {placeLabel(item)
                    ? <> · {placeLabel(item)}</>
                    : entry.location && <> · {formatCoords(entry.location.lat, entry.location.lon, isEN)}</>}
                </p>
                <EcologyChips chips={chipsFor(item)} max={2} />
              </div>
            </div>
          )
        })}
          </div>
        </div>
        )
      })}

      {/* ── Field-guide detail ── */}
      {selected && (() => {
        const entry = buildDiscoveryJournalEntry(selected, t.locale)
        const nr = orderIndex.get(selected.id)
        const fit = bestFit(selected.species_id != null ? fitMap[String(selected.species_id)] : undefined)
        const fitLabel = fit
          ? { perfect: t.discovery.fitPerfect, acceptable: t.discovery.fitAcceptable, marginal: t.discovery.fitMarginal, tolerated: t.discovery.fitTolerated }[fit]
          : null
        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={entry.title}
            onClick={() => setSelectedId(null)}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(20,20,16,.38)] p-4 pb-[calc(var(--bottom-nav-height)+1rem)] md:pb-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              onTouchStart={onCardTouchStart}
              onTouchEnd={onCardTouchEnd}
              className="relative grid max-h-[min(760px,calc(100dvh-var(--bottom-nav-height)-48px))] w-[min(100%,880px)] md:max-h-[min(760px,calc(100dvh-32px))] grid-cols-1 overflow-y-auto rounded-3xl bg-bg shadow-[0_20px_60px_rgba(0,0,0,.22)] md:grid-cols-[1fr_1.25fr]"
            >
              {/* Close sits on the card itself, not inside the right-hand
                  column: stacked on a phone that column starts below the photo
                  and the map, so the only way out was to scroll (#884). */}
              <button
                onClick={() => setSelectedId(null)}
                aria-label={t.discovery.closeEntry}
                className="absolute right-3 top-3 z-10 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/25 bg-black/45 text-white backdrop-blur-sm transition-colors hover:bg-black/65"
              >
                <Glyph name="x" size={17} aria-hidden />
              </button>

              {/* Left: photo + mini location map */}
              <div className="flex flex-col border-border-soft md:border-r">
                <div className="relative h-52 shrink-0 md:h-60" style={{ background: 'linear-gradient(145deg, #FDFAF1 0%, #F4EEDB 100%)' }}>
                  {entry.image_url ? (
                    <img src={entry.image_url} alt={entry.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-text-muted"><Glyph name="leaf" size={40} /></div>
                  )}
                  {nr != null && (
                    <span className="absolute bottom-3 left-3 flex h-7 w-7 items-center justify-center rounded-full bg-secondary font-mono text-xs font-bold text-white ring-[3px] ring-paper/85">
                      {nr}
                    </span>
                  )}
                </div>
                {entry.location ? (
                  <div className="border-t border-dashed border-border">
                    <ExpeditionMap
                      entries={[{ id: selected.id, lat: entry.location.lat, lon: entry.location.lon, index: nr ?? 1 }]}
                      width={420} height={150} compact compass={compass}
                    />
                    <a
                      href={mapUrl(entry.location.lat, entry.location.lon)}
                      target="_blank" rel="noreferrer"
                      className="block border-t border-dashed border-border px-4 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-primary no-underline hover:underline"
                    >
                      {placeLabel(selected) ? `${placeLabel(selected)} · ` : ''}{formatCoords(entry.location.lat, entry.location.lon, isEN)} → {t.discovery.journalOpenMap}
                    </a>
                  </div>
                ) : (
                  <div className="border-t border-dashed border-border px-4 py-4">
                    <p className="m-0 mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
                      {t.discovery.journalLocation}
                    </p>
                    <button
                      onClick={() => void handleCaptureLocation(selected)}
                      disabled={locationCapturing}
                      className="cursor-pointer rounded-full border border-primary/35 bg-primary/8 px-3 py-1.5 text-xs font-semibold text-primary disabled:cursor-wait disabled:opacity-50"
                    >
                      {locationCapturing ? t.discovery.journalAddingLocation : t.discovery.journalAddLocation}
                    </button>
                    {locationError && (
                      <p role="alert" className="mb-0 mt-2 text-xs leading-snug text-overdue">
                        {t.discovery.journalLocationError}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Right: field-guide entry */}
              <div className="flex flex-col gap-3.5 p-6">
                <div className="flex items-start justify-between gap-3 pr-11">
                  <p className="m-0 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
                    <span className="h-px w-6 flex-none bg-border" />
                    {t.discovery.entryNoPrefix} {nr} · {formatDate(entry.occurred_at, t.locale)}
                  </p>
                  {(prevEntry || nextEntry) && (
                    <div className="flex flex-none items-center gap-1">
                      <button
                        onClick={() => stepEntry('prev')}
                        disabled={!prevEntry}
                        aria-label={t.discovery.previousEntry}
                        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border bg-transparent text-text-soft transition-colors hover:border-primary hover:text-primary disabled:cursor-default disabled:opacity-30 disabled:hover:border-border disabled:hover:text-text-soft"
                      >
                        <Glyph name="arrow-left" size={15} aria-hidden />
                      </button>
                      <button
                        onClick={() => stepEntry('next')}
                        disabled={!nextEntry}
                        aria-label={t.discovery.nextEntry}
                        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border bg-transparent text-text-soft transition-colors hover:border-primary hover:text-primary disabled:cursor-default disabled:opacity-30 disabled:hover:border-border disabled:hover:text-text-soft"
                      >
                        <Glyph name="chevron-right" size={15} aria-hidden />
                      </button>
                    </div>
                  )}
                </div>

                <h2 className="m-0 font-heading text-[28px] font-medium leading-[1.05] tracking-[-0.01em] text-text">
                  {entry.title}
                  {entry.subtitle && <> <em className="font-normal italic text-primary">{entry.subtitle}</em></>}.
                </h2>

                <div className="flex flex-wrap items-center gap-1.5">
                  <EcologyChips chips={chipsFor(selected)} />
                  {fit && fitLabel && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-text-soft ring-1 ring-border">
                      <i className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: FIT_COLOR[fit] ?? '#6b7280' }} />
                      {fitLabel}
                    </span>
                  )}
                </div>

                {entry.fun_fact ? (
                  <div>
                    <p className="m-0 mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-primary">{t.discovery.funFact}</p>
                    <p className="m-0 font-heading text-[14.5px] italic leading-[1.55] text-text-soft">{entry.fun_fact}</p>
                  </div>
                ) : selected.species_id != null && (
                  <div>
                    <p className="m-0 mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-primary">{t.discovery.funFact}</p>
                    {/* Default to the loading state: the fetch is kicked off by
                        an effect that runs after this paint, so keying on
                        "loading" here would flash the error text first. */}
                    {funFactFailedId === selected.id ? (
                      <div className="flex items-center gap-2">
                        <p className="m-0 text-sm text-text-muted">{t.discovery.funFactError}</p>
                        <button onClick={() => void loadMissingFunFact(selected)} className="cursor-pointer border-none bg-transparent p-0 text-xs font-semibold text-primary">
                          {t.discovery.funFactRetry}
                        </button>
                      </div>
                    ) : (
                      <p className="m-0 text-sm text-text-muted">{t.discovery.funFactLoading}</p>
                    )}
                  </div>
                )}

                {selected.latin_name && (
                  <WikipediaLink latinName={selected.latin_name} className="w-fit text-xs font-semibold text-primary no-underline hover:underline" />
                )}

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="m-0 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">{t.discovery.journalNotes}</p>
                    {!editingNotes && (
                      <button
                        onClick={() => { setNotesDraft(selected.notes ?? ''); setEditingNotes(true) }}
                        className="cursor-pointer border-none bg-transparent p-0 text-xs font-semibold text-primary"
                      >
                        {t.discovery.notesEdit}
                      </button>
                    )}
                  </div>
                  {editingNotes ? (
                    <div className="flex flex-col gap-2">
                      <textarea
                        value={notesDraft}
                        onChange={(e) => setNotesDraft(e.target.value)}
                        placeholder={t.discovery.notesPlaceholder}
                        rows={3}
                        autoFocus
                        className="w-full resize-none rounded-xl border border-border bg-paper px-3 py-2 font-heading text-sm italic text-text-soft focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                      />
                      <div className="flex justify-end">
                        <button
                          onClick={() => void handleSaveNotes(selected)}
                          disabled={notesSaving}
                          className="cursor-pointer rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          {notesSaving ? t.discovery.notesSaving : t.discovery.notesSave}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border px-3.5 py-2.5 font-heading text-[13.5px] italic leading-snug text-text-soft">
                      {selected.notes ? `"${selected.notes}"` : <span className="text-text-muted">{t.discovery.notesPlaceholder}</span>}
                    </div>
                  )}
                </div>

                <p aria-hidden="true" className="m-0 select-none overflow-hidden whitespace-nowrap font-mono text-[11px] leading-none tracking-[0.24em] text-text-muted/40">
                  {mrz(entry.title, entry.subtitle)}
                </p>

                <div className="mt-auto flex flex-wrap gap-2 pt-1.5">
                  <button
                    onClick={(e) => stopAction(e, () => handleAddToGarden(selected))}
                    className="flex-1 cursor-pointer rounded-full border-none bg-primary px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    {t.discovery.addToGarden}
                  </button>
                  <button
                    onClick={(e) => stopAction(e, () => void handleShare(selected))}
                    className="cursor-pointer rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-text"
                  >
                    {copiedId === selected.id ? t.discovery.shareCopied : t.discovery.share}
                  </button>
                  <button
                    onClick={(e) => stopAction(e, () => void handleDelete(selected.id))}
                    className="flex cursor-pointer items-center justify-center rounded-full border border-overdue/25 bg-transparent px-4 py-2.5 text-sm text-overdue/70 hover:bg-overdue/5"
                    aria-label={t.common.delete}
                    title={t.common.delete}
                  >
                    <Glyph name="trash" size={15} aria-hidden />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </>
  )
}
