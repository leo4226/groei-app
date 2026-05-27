import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
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
import { PLANT_SUN_PROFILES } from '../utils/plantSunRequirements'
import type { CareType, CareScheduleInput } from '../types'
import IconPicker from '../components/IconPicker'
import type { PlantIcon } from '../types'
import { icons } from '../api/client'
import PlantPickerSheet from '../components/sheets/PlantPickerSheet'
import { displayToIso, isoToDisplay } from '../utils/dateFormat'

const OUTDOOR_KEYWORDS = ['tuin', 'balkon', 'terras', 'buiten', 'kas', 'moestuin']
const isTuinLoc = (name: string) => OUTDOOR_KEYWORDS.some(k => name.toLowerCase().includes(k))

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
  const { locations, maps, addPlant, uploadPhoto } = useFloreren()

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
  const [locationId, setLocationId] = useState<number | undefined>()
  const [area, setArea] = useState<'tuin' | 'huis' | null>(null)
  const [potSize, setPotSize] = useState('')
  const [acquiredDateInput, setAcquiredDateInput] = useState('')
  const [notes, setNotes] = useState(
    prefill && !isIdentifyPrefill(prefill) && 'latinName' in prefill
      ? (prefill as LocalPlant).amsterdamNotes ?? ''
      : ''
  )
  const [sunRequirement, setSunRequirement] = useState<string | null>(
    prefill && !isIdentifyPrefill(prefill) && 'latinName' in prefill
      ? (prefill as LocalPlant).sunRequirement
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

  const tuinLocs = useMemo(() => locations.filter(l => isTuinLoc(l.name)), [locations])
  const huisLocs = useMemo(() => locations.filter(l => !isTuinLoc(l.name)), [locations])
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

  function toggleArea(target: 'tuin' | 'huis') {
    if (area === target) {
      setArea(null)
      setLocationId(undefined)
      return
    }
    setArea(target)
    const pool = target === 'tuin' ? tuinLocs : huisLocs
    if (pool.length > 0) {
      setLocationId(pool[0].id)
    } else {
      setLocationId(undefined)
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
      setSunRequirement(p.sunRequirement ?? null)
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
        acquired_date: displayToIso(acquiredDateInput) || undefined,
        notes: notes.trim() || undefined,
        icon_key: iconKey ?? undefined,
        plant_type: isFromDatabase
          ? (DUTCH_TYPE_TO_SYSTEM[(prefill as LocalPlant).type] ?? (prefill as LocalPlant).type)
          : derivedPlantType,
        sun_requirement: sunRequirement ?? undefined,
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
    <div key={remountKey} className="px-4 pt-6 pb-8">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full bg-surface border border-border flex items-center justify-center text-text"
        >
          ←
        </button>
        <h1 className="text-2xl font-extrabold">{t.addPlant.title}</h1>
      </div>

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

        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-text-muted mb-1.5">{t.editPlant.nameLabel}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Grote Monstera"
            required
            className={inputClass}
          />
        </div>

        {/* Species */}
        <div>
          <label className="block text-sm font-medium text-text-muted mb-1.5">{t.editPlant.speciesLabel}</label>
          <input
            type="text"
            value={species}
            onChange={(e) => setSpecies(e.target.value)}
            placeholder="Monstera deliciosa"
            className={inputClass}
          />
        </div>

        {/* Icon */}
        <div>
          <label className="block text-sm font-medium text-text-muted mb-1.5">{t.editPlant.iconLabel}</label>
          <IconPicker value={iconKey} onChange={(key) => {
            userPickedIconRef.current = true
            baseIconRef.current = null
            setIconKey(key)
          }} />
        </div>

        {/* Growth phase */}
        <div>
          <label className="block text-sm font-medium text-text-muted mb-1.5">{t.editPlant.growthPhaseLabel}</label>
          <div className="flex flex-wrap gap-1.5">
            {(['seed', 'sprout', 'seedling', 'young', 'established'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPhase(p)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                  phase === p
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-text-muted hover:border-text-muted'
                }`}
              >
                {t.editPlant[`phase${p.charAt(0).toUpperCase() + p.slice(1)}` as keyof typeof t.editPlant] as string}
              </button>
            ))}
          </div>
        </div>

        {isFromDatabase && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-primary/5 border border-primary/15 text-sm text-primary">
            <span className="text-base">📋</span>
            <span>{t.editPlant.databasePrefill}</span>
          </div>
        )}

        {/* Sun requirement */}
        <div>
          <label className="block text-sm font-medium text-text-muted mb-1.5">{t.editPlant.sunRequirementLabel}</label>
          <div className="flex gap-2">
            {PLANT_SUN_PROFILES.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => setSunRequirement(sunRequirement === profile.id ? null : profile.id)}
                className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl border text-xs font-medium transition-colors ${
                  sunRequirement === profile.id
                    ? 'border-transparent text-white'
                    : 'border-border text-text-muted hover:border-text-muted'
                }`}
                style={sunRequirement === profile.id ? { backgroundColor: profile.color } : undefined}
              >
                <span className="text-lg">{profile.emoji}</span>
                <span>{profile.id === 'full_sun' ? t.editPlant.sunFull : profile.id === 'partial_sun' ? t.editPlant.sunPartial : t.editPlant.sunShade}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Location */}
        <div>
          <label className="block text-sm font-medium text-text-muted mb-1.5">{t.editPlant.locationLabel}</label>
          <div className="flex gap-3">
            {([
              tuinMap && { area: 'tuin' as const, label: t.editPlant.garden, emoji: '🌿' },
              huisMap && { area: 'huis' as const, label: t.editPlant.house, emoji: '🏠' },
            ].filter(Boolean) as { area: 'tuin' | 'huis'; label: string; emoji: string }[]).map(({ area: btnArea, label, emoji }) => (
              <button
                key={btnArea}
                type="button"
                onClick={() => toggleArea(btnArea)}
                className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border text-sm font-medium transition-colors ${
                  area === btnArea
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-text-muted hover:border-text-muted'
                }`}
              >
                <span className="text-2xl">{emoji}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Pot size & Acquired */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">{t.editPlant.potSizeLabel}</label>
            <input
              type="number"
              value={potSize}
              onChange={(e) => setPotSize(e.target.value)}
              placeholder="15"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">{t.editPlant.acquiredLabel}</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={acquiredDateInput}
              onChange={(e) => setAcquiredDateInput(e.target.value)}
              placeholder="DD-MM-YYYY"
              className={inputClass}
            />
          </div>
        </div>

        {/* Sown date */}
        <div>
          <label className="block text-sm font-medium text-text-muted mb-1.5">{t.editPlant.sownDateLabel}</label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={sownDateInput}
            onChange={(e) => setSownDateInput(e.target.value)}
            placeholder="DD-MM-YYYY"
            className={inputClass}
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-text-muted mb-1.5">{t.editPlant.notesLabel}</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t.editPlant.notesPlaceholder}
            rows={2}
            className={`${inputClass} resize-none`}
          />
        </div>

        {/* Care Schedules */}
        <div>
          <h2 className="text-lg font-bold mb-1">{t.editPlant.careScheduleTitle}</h2>
          <p className="text-xs text-text-muted mb-3">{t.editPlant.careScheduleDesc}</p>
          <div className="space-y-2">
            {(Object.entries(CARE_TYPE_INFO) as [CareType, typeof CARE_TYPE_INFO[CareType]][]).map(([type, info]) => {
              const sched = schedules[type]
              const defaultDays = isOutdoor ? info.defaultOutdoor : info.defaultIndoor
              if (defaultDays === 0 && !sched.enabled) return null

              return (
                <div key={type} className={`card p-3 transition-all ${sched.enabled ? 'border-primary/20' : ''}`}>
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sched.enabled}
                        onChange={() => toggleSchedule(type)}
                        className="w-5 h-5 rounded accent-primary"
                      />
                      <span className="text-lg">{info.icon}</span>
                      <span className="font-medium text-sm">{t.care[type as keyof typeof t.care]}</span>
                    </label>
                    {sched.enabled && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-text-muted">{t.editPlant.everyLabel}</span>
                        <input
                          type="number"
                          min={1}
                          value={sched.days}
                          onChange={(e) => setScheduleDays(type, parseInt(e.target.value) || 1)}
                          className="w-14 px-2 py-1 rounded-lg bg-bg border border-border text-center text-sm font-medium"
                        />
                        <span className="text-xs text-text-muted">{t.editPlant.daysLabel}</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="w-full bg-primary text-white py-3.5 rounded-xl font-bold text-lg active:scale-[0.98] transition-transform disabled:opacity-50 shadow-sm"
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              {t.editPlant.submitting}
            </span>
          ) : (
            <span>{t.addPlant.title}</span>
          )}
        </button>
      </form>
    </div>
  )
}
