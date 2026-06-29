import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import type { LocalPlant } from '../data/plants-dataset'
import type { IdentifyCommitResult } from '../types'
import { useT } from '../context/LanguageContext'
import { useFloreren } from '../store/useFloreren'
import Glyph from '../components/ui/Glyph'
import type { CareType, CareScheduleInput } from '../types'
import { isCareTypeValidForEnv } from '../types'
import IconPicker from '../components/IconPicker'
import TileIcon from '../components/ui/TileIcon'
import type { PlantIcon } from '../types'
import { icons, species as speciesApi } from '../api/client'
import PlantPickerSheet from '../components/sheets/PlantPickerSheet'
import EntryBanner from '../components/add/EntryBanner'
import { displayToIso } from '../utils/dateFormat'
import { compressImage } from '../utils/compressImage'
import Card from '../components/ui/Card'
import FormRow from '../components/ui/FormRow'
import TileGrid from '../components/ui/TileGrid'
import SegmentedControl from '../components/ui/SegmentedControl'
import ChipCluster from '../components/ui/ChipCluster'
import ZonePicker from '../components/add/ZonePicker'
import FrequencySlider from '../components/add/FrequencySlider'
import {
  isIdentifyPrefill,
  findMatchingIcon,
  buildSchedules,
  normalizePrefill,
  buildCreatePayload,
  sunPreferenceToTile,
  SUN_DB_TO_TILE,
  TYPE_TO_FORM,
} from './addPlant/prefill'

type AddPlantLocState = {
  from?: 'identify' | 'manual' | 'pick'
  prefill?: LocalPlant | { name: string } | IdentifyCommitResult
} | null

export default function AddPlant() {
  const t = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const locState = (location.state ?? null) as AddPlantLocState
  const prefill = locState?.prefill
  // Single consolidated view of the prefill across all three entry paths.
  const norm = useMemo(() => normalizePrefill(prefill), [prefill])
  const remountKey = useMemo(() => Date.now(), [prefill])
  const isFromDatabase = !!(prefill && 'latinName' in (prefill as Record<string, unknown>))
  const isFromIdentify = isIdentifyPrefill(prefill)
  const initialRoute: 'database' | 'photo' = locState?.from === 'identify' ? 'photo' : 'database'
  const [activeRoute, setActiveRoute] = useState<'database' | 'photo'>(initialRoute)
  const [showDetails, setShowDetails] = useState(false)
  const { maps, plants, addPlant, uploadPhoto } = useFloreren()

  // Build zone list from the user's actual maps (not hardcoded defaults)
  const zoneList = useMemo(() => maps.map(m => ({
    id: String(m.id),
    name: m.name,
    description: m.map_type === 'indoor' ? 'Binnen' : 'Buiten',
    plantCount: plants.filter(p => p.map_id === m.id).length,
    isIndoor: m.map_type === 'indoor',
  })), [maps, plants])

  // Preserve the return path through replace navigations (pick flow remounts the component with new location.state)
  const fromMapState = (location.state as any)?.fromMap
  if (fromMapState) sessionStorage.setItem('addPlant_returnPath', fromMapState)

  const [name, setName] = useState<string>(
    prefill
      ? isIdentifyPrefill(prefill)
        ? prefill.name_nl_suggested
        : 'latinName' in prefill
          ? prefill.dutchName
          : String((prefill as Record<string, unknown>).name
            ?? (prefill as Record<string, unknown>).scientific_name
            ?? '')
      : ''
  )
  const [species, setSpecies] = useState<string>(
    prefill
      ? isIdentifyPrefill(prefill)
        ? prefill.scientific_name
        : 'latinName' in prefill
          ? prefill.latinName
          : String((prefill as Record<string, unknown>).scientific_name
            ?? (prefill as Record<string, unknown>).name
            ?? '')
      : ''
  )
  const [locationId] = useState<number | undefined>()
  const [, setArea] = useState<'tuin' | 'huis' | null>(null)
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

  const [gardenFitChip, setGardenFitChip] = useState<Array<{ map_id: number; map_name: string; sun_fit: string | null; reason: string }> | null>(null)

  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(
    isFromIdentify ? (prefill as IdentifyCommitResult).photo_path : null
  )
  const [submitting, setSubmitting] = useState(false)
  const [progressMsg, setProgressMsg] = useState('')
  const [sownDateInput, setSownDateInput] = useState('')
  const [phase, setPhase] = useState('established')
  const [quantity, setQuantity] = useState(1)
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
  const [feedingSchedule, setFeedingSchedule] = useState('monthly')
  const [pruningType, setPruningType] = useState('none')
  const [pruningFrequency, setPruningFrequency] = useState('never')


  function randomMapPos(viewbox: string) {
    const [x0, y0, w, h] = viewbox.split(' ').map(Number)
    const pad = Math.min(w, h) * 0.12
    return {
      x: Math.round((x0 + pad + Math.random() * (w - pad * 2)) * 10) / 10,
      y: Math.round((y0 + pad + Math.random() * (h - pad * 2)) * 10) / 10,
    }
  }

  const [schedules, setSchedules] = useState<Record<CareType, { enabled: boolean; days: number }>>(
    () => buildSchedules(prefill, norm.careThresholds)
  )

  // Extract fertilise_tip from care thresholds (identify path uses norm.careThresholds
  // at mount; database path updates it via the lookupLatin useEffect below)
  const [fertiliseTip, setFertiliseTip] = useState<string | null>(() => {
    const ct = norm.careThresholds
    if (ct && typeof ct === 'object') {
      const tip = (ct as Record<string, unknown>)['fertilise_tip']
      return typeof tip === 'string' && tip.trim() ? tip.trim() : null
    }
    return null
  })

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

  // Database path: fetch care thresholds for the selected plant
  useEffect(() => {
    if (norm.kind !== 'database' || !norm.species) return
    let cancelled = false
    const latin = norm.species
    speciesApi.lookupLatin(latin)
      .then(resp => {
        if (cancelled || !resp.care_thresholds) return
        setSchedules(() => buildSchedules(
          prefill,
          resp.care_thresholds,
        ))
        // Also extract the fertilise_tip from the fetched thresholds
        const tip = (resp.care_thresholds as Record<string, unknown>)['fertilise_tip']
        setFertiliseTip(
          typeof tip === 'string' && tip.trim() ? tip.trim() : null,
        )
      })
      .catch(() => {}) // latin name may not match — silently skip
    return () => { cancelled = true }
  }, [norm.kind, norm.species])

  // Garden fit chip — shown when species_id is known (identify or journal paths)
  useEffect(() => {
    if (norm.speciesId == null) return
    let cancelled = false
    speciesApi.gardenFit(norm.speciesId)
      .then(fits => { if (!cancelled) setGardenFitChip(fits) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [norm.speciesId])

  // Photo-ID path: lazily fetch the species ecology profile and fill the sun
  // requirement from it. Non-blocking and fire-and-forget (mirrors the catalog
  // load). `sun_preference` is null until the /ecology endpoint runs lazy
  // enrichment, so this is the call that triggers and then consumes it. Never
  // clobber a sun value the user has already picked.
  useEffect(() => {
    if (norm.kind !== 'identify' || norm.speciesId == null) return
    let cancelled = false
    speciesApi.ecology(norm.speciesId)
      .then(eco => {
        if (cancelled) return
        const tile = sunPreferenceToTile(eco.sun_preference)
        if (tile) setSunRequirement(prev => prev ?? tile)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [norm.kind, norm.speciesId])

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
      setSchedules(buildSchedules(prefill, norm.careThresholds))
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

  // Progress timer: update elapsed seconds + phase message while submitting
  useEffect(() => {
    if (!submitting) {
      setProgressMsg('')
      return
    }
    const start = Date.now()
    setProgressMsg(t.addPlant.adding)
    const tick = setInterval(() => {
      const sec = Math.floor((Date.now() - start) / 1000)
      if (sec < 5) {
        setProgressMsg(t.addPlant.adding)
      } else if (sec < 25) {
        setProgressMsg(t.addPlant.fetchingSpecies)
      } else if (sec < 40) {
        setProgressMsg(t.addPlant.calculatingCare)
      } else {
        setProgressMsg(t.addPlant.stillWorking(sec))
      }
    }, 1000)
    return () => clearInterval(tick)
  }, [submitting])

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      setPhotoFile(file)
      setPhotoPreview(URL.createObjectURL(file))
    }
  }


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name?.trim()) return

    setSubmitting(true)
    try {
      // Use the actual map the user selected in the ZonePicker, not a fuzzy match on area
      const placedMap = selectedZoneId ? maps.find(m => String(m.id) === selectedZoneId) : undefined
      const mapPos = placedMap ? randomMapPos(placedMap.viewbox) : undefined

      // Drop care types that don't apply to this environment (e.g. rotate/mist
      // outdoors). No map selected → treated as outdoor, matching the backend.
      const isIndoor = placedMap?.map_type === 'indoor'
      const careSchedules: CareScheduleInput[] = Object.entries(schedules)
        .filter(([type, s]) => s.enabled && s.days > 0 && isCareTypeValidForEnv(type as CareType, isIndoor))
        .map(([type, s]) => ({ care_type: type as CareType, interval_days: s.days }))

      const plant = await addPlant(buildCreatePayload({
        name,
        species,
        locationId,
        mapId: placedMap?.id,
        mapX: mapPos?.x,
        mapY: mapPos?.y,
        potSizeCm: potSize ? parseInt(potSize) : undefined,
        acquiredDate: acquiredDateInput.trim() || displayToIso(acquiredDateInput) || undefined,
        notes,
        iconKey: iconKey ?? undefined,
        kind: norm.kind,
        databaseType: norm.kind === 'database' ? (prefill as LocalPlant).type : undefined,
        derivedPlantType,
        sunRequirement,
        phase: phase as any,
        quantity,
        sownDate: displayToIso(sownDateInput) || undefined,
        careSchedules,
      }))

      if (photoFile) {
        const compressed = await compressImage(photoFile)
        await uploadPhoto(plant.id, new File([compressed], 'photo.jpg', { type: 'image/jpeg' }))
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

  

  // Derived Latin name for species row (read-only, from prefill)
  const latinName = useMemo(() => {
    if (!prefill) return ''
    if (isIdentifyPrefill(prefill)) return prefill.scientific_name
    if ('latinName' in prefill) return prefill.latinName
    return ''
  }, [prefill])

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
              <Glyph name="camera" size={24} className="shrink-0" />
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
              <Glyph name="search" size={24} className="shrink-0 text-text-muted" />
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
              <Glyph name="edit" size={24} className="shrink-0 text-text-muted" />
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
        <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-12 pt-6 sm:pt-8 pb-5">
          <div className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.15em] sm:tracking-[0.22em] text-text-muted flex items-center gap-3 sm:gap-3.5 mb-3 sm:mb-3.5">
            <span className="text-primary">§</span>
            <span>{t.addPlant.breadcrumb}</span>
            <span className="hidden sm:block flex-1 h-px bg-border max-w-[80px]" />
          </div>
          <h1 className="font-heading font-bold text-2xl sm:text-3xl mt-1">
            {t.addPlant.heading}
          </h1>
          <p className="font-heading italic text-base sm:text-lg text-text-soft mt-3 sm:mt-3.5 max-w-[540px] leading-[1.45]">
            {t.addPlant.subheading}
          </p>
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
            {t.addPlant.basic}
          </button>
          <button
            type="button"
            onClick={() => setShowDetails(true)}
            className={`font-heading text-xs px-3 py-1.5 rounded-full transition-all ${
              showDetails ? 'bg-primary text-white' : 'bg-paper border border-border text-text-soft'
            }`}
          >
            {t.addPlant.details}
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

      {/* ——— Garden fit chip ——— */}
      {gardenFitChip && gardenFitChip.length > 0 && (() => {
        const FIT_RANK: Record<string, number> = { perfect: 4, acceptable: 3, marginal: 2, tolerated: 1 }
        const FIT_COLOR: Record<string, string> = { perfect: '#24e34c', acceptable: '#a3e635', marginal: '#f59e0b', tolerated: '#6b7280' }
        const FIT_LABEL: Record<string, string> = {
          perfect: t.discovery.fitPerfect,
          acceptable: t.discovery.fitAcceptable,
          marginal: t.discovery.fitMarginal,
          tolerated: t.discovery.fitTolerated,
        }
        const best = gardenFitChip.reduce((b, v) =>
          (FIT_RANK[v.sun_fit ?? ''] ?? 0) > (FIT_RANK[b.sun_fit ?? ''] ?? 0) ? v : b,
          gardenFitChip[0]
        )
        if (!best.sun_fit) return null
        const color = FIT_COLOR[best.sun_fit] ?? '#d1d5db'
        return (
          <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-12 pb-2 pt-2">
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '7px 14px', borderRadius: 20,
              background: color + '18', border: `1px solid ${color}50`,
            }}>
              <div style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: 'var(--color-text-soft)' }}>
                <strong style={{ color: 'var(--color-text)' }}>{FIT_LABEL[best.sun_fit]}</strong>
                {' — '}{best.map_name}
              </span>
            </div>
          </div>
        )
      })()}

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
              <Glyph name="camera" size={24} />
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
          eyebrow={t.addPlant.secIdentity}
          title={t.addPlant.secIdentityTitle}
        >
          {/* Bijnaam */}
          <FormRow label={t.addPlant.labelNickname} description={t.addPlant.labelNicknameDesc}>
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t.addPlant.placeholderNickname}
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
          <FormRow label={t.addPlant.labelSpecies} description={t.addPlant.labelSpeciesDesc}>
            <div className="grid grid-cols-[1fr_1fr] gap-3">
              <input
                type="text"
                value={species}
                onChange={(e) => setSpecies(e.target.value)}
                placeholder={t.addPlant.placeholderSpecies}
                className="w-full rounded-lg border border-border bg-paper px-3 py-2 font-heading text-sm text-text placeholder:text-text-muted/50 focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
              />
              <input
                type="text"
                readOnly
                value={latinName}
                className="w-full rounded-lg border border-border bg-paper px-3 py-2 font-heading italic text-sm text-text-soft"
                placeholder={t.addPlant.placeholderSpeciesLatin}
              />
            </div>
          </FormRow>

          {/* Form type */}
          <FormRow label={t.addPlant.labelForm} description={t.addPlant.labelFormDesc}>
            <TileGrid
              options={[
                { id: 'pot', glyph: <TileIcon name="form-pot" />, title: t.addPlant.formPot, subtitle: t.addPlant.formPotSub },
                { id: 'ground', glyph: <TileIcon name="form-ground" />, title: t.addPlant.formGround, subtitle: t.addPlant.formGroundSub },
                { id: 'seedling', glyph: <TileIcon name="form-seedling" />, title: t.addPlant.formSeedling, subtitle: t.addPlant.formSeedlingSub },
                { id: 'tree', glyph: <TileIcon name="form-tree" />, title: t.addPlant.formTree, subtitle: t.addPlant.formTreeSub },
              ]}
              value={formType} onChange={setFormType}
            />
          </FormRow>

          {/* Life phase */}
          <FormRow label={t.addPlant.labelPhase} description={t.addPlant.labelPhaseDesc}>
            <SegmentedControl
              options={[
                { id: 'seed', label: t.addPlant.phaseSeed },
                { id: 'sprout', label: t.addPlant.phaseSprout },
                { id: 'seedling', label: t.addPlant.phaseSeedling },
                { id: 'young', label: t.addPlant.phaseYoung },
                { id: 'established', label: t.addPlant.phaseEstablished },
              ]}
              value={phase} onChange={setPhase}
            />
          </FormRow>

          {/* Quantity */}
          <FormRow label={t.addPlant.labelQuantity} description={t.addPlant.labelQuantityDesc}>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={quantity || ''}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10)
                setQuantity(Number.isNaN(n) ? 0 : Math.max(0, n))
              }}
              onBlur={() => { if (quantity < 1) setQuantity(1) }}
              className="w-full sm:w-32 rounded-lg border border-border bg-paper px-3 py-2 font-mono text-base text-text focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
            />
          </FormRow>

          {/* Acquisition */}
          <FormRow label={t.addPlant.labelAcquired} description={t.addPlant.labelAcquiredDesc}>
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
                placeholder={t.addPlant.placeholderAcquiredAt}
                className="w-full rounded-lg border border-border bg-paper px-3 py-2 font-heading text-sm text-text placeholder:text-text-muted/50 focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
              />
            </div>
          </FormRow>
        </Card>

        {/* ——— § II · Placement Card (zone always visible; rest under Details) ——— */}
        <Card
          eyebrow={t.addPlant.secPlacement}
          title={t.addPlant.secPlacementTitle}
          subtitle={t.addPlant.secPlacementSubtitle}
        >
          {/* Zone picker */}
          <FormRow label={t.addPlant.labelZone} description={t.addPlant.labelZoneDesc}>
            <ZonePicker
              zones={zoneList}
              translations={{
                plantsLabel: t.addPlant.zonePlants,
              }}
              value={selectedZoneId}
              onChange={(zoneId) => {
                setSelectedZoneId(zoneId || null)
                if (!zoneId) return
                const zone = zoneList.find(z => z.id === zoneId)
                if (zone) {
                  setArea(zone.isIndoor ? 'huis' : 'tuin')
                }
              }}
              advice={species ? t.addPlant.zoneAdvice(species) : undefined}
            />
          </FormRow>

          {showDetails && (<>
          {/* Light measurement */}
          <FormRow label={t.addPlant.labelLight} description={t.addPlant.labelLightDesc}>
            <TileGrid
              options={[
                { id: 'dark', title: t.addPlant.lightDark, subtitle: t.addPlant.lightDarkSub, glyph: <TileIcon name="light-dark" /> },
                { id: 'shade', title: t.addPlant.lightShade, subtitle: t.addPlant.lightShadeSub, glyph: <TileIcon name="light-shade" /> },
                { id: 'indirect', title: t.addPlant.lightIndirect, subtitle: t.addPlant.lightIndirectSub, glyph: <TileIcon name="light-indirect" /> },
                { id: 'bright', title: t.addPlant.lightBright, subtitle: t.addPlant.lightBrightSub, glyph: <TileIcon name="light-bright" /> },
                { id: 'full-sun', title: t.addPlant.lightFullSun, subtitle: t.addPlant.lightFullSunSub, glyph: <TileIcon name="light-full" /> },
              ]}
              value={sunRequirement}
              onChange={(v) => setSunRequirement(v || null)}
            />
          </FormRow>

          {/* Pot material */}
          <FormRow label={t.addPlant.labelPot} description={t.addPlant.labelPotDesc}>
            <TileGrid
              options={[
                { id: 'terracotta', title: t.addPlant.potTerracotta, subtitle: t.addPlant.potTerracottaSub, glyph: <TileIcon name="pot-terracotta" /> },
                { id: 'plastic', title: t.addPlant.potPlastic, subtitle: t.addPlant.potPlasticSub, glyph: <TileIcon name="pot-plastic" /> },
                { id: 'ceramic', title: t.addPlant.potCeramic, subtitle: t.addPlant.potCeramicSub, glyph: <TileIcon name="pot-ceramic" /> },
                { id: 'basket', title: t.addPlant.potBasket, subtitle: t.addPlant.potBasketSub, glyph: <TileIcon name="pot-basket" /> },
              ]}
              value={potMaterial}
              onChange={setPotMaterial}
            />
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="text-xs text-text-muted mb-1 block">{t.addPlant.labelPotDiameter}</label>
                <input
                  type="number"
                  value={potDiameter || ''}
                  onChange={(e) => setPotDiameter(e.target.value)}
                  placeholder="⌀ 18"
                  className="w-full rounded-lg border border-border bg-paper px-3 py-2 font-mono text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-text-muted mb-1 block">{t.addPlant.labelPotHeight}</label>
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
              <span className="font-heading text-sm rounded-full border px-3 py-1.5 peer-checked:bg-primary/10 peer-checked:border-primary peer-checked:text-primary bg-paper border-border text-text-soft transition-all inline-flex items-center gap-1">
                {hasDrainage && <Glyph name="check" size={13} />}{t.addPlant.labelDrainageYes}
              </span>
            </label>
          </FormRow>

          {/* Substrate */}
          <FormRow
            label={t.addPlant.labelSubstrate}
            description={t.addPlant.labelSubstrateDesc}
            help={t.addPlant.substrateHelp}
          >
            <ChipCluster
              options={t.addPlant.substrateOptions}
              selected={substrate}
              onChange={setSubstrate}
            />
          </FormRow>
          </>)}
        </Card>

        {/* ——— § III · Care Card ——— */}
        {!showDetails ? (
          <Card
            eyebrow={t.addPlant.secCare}
            title={t.addPlant.secCareTitle}
          >
            {/* Water gift frequency */}
            <FormRow label={t.addPlant.labelWatering} description={t.addPlant.labelWateringDesc}>
              <FrequencySlider
                label={t.addPlant.labelWatering}
                value={schedules.water.days}
                onChange={(v) => {
                  setSchedules(prev => ({
                    ...prev,
                    water: { ...prev.water, days: v },
                  }))
                }}
                presets={[
                  { label: t.addPlant.presetSeldom, value: 14 },
                  { label: t.addPlant.presetWeekly, value: 7 },
                  { label: t.addPlant.presetBiweekly, value: 3 },
                  { label: t.addPlant.presetDaily, value: 1 },
                ]}
              />
            </FormRow>

          </Card>
        ) : (
          <Card
            eyebrow={t.addPlant.secCare}
            title={t.addPlant.secCareTitle}
            subtitle={t.addPlant.secCareSubtitle}
          >
            {/* Water gift frequency */}
            <FormRow label={t.addPlant.labelWatering} description={t.addPlant.labelWateringDesc}>
              <FrequencySlider
                label={t.addPlant.labelWatering}
                value={schedules.water.days}
                onChange={(v) => {
                  setSchedules(prev => ({
                    ...prev,
                    water: { ...prev.water, days: v },
                  }))
                }}
                presets={[
                  { label: t.addPlant.presetSeldom, value: 14 },
                  { label: t.addPlant.presetWeekly, value: 7 },
                  { label: t.addPlant.presetBiweekly, value: 3 },
                  { label: t.addPlant.presetDaily, value: 1 },
                ]}
              />
            </FormRow>

            <FormRow label={t.addPlant.labelFeeding} description={t.addPlant.labelFeedingDesc}>
              <TileGrid
                options={[
                  { id: 'weekly', title: t.addPlant.feedWeekly, subtitle: t.addPlant.feedWeeklySub, glyph: <TileIcon name="feed-weekly" /> },
                  { id: 'monthly', title: t.addPlant.feedMonthly, subtitle: t.addPlant.feedMonthlySub, glyph: <TileIcon name="feed-monthly" /> },
                  { id: 'seasonal', title: t.addPlant.feedSeasonal, subtitle: t.addPlant.feedSeasonalSub, glyph: <TileIcon name="feed-seasonal" /> },
                  { id: 'optional', title: t.addPlant.feedOptional, subtitle: t.addPlant.feedOptionalSub, glyph: <TileIcon name="feed-optional" /> },
                ]}
                value={feedingSchedule}
                onChange={setFeedingSchedule}
              />
            </FormRow>
            {fertiliseTip && (
              <p className="text-xs text-text-muted italic mt-1 text-center">{fertiliseTip}</p>
            )}

            {/* Pruning type */}
            <FormRow label={t.addPlant.labelPruneType} description={t.addPlant.labelPruneTypeDesc}>
              <TileGrid
                options={[
                  { id: 'none', title: t.addPlant.pruneNone, subtitle: t.addPlant.pruneNoneSub, glyph: <TileIcon name="prune-none" /> },
                  { id: 'light', title: t.addPlant.pruneLight, subtitle: t.addPlant.pruneLightSub, glyph: <TileIcon name="prune-light" /> },
                  { id: 'moderate', title: t.addPlant.pruneModerate, subtitle: t.addPlant.pruneModerateSub, glyph: <TileIcon name="prune-moderate" /> },
                  { id: 'heavy', title: t.addPlant.pruneHeavy, subtitle: t.addPlant.pruneHeavySub, glyph: <TileIcon name="prune-heavy" /> },
                ]}
                value={pruningType}
                onChange={setPruningType}
              />
            </FormRow>

            {/* Pruning frequency */}
            <FormRow label={t.addPlant.labelPruneFreq} description={t.addPlant.labelPruneFreqDesc}>
              <TileGrid
                options={[
                  { id: 'never', title: t.addPlant.pruneNever, subtitle: t.addPlant.pruneNeverSub, glyph: <TileIcon name="freq-never" /> },
                  { id: 'weekly', title: t.addPlant.pruneW, subtitle: t.addPlant.pruneWSub, glyph: <TileIcon name="freq-weekly" /> },
                  { id: 'monthly', title: t.addPlant.pruneM, subtitle: t.addPlant.pruneMSub, glyph: <TileIcon name="freq-monthly" /> },
                  { id: 'seasonal', title: t.addPlant.pruneS, subtitle: t.addPlant.pruneSSub, glyph: <TileIcon name="freq-seasonal" /> },
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
            eyebrow={t.addPlant.secAlbum}
            title={t.addPlant.secAlbumTitle}
            subtitle={t.addPlant.secAlbumSubtitle}
          >
            {/* Icon */}
            <FormRow label={t.addPlant.labelIcon} description={t.addPlant.labelIconDesc}>
              <IconPicker value={iconKey} onChange={(key) => {
                userPickedIconRef.current = true
                baseIconRef.current = null
                setIconKey(key)
              }} />
            </FormRow>

            {isFromDatabase && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-primary/5 border border-primary/15 text-sm text-primary">
                <Glyph name="clipboard" size={16} className="shrink-0" />
                <span>{t.editPlant.databasePrefill}</span>
              </div>
            )}

            {/* Sown date */}
            <FormRow label={t.addPlant.labelSown} description={t.addPlant.labelSownDesc}>
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
            <FormRow label={t.addPlant.labelNotes} description={t.addPlant.labelNotesDesc}>
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
            <span className="font-mono text-[10px] text-text-muted uppercase tracking-[0.15em]">{t.addPlant.labelIcon}</span>
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
            className="font-heading font-medium text-sm px-3 py-2.5 rounded-xl border border-border text-text-soft hover:text-text hover:border-text-muted transition-colors shrink-0"
          >
            {t.addPlant.cancel}
          </button>
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="font-heading font-bold text-sm px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-dark text-white disabled:opacity-40 active:scale-[0.98] transition-all shadow-sm max-w-[260px] truncate"
          >
            {submitting ? (
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
                <span className="truncate">{progressMsg || t.addPlant.submitting}</span>
              </span>
            ) : (
              name ? `${t.addPlant.title} — ${name}` : t.addPlant.title
            )}
          </button>
        </div>
      </form>
          </div>

        </div>
      </div>
    </div>
  )
}
