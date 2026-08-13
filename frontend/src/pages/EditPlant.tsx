import { useState, useEffect, useMemo, useRef } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useFloreren } from '../store/useFloreren'
import { plants as plantsApi, care as careApi, icons as iconsApi, objects as objectsApi } from '../api/client'
import type { MapObject, Plant } from '../types'
import Glyph from '../components/ui/Glyph'
import { isoToDisplay } from '../utils/dateFormat'
import { compressImage } from '../utils/compressImage'
import { useT } from '../context/LanguageContext'
import IconPicker from '../components/IconPicker'
import Card from '../components/ui/Card'
import FormRow from '../components/ui/FormRow'
import TileGrid from '../components/ui/TileGrid'
import TileIcon from '../components/ui/TileIcon'
import SegmentedControl from '../components/ui/SegmentedControl'
import ZonePicker from '../components/add/ZonePicker'
import { sunRequirementTiles } from '../components/add/sunRequirementTiles'
import PotDetailsFields from '../components/add/PotDetailsFields'
import SpeciesPicker from '../components/plant/SpeciesPicker'
import PageMasthead from '../components/ui/PageMasthead'
import { buildEditPlantPayload, resolveFormType } from './editPlantPayload'
import { normalizeSunRequirement } from '../utils/plantSunRequirements'
import { EDIT_PLANT_CARE_HASH, PLANT_PASSPORT_ANCHORS } from '../utils/plantPassportLinks'
import { zoneAdviceKey } from './addPlant/prefill'
import { useIsMobile } from '../hooks/useIsMobile'
import { useSunAt } from '../hooks/useSunAt'
import { resolveIconUrl } from '../utils/icons'
import CareScheduleEditor from '../components/plant/CareScheduleEditor'
import {
  buildCareScheduleSyncPayload,
  buildScheduleEditorState,
  careEnvironmentForPlant,
  editableCareTypesForEnvironment,
} from './editPlantCareSchedules'
import type { EditableCareType, ScheduleEditorState } from './editPlantCareSchedules'

export default function EditPlant() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const t = useT()
  const { maps, plants, updatePlant, uploadPhoto } = useFloreren()
  const plantId = Number(id)

  const [plant, setPlant] = useState<Plant | null>(null)
  const [loading, setLoading] = useState(true)
  // Below 1024px the form grid is single-column and the cards collapse, so all
  // four headings stay on screen; from lg up they all sit open beside the
  // preview rail. This replaces a Basis / Details pill that read like a wizard
  // step but was a filter — a phone user editing a pot size had to know it
  // lived under "Details" (#886 §4.4).
  const isNarrow = useIsMobile(1023)
  // The passport's "manage care" link lands here; on a phone the care card is
  // collapsed by default, so open it when that is where the user was heading.
  const openCareCard = !isNarrow || window.location.hash === EDIT_PLANT_CARE_HASH

  // Build zone list from the user's actual maps
  const zoneList = useMemo(() => maps.map(m => ({
    id: String(m.id),
    name: m.name,
    description: m.map_type === 'indoor' ? t.maps.indoor : t.maps.outdoor,
    plantCount: plants.filter(p => p.map_id === m.id).length,
    isIndoor: m.map_type === 'indoor',
  })), [maps, plants, t.maps.indoor, t.maps.outdoor])

  // Basic fields
  const [name, setName] = useState('')
  const [species, setSpecies] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  // Identity card
  const [formType, setFormType] = useState('pot')
  // Mulch (moisture-retaining top layer, #799): only meaningful outdoors; the
  // pressure engine ignores it for indoor plants.
  const [mulch, setMulch] = useState(false)
  const [phase, setPhase] = useState('established')
  const [quantity, setQuantity] = useState(1)
  const [acquiredDateInput, setAcquiredDateInput] = useState('')

  // Container + provenance (#823 columns). Collected by Add Plant since #823
  // and, until #886, editable nowhere — a repot could be dated but the pot
  // itself could never be corrected.
  const [potMaterial, setPotMaterial] = useState('terracotta')
  const [potDiameter, setPotDiameter] = useState('')
  const [potHeight, setPotHeight] = useState('')
  const [hasDrainage, setHasDrainage] = useState(false)
  const [substrate, setSubstrate] = useState<string[]>([])
  const [acquiredFrom, setAcquiredFrom] = useState('')

  // Placement card
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)
  const [sunRequirement, setSunRequirement] = useState<string | null>(null)
  // "This spot gives" — the other half of the sun-fit comparison. Editable in
  // the passport and the quick sheet but not here, so the form showed the
  // plant's requirement with no sight of what it is judged against (#886 §4.3).
  const [measuredSun, setMeasuredSun] = useState<number | null>(null)
  // Which container object the plant sits in, if any. It decides the care
  // environment (outdoor_container vs outdoor_ground) and therefore which care
  // types the form offers and what they default to — but it could only be set
  // by dragging the plant onto a container on the map (#886 §4.3).
  const [containerId, setContainerId] = useState<number | null>(null)
  const [containers, setContainers] = useState<MapObject[]>([])

  // Advice follows the sun requirement we know, and stays silent when we know
  // nothing — the same fix as AddPlant, where one fixed "prefers a bright spot
  // without direct sunlight" line was shown for every species.
  const zoneAdvice = useMemo(() => {
    const key = zoneAdviceKey(sunRequirement)
    if (!key) return undefined
    const subject = name.trim() || species.trim()
    return subject ? t.addPlant.zoneAdvice[key](subject) : undefined
  }, [sunRequirement, name, species, t])

  // Care
  const [schedules, setSchedules] = useState<ScheduleEditorState | null>(null)

  // Album
  const [iconKey, setIconKey] = useState<string | null>(null)
  const [sownDateInput, setSownDateInput] = useState('')
  const [notes, setNotes] = useState('')

  // Legacied fields
  const [lastRepottedInput, setLastRepottedInput] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Icon catalog for potted/bare variant switching
  const [iconCatalog, setIconCatalog] = useState<{ id: string; form?: string; variant_of?: string }[]>([])
  const baseIconRef = useRef<string | null>(null)
  const schedulePlantIdRef = useRef<number | null>(null)
  const iconLookup = useMemo(() => {
    const bareBases = new Set<string>()
    const pottedVariants = new Map<string, string>()
    for (const icon of iconCatalog) {
      if (icon.form === 'bare' && icon.variant_of) bareBases.add(icon.variant_of)
      if (icon.form === 'potted' && icon.variant_of) pottedVariants.set(icon.variant_of, icon.id)
    }
    return { bareBases, pottedVariants }
  }, [iconCatalog])

  // Modelled sun hours at the plant's spot, shown beside the measured override
  // so "this spot gives" has something to default to. Null for an unplaced or
  // indoor plant, where the light engine has nothing to model.
  const sunCoord = useMemo(
    () => (plant?.map_x != null && plant?.map_y != null
      ? { x: plant.map_x, y: plant.map_y }
      : null),
    [plant?.map_x, plant?.map_y],
  )
  const plantMap = useMemo(
    () => maps.find(map => map.id === plant?.map_id) ?? null,
    [maps, plant?.map_id],
  )
  const { sunHours: modelledSunHours } = useSunAt(sunCoord, new Date().getMonth() + 1, plantMap)


  // Load plant data
  useEffect(() => {
    async function load() {
      try {
        const p = await plantsApi.get(plantId)
        setPlant(p)
        setName(p.name)
        setSpecies(p.species ?? '')
        setPhase(p.phase ?? 'established')
        setQuantity(p.quantity ?? 1)
        setIconKey(p.icon_key ?? null)
        setAcquiredDateInput(p.acquired_date ? isoToDisplay(p.acquired_date) : '')
        setSownDateInput(p.sown_date ? isoToDisplay(p.sown_date) : '')
        setLastRepottedInput(p.last_repotted ? isoToDisplay(p.last_repotted) : '')
        setNotes(p.notes ?? '')
        setSunRequirement(normalizeSunRequirement(p.sun_requirement))
        setMeasuredSun(p.measured_sun_hours)
        setContainerId(p.container_id)
        // Resolved against the icon in the catalog effect below, which is the
        // half of this that map placement keeps current.
        setFormType(p.form_type ?? 'pot')
        setMulch(p.mulch ?? false)
        setPotMaterial(p.pot_material ?? 'terracotta')
        // pot_size_cm is the canonical container size and pot_diameter_cm the
        // form's field; create_plant seeds the former from the latter, so fall
        // back to it for plants added before the diameter input existed.
        setPotDiameter(String(p.pot_diameter_cm ?? p.pot_size_cm ?? ''))
        setPotHeight(String(p.pot_height_cm ?? ''))
        setHasDrainage(p.has_drainage ?? false)
        setSubstrate(p.substrate ?? [])
        setAcquiredFrom(p.acquired_from ?? '')
        setSelectedZoneId(p.map_id ? String(p.map_id) : null)
        if (p.photo_path) setPhotoPreview(p.photo_path)
      } catch {
        navigate('/plants')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [plantId, navigate])

  // Maps can arrive after the plant. Initialise schedule state once both sides
  // are available, without refetching/resetting the rest of the edit form when
  // the maps store refreshes.
  useEffect(() => {
    if (!plant || schedulePlantIdRef.current === plant.id) return
    const initialMap = maps.find(map => map.id === plant.map_id)
    if (plant.map_id != null && !initialMap) return
    setSchedules(buildScheduleEditorState(
      plant,
      careEnvironmentForPlant(plant, initialMap),
    ))
    schedulePlantIdRef.current = plant.id
  }, [plant, maps])

  // Load icon catalog once for potted/bare switching
  useEffect(() => {
    iconsApi.catalog().then(setIconCatalog).catch(() => {})
  }, [])

  // Container objects, for the "which pot is it in" row. A failed load just
  // leaves the row empty — it must never block editing the rest of the form.
  useEffect(() => {
    objectsApi.list()
      .then(all => setContainers(all.filter(o => o.category === 'container' && o.is_active)))
      .catch(() => setContainers([]))
  }, [])

  // Set base icon ref when plant data and catalog are both available, and align
  // the Form tile with the icon's ACTUAL form. The stored form_type can be stale
  // on the potted/bare axis — map placement updates icon_key but never
  // form_type — so trusting it outright would silently flip a bare plant back to
  // potted when the editor opens (part of the potted/bare drift bug). Within the
  // bare half it is the better answer, and resolveFormType keeps it.
  useEffect(() => {
    if (!plant?.icon_key || iconCatalog.length === 0) return
    const entry = iconCatalog.find(e => e.id === plant.icon_key)
    baseIconRef.current = entry?.variant_of ?? plant.icon_key
    const isBare = entry?.form === 'bare' || /_bare$/.test(plant.icon_key)
    setFormType(resolveFormType(plant.form_type, isBare))
  }, [iconCatalog, plant])

  // Switch icon variant when form type or catalog changes
  useEffect(() => {
    const base = baseIconRef.current
    if (!base || iconCatalog.length === 0) return
    const isPotted = formType === 'pot'
    const bareExists = iconLookup.bareBases.has(base)
    const pottedOverride = iconLookup.pottedVariants.get(base)
    if (isPotted) {
      setIconKey(pottedOverride ?? base)
    } else {
      setIconKey(bareExists ? `${base}_bare` : base)
    }
  }, [formType, iconLookup])

  // Revoke old object URL when preview changes or on unmount
  useEffect(() => {
    return () => {
      if (photoPreview && photoPreview.startsWith('blob:')) {
        URL.revokeObjectURL(photoPreview)
      }
    }
  }, [photoPreview])

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      setPhotoFile(file)
      setPhotoPreview(URL.createObjectURL(file))
    }
  }





  function handleIconChange(key: string | null) {
    if (key) {
      const entry = iconCatalog.find(e => e.id === key)
      baseIconRef.current = entry?.variant_of ?? key
    } else {
      baseIconRef.current = null
    }
    setIconKey(key)
  }

  const selectedCareMap = selectedZoneId
    ? maps.find(map => String(map.id) === selectedZoneId)
    : undefined
  // The journal owns this one — it is a `photo` schedule, which
  // sync_care_schedules rejects — so the care card names it and links out
  // rather than offering a toggle that could not save (#886 §4.2).
  const photoReminder = plant?.care_schedules.find(
    cs => cs.care_type === 'photo' && cs.is_active,
  ) ?? null

  // Containers live on a specific map, so only those on the map the plant is
  // placed on are real choices.
  const containersOnMap = useMemo(() => {
    const mapId = selectedZoneId ? Number(selectedZoneId) : null
    return mapId == null ? [] : containers.filter(c => c.map_id === mapId)
  }, [containers, selectedZoneId])

  // Follows the container the user has picked, not the stored one, so the care
  // card visibly re-derives while they are still deciding.
  const careEnvironment = plant
    ? careEnvironmentForPlant({ container_id: containerId }, selectedCareMap)
    : 'outdoor_ground'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !plant || !schedules) return

    setSubmitting(true)
    setSaveError(null)
    try {
      await updatePlant(plantId, buildEditPlantPayload({
        plant,
        maps,
        selectedZoneId,
        name,
        species,
        acquiredDateInput,
        lastRepottedInput,
        notes,
        iconKey,
        formType,
        potMaterial,
        potDiameter,
        potHeight,
        hasDrainage,
        substrate,
        acquiredFrom,
        sunRequirement,
        measuredSun,
        phase: phase as Plant['phase'],
        sownDateInput,
        quantity,
        mulch,
        randomMapPos,
      }))

      // Its own endpoint (it also clears ground_zone_id and re-resolves the
      // potted/bare icon), so only call it when the choice actually changed.
      if (containerId !== (plant.container_id ?? null)) {
        await plantsApi.setContainer(plantId, containerId)
      }

      if (schedules) {
        await careApi.syncSchedules(
          plantId,
          buildCareScheduleSyncPayload(schedules, careEnvironment),
        )
      }

      if (photoFile) {
        const compressed = await compressImage(photoFile)
        await uploadPhoto(plantId, new File([compressed], 'photo.jpg', { type: 'image/jpeg' }))
      }

      navigate(-1)
    } catch (e) {
      // Surface the failure instead of leaving the button silently stuck.
      setSaveError(e instanceof Error && e.message ? e.message : t.editPlant.saveFailed)
    } finally {
      setSubmitting(false)
    }
  }

  function randomMapPos(viewbox: string) {
    const [x0, y0, w, h] = viewbox.split(' ').map(Number)
    const pad = Math.min(w, h) * 0.12
    return {
      x: Math.round((x0 + pad + Math.random() * (w - pad * 2)) * 10) / 10,
      y: Math.round((y0 + pad + Math.random() * (h - pad * 2)) * 10) / 10,
    }
  }

  if (loading || !plant) {
    return (
      <div className="px-4 pt-6 space-y-4">
        <div className="h-8 w-40 bg-surface rounded-lg animate-pulse" />
        <div className="h-12 bg-surface rounded-xl animate-pulse" />
        <div className="h-12 bg-surface rounded-xl animate-pulse" />
        <div className="h-12 bg-surface rounded-xl animate-pulse" />
      </div>
    )
  }

  // ── Desktop preview rail: labels + decorative passport MRZ line ──
  const previewFormLabel: Record<string, string> = {
    pot: t.addPlant.formPot,
    ground: t.addPlant.formGround,
    seedling: t.addPlant.formSeedling,
    tree: t.addPlant.formTree,
  }
  const previewPhaseLabel: Record<string, string> = {
    seed: t.addPlant.phaseSeed,
    sprout: t.addPlant.phaseSprout,
    seedling: t.addPlant.phaseSeedling,
    young: t.addPlant.phaseYoung,
    established: t.addPlant.phaseEstablished,
  }
  const previewSunLabel: Record<string, string> = {
    shade: t.addPlant.lightShade,
    partial_sun: t.addPlant.lightPartial,
    full_sun: t.addPlant.lightFullSun,
  }
  const previewZone = selectedZoneId ? zoneList.find(z => z.id === selectedZoneId) ?? null : null
  const previewMrz = `P<FLO<<${name}<<${species}`
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, '<')
    .padEnd(34, '<')
    .slice(0, 34)



  return (
    <div>
      {/* ——— Masthead — follows the name/species fields live ——— */}
      <PageMasthead
        eyebrow={t.editPlant.title}
        title={name || plant.name}
        accent={species || undefined}
        actions={
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label={t.common.back}
            className="w-9 h-9 rounded-full bg-surface border border-border flex items-center justify-center text-text transition-colors hover:bg-paper"
          >
            ←
          </button>
        }
      />

      {/* ——— Two-column form grid ——— */}
      <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-12 py-6 sm:py-7">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] xl:grid-cols-[1fr_420px] gap-6 lg:gap-8">
          {/* LEFT: form content */}
          <div className="space-y-6 min-w-0">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Photo — mobile row; on desktop the preview rail owns the photo */}
              <label className="card p-4 flex items-center gap-4 cursor-pointer lg:hidden">
                {photoPreview ? (
                  <img src={photoPreview} alt={t.editPlant.previewAlt} className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
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
                collapsible={isNarrow}
                defaultOpen
              >
                {/* Bijnaam */}
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

                {/* Species — autocomplete + an explicit "I don't know", because
                    changing this re-identifies the plant (#866) */}
                <FormRow label={t.addPlant.labelSpecies} description={t.addPlant.labelSpeciesDesc}>
                  <SpeciesPicker
                    value={species}
                    onChange={setSpecies}
                    original={plant.species}
                    placeholder={t.addPlant.placeholderSpecies}
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

                {/* Icon — identity, not archive: it is how the plant is
                    recognised on the map, so it belongs beside its name. The
                    Form tiles pick its potted/bare variant, so they sit here
                    with it rather than three cards away (#886 §4.2). */}
                <FormRow label={t.addPlant.labelIcon} description={t.editPlant.iconDescription}>
                  <IconPicker value={iconKey} onChange={handleIconChange} />
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

              </Card>

              {/* ——— § II · Where it lives ———
                  Every input the care engine reads to pick an environment:
                  map, container, mulch, light, pot. They decide § III, so they
                  sit together and ahead of it. */}
              <Card
                eyebrow={t.addPlant.secPlacement}
                title={t.addPlant.secPlacementTitle}
                subtitle={t.addPlant.secPlacementSubtitle}
                collapsible={isNarrow}
                defaultOpen={false}
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
                    }}
                    advice={zoneAdvice}
                  />
                </FormRow>

                {/* Which container, if any. Only offers containers on the map
                    the plant is actually on — a pot in the greenhouse is not a
                    choice for a plant in the living room. */}
                {containersOnMap.length > 0 && (
                  <FormRow
                    label={t.editPlant.containerLabel}
                    description={t.editPlant.containerDescription}
                  >
                    <select
                      value={containerId ?? ''}
                      onChange={(e) => setContainerId(e.target.value ? Number(e.target.value) : null)}
                      className="w-full rounded-lg border border-border bg-paper px-3 py-2 font-heading text-sm text-text focus:border-primary/40 focus:ring-2 focus:ring-primary/20 sm:w-72"
                    >
                      <option value="">{t.editPlant.containerNone}</option>
                      {containersOnMap.map(c => (
                        <option key={c.id} value={c.id}>{c.label || c.name}</option>
                      ))}
                    </select>
                  </FormRow>
                )}

                {/* Two rows, not one. The sun-fit verdict compares what the
                    plant WANTS against what the spot GIVES; the form used to
                    show only the first, under copy describing the second. */}
                <FormRow label={t.addPlant.labelLight} description={t.addPlant.labelLightDesc}>
                  <TileGrid
                    options={sunRequirementTiles(t)}
                    value={sunRequirement}
                    onChange={(v) => setSunRequirement(v || null)}
                  />
                </FormRow>

                <FormRow
                  label={t.editPlant.measuredSunLabel}
                  description={t.editPlant.measuredSunDescription}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={12}
                      step={0.5}
                      inputMode="decimal"
                      value={measuredSun ?? ''}
                      onChange={(e) => {
                        const v = Number.parseFloat(e.target.value)
                        setMeasuredSun(Number.isFinite(v) ? Math.min(12, Math.max(0, v)) : null)
                      }}
                      placeholder={modelledSunHours != null ? modelledSunHours.toFixed(1) : '—'}
                      className="w-24 rounded-lg border border-border bg-paper px-3 py-2 text-right font-mono text-sm text-text focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                    />
                    <span className="text-xs text-text-muted">{t.plantQuickSheet.sunHoursUnit}</span>
                    {measuredSun != null && (
                      <button
                        type="button"
                        onClick={() => setMeasuredSun(null)}
                        className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-text-muted hover:text-text"
                      >
                        {t.plantQuickSheet.sunMeasureClear}
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-text-muted">
                    {modelledSunHours != null
                      ? t.editPlant.measuredSunEstimate(modelledSunHours.toFixed(1))
                      : t.editPlant.measuredSunNoEstimate}
                  </p>
                </FormRow>

                {/* Mulch — moisture-retaining top layer; lowers outdoor water
                    pressure. Hidden indoors, where the pressure engine ignores
                    it entirely, so the form stops asking a question that has no
                    effect (#886). */}
                {careEnvironment !== 'indoor' && (
                <FormRow label={t.editPlant.mulchLabel} description={t.editPlant.mulchDescription}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={mulch}
                    aria-label={t.editPlant.mulchLabel}
                    onClick={() => setMulch(v => !v)}
                    className={`relative h-6 w-11 rounded-full transition-colors ${
                      mulch ? 'bg-primary' : 'bg-border'
                    }`}
                  >
                    <span
                      className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                        mulch ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </FormRow>
                )}

                {/* Pot + substrate — the container detail Add Plant collects.
                    Until #886 none of it was editable, so a repot could be
                    dated here but the pot itself never corrected. */}
                <PotDetailsFields
                  t={t}
                  value={{ potMaterial, potDiameter, potHeight, hasDrainage, substrate }}
                  onChange={(patch) => {
                    if (patch.potMaterial !== undefined) setPotMaterial(patch.potMaterial)
                    if (patch.potDiameter !== undefined) setPotDiameter(patch.potDiameter)
                    if (patch.potHeight !== undefined) setPotHeight(patch.potHeight)
                    if (patch.hasDrainage !== undefined) setHasDrainage(patch.hasDrainage)
                    if (patch.substrate !== undefined) setSubstrate(patch.substrate)
                  }}
                />

              </Card>

              {/* ——— § III · Care Card ——— */}
              <Card
                eyebrow={t.addPlant.secCare}
                title={t.addPlant.secCareTitle}
                subtitle={t.addPlant.secCareSubtitle}
                collapsible={isNarrow}
                defaultOpen={openCareCard}
              >
                {/* Name the environment these toggles came from, so the
                    dependency on § II is visible rather than mysterious. */}
                <p className="rounded-xl bg-surface px-3 py-2 text-xs text-text-muted">
                  {t.editPlant.careEnvironmentNote(
                    t.editPlant.careEnvironments[careEnvironment],
                    editableCareTypesForEnvironment(careEnvironment).length,
                  )}
                </p>
                {photoReminder && (
                  <div className="flex items-center gap-3 rounded-xl border border-border bg-paper px-3 py-2.5">
                    <span className="text-text-muted"><Glyph name="camera" size={18} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="font-heading text-sm font-medium text-text">{t.careTypes.photo}</p>
                      <p className="text-xs text-text-muted">
                        {t.plantDetail.xDays.replace('{n}', String(photoReminder.interval_days))}
                      </p>
                    </div>
                    <Link
                      to={`/plants/${plantId}#${PLANT_PASSPORT_ANCHORS.photoJournal}`}
                      className="shrink-0 text-xs font-semibold text-primary no-underline"
                    >
                      {t.editPlant.photoReminderManage}
                    </Link>
                  </div>
                )}
                {schedules && (
                  <CareScheduleEditor
                    environment={careEnvironment}
                    intervalLabel={t.editPlant.everyLabel}
                    daysLabel={t.editPlant.daysLabel}
                    rhythmLabel={t.editPlant.careRhythmLabel}
                    rhythmDescription={t.editPlant.careRhythmDescription}
                    labels={t.careTypes as Record<EditableCareType, string>}
                    state={schedules}
                    onChange={setSchedules}
                  />
                )}
              </Card>

              {/* ——— § IV · History & notes ———
                  Dates and free text. "Album" used to hold the sown date while
                  "Placement" held last-repotted; neither is where a user looks
                  for them (#886 §4.2). */}
              <Card
                eyebrow={t.editPlant.historyEyebrow}
                title={t.editPlant.historyTitle}
                subtitle={t.editPlant.historySubtitle}
                collapsible={isNarrow}
                defaultOpen={false}
              >
                {/* Acquisition */}
                <FormRow label={t.addPlant.labelAcquired} description={t.editPlant.acquiredDescription}>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={acquiredDateInput}
                    onChange={(e) => setAcquiredDateInput(e.target.value)}
                    placeholder="DD-MM-YYYY"
                    className="w-full sm:w-44 rounded-lg border border-border bg-paper px-3 py-2 font-heading text-sm text-text placeholder:text-text-muted/50 focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                  />
                </FormRow>

                {/* Where it came from */}
                <FormRow label={t.editPlant.acquiredFromLabel} description={t.editPlant.acquiredFromDescription}>
                  <input
                    type="text"
                    value={acquiredFrom}
                    onChange={(e) => setAcquiredFrom(e.target.value)}
                    placeholder={t.editPlant.acquiredFromPlaceholder}
                    className="w-full rounded-lg border border-border bg-paper px-3 py-2 font-heading text-sm text-text placeholder:text-text-muted/50 focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                  />
                </FormRow>
                {/* Last repotted */}
                <FormRow label={t.editPlant.lastRepottedLabel} description={t.editPlant.lastRepottedDescription}>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={lastRepottedInput}
                    onChange={(e) => setLastRepottedInput(e.target.value)}
                    placeholder="DD-MM-YYYY"
                    className="w-full sm:w-44 rounded-lg border border-border bg-paper px-3 py-2 font-heading text-sm"
                  />
                </FormRow>
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

              {/* Action Bar */}
              {saveError && (
                <p className="text-sm text-fiery-red mt-4" role="alert">{saveError}</p>
              )}
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
                  disabled={submitting || !name.trim() || !schedules}
                  className="font-heading font-bold text-sm px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-dark text-white disabled:opacity-40 active:scale-[0.98] transition-all shadow-sm max-w-[260px] truncate"
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {t.editPlant.saving}
                    </span>
                  ) : (
                    name ? `${t.common.save} — ${name}` : t.common.save
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* RIGHT: live passport preview (desktop only) */}
          <aside className="hidden lg:block min-w-0">
            <div className="sticky top-6">
              <p className="mb-3 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
                <span className="h-px w-6 flex-none bg-border" />
                {t.editPlant.previewEyebrow}
                <span className="h-px min-w-[24px] max-w-[80px] flex-1 bg-border" />
              </p>
              <div className="overflow-hidden rounded-2xl border border-border bg-paper">
                {/* Photo — click to change, mirrors the passport hero */}
                <label className="group relative block cursor-pointer">
                  {photoPreview ? (
                    <img src={photoPreview} alt={t.editPlant.previewAlt} className="h-64 w-full object-cover" />
                  ) : (
                    <div
                      className="flex h-64 w-full flex-col items-center justify-center gap-2 text-text-muted"
                      style={{ background: 'linear-gradient(145deg, #FDFAF1 0%, #F4EEDB 100%)' }}
                    >
                      <Glyph name="camera" size={28} />
                      <span className="text-xs">{t.editPlant.addPhoto}</span>
                    </div>
                  )}
                  <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <Glyph name="camera" size={13} />
                    {t.editPlant.changePhoto}
                  </span>
                  <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
                </label>

                <div className="border-t border-border-soft px-5 py-4">
                  <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted">
                    {`${t.plantDetail.mastheadEyebrow} · #${String(plant.id).padStart(3, '0')}`}
                  </p>
                  <div className="mt-1.5 flex items-start justify-between gap-3">
                    <p className="min-w-0 font-heading text-2xl font-medium leading-tight text-text">
                      {name || '—'}
                      {species && <> <em className="font-normal italic text-primary">{species}</em></>}.
                    </p>
                    {iconKey && resolveIconUrl(iconKey) && (
                      <img src={resolveIconUrl(iconKey)!} alt="" className="h-11 w-11 shrink-0 object-contain" />
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {[
                      previewPhaseLabel[phase],
                      previewFormLabel[formType],
                      quantity > 1 ? `× ${quantity}` : null,
                    ].filter(Boolean).map((chip, i) => (
                      <span key={i} className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-text-soft">
                        {chip}
                      </span>
                    ))}
                  </div>

                  <div className="mt-4 space-y-1.5 border-t border-dashed border-border pt-3 text-xs text-text-muted">
                    {previewZone && (
                      <p className="flex items-center gap-1.5">
                        <Glyph name="pin" size={12} className="shrink-0" />
                        {previewZone.name} · {previewZone.description}
                      </p>
                    )}
                    {sunRequirement && previewSunLabel[sunRequirement] && (
                      <p className="flex items-center gap-1.5">
                        <Glyph name="sun" size={12} className="shrink-0" />
                        {previewSunLabel[sunRequirement]}
                      </p>
                    )}
                    {schedules?.water.enabled && (
                      <p className="flex items-center gap-1.5">
                        <Glyph name="droplet" size={12} className="shrink-0" />
                        {t.careTypes.water} · {t.plantDetail.xDays.replace('{n}', String(schedules.water.days))}
                      </p>
                    )}
                    {acquiredDateInput && (
                      <p className="flex items-center gap-1.5">
                        <Glyph name="calendar" size={12} className="shrink-0" />
                        {acquiredDateInput}
                      </p>
                    )}
                  </div>

                  {notes && (
                    <p className="mt-3 line-clamp-2 font-heading text-[13px] italic leading-snug text-text-soft">
                      "{notes}"
                    </p>
                  )}

                  <p aria-hidden="true" className="mt-4 select-none overflow-hidden whitespace-nowrap font-mono text-[11px] leading-none tracking-[0.24em] text-text-muted/40">
                    {previewMrz}
                  </p>
                </div>
              </div>
            </div>
          </aside>

        </div>
      </div>
    </div>
  )
}
