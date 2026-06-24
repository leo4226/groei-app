import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useFloreren } from '../store/useFloreren'
import { plants as plantsApi, care as careApi, icons as iconsApi } from '../api/client'
import type { Plant, CareType } from '../types'
import { CARE_TYPE_INFO } from '../types'
import { isoToDisplay } from '../utils/dateFormat'
import { compressImage } from '../utils/compressImage'
import { useT } from '../context/LanguageContext'
import IconPicker from '../components/IconPicker'
import Card from '../components/ui/Card'
import FormRow from '../components/ui/FormRow'
import TileGrid from '../components/ui/TileGrid'
import SegmentedControl from '../components/ui/SegmentedControl'
import ZonePicker from '../components/add/ZonePicker'
import FrequencySlider from '../components/add/FrequencySlider'
import PageMasthead from '../components/ui/PageMasthead'
import { buildEditPlantPayload, SUN_DB_TO_TILE } from './editPlantPayload'

/** Build initial schedules map from the plant's existing care_schedules. */
function buildSchedulesFromPlant(plant: Plant): Record<CareType, { enabled: boolean; days: number }> {
  const initial: Record<string, { enabled: boolean; days: number }> = {}
  for (const [type, info] of Object.entries(CARE_TYPE_INFO)) {
    if (type === 'photo') continue // photo reminder managed from PlantDetail (groeidagboek)
    const cs = plant.care_schedules?.find(s => s.care_type === type && s.is_active)
    initial[type] = {
      enabled: !!cs,
      days: cs?.interval_days ?? info.defaultIndoor,
    }
  }
  return initial as Record<CareType, { enabled: boolean; days: number }>
}

export default function EditPlant() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const t = useT()
  const { maps, plants, updatePlant, uploadPhoto } = useFloreren()
  const plantId = Number(id)

  const [plant, setPlant] = useState<Plant | null>(null)
  const [loading, setLoading] = useState(true)
  const [showDetails, setShowDetails] = useState(false)

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
  const [acquiredDateInput, setAcquiredDateInput] = useState('')

  // Placement card
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)
  const [sunRequirement, setSunRequirement] = useState<string | null>(null)

  // Care
  const [schedules, setSchedules] = useState<Record<CareType, { enabled: boolean; days: number }>>(
    {} as Record<CareType, { enabled: boolean; days: number }>
  )

  // Album
  const [iconKey, setIconKey] = useState<string | null>(null)
  const [sownDateInput, setSownDateInput] = useState('')
  const [notes, setNotes] = useState('')

  // Legacied fields
  const [lastRepottedInput, setLastRepottedInput] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const origWaterSchedule = useRef<{id: number; days: number} | null>(null)

  // Icon catalog for potted/bare variant switching
  const [iconCatalog, setIconCatalog] = useState<{ id: string; form?: string; variant_of?: string }[]>([])
  const baseIconRef = useRef<string | null>(null)
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
        setIconKey(p.icon_key ?? null)
        setAcquiredDateInput(p.acquired_date ? isoToDisplay(p.acquired_date) : '')
        setSownDateInput(p.sown_date ? isoToDisplay(p.sown_date) : '')
        setLastRepottedInput(p.last_repotted ? isoToDisplay(p.last_repotted) : '')
        setNotes(p.notes ?? '')
        setSunRequirement(p.sun_requirement ? (SUN_DB_TO_TILE[p.sun_requirement] ?? p.sun_requirement) : null)
        setFormType(p.plant_type ?? 'pot')
        setSelectedZoneId(p.map_id ? String(p.map_id) : null)
        setSchedules(buildSchedulesFromPlant(p))
        // Remember original water schedule for change detection
        const waterSched = p.care_schedules?.find(s => s.care_type === 'water' && s.is_active)
        if (waterSched) origWaterSchedule.current = { id: waterSched.id, days: waterSched.interval_days }
        if (p.photo_path) setPhotoPreview(p.photo_path)
      } catch {
        navigate('/plants')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [plantId, navigate])

  // Load icon catalog once for potted/bare switching
  useEffect(() => {
    iconsApi.catalog().then(setIconCatalog).catch(() => {})
  }, [])

  // Set base icon ref when plant data and catalog are both available
  useEffect(() => {
    if (!plant?.icon_key || iconCatalog.length === 0) return
    const entry = iconCatalog.find(e => e.id === plant.icon_key)
    baseIconRef.current = entry?.variant_of ?? plant.icon_key
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !plant) return

    setSubmitting(true)
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
        formType,
        randomMapPos,
      }))

      // PATCH water schedule interval if changed
      const newWaterDays = schedules.water?.days
      if (origWaterSchedule.current && newWaterDays && newWaterDays !== origWaterSchedule.current.days) {
        await careApi.updateScheduleInterval(origWaterSchedule.current.id, newWaterDays)
      }

      if (photoFile) {
        const compressed = await compressImage(photoFile)
        await uploadPhoto(plantId, new File([compressed], 'photo.jpg', { type: 'image/jpeg' }))
      }

      navigate(-1)
    } catch {
      // Error handled by store
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



  return (
    <div>
      {/* ——— Masthead ——— */}
      <PageMasthead
        eyebrow={t.editPlant.title}
        title={plant.name}
        lede={plant.species ?? undefined}
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

      {/* ——— Two-column form grid ——— */}
      <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-12 py-6 sm:py-7">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6 lg:gap-8">
          {/* LEFT: form content */}
          <div className="space-y-6 min-w-0">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Photo */}
              <label className="card p-4 flex items-center gap-4 cursor-pointer">
                {photoPreview ? (
                  <img src={photoPreview} alt={t.editPlant.previewAlt} className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
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
                      { id: 'pot', glyph: '🪴', title: t.addPlant.formPot, subtitle: t.addPlant.formPotSub },
                      { id: 'ground', glyph: '🌱', title: t.addPlant.formGround, subtitle: t.addPlant.formGroundSub },
                      { id: 'seedling', glyph: '🌿', title: t.addPlant.formSeedling, subtitle: t.addPlant.formSeedlingSub },
                      { id: 'tree', glyph: '🌳', title: t.addPlant.formTree, subtitle: t.addPlant.formTreeSub },
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
              {showDetails && (
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
                    advice={species ? t.addPlant.zoneAdvice(species) : undefined}
                  />
                </FormRow>

                {/* Light measurement */}
                <FormRow label={t.addPlant.labelLight} description={t.addPlant.labelLightDesc}>
                  <TileGrid
                    options={[
                      { id: 'dark', title: t.addPlant.lightDark, subtitle: t.addPlant.lightDarkSub, glyph: '🌑' },
                      { id: 'shade', title: t.addPlant.lightShade, subtitle: t.addPlant.lightShadeSub, glyph: '🌒' },
                      { id: 'indirect', title: t.addPlant.lightIndirect, subtitle: t.addPlant.lightIndirectSub, glyph: '🌓' },
                      { id: 'bright', title: t.addPlant.lightBright, subtitle: t.addPlant.lightBrightSub, glyph: '🌔' },
                      { id: 'full-sun', title: t.addPlant.lightFullSun, subtitle: t.addPlant.lightFullSunSub, glyph: '🌕' },
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
                subtitle={showDetails ? t.addPlant.secCareSubtitle : undefined}
              >
                {/* Water gift frequency */}
                <FormRow label={t.addPlant.labelWatering} description={t.addPlant.labelWateringDesc}>
                    <FrequencySlider
                      label={t.addPlant.labelWatering}
                      value={schedules.water?.days ?? CARE_TYPE_INFO.water.defaultIndoor}
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

              {/* ——— § IV · Album Card ——— */}
              {showDetails ? (
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

        </div>
      </div>
    </div>
  )
}
