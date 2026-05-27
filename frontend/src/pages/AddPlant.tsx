import { useState, useMemo, useEffect, useRef } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import type { LocalPlant } from '../data/plants-dataset'
import type { IdentifyCommitResult } from '../types'
import { useT } from '../context/LanguageContext'

const DUTCH_TYPE_TO_SYSTEM: Record<string, string> = {
  vaste_plant: 'herb',
  heester: 'shrub',
  klimmer: 'climber',
  gras: 'grass',
  bol: 'bulb',
  eenjarig: 'flower',
  boom: 'tree',
}
import { useFloreren } from '../store/useFloreren'
import { CARE_TYPE_INFO } from '../types'
import type { CareType, CareScheduleInput } from '../types'
import IconPicker from '../components/IconPicker'
import type { PlantIcon } from '../types'
import { icons } from '../api/client'
import PlantPickerSheet from '../components/sheets/PlantPickerSheet'
import EntryBanner from '../components/add/EntryBanner'
import { displayToIso } from '../utils/dateFormat'
import Card from '../components/ui/Card'
import FormRow from '../components/ui/FormRow'
import TileGrid from '../components/ui/TileGrid'
import SegmentedControl from '../components/ui/SegmentedControl'
import ChipCluster from '../components/ui/ChipCluster'
import ZonePicker, { DEFAULT_ZONES } from '../components/add/ZonePicker'
import FrequencySlider from '../components/add/FrequencySlider'
import CalendarPreview from '../components/add/CalendarPreview'
import SpeciesReference from '../components/add/SpeciesReference'

type AddPlantLocState = {
  from?: 'identify' | 'manual' | 'pick'
  prefill?: LocalPlant | { name: string } | IdentifyCommitResult
} | null

function isIdentifyPrefill(p: unknown): p is IdentifyCommitResult {
  return !!p && typeof p === 'object' && 'name_nl_suggested' in (p as Record<string, unknown>)
}

/** Try to find the best-matching icon for a LocalPlant in the icon catalog. */
function findMatchingIcon(plant: LocalPlant, catalog: PlantIcon[]): string | null {
  // 1. Check if iconKey from dataset exists in catalog
  if (plant.iconKey) {
    const direct = catalog.find(i => i.id === plant.iconKey)
    if (direct) return direct.variant_of || direct.id
  }
  // 2. Match by exact Latin name
  if (plant.latinName) {
    const latin = plant.latinName.toLowerCase()
    const exact = catalog.find(i => i.sci?.toLowerCase() === latin)
    if (exact) return exact.variant_of || exact.id
  }
  // 3. Match by exact Dutch name
  if (plant.dutchName) {
    const name = plant.dutchName.toLowerCase()
    const byName = catalog.find(i => i.name?.toLowerCase() === name)
    if (byName) return byName.variant_of || byName.id
  }
  // 4. Match by genus (first word of Latin name)
  if (plant.latinName) {
    const genus = plant.latinName.split(' × ')[0].split(' ')[0].toLowerCase()
    const byGenus = catalog.find(i => i.sci?.toLowerCase().startsWith(genus) || i.id === genus)
    if (byGenus) return byGenus.variant_of || byGenus.id
  }
  return null
}

/** Map LocalPlant waterNeeds to a water interval in days. */
const WATER_NEEDS_TO_DAYS: Record<string, number> = {
  laag: 14,
  gemiddeld: 7,
  hoog: 3,
}

/** Map database sunRequirement values to TileGrid IDs. */
const SUN_DB_TO_TILE: Record<string, string> = {
  shade: 'shade',
  partial_sun: 'indirect',
  full_sun: 'full-sun',
}

/** Reverse: map TileGrid sunRequirement IDs back to database values. */
const SUN_TILE_TO_DB: Record<string, string> = {
  shade: 'shade',
  indirect: 'partial_sun',
  'full-sun': 'full_sun',
}

/** Map database plant type to form type. */
const TYPE_TO_FORM: Record<string, string> = {
  boom: 'tree',
  heester: 'tree',
  gras: 'pot',
  bol: 'pot',
  vaste_plant: 'pot',
  eenjarig: 'pot',
  klimmer: 'pot',
}

/** Build an initial schedules map, optionally prefilled from a LocalPlant. */
function buildInitialSchedules(prefill: unknown): Record<CareType, { enabled: boolean; days: number }> {
  const initial: Record<string, { enabled: boolean; days: number }> = {}
  for (const [type, info] of Object.entries(CARE_TYPE_INFO)) {
    let days = info.defaultIndoor
    if (
      type === 'water' &&
      prefill &&
      !isIdentifyPrefill(prefill) &&
      'waterNeeds' in (prefill as Record<string, unknown>)
    ) {
      days = WATER_NEEDS_TO_DAYS[(prefill as LocalPlant).waterNeeds] ?? days
    }
    initial[type] = { enabled: type === 'repot_check' ? false : days > 0, days }
  }
  return initial as Record<CareType, { enabled: boolean; days: number }>
}

export default function AddPlant() {
  const t = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const locState = (location.state ?? null) as AddPlantLocState
  const prefill = locState?.prefill
  const remountKey = useMemo(() => Date.now(), [prefill])
  const isFromDatabase = !!(prefill && 'latinName' in (prefill as Record<string, unknown>))
  const isFromIdentify = isIdentifyPrefill(prefill)
  const initialRoute: 'database' | 'photo' = locState?.from === 'identify' ? 'photo' : 'database'
  const [activeRoute, setActiveRoute] = useState<'database' | 'photo'>(initialRoute)
  const [showDetails, setShowDetails] = useState(false)
  const { maps, addPlant, uploadPhoto } = useFloreren()

  // Preserve the return path through replace navigations (pick flow remounts the component with new location.state)
  const fromMapState = (location.state as any)?.fromMap
  if (fromMapState) sessionStorage.setItem('addPlant_returnPath', fromMapState)

  const [name, setName] = useState(
    prefill
      ? isIdentifyPrefill(prefill)
        ? prefill.name_nl_suggested
        : 'latinName' in prefill
          ? prefill.dutchName
          : prefill.name
      : ''
  )
  const [species, setSpecies] = useState(
    prefill
      ? isIdentifyPrefill(prefill)
        ? prefill.scientific_name
        : 'latinName' in prefill
          ? prefill.latinName
          : ''
      : ''
  )
  const [locationId] = useState<number | undefined>()
  const [area, setArea] = useState<'tuin' | 'huis' | null>(null)
  const [potSize] = useState('')
  const [acquiredDateInput, setAcquiredDateInput] = useState('')
  const [notes, setNotes] = useState(
    prefill && !isIdentifyPrefill(prefill) && 'latinName' in prefill
      ? (prefill as LocalPlant).amsterdamNotes ?? ''
      : ''
  )
  const [sunRequirement, setSunRequirement] = useState<string | null>(
    prefill && !isIdentifyPrefill(prefill) && 'latinName' in prefill
      ? SUN_DB_TO_TILE[(prefill as LocalPlant).sunRequirement] ?? (prefill as LocalPlant).sunRequirement
      : null
  )
  const [iconKey, setIconKey] = useState<string | null>(
    prefill
      ? isIdentifyPrefill(prefill)
        ? prefill.icon_key ?? null
        : 'latinName' in prefill
          ? (prefill as LocalPlant).iconKey ?? null
          : null
      : null
  )

  // Icon catalog — used for auto-matching and pot/bare icon switching
  const [iconCatalog, setIconCatalog] = useState<PlantIcon[]>([])
  const baseIconRef = useRef<string | null>(null)
  const userPickedIconRef = useRef(false)
  const iconLookup = useMemo(() => {
    const bareBases = new Set<string>()       // base ids that have _bare variants
    const pottedVariants = new Map<string, string>()  // base id → potted variant id
    for (const icon of iconCatalog) {
      if (icon.form === 'bare' && icon.variant_of) bareBases.add(icon.variant_of)
      if (icon.form === 'potted' && icon.variant_of) pottedVariants.set(icon.variant_of, icon.id)
    }
    return { bareBases, pottedVariants }
  }, [iconCatalog])

  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(
    isFromIdentify ? (prefill as IdentifyCommitResult).photo_path : null
  )
  const [submitting, setSubmitting] = useState(false)
  const [sownDateInput, setSownDateInput] = useState('')
  const [phase, setPhase] = useState('established')
  const [formType, setFormType] = useState(
    prefill && !isIdentifyPrefill(prefill) && 'latinName' in prefill
      ? TYPE_TO_FORM[(prefill as LocalPlant).type] ?? 'pot'
      : 'pot'
  )
  const [locationText, setLocationText] = useState('')
  const [potMaterial, setPotMaterial] = useState('terracotta')
  const [potDiameter, setPotDiameter] = useState('')
  const [potHeight, setPotHeight] = useState('')
  const [hasDrainage, setHasDrainage] = useState(false)
  const [substrate, setSubstrate] = useState<string[]>([])
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)
  const [waterVolume, setWaterVolume] = useState('')
  const [feedingSchedule, setFeedingSchedule] = useState('monthly')
  const [pruningType, setPruningType] = useState('none')
  const [pruningFrequency, setPruningFrequency] = useState('never')

  const tuinMap = maps.find(m => ['garden', 'tuin'].some(k => m.name.toLowerCase().includes(k) || (m as any).slug?.toLowerCase().includes(k)))
  const huisMap = maps.find(m => ['huis', 'house', 'indoor'].some(k => m.name.toLowerCase().includes(k) || (m as any).slug?.toLowerCase().includes(k)))
  const isOutdoor = area === 'tuin'

  function randomMapPos(viewbox: string) {
    const [x0, y0, w, h] = viewbox.split(' ').map(Number)
    const pad = Math.min(w, h) * 0.12
    return {
      x: Math.round((x0 + pad + Math.random() * (w - pad * 2)) * 10) / 10,
      y: Math.round((y0 + pad + Math.random() * (h - pad * 2)) * 10) / 10,
    }
  }

  const [schedules, setSchedules] = useState<Record<CareType, { enabled: boolean; days: number }>>(
    () => buildInitialSchedules(prefill)
  )

  // Derive plant_type from selected icon's cat field
  const derivedPlantType = useMemo(() => {
    if (!iconKey || iconCatalog.length === 0) return undefined
    const icon = iconCatalog.find(i => i.id === iconKey || i.variant_of === iconKey)
    // If we picked a variant (e.g. monstera_bare), resolve to the base icon
    const baseIcon = icon?.variant_of
      ? iconCatalog.find(i => i.id === icon.variant_of)
      : icon
    return baseIcon?.cat || icon?.cat || undefined
  }, [iconKey, iconCatalog])

  // Load icon catalog once for auto-matching and pot/bare switching
  useEffect(() => {
    icons.catalog().then(setIconCatalog).catch(() => {})
  }, [])

  // Sync form fields when prefill changes from a later navigation (e.g. pick from list)
  useEffect(() => {
    if (!prefill) return
    if (isIdentifyPrefill(prefill)) {
      setName(prefill.name_nl_suggested)
      setSpecies(prefill.scientific_name)
      // Resolve icon through catalog so pot/bare switching works
      if (iconCatalog.length > 0) {
        const iconKeyFromPrefill = prefill.icon_key
        const icon = iconKeyFromPrefill
          ? iconCatalog.find(i => i.id === iconKeyFromPrefill || i.variant_of === iconKeyFromPrefill)
          : null
        // If not found by key, try matching by scientific name
        const match = icon ?? (
          prefill.scientific_name
            ? iconCatalog.find(i => i.sci?.toLowerCase() === prefill.scientific_name.toLowerCase())
            : null
        )
        if (match) {
          const baseId = match.variant_of || match.id
          baseIconRef.current = baseId
          userPickedIconRef.current = false
          const noPot = potSize.trim() === ''
          const bareExists = iconLookup.bareBases.has(baseId)
          setIconKey(noPot && bareExists ? `${baseId}_bare` : baseId)
        } else {
          baseIconRef.current = null
          setIconKey(prefill.icon_key ?? null)
        }
      } else {
        // Catalog not loaded yet — plant a flag to retry when it arrives
        baseIconRef.current = prefill.icon_key ? 'pending' : null
        setIconKey(prefill.icon_key ?? null)
      }
      return
    }
    if ('latinName' in (prefill as Record<string, unknown>)) {
      const p = prefill as LocalPlant
      setName(p.dutchName)
      setSpecies(p.latinName)
      setNotes(p.amsterdamNotes ?? '')
      setSunRequirement(SUN_DB_TO_TILE[p.sunRequirement] ?? p.sunRequirement ?? null)
      setFormType(TYPE_TO_FORM[p.type] ?? 'pot')
      // Try to auto-match an icon from the catalog
      if (iconCatalog.length > 0) {
        const matchedId = findMatchingIcon(p, iconCatalog)
        if (matchedId) {
          baseIconRef.current = matchedId
          userPickedIconRef.current = false
          const noPot = potSize.trim() === ''
          const bareExists = iconLookup.bareBases.has(matchedId)
          setIconKey(noPot && bareExists ? `${matchedId}_bare` : matchedId)
        } else {
          baseIconRef.current = null
          setIconKey(p.iconKey ?? null)
        }
      } else {
        // Catalog not loaded yet — plant a flag to retry when it arrives
        baseIconRef.current = 'pending'
        setIconKey(p.iconKey ?? null)
      }
      setSchedules(buildInitialSchedules(prefill))
      return
    }
    if ('name' in prefill) {
      setName(prefill.name)
    }
  }, [prefill, iconCatalog, iconLookup])

  // Switch icon between potted/bare variant based on pot size
  useEffect(() => {
    const base = baseIconRef.current
    if (!base || base === 'pending' || userPickedIconRef.current) return
    const hasPot = potSize.trim() !== ''
    const bareExists = iconLookup.bareBases.has(base)
    const pottedOverride = iconLookup.pottedVariants.get(base)
    if (hasPot) {
      setIconKey(pottedOverride ?? base)
    } else {
      setIconKey(bareExists ? `${base}_bare` : base)
    }
  }, [potSize, iconLookup])

  // Repot check toggle: only enabled when a pot size is entered
  useEffect(() => {
    setSchedules(prev => ({
      ...prev,
      repot_check: { ...prev.repot_check, enabled: potSize.trim() !== '' },
    }))
  }, [potSize])

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      setPhotoFile(file)
      setPhotoPreview(URL.createObjectURL(file))
    }
  }

  function toggleSchedule(type: CareType) {
    setSchedules(prev => ({ ...prev, [type]: { ...prev[type], enabled: !prev[type].enabled } }))
  }

  function setScheduleDays(type: CareType, days: number) {
    setSchedules(prev => ({ ...prev, [type]: { ...prev[type], days } }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    setSubmitting(true)
    try {
      const careSchedules: CareScheduleInput[] = Object.entries(schedules)
        .filter(([, s]) => s.enabled && s.days > 0)
        .map(([type, s]) => ({ care_type: type as CareType, interval_days: s.days }))

      const placedMap = area === 'tuin' ? tuinMap : area === 'huis' ? huisMap : undefined
      const mapPos = placedMap ? randomMapPos(placedMap.viewbox) : undefined

      const plant = await addPlant({
        name: name.trim(),
        species: species.trim() || undefined,
        location_id: locationId,
        map_id: placedMap?.id,
        map_x: mapPos?.x,
        map_y: mapPos?.y,
        pot_size_cm: potSize ? parseInt(potSize) : undefined,
        acquired_date: acquiredDateInput.trim() || displayToIso(acquiredDateInput) || undefined,
        notes: notes.trim() || undefined,
        icon_key: iconKey ?? undefined,
        plant_type: isFromDatabase
          ? (DUTCH_TYPE_TO_SYSTEM[(prefill as LocalPlant).type] ?? (prefill as LocalPlant).type)
          : derivedPlantType,
        sun_requirement: sunRequirement ? (SUN_TILE_TO_DB[sunRequirement] ?? sunRequirement) : undefined,
        phase: phase as any,
        sown_date: displayToIso(sownDateInput) || undefined,
        care_schedules: careSchedules,
      })

      if (photoFile) {
        await uploadPhoto(plant.id, photoFile)
      }
    } catch (e) {
      console.error('AddPlant: add failed', e)
    } finally {
      const finalReturnPath = sessionStorage.getItem('addPlant_returnPath') ?? '/plants'
      sessionStorage.removeItem('addPlant_returnPath')
      navigate(finalReturnPath)
      setSubmitting(false)
    }
  }

  const inputClass = "w-full px-3.5 py-2.5 rounded-xl bg-surface border border-border text-text placeholder:text-text-muted/50 focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"

  // Derived Latin name for species row (read-only, from prefill)
  const latinName = useMemo(() => {
    if (!prefill) return ''
    if (isIdentifyPrefill(prefill)) return prefill.scientific_name
    if ('latinName' in prefill) return prefill.latinName
    return ''
  }, [prefill])

  const FORM_OPTIONS = [
    { id: 'pot', glyph: '🪴', title: 'In pot', subtitle: 'Potted' },
    { id: 'ground', glyph: '🌱', title: 'In de grond', subtitle: 'Bare' },
    { id: 'seedling', glyph: '🌿', title: 'Zaailing', subtitle: 'Seedling' },
    { id: 'tree', glyph: '🌳', title: 'Boomvorm', subtitle: 'Tree' },
  ]

  const PHASE_OPTIONS = [
    { id: 'seed', label: 'Zaad' },
    { id: 'sprout', label: 'Kiem' },
    { id: 'seedling', label: 'Zaailing' },
    { id: 'young', label: 'Jong' },
    { id: 'established', label: 'Volwassen' },
  ]

  // Entry-choice screen: shown when the user lands on Add Plant without a prior path choice.
  if (locState?.from == null) {
    return (
      <div className="px-4 pt-6 pb-8">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full bg-surface border border-border flex items-center justify-center text-text"
          >
            ←
          </button>
          <h1 className="text-2xl font-extrabold">{t.addPlant.title}</h1>
        </div>
        <div className="flex flex-col gap-3 max-w-md mx-auto">
          <button
            type="button"
            onClick={() => navigate('/identify')}
            className="bg-green-700 text-white p-4 rounded-lg text-left"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">📸</span>
              <div>
                <div className="font-medium">{t.addPlant.entry.identify}</div>
                <div className="text-xs opacity-85">{t.addPlant.entry.identifySubtitle}</div>
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => navigate(location.pathname, { state: { from: 'pick' }, replace: true })}
            className="card p-4 text-left"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔍</span>
              <div>
                <div className="font-medium">{t.addPlant.entry.pick}</div>
                <div className="text-xs text-text-muted">{t.addPlant.entry.pickSubtitle}</div>
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => navigate(location.pathname, { state: { from: 'manual' }, replace: true })}
            className="card p-4 text-left"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">✏️</span>
              <div>
                <div className="font-medium">{t.addPlant.entry.manual}</div>
                <div className="text-xs text-text-muted">{t.addPlant.entry.manualSubtitle}</div>
              </div>
            </div>
          </button>
        </div>
      </div>
    )
  }

  if (locState?.from === 'pick' && !prefill) {
    return (
      <PlantPickerSheet
        onClose={() => navigate(-1)}
        onSelectPlant={(plant) =>
          navigate(location.pathname, { state: { from: 'pick', prefill: plant }, replace: true })
        }
        onCustomName={(name) =>
          navigate(location.pathname, { state: { from: 'manual', prefill: name ? { name } : undefined }, replace: true })
        }
      />
    )
  }

  return (
    <div key={remountKey}>
      {/* ——— Masthead ——— */}
      <header className="border-b border-border">
        <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-12 pt-6 sm:pt-8">
          {/* Navigation bar */}
          <nav className="flex items-center gap-5 sm:gap-7 font-heading text-xs sm:text-sm text-text-muted">
            <Link to="/dashboard" className="hover:text-primary transition-colors">Vandaag</Link>
            <Link to="/maps" className="hover:text-primary transition-colors">Tuinkaart</Link>
            <Link to="/collection" className="text-text font-semibold">Collectie</Link>
            <Link to="/calendar" className="hover:text-primary transition-colors">Kalender</Link>
            <Link to="/settings" className="hover:text-primary transition-colors">Instellingen</Link>
          </nav>

          {/* Title row + stepper */}
          <div className="grid grid-cols-[1fr_auto] gap-8 lg:gap-12 items-end mt-5 sm:mt-7 mb-4 sm:mb-5">
            {/* Title block */}
            <div>
              <div className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.15em] sm:tracking-[0.22em] text-text-muted flex items-center gap-3 sm:gap-3.5 mb-3 sm:mb-3.5">
                <span className="text-primary">§</span>
                <span>Collectie</span>
                <span className="hidden sm:block flex-1 h-px bg-border max-w-[80px]" />
              </div>
              <h1 className="font-heading text-4xl sm:text-5xl lg:text-7xl/[0.92] font-medium leading-[0.92] tracking-[-0.025em] m-0">
                Toevoegen
              </h1>
              <p className="font-heading italic text-base sm:text-lg text-text-soft mt-3 sm:mt-3.5 max-w-[540px] leading-[1.45]">
                Een nieuwe plant inpassen op haar beste plek.
              </p>
            </div>

            {/* Stepper — hidden on smallest screens, shown as a horizontal bar below 640px */}
            <div className="hidden sm:block border-l border-border pl-6 lg:pl-7 min-w-[280px] lg:min-w-[320px]">
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted mb-3">
                Stappen
              </div>
              <ul className="list-none m-0 p-0 space-y-1">
                {/* Step I — done */}
                <li className="grid grid-cols-[24px_1fr_auto] lg:grid-cols-[28px_1fr_auto] gap-3 lg:gap-3.5 items-baseline border-b border-dashed border-border py-2 font-heading text-sm lg:text-base text-text">
                  <span className="font-mono text-[10px] text-primary text-right">I</span>
                  <span>Soort</span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">✓</span>
                </li>
                {/* Step II — on (active) */}
                <li className="grid grid-cols-[24px_1fr_auto] lg:grid-cols-[28px_1fr_auto] gap-3 lg:gap-3.5 items-baseline border-b border-dashed border-border py-2 font-heading text-sm lg:text-base text-text italic">
                  <span className="font-mono text-[10px] text-secondary font-medium text-right">II</span>
                  <span>Details</span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-secondary">on</span>
                </li>
                {/* Step III — muted */}
                <li className="grid grid-cols-[24px_1fr_auto] lg:grid-cols-[28px_1fr_auto] gap-3 lg:gap-3.5 items-baseline border-b border-dashed border-border py-2 font-heading text-sm lg:text-base text-text-soft">
                  <span className="font-mono text-[10px] text-text-muted text-right">III</span>
                  <span>Planning</span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted">—</span>
                </li>
                {/* Step IV — muted */}
                <li className="grid grid-cols-[24px_1fr_auto] lg:grid-cols-[28px_1fr_auto] gap-3 lg:gap-3.5 items-baseline py-2 font-heading text-sm lg:text-base text-text-soft">
                  <span className="font-mono text-[10px] text-text-muted text-right">IV</span>
                  <span>Foto's</span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted">—</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Stepper — horizontal mini-bar for mobile (< 640px) */}
          <div className="sm:hidden flex items-center justify-center gap-2 pb-4 text-text-muted font-mono text-[10px] uppercase tracking-[0.18em]">
            <span className="flex items-center gap-1"><span className="text-primary">I</span>·<span className="text-primary font-semibold">Soort</span></span>
            <span className="text-text-soft">·</span>
            <span className="flex items-center gap-1"><span className="text-secondary font-semibold">II</span>·<span className="text-secondary font-semibold">Details</span></span>
            <span className="text-text-soft">·</span>
            <span>III·Planning</span>
            <span className="text-text-soft">·</span>
            <span>IV·Foto's</span>
          </div>
        </div>
      </header>

      {/* ——— BASIS / DETAILS Toggle ——— */}
      <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-12 pt-5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowDetails(false)}
            className={`font-heading text-xs px-3 py-1.5 rounded-full transition-all ${
              !showDetails ? 'bg-primary text-white' : 'bg-paper border border-border text-text-soft'
            }`}
          >
            BASIS
          </button>
          <button
            type="button"
            onClick={() => setShowDetails(true)}
            className={`font-heading text-xs px-3 py-1.5 rounded-full transition-all ${
              showDetails ? 'bg-primary text-white' : 'bg-paper border border-border text-text-soft'
            }`}
          >
            DETAILS
          </button>
        </div>
      </div>

      {/* ——— Entry Banner ——— */}
      <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-12 pt-6">
        <EntryBanner
          activeRoute={activeRoute}
          onRouteChange={setActiveRoute}
          speciesCount={2891}
          selectedSpeciesName={
            prefill
              ? isIdentifyPrefill(prefill)
                ? undefined // identify case: name shown in photo route instead
                : 'latinName' in prefill
                  ? (prefill as LocalPlant).dutchName
                  : undefined
              : undefined
          }
          selectedSpeciesScientific={
            prefill && !isIdentifyPrefill(prefill) && 'latinName' in prefill
              ? (prefill as LocalPlant).latinName
              : undefined
          }
          selectedSpeciesIcon={undefined}
          photoPreview={photoPreview}
          identifyResult={
            isFromIdentify && isIdentifyPrefill(prefill)
              ? {
                  topMatch: {
                    scientific_name: (prefill as import('../types').IdentifyCommitResult).scientific_name,
                    common_names_nl: [(prefill as import('../types').IdentifyCommitResult).name_nl_suggested],
                    common_names_en: [],
                    confidence: 1,
                    species_id: (prefill as import('../types').IdentifyCommitResult).species_id,
                    thumbnail_url: null,
                  },
                }
              : undefined
          }
        />
      </div>

      {/* ——— Two-column form grid ——— */}
      <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-12 py-6 sm:py-7">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6 lg:gap-8">
          {/* LEFT: form content */}
          <div className="space-y-6 min-w-0">
            <form onSubmit={handleSubmit} className="space-y-5">
        {/* Photo */}
        <label className="card p-4 flex items-center gap-4 cursor-pointer">
          {photoPreview ? (
            <img src={photoPreview} alt="Preview" className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
          ) : (
            <div className="w-20 h-20 rounded-xl bg-bg border-2 border-dashed border-border flex flex-col items-center justify-center text-text-muted flex-shrink-0">
              <span className="text-2xl">📷</span>
              <span className="text-[10px] mt-0.5">{t.editPlant.addPhoto}</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text">{t.editPlant.plantPhoto}</p>
            <p className="text-xs text-text-muted mt-0.5">{t.editPlant.tapToChangePhoto}</p>
          </div>
          <input
            type="file"
            accept="image/*"
            onChange={handlePhotoChange}
            className="hidden"
          />
        </label>

        {/* ——— § I · Identity Card ——— */}
        <Card
          eyebrow="§ I · Identiteit"
          title={<>Geef haar <em>een naam</em>.</>}
        >
          {/* Bijnaam */}
          <FormRow label="Bijnaam" description="Hoe je haar noemt">
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Lente-orchidee"
                required
                className="w-full rounded-lg border border-border bg-paper px-3 py-2 font-heading text-sm text-text placeholder:text-text-muted/50 focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
              />
              <input
                type="text"
                readOnly
                value={species ? species.replace(/[^a-zA-Z].*$/, '').slice(0, 4).toUpperCase() + '-' + String(Math.floor(Math.random() * 1000)).padStart(3, '0') : ''}
                className="w-full rounded-lg border border-border bg-paper px-3 py-2 font-mono text-xs text-text-muted"
                placeholder="---"
              />
            </div>
          </FormRow>

          {/* Species */}
          <FormRow label="Soort" description="Geslacht + soortnaam">
            <div className="grid grid-cols-[1fr_1fr] gap-3">
              <input
                type="text"
                value={species}
                onChange={(e) => setSpecies(e.target.value)}
                placeholder="Phalaenopsis"
                className="w-full rounded-lg border border-border bg-paper px-3 py-2 font-heading text-sm text-text placeholder:text-text-muted/50 focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
              />
              <input
                type="text"
                readOnly
                value={latinName}
                className="w-full rounded-lg border border-border bg-paper px-3 py-2 font-heading italic text-sm text-text-soft"
                placeholder="Phalaenopsis amabilis"
              />
            </div>
          </FormRow>

          {/* Form type */}
          <FormRow label="Vorm" description="Hoe ze groeit">
            <TileGrid options={FORM_OPTIONS} value={formType} onChange={setFormType} />
          </FormRow>

          {/* Life phase */}
          <FormRow label="Levensfase" description="Huidig groeistadium">
            <SegmentedControl options={PHASE_OPTIONS} value={phase} onChange={setPhase} />
          </FormRow>

          {/* Acquisition */}
          <FormRow label="Verkregen" description="Wanneer + waar">
            <div className="grid grid-cols-[1fr_1fr] gap-3">
              <input
                type="date"
                value={acquiredDateInput}
                onChange={(e) => setAcquiredDateInput(e.target.value)}
                className="w-full rounded-lg border border-border bg-paper px-3 py-2 font-heading text-sm text-text placeholder:text-text-muted/50 focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
              />
              <input
                type="text"
                value={locationText}
                onChange={(e) => setLocationText(e.target.value)}
                placeholder="Tuincentrum Overvecht"
                className="w-full rounded-lg border border-border bg-paper px-3 py-2 font-heading text-sm text-text placeholder:text-text-muted/50 focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
              />
            </div>
          </FormRow>
        </Card>

        {/* ——— § II · Placement Card ——— */}
        {showDetails && (
        <Card
          eyebrow="§ II · Plaatsing"
          title={<>Kies haar <em>beste plek.</em></>}
          subtitle="Licht, pot en substraat bepalen hoe ze groeit."
        >
          {/* Zone picker */}
          <FormRow label="Zone" description="Waar ze komt te staan">
            <ZonePicker
              value={selectedZoneId}
              onChange={(zoneId) => {
                setSelectedZoneId(zoneId || null)
                if (!zoneId) return
                const zone = DEFAULT_ZONES.find(z => z.id === zoneId)
                if (zone) {
                  setArea(zone.isIndoor ? 'huis' : 'tuin')
                }
              }}
              advice={species ? `Tip: ${species} staat het liefst op een lichte plek zonder direct zonlicht.` : undefined}
            />
          </FormRow>

          {/* Light measurement */}
          <FormRow label="Lichtmeting" description="Hoeveel licht ze krijgt">
            <TileGrid
              options={[
                { id: 'dark', title: 'Donker', subtitle: '≤500 lx', glyph: '🌑' },
                { id: 'shade', title: 'Schaduw', subtitle: '0.5–2k', glyph: '🌒' },
                { id: 'indirect', title: 'Indirect', subtitle: '2–10k', glyph: '🌓' },
                { id: 'bright', title: 'Helder', subtitle: '10–25k', glyph: '🌔' },
                { id: 'full-sun', title: 'Vol zon', subtitle: '>25k', glyph: '🌕' },
              ]}
              value={sunRequirement}
              onChange={(v) => setSunRequirement(v || null)}
            />
          </FormRow>

          {/* Pot material */}
          <FormRow label="Pot" description="Materiaal + afmetingen">
            <TileGrid
              options={[
                { id: 'terracotta', title: 'Terracotta', subtitle: 'Ademt', glyph: '🏺' },
                { id: 'plastic', title: 'Kunststof', subtitle: 'Licht', glyph: '🪣' },
                { id: 'ceramic', title: 'Keramiek', subtitle: 'Geglazuurd', glyph: '🫖' },
                { id: 'basket', title: 'Mand·vlecht', subtitle: 'Luchtig', glyph: '🧺' },
              ]}
              value={potMaterial}
              onChange={setPotMaterial}
            />
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="text-xs text-text-muted mb-1 block">Diameter (cm)</label>
                <input
                  type="number"
                  value={potDiameter || ''}
                  onChange={(e) => setPotDiameter(e.target.value)}
                  placeholder="⌀ 18"
                  className="w-full rounded-lg border border-border bg-paper px-3 py-2 font-mono text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-text-muted mb-1 block">Hoogte (cm)</label>
                <input
                  type="number"
                  value={potHeight || ''}
                  onChange={(e) => setPotHeight(e.target.value)}
                  placeholder="↑ 22"
                  className="w-full rounded-lg border border-border bg-paper px-3 py-2 font-mono text-sm"
                />
              </div>
            </div>
            <label className="inline-flex items-center gap-2 mt-3 cursor-pointer">
              <input
                type="checkbox"
                checked={hasDrainage}
                onChange={(e) => setHasDrainage(e.target.checked)}
                className="sr-only peer"
              />
              <span className="font-heading text-sm rounded-full border px-3 py-1.5 peer-checked:bg-primary/10 peer-checked:border-primary peer-checked:text-primary bg-paper border-border text-text-soft transition-all">
                {hasDrainage ? '✓ ' : ''}Heeft drainagegat
              </span>
            </label>
          </FormRow>

          {/* Substrate */}
          <FormRow
            label="Substraat"
            description="Waar ze in staat"
            help="Tip: orchideeën houden van luchtige bast, geen potgrond."
          >
            <ChipCluster
              options={['Orchideeënbast', 'Universeel', 'Kokosvezel', 'Perliet', 'Sphagnum', 'Akadama', 'Kalkrijk', 'Zandig', '+ Anders']}
              selected={substrate}
              onChange={setSubstrate}
            />
          </FormRow>
        </Card>
        )}

        {/* ——— § III · Care Card ——— */}
        {!showDetails ? (
          <Card
            eyebrow="§ III · Verzorging"
            title={<>Haar <em>routine.</em></>}
          >
            {/* Water gift frequency */}
            <FormRow label="Watergift" description="Hoe vaak ze dorst heeft">
              <FrequencySlider
                label="Watergift"
                value={schedules.water.days}
                onChange={(v) => {
                  setSchedules(prev => ({
                    ...prev,
                    water: { ...prev.water, days: v },
                  }))
                }}
                presets={[
                  { label: 'Soms', value: 14 },
                  { label: 'Wekelijks', value: 7 },
                  { label: '2× p/w', value: 3 },
                  { label: 'Dagelijks', value: 1 },
                ]}
              />
            </FormRow>

            {/* Water volume */}
            <FormRow label="Volume" description="Hoeveel per gift">
              <div className="flex items-center gap-3 mt-1">
                <input
                  type="number"
                  value={waterVolume || ''}
                  onChange={(e) => setWaterVolume(e.target.value)}
                  placeholder="250"
                  className="w-24 rounded-lg border border-border bg-paper px-3 py-2 font-mono text-sm"
                />
                <span className="text-sm text-text-soft">ml per gift</span>
              </div>
            </FormRow>
          </Card>
        ) : (
          <Card
            eyebrow="§ III · Verzorging"
            title={<>Haar <em>routine.</em></>}
            subtitle="Water, voeding en onderhoud."
          >
            {/* Water gift frequency */}
            <FormRow label="Watergift" description="Hoe vaak ze dorst heeft">
              <FrequencySlider
                label="Watergift"
                value={schedules.water.days}
                onChange={(v) => {
                  setSchedules(prev => ({
                    ...prev,
                    water: { ...prev.water, days: v },
                  }))
                }}
                presets={[
                  { label: 'Soms', value: 14 },
                  { label: 'Wekelijks', value: 7 },
                  { label: '2× p/w', value: 3 },
                  { label: 'Dagelijks', value: 1 },
                ]}
              />
            </FormRow>

            {/* Water volume */}
            <FormRow label="Volume" description="Hoeveel per gift">
              <div className="flex items-center gap-3 mt-1">
                <input
                  type="number"
                  value={waterVolume || ''}
                  onChange={(e) => setWaterVolume(e.target.value)}
                  placeholder="250"
                  className="w-24 rounded-lg border border-border bg-paper px-3 py-2 font-mono text-sm"
                />
                <span className="text-sm text-text-soft">ml per gift</span>
              </div>
            </FormRow>

            {/* Feeding schedule */}
            <FormRow label="Voeding" description="Extraatjes voor groei">
              <TileGrid
                options={[
                  { id: 'weekly', title: 'Wekelijks', subtitle: '1× p/w', glyph: '💪' },
                  { id: 'monthly', title: 'Maandelijks', subtitle: '1× p/m', glyph: '📅' },
                  { id: 'seasonal', title: 'Seizoens', subtitle: '4× p/j', glyph: '🍂' },
                  { id: 'optional', title: 'Optioneel', subtitle: 'Alleen nodig', glyph: '✨' },
                ]}
                value={feedingSchedule}
                onChange={setFeedingSchedule}
              />
            </FormRow>

            {/* Pruning type */}
            <FormRow label="Type snoei" description="Hoe je haar trimt">
              <TileGrid
                options={[
                  { id: 'none', title: 'Geen', subtitle: 'Bloeit natuurlijk', glyph: '🌿' },
                  { id: 'light', title: 'Knippen', subtitle: 'Dode bladeren', glyph: '✂️' },
                  { id: 'moderate', title: 'Snoeien', subtitle: 'Vorm behouden', glyph: '✂️' },
                  { id: 'heavy', title: 'Terugsnoeien', subtitle: 'Nieuwe groei', glyph: '🪓' },
                ]}
                value={pruningType}
                onChange={setPruningType}
              />
            </FormRow>

            {/* Pruning frequency */}
            <FormRow label="Snoei frequentie" description="Regelmaat">
              <TileGrid
                options={[
                  { id: 'never', title: 'Nooit', subtitle: 'Vormvast', glyph: '—' },
                  { id: 'weekly', title: 'Wekelijks', subtitle: 'Onderhoud', glyph: '📅' },
                  { id: 'monthly', title: 'Maandelijks', subtitle: 'Check-up', glyph: '📅' },
                  { id: 'seasonal', title: 'Seizoens', subtitle: '2-4× p/j', glyph: '🍂' },
                ]}
                value={pruningFrequency}
                onChange={setPruningFrequency}
              />
            </FormRow>
          </Card>
        )}

        {/* ——— § IV · Album Card ——— */}
        {showDetails ? (
          <Card
            eyebrow="§ IV · Album"
            title={<>Haar <em>verhaal.</em></>}
            subtitle="Notities, data en herinneringen."
          >
            {/* Icon */}
            <FormRow label="Icoon" description="Kies een emoji">
              <IconPicker value={iconKey} onChange={(key) => {
                userPickedIconRef.current = true
                baseIconRef.current = null
                setIconKey(key)
              }} />
            </FormRow>

            {isFromDatabase && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-primary/5 border border-primary/15 text-sm text-primary">
                <span className="text-base">📋</span>
                <span>{t.editPlant.databasePrefill}</span>
              </div>
            )}

            {/* Sown date */}
            <FormRow label="Gezaaid" description="Wanneer begon haar leven?">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={sownDateInput}
                onChange={(e) => setSownDateInput(e.target.value)}
                placeholder="DD-MM-YYYY"
                className="w-full sm:w-44 rounded-lg border border-border bg-paper px-3 py-2 font-heading text-sm"
              />
            </FormRow>

            {/* Notes */}
            <FormRow label="Notities" description="Alles wat je wilt onthouden">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t.editPlant.notesPlaceholder}
                rows={3}
                className="w-full rounded-lg border border-border bg-paper px-3 py-2 font-body text-sm resize-none"
              />
            </FormRow>
          </Card>
        ) : (
          <div className="card p-4 flex items-center gap-4">
            <span className="font-mono text-[10px] text-text-muted uppercase tracking-[0.15em]">Icoon</span>
            <IconPicker value={iconKey} onChange={(key) => {
              userPickedIconRef.current = true
              baseIconRef.current = null
              setIconKey(key)
            }} />
          </div>
        )}

        {/* Action Bar */}
        <div className="sticky bottom-0 bg-bg/95 backdrop-blur border-t border-border mt-6 -mx-4 sm:-mx-6 lg:-mx-12 px-4 sm:px-6 lg:px-12 py-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="font-heading font-medium text-sm px-4 py-3 rounded-xl border border-border text-text-soft hover:text-text hover:border-text-muted transition-colors"
          >
            ← Annuleren
          </button>
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="font-heading font-bold text-base px-8 py-3 rounded-xl bg-primary hover:bg-primary-dark text-white disabled:opacity-40 active:scale-[0.98] transition-all shadow-sm"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Toevoegen...
              </span>
            ) : (
              `${t.addPlant.title} ${name ? `— ${name}` : ''}`
            )}
          </button>
        </div>
      </form>
          </div>

          {/* RIGHT: Calendar preview + Species reference */}
          <div className="space-y-5 lg:sticky lg:top-6">
            {/* Calendar Preview */}
            {schedules.water?.days > 0 && (
              <CalendarPreview
                waterDays={schedules.water.days}
                waterVolume={waterVolume}
                feedingSchedule={feedingSchedule}
                pruningFrequency={pruningFrequency}
              />
            )}

            {/* Species Reference */}
            {species && (
              <SpeciesReference
                species={name || species}
                scientificName={species}
                description={
                  prefill && !isIdentifyPrefill(prefill) && 'amsterdamNotes' in prefill
                    ? (prefill as LocalPlant).amsterdamNotes ?? undefined
                    : undefined
                }
                waterDays={schedules.water?.days}
                lightLevel={sunRequirement ?? undefined}
                nutriment={feedingSchedule}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
