import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import type { LocalPlant } from '../data/plants-dataset'
import type { IdentifyCommitResult } from '../types'
import { useT } from '../context/LanguageContext'
import { useFloreren } from '../store/useFloreren'
import Glyph from '../components/ui/Glyph'
import IconPicker from '../components/IconPicker'
import TileIcon from '../components/ui/TileIcon'
import type { PlantIcon } from '../types'
import { icons, species as speciesApi } from '../api/client'
import PlantPickerSheet from '../components/sheets/PlantPickerSheet'
import { PICKABLE_SPECIES_COUNT, displayPlantName } from '../data/pickableSpecies'
import EntryBanner from '../components/add/EntryBanner'
import { compressImage } from '../utils/compressImage'
import Card from '../components/ui/Card'
import FormRow from '../components/ui/FormRow'
import TileGrid from '../components/ui/TileGrid'
import SegmentedControl from '../components/ui/SegmentedControl'
import ChipCluster from '../components/ui/ChipCluster'
import ZonePicker from '../components/add/ZonePicker'
import PlacementPicker from '../components/add/PlacementPicker'
import PageMasthead from '../components/ui/PageMasthead'
import {
  isIdentifyPrefill,
  findMatchingIcon,
  normalizePrefill,
  buildCreatePayload,
  sunPreferenceToTile,
  waterAdviceFromThresholds,
  zoneAdviceKey,
  SUN_DB_TO_TILE,
  TYPE_TO_FORM,
} from './addPlant/prefill'
import { resolveDefaultMapId, type MapPos } from './addPlant/placementModel'

const SECTION_MARKER = String.fromCodePoint(0x00a7)
const WATER_FORMULA = `H${String.fromCodePoint(0x2082)}O`

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
    description: m.map_type === 'indoor' ? t.maps.indoor : t.maps.outdoor,
    plantCount: plants.filter(p => p.map_id === m.id).length,
    isIndoor: m.map_type === 'indoor',
  })), [maps, plants, t.maps.indoor, t.maps.outdoor])

  // Preserve the return path across the entry-choice navigations, which remount
  // this component with fresh location.state. Written in an effect, not during
  // render — and cleared whenever the user leaves without creating a plant, so
  // a later add started from /plants can't inherit an old map's path.
  const fromMapState = (location.state as { fromMap?: string } | null)?.fromMap
  useEffect(() => {
    if (fromMapState) sessionStorage.setItem('addPlant_returnPath', fromMapState)
  }, [fromMapState])

  const returnPath = () => sessionStorage.getItem('addPlant_returnPath') ?? '/plants'

  function handleCancel() {
    const path = returnPath()
    sessionStorage.removeItem('addPlant_returnPath')
    navigate(path)
  }

  const [name, setName] = useState<string>(
    prefill
      ? isIdentifyPrefill(prefill)
        ? prefill.name_nl_suggested
        : 'latinName' in prefill
          ? displayPlantName(prefill, t.locale)
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
  const [pickedPos, setPickedPos] = useState<MapPos | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Auto-select the most logical map: the one the user came from, else the
  // last map they visited (BottomNav/MapPage keep lastMapSlug in sync). Only
  // when the user hasn't chosen yet — a deliberate pick always wins.
  useEffect(() => {
    if (selectedZoneId || maps.length === 0) return
    const wantedSlug: string | null = fromMapState ?? localStorage.getItem('lastMapSlug')
    const defaultId = resolveDefaultMapId(maps, fromMapState ?? null, wantedSlug)
    if (defaultId != null) setSelectedZoneId(String(defaultId))
  }, [maps, selectedZoneId, fromMapState])

  /**
   * Canonical container size. The form asks for a diameter; `pot_size_cm` is
   * what the backend stores and what the potted/bare icon variant keys off, so
   * the two must not drift apart.
   */
  const potSize = potDiameter


  function randomMapPos(viewbox: string) {
    const [x0, y0, w, h] = viewbox.split(' ').map(Number)
    const pad = Math.min(w, h) * 0.12
    return {
      x: Math.round((x0 + pad + Math.random() * (w - pad * 2)) * 10) / 10,
      y: Math.round((y0 + pad + Math.random() * (h - pad * 2)) * 10) / 10,
    }
  }

  const [waterAdvice, setWaterAdvice] = useState(
    () => waterAdviceFromThresholds(norm.careThresholds),
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

  // Database path: fetch care thresholds for the selected plant
  useEffect(() => {
    if (norm.kind !== 'database' || !norm.species) return
    let cancelled = false
    const latin = norm.species
    speciesApi.lookupLatin(latin)
      .then(resp => {
        if (cancelled || !resp.care_thresholds) return
        setWaterAdvice(waterAdviceFromThresholds(resp.care_thresholds))
      })
      .catch(() => {}) // latin name may not match — silently skip
    return () => { cancelled = true }
  }, [norm.kind, norm.species])

  // Garden fit chip — shown when species_id is known (identify or journal paths)
  useEffect(() => {
    if (norm.speciesId == null) return
    let cancelled = false
    speciesApi.gardenFit(norm.speciesId, t.locale.toLowerCase().startsWith('en') ? 'en' : 'nl')
      .then(fits => { if (!cancelled) setGardenFitChip(fits) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [norm.speciesId, t.locale])

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
      setWaterAdvice(waterAdviceFromThresholds(prefill.care_thresholds))
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
      setName(displayPlantName(p, t.locale))
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
      setWaterAdvice(waterAdviceFromThresholds(norm.careThresholds))
      return
    }
    if ('name' in prefill) {
      setName(prefill.name)
      setWaterAdvice(waterAdviceFromThresholds(null))
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
    setSubmitError(null)
    try {
      // Use the actual map the user selected in the ZonePicker, not a fuzzy match on area
      const placedMap = selectedZoneId ? maps.find(m => String(m.id) === selectedZoneId) : undefined
      // Tapped position wins; otherwise scatter randomly as before (only when
      // a map is chosen — a plant can also be added without a spot).
      const mapPos = placedMap
        ? (pickedPos ?? randomMapPos(placedMap.viewbox))
        : undefined

      const plant = await addPlant(buildCreatePayload({
        name,
        species,
        locationId,
        mapId: placedMap?.id,
        mapX: mapPos?.x,
        mapY: mapPos?.y,
        potSizeCm: potSize ? parseInt(potSize) : undefined,
        acquiredDate: acquiredDateInput.trim() || undefined,
        notes,
        iconKey: iconKey ?? undefined,
        kind: norm.kind,
        databaseType: norm.kind === 'database' ? (prefill as LocalPlant).type : undefined,
        derivedPlantType,
        sunRequirement,
        phase: phase as any,
        quantity,
        sownDate: sownDateInput.trim() || undefined,
        formType,
        potMaterial: showDetails ? potMaterial : undefined,
        potDiameterCm: potDiameter ? parseInt(potDiameter) : undefined,
        potHeightCm: potHeight ? parseInt(potHeight) : undefined,
        hasDrainage: showDetails ? hasDrainage : undefined,
        substrate,
        acquiredFrom: locationText,
        careSchedules: [],
      }))

      if (photoFile) {
        const compressed = await compressImage(photoFile)
        await uploadPhoto(plant.id, new File([compressed], 'photo.jpg', { type: 'image/jpeg' }))
      }

      // Only leave the form once the plant actually exists. On failure the user
      // keeps everything they typed and sees why (previously every error was
      // swallowed and looked exactly like success).
      const finalReturnPath = returnPath()
      sessionStorage.removeItem('addPlant_returnPath')
      navigate(finalReturnPath)
    } catch (e) {
      console.error('AddPlant: add failed', e)
      const status = (e as { status?: number }).status
      setSubmitError(
        status === 422 ? t.addPlant.errorInvalid
          : status === 401 || status === 403 ? t.addPlant.errorAuth
          : status && status >= 500 ? t.addPlant.errorServer
          : t.addPlant.errorNetwork
      )
    } finally {
      setSubmitting(false)
    }
  }



  // Zone advice follows the sun requirement we actually know. No requirement,
  // no advice — silence beats a confident wrong claim.
  const zoneAdvice = useMemo(() => {
    const key = zoneAdviceKey(sunRequirement)
    if (!key) return undefined
    const subject = name.trim() || species.trim()
    return subject ? t.addPlant.zoneAdvice[key](subject) : undefined
  }, [sunRequirement, name, species, t])

  // Derived Latin name for species row (read-only, from prefill)
  const latinName = useMemo(() => {
    if (!prefill) return ''
    if (isIdentifyPrefill(prefill)) return prefill.scientific_name
    if ('latinName' in prefill) return prefill.latinName
    return ''
  }, [prefill])

  // Entry-choice screen: shown when the user lands on Add Plant without a prior
  // path choice, and kept mounted behind the picker sheet so the sheet dims a
  // real screen instead of an empty white page.
  // Mobile: fills the scroll area (viewport minus the in-flow BottomNav) so the
  // three route cards sit exactly above the nav with no page scrollbar. Desktop
  // keeps the centered editorial layout.
  const entryChoiceScreen = (
      <div className="flex min-h-full flex-col pb-2">
        <PageMasthead
          eyebrow={t.addPlant.breadcrumb}
          title={t.addPlant.entryTitle}
          accent={t.addPlant.entryAccent}
          lede={t.addPlant.subheading}
          actions={
            <button
              type="button"
              onClick={handleCancel}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 font-heading text-sm text-text-soft transition-colors hover:border-text-muted hover:text-text"
            >
              <Glyph name="arrow-left" size={14} />
              {t.addPlant.cancel}
            </button>
          }
        />

        {/* Three routes, side by side from 900px up. The old layout stacked them
            in a max-w-md column, which on a desktop viewport left a tiny strip
            of UI adrift in empty space. On mobile the wrapper flexes to fill the
            remaining height and the cards share it equally. */}
        <div className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col justify-center px-4 pt-4 sm:px-6 md:min-h-[52vh] md:pt-0">
          <div className="flex flex-1 flex-col gap-2.5 md:flex-none md:grid md:grid-cols-3 md:gap-5">
            {[
              {
                key: 'identify',
                icon: 'camera' as const,
                title: t.addPlant.entry.identify,
                subtitle: t.addPlant.entry.identifySubtitle,
                badge: t.addPlant.entry.recommended,
                onClick: () => navigate('/identify'),
              },
              {
                key: 'pick',
                icon: 'search' as const,
                title: t.addPlant.entry.pick,
                subtitle: t.addPlant.entry.pickSubtitle,
                badge: t.addPlant.entry.speciesBadge(PICKABLE_SPECIES_COUNT),
                onClick: () => navigate(location.pathname, {
                  state: { from: 'pick', fromMap: fromMapState },
                }),
              },
              {
                key: 'manual',
                icon: 'edit' as const,
                title: t.addPlant.entry.manual,
                subtitle: t.addPlant.entry.manualSubtitle,
                badge: undefined,
                onClick: () => navigate(location.pathname, {
                  state: { from: 'manual', fromMap: fromMapState },
                }),
              },
            ].map((route, index) => {
              const isPrimary = index === 0
              return (
                <button
                  key={route.key}
                  type="button"
                  onClick={route.onClick}
                  className={[
                    'group flex flex-1 flex-col items-start rounded-2xl border p-3.5 text-left transition-all sm:p-6 md:h-full',
                    'hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(31,42,30,0.07)] active:translate-y-0',
                    isPrimary
                      ? 'border-primary bg-primary/[0.06] shadow-[0_0_0_1px_var(--color-primary)]'
                      : 'border-border bg-paper hover:border-text-muted',
                  ].join(' ')}
                >
                  {/* Icon well — the warm gradient from the design language */}
                  <div
                    className={[
                      'mb-2.5 flex h-9 w-9 items-center justify-center rounded-xl border transition-colors sm:mb-4 sm:h-12 sm:w-12',
                      isPrimary
                        ? 'border-primary/30 bg-gradient-to-br from-primary/20 to-primary-dark/20 text-primary'
                        : 'border-border-soft bg-gradient-to-br from-[#FDFAF1] to-[#EDE5D1] text-text-soft group-hover:text-primary',
                    ].join(' ')}
                  >
                    <Glyph name={route.icon} size={22} />
                  </div>

                  <div className="mb-1 flex min-h-[12px] items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted sm:mb-1.5 sm:min-h-[14px]">
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    {route.badge && (
                      <>
                        <span className="h-px w-3 bg-border" />
                        <span className={isPrimary ? 'text-primary' : undefined}>{route.badge}</span>
                      </>
                    )}
                  </div>

                  <h2 className="m-0 font-heading text-[17px] font-medium leading-tight tracking-[-0.01em] text-text sm:text-[21px]">
                    {route.title}
                  </h2>
                  <p className="mt-1.5 font-heading text-[13px] italic leading-snug text-text-soft sm:mt-1.5 sm:text-sm sm:leading-[1.5]">
                    {route.subtitle}
                  </p>
                </button>
              )
            })}
          </div>
        </div>
      </div>
  )

  if (locState?.from == null) return entryChoiceScreen

  // Picker sheet, over the entry screen. Both the sheet and the form are pushed
  // (not replaced), so browser Back walks form → picker → entry → wherever the
  // user came from, and a wrong species is one tap to correct.
  if (locState?.from === 'pick' && !prefill) {
    return (
      <>
        {entryChoiceScreen}
        <PlantPickerSheet
          onClose={() => navigate(-1)}
          onSelectPlant={(plant) =>
            navigate(location.pathname, { state: { from: 'pick', prefill: plant, fromMap: fromMapState } })
          }
          onCustomName={(name) =>
            navigate(location.pathname, { state: { from: 'manual', prefill: name ? { name } : undefined, fromMap: fromMapState } })
          }
        />
      </>
    )
  }

  return (
    <div key={remountKey}>
      {/* ——— Masthead ——— */}
      <header className="border-b border-border">
        <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-12 pt-6 sm:pt-8 pb-5">
          <div className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.15em] sm:tracking-[0.22em] text-text-muted flex items-center gap-3 sm:gap-3.5 mb-3 sm:mb-3.5">
            <span className="text-primary">{SECTION_MARKER}</span>
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
          speciesCount={PICKABLE_SPECIES_COUNT}
          onBrowseSpecies={() =>
            navigate(location.pathname, { state: { from: 'pick', fromMap: fromMapState } })
          }
          onIdentifyWithPhoto={() => navigate('/identify')}
          selectedSpeciesName={
            prefill
              ? isIdentifyPrefill(prefill)
                ? undefined // identify case: name shown in photo route instead
                : 'latinName' in prefill
                  ? displayPlantName(prefill as LocalPlant, t.locale)
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
              ? (() => {
                  const commit = prefill as import('../types').IdentifyCommitResult
                  const suggested = commit.name_suggested ?? commit.name_nl_suggested
                  const isEnglish = t.locale.toLowerCase().startsWith('en')
                  return {
                    topMatch: {
                      scientific_name: commit.scientific_name,
                      common_names_nl: isEnglish ? [] : [suggested],
                      common_names_en: isEnglish ? [suggested] : [],
                      confidence: 1,
                      species_id: commit.species_id,
                      thumbnail_url: null,
                    },
                  }
                })()
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
          {/* Bijnaam — the decorative random "record code" that used to sit
              beside this field is gone: it re-rolled Math.random() on every
              render, so it changed on each keystroke, and was never stored. */}
          <FormRow label={t.addPlant.labelNickname} description={t.addPlant.labelNicknameDesc}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.addPlant.placeholderNickname}
              required
              className="w-full rounded-lg border border-border bg-paper px-3 py-2 font-heading text-sm text-text placeholder:text-text-muted/50 focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
            />
          </FormRow>

          {/* Species. One editable field — the read-only twin next to it showed
              the same Latin name on the pick path and stayed permanently empty
              on the manual path. The prefill's Latin name, when we have one, is
              shown as a caption instead. */}
          <FormRow label={t.addPlant.labelSpecies} description={t.addPlant.labelSpeciesDesc}>
            <input
              type="text"
              value={species}
              onChange={(e) => setSpecies(e.target.value)}
              placeholder={t.addPlant.placeholderSpecies}
              className="w-full rounded-lg border border-border bg-paper px-3 py-2 font-heading text-sm text-text placeholder:text-text-muted/50 focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
            />
            {latinName && latinName !== species && (
              <p className="mt-1.5 font-heading italic text-xs text-text-soft">
                {t.addPlant.speciesFromPrefill(latinName)}
              </p>
            )}
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
                setPickedPos(null) // placement is per-map; a new map clears it
              }}
              emptyLabel={t.addPlant.zoneEmpty}
              advice={zoneAdvice}
            />
          </FormRow>

          {/* Tap-to-place on the selected map — opt-in; without a tap we fall
              back to a random spot on submit. Shown whenever a map is picked. */}
          {selectedZoneId && (() => {
            const placedMap = maps.find(m => String(m.id) === selectedZoneId)
            return placedMap ? (
              <FormRow label={t.addPlant.labelPlace} description={t.addPlant.labelPlaceDesc}>
                <PlacementPicker
                  map={placedMap}
                  value={pickedPos}
                  onChange={setPickedPos}
                />
              </FormRow>
            ) : null
          })()}

          {/* Light measurement — deliberately outside DETAILS: sun_requirement
              drives garden fit and the sun overlays, and a manual add that
              never opens DETAILS used to ship without it entirely. */}
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

          {showDetails && (<>
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
        <Card
          eyebrow={t.addPlant.secCare}
          title={t.addPlant.secCareTitle}
          subtitle={t.addPlant.waterAdviceSubtitle}
        >
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-bold text-primary">
                {WATER_FORMULA}
              </span>
              <div className="min-w-0">
                <h3 className="font-heading text-sm font-semibold text-text">
                  {t.addPlant.labelWatering}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-text-soft">
                  {waterAdvice.source === 'species'
                    ? t.addPlant.waterAdviceSpecies(waterAdvice.intervalDays)
                    : t.addPlant.waterAdviceProvisional(waterAdvice.intervalDays)}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-text-muted">
                  {t.addPlant.waterAdviceEditable}
                </p>
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-text-muted">
            {t.addPlant.optionalCareAfterCreate}
          </p>
        </Card>

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

            {/* Sown date — a native date picker like Acquired above. It used to
                be free text parsed as DD-MM-YYYY, so anything unparseable was
                dropped without a word. */}
            <FormRow label={t.addPlant.labelSown} description={t.addPlant.labelSownDesc}>
              <input
                type="date"
                value={sownDateInput}
                onChange={(e) => setSownDateInput(e.target.value)}
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

        {/* Submit error — the form stays put and keeps everything typed. */}
        {submitError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-overdue/10 border border-overdue/30 text-sm text-overdue"
          >
            <Glyph name="alert" size={16} className="shrink-0 mt-0.5" />
            <span>{submitError}</span>
          </div>
        )}

        {/* Action Bar */}
        <div className="sticky bottom-0 bg-bg/95 backdrop-blur border-t border-border mt-6 -mx-4 sm:-mx-6 lg:-mx-12 px-4 sm:px-6 lg:px-12 py-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleCancel}
            className="font-heading font-medium text-sm px-3 py-2.5 rounded-xl border border-border text-text-soft hover:text-text hover:border-text-muted transition-colors shrink-0"
          >
            {t.addPlant.cancel}
          </button>
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="font-heading font-bold text-sm px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-dark text-white disabled:opacity-40 active:scale-[0.98] transition-all shadow-sm shrink-0"
          >
            {submitting ? (
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
                <span className="truncate">{progressMsg || t.addPlant.submitting}</span>
              </span>
            ) : (
              // Just the verb. Appending the nickname pushed the label past the
              // button's width, so long names read as "Toevoegen — Monstera de…".
              t.addPlant.title
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
