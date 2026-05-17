import { useState, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import type { LocalPlant } from '../data/plants-dataset'
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

const OUTDOOR_KEYWORDS = ['tuin', 'balkon', 'terras', 'buiten', 'kas', 'moestuin']
const isTuinLoc = (name: string) => OUTDOOR_KEYWORDS.some(k => name.toLowerCase().includes(k))

export default function AddPlant() {
  const t = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const prefill = location.state?.prefill as LocalPlant | { name: string } | undefined
  const isFromDatabase = !!(prefill && 'latinName' in prefill)
  const { locations, maps, addPlant, uploadPhoto } = useFloreren()

  const [name, setName] = useState(
    prefill
      ? 'latinName' in prefill
        ? prefill.dutchName
        : prefill.name
      : ''
  )
  const [species, setSpecies] = useState(
    prefill && 'latinName' in prefill ? prefill.latinName : ''
  )
  const [locationId, setLocationId] = useState<number | undefined>()
  const [potSize, setPotSize] = useState('')
  const [acquiredDate, setAcquiredDate] = useState('')
  const [notes, setNotes] = useState('')
  const [sunRequirement, setSunRequirement] = useState<string | null>(
    prefill && 'latinName' in prefill ? (prefill as LocalPlant).sunRequirement : null
  )
  const [iconKey, setIconKey] = useState<string | null>(
    prefill && 'latinName' in prefill ? (prefill as LocalPlant).iconKey ?? null : null
  )
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [sownDate, setSownDate] = useState('')
  const [phase, setPhase] = useState('established')

  const tuinLocs = useMemo(() => locations.filter(l => isTuinLoc(l.name)), [locations])
  const tuinMap = maps.find(m => ['garden', 'tuin'].some(k => m.name.toLowerCase().includes(k) || (m as any).slug?.toLowerCase().includes(k)))
  const huisMap = maps.find(m => ['huis', 'house', 'indoor'].some(k => m.name.toLowerCase().includes(k) || (m as any).slug?.toLowerCase().includes(k)))

  const currentArea: 'tuin' | 'huis' | null = locationId == null ? null
    : locations.find(l => l.id === locationId && isTuinLoc(l.name)) ? 'tuin'
    : locations.find(l => l.id === locationId) ? 'huis'
    : null

  const isOutdoor = currentArea === 'tuin'

  function randomMapPos(viewbox: string) {
    const [, , w, h] = viewbox.split(' ').map(Number)
    const pad = Math.min(w, h) * 0.12
    return {
      x: Math.round((pad + Math.random() * (w - pad * 2)) * 10) / 10,
      y: Math.round((pad + Math.random() * (h - pad * 2)) * 10) / 10,
    }
  }

  function selectArea(area: 'tuin' | 'huis') {
    if (currentArea === area) { setLocationId(undefined); return }
    const pool = area === 'tuin' ? tuinLocs : huisLocs
    if (pool.length > 0) setLocationId(pool[0].id)
  }

  const [schedules, setSchedules] = useState<Record<CareType, { enabled: boolean; days: number }>>(() => {
    const initial: Record<string, { enabled: boolean; days: number }> = {}
    for (const [type, info] of Object.entries(CARE_TYPE_INFO)) {
      initial[type] = { enabled: type === 'water', days: info.defaultIndoor }
    }
    return initial as Record<CareType, { enabled: boolean; days: number }>
  })

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

      // Auto-place on garden map at a random spot when Tuin is selected
      const mapPos = currentArea === 'tuin' && tuinMap ? randomMapPos(tuinMap.viewbox) : undefined

      const plant = await addPlant({
        name: name.trim(),
        species: species.trim() || undefined,
        location_id: locationId,
        map_id: currentArea === 'tuin' && tuinMap ? tuinMap.id : undefined,
        map_x: mapPos?.x,
        map_y: mapPos?.y,
        pot_size_cm: potSize ? parseInt(potSize) : undefined,
        acquired_date: acquiredDate || undefined,
        notes: notes.trim() || undefined,
        icon_key: iconKey ?? undefined,
        plant_type: isFromDatabase ? (DUTCH_TYPE_TO_SYSTEM[(prefill as LocalPlant).type] ?? (prefill as LocalPlant).type) : undefined,
        sun_requirement: sunRequirement ?? undefined,
        phase: phase as any,
        sown_date: sownDate || undefined,
        care_schedules: careSchedules,
      })

      if (photoFile) {
        await uploadPhoto(plant.id, photoFile)
      }

      navigate('/plants')
    } catch {
      // Error handled by store
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass = "w-full px-3.5 py-2.5 rounded-xl bg-surface border border-border text-text placeholder:text-text-muted/50 focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"

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
          <IconPicker value={iconKey} onChange={setIconKey} />
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
              { area: 'tuin' as const, label: t.editPlant.garden, emoji: '🌿', hasMap: !!tuinMap },
              { area: 'huis' as const, label: t.editPlant.house, emoji: '🏠', hasMap: !!huisMap },
            ]).map(({ area, label, emoji, hasMap }) => (
              <button
                key={area}
                type="button"
                onClick={() => selectArea(area)}
                className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border text-sm font-medium transition-colors ${
                  currentArea === area
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-text-muted hover:border-text-muted'
                }`}
              >
                <span className="text-2xl">{emoji}</span>
                <span>{label}</span>
                {!hasMap && (
                  <span className="text-[10px] text-text-muted/60">{t.editPlant.mapComingSoon}</span>
                )}
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
              type="date"
              value={acquiredDate}
              onChange={(e) => setAcquiredDate(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        {/* Sown date */}
        <div>
          <label className="block text-sm font-medium text-text-muted mb-1.5">{t.editPlant.sownDateLabel}</label>
          <input
            type="date"
            value={sownDate}
            onChange={(e) => setSownDate(e.target.value)}
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
            <span>{t.addPlant.title + ' 🌱'}</span>
          )}
        </button>
      </form>
    </div>
  )
}
