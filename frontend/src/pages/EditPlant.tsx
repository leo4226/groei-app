import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useFloreren } from '../store/useFloreren'
import { plants as plantsApi, care as careApi } from '../api/client'
import type { Plant, CareType } from '../types'
import { CARE_TYPE_INFO } from '../types'
import { displayToIso, isoToDisplay } from '../utils/dateFormat'
import { compressImage } from '../utils/compressImage'
import { useT } from '../context/LanguageContext'
import IconPicker from '../components/IconPicker'
import Card from '../components/ui/Card'
import FormRow from '../components/ui/FormRow'
import TileGrid from '../components/ui/TileGrid'
import SegmentedControl from '../components/ui/SegmentedControl'
import ZonePicker from '../components/add/ZonePicker'
import FrequencySlider from '../components/add/FrequencySlider'

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

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      setPhotoFile(file)
      setPhotoPreview(URL.createObjectURL(file))
    }
  }





  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    setSubmitting(true)
    try {
      // Use the actual map the user selected in the ZonePicker
      const placedMap = selectedZoneId ? maps.find(m => String(m.id) === selectedZoneId) : undefined
      const mapPos = placedMap ? randomMapPos(placedMap.viewbox) : undefined

      await updatePlant(plantId, {
        name: name.trim(),
        species: species.trim() || null,
        location_id: placedMap?.id ?? null,
        map_id: placedMap?.id ?? null,
        map_x: mapPos?.x ?? null,
        map_y: mapPos?.y ?? null,
        pot_size_cm: null, // keep existing
        acquired_date: displayToIso(acquiredDateInput) || null,
        last_repotted: displayToIso(lastRepottedInput) || null,
        notes: notes.trim() || null,
        icon_key: iconKey,
        sun_requirement: sunRequirement ? (SUN_TILE_TO_DB[sunRequirement] ?? sunRequirement) : null,
        phase: phase as any,
        sown_date: displayToIso(sownDateInput) || null,
        plant_type: formType,
      })

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
      <header className="border-b border-border">
        <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-12 pt-6 sm:pt-8 pb-5">
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => navigate(-1)}
              className="w-9 h-9 rounded-full bg-surface border border-border flex items-center justify-center text-text"
            >
              ←
            </button>
            <h1 className="text-2xl font-extrabold">{t.editPlant.title}</h1>
          </div>
          <div className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.15em] sm:tracking-[0.22em] text-text-muted flex items-center gap-3 sm:gap-3.5 mb-3 sm:mb-3.5">
            <span className="text-primary">§</span>
            <span>{plant.name}</span>
            <span className="hidden sm:block flex-1 h-px bg-border max-w-[80px]" />
          </div>
          <h1 className="font-heading font-bold text-2xl sm:text-3xl mt-1">
            {plant.name}
          </h1>
          {plant.species && (
            <p className="font-heading italic text-base sm:text-lg text-text-soft mt-3 sm:mt-3.5 max-w-[540px] leading-[1.45]">
              {plant.species}
            </p>
          )}
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

      {/* ——— Two-column form grid ——— */}
      <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-12 py-6 sm:py-7">
        <div className="flex flex-col gap-6 lg:gap-8">
          {/* LEFT: form content */}
          <div className="space-y-6 max-w-2xl mx-auto w-full">
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
                      value={plant.species ?? ''}
                      className="w-full rounded-lg border border-border bg-paper px-3 py-2 font-heading italic text-sm text-text-soft"
                      placeholder={t.addPlant.placeholderSpeciesLatin}
                    />
                  </div>
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
              {!showDetails ? (
                <Card
                  eyebrow={t.addPlant.secCare}
                  title={t.addPlant.secCareTitle}
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
                    <IconPicker value={iconKey} onChange={setIconKey} />
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
