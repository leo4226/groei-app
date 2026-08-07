import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useFloreren } from '../store/useFloreren'
import { plants as plantsApi, care as careApi, icons as iconsApi } from '../api/client'
import type { Plant } from '../types'
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
import PageMasthead from '../components/ui/PageMasthead'
import { buildEditPlantPayload, SUN_DB_TO_TILE } from './editPlantPayload'
import { zoneAdviceKey } from './addPlant/prefill'
import { useIsMobile } from '../hooks/useIsMobile'
import { resolveIconUrl } from '../utils/icons'
import CareScheduleEditor from '../components/plant/CareScheduleEditor'
import {
  buildCareScheduleSyncPayload,
  buildScheduleEditorState,
  careEnvironmentForPlant,
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
  const [showDetails, setShowDetails] = useState(false)
  // Below 1024px the form grid is single-column (mobile flow with the
  // Basis/Details toggle); from lg up all sections show beside the preview rail.
  const isNarrow = useIsMobile(1023)
  const expanded = showDetails || !isNarrow

  // Build zone list from the user's actual maps
  const zoneList = useMemo(() => maps.map(m => ({
    id: String(m.id),
    name: m.name,
    description: m.map_type === 'indoor' ? 'Binnen' : 'Buiten',
    plantCount: plants.filter(p => p.map_id === m.id).length,
    isIndoor: m.map_type === 'indoor',
  })), [maps, plants])

  // Basic fields
  const [name, setName] = useState('')
  const [species, setSpecies] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  // Identity card
  const [formType, setFormType] = useState('pot')
  const [phase, setPhase] = useState('established')
  const [quantity, setQuantity] = useState(1)
  const [acquiredDateInput, setAcquiredDateInput] = useState('')

  // Placement card
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)
  const [sunRequirement, setSunRequirement] = useState<string | null>(null)

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

  // Derived area from the selected zone

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
        setSunRequirement(p.sun_requirement ? (SUN_DB_TO_TILE[p.sun_requirement] ?? p.sun_requirement) : null)
        // Form only controls the potted/bare icon variant. Its canonical
        // value comes from icon_key in the catalog effect below, never plant_type.
        setFormType('pot')
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

  // Set base icon ref when plant data and catalog are both available, and align
  // the Potted/Bare toggle with the icon's ACTUAL form. plant_type can be stale —
  // map placement updates icon_key but never plant_type — so initialising the
  // toggle from plant_type would silently flip a bare plant back to potted when
  // the editor opens (part of the potted/bare drift bug).
  useEffect(() => {
    if (!plant?.icon_key || iconCatalog.length === 0) return
    const entry = iconCatalog.find(e => e.id === plant.icon_key)
    baseIconRef.current = entry?.variant_of ?? plant.icon_key
    const isBare = entry?.form === 'bare' || /_bare$/.test(plant.icon_key)
    setFormType(isBare ? 'ground' : 'pot')
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
  const careEnvironment = plant
    ? careEnvironmentForPlant(plant, selectedCareMap)
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
        sunRequirement,
        phase: phase as Plant['phase'],
        sownDateInput,
        quantity,
        randomMapPos,
      }))

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
    dark: t.addPlant.lightDark,
    shade: t.addPlant.lightShade,
    indirect: t.addPlant.lightIndirect,
    bright: t.addPlant.lightBright,
    'full-sun': t.addPlant.lightFullSun,
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

      {/* ——— BASIS / DETAILS Toggle — mobile only; desktop shows everything ——— */}
      {isNarrow && (
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
      )}

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
                      value={plant.id ? '#' + String(plant.id).padStart(3, '0') : ''}
                      className="w-full rounded-lg border border-border bg-paper px-3 py-2 font-mono text-xs text-text-muted"
                      placeholder="---"
                    />
                  </div>
                </FormRow>

                {/* Species */}
                <FormRow label={t.addPlant.labelSpecies} description={t.addPlant.labelSpeciesDesc}>
                  <input
                    type="text"
                    value={species}
                    onChange={(e) => setSpecies(e.target.value)}
                    placeholder={t.addPlant.placeholderSpecies}
                    className="w-full rounded-lg border border-border bg-paper px-3 py-2 font-heading text-sm text-text placeholder:text-text-muted/50 focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                  />
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
              </Card>

              {/* ——— § II · Placement Card ——— */}
              {expanded && (
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
                    }}
                    advice={zoneAdvice}
                  />
                </FormRow>

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

                {/* Substrate */}


                {/* Last repotted */}
                <FormRow label={t.editPlant.lastRepottedLabel} description={t.addPlant.labelSownDesc}>
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
              </Card>
              )}

              {/* ——— § III · Care Card ——— */}
              <Card
                eyebrow={t.addPlant.secCare}
                title={t.addPlant.secCareTitle}
                subtitle={expanded ? t.addPlant.secCareSubtitle : undefined}
              >
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

              {/* ——— § IV · Album Card ——— */}
              {expanded ? (
                <Card
                  eyebrow={t.addPlant.secAlbum}
                  title={t.addPlant.secAlbumTitle}
                  subtitle={t.addPlant.secAlbumSubtitle}
                >
                  {/* Icon */}
                  <FormRow label={t.addPlant.labelIcon} description={t.addPlant.labelIconDesc}>
                    <IconPicker value={iconKey} onChange={handleIconChange} />
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
              ) : (
                <div className="card p-4 flex items-center gap-4">
                  <span className="font-mono text-[10px] text-text-muted uppercase tracking-[0.15em]">{t.addPlant.labelIcon}</span>
                  <IconPicker value={iconKey} onChange={setIconKey} />
                </div>
              )}

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
                    {t.plantDetail.mastheadEyebrow} · #{String(plant.id).padStart(3, '0')}
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
