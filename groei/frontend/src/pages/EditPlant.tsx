import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useGroeiStore } from '../store/useGroeiStore'
import { fetchPlant } from '../api/client'
import type { Plant } from '../types'
import { PLANT_SUN_PROFILES } from '../utils/plantSunRequirements'
import IconPicker from '../components/IconPicker'

const OUTDOOR_KEYWORDS = ['tuin', 'balkon', 'terras', 'buiten', 'kas', 'moestuin']
const isTuinLoc = (name: string) => OUTDOOR_KEYWORDS.some(k => name.toLowerCase().includes(k))

export default function EditPlant() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { locations, maps, updatePlant, uploadPhoto } = useGroeiStore()
  const plantId = Number(id)

  const [plant, setPlant] = useState<Plant | null>(null)
  const [loading, setLoading] = useState(true)

  const [name, setName] = useState('')
  const [species, setSpecies] = useState('')
  const [locationId, setLocationId] = useState<number | undefined>()
  const [potSize, setPotSize] = useState('')
  const [acquiredDate, setAcquiredDate] = useState('')
  const [lastRepotted, setLastRepotted] = useState('')
  const [notes, setNotes] = useState('')
  const [sunRequirement, setSunRequirement] = useState<string | null>(null)
  const [iconKey, setIconKey] = useState<string | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const tuinLocs = useMemo(() => locations.filter(l => isTuinLoc(l.name)), [locations])
  const huisLocs = useMemo(() => locations.filter(l => !isTuinLoc(l.name)), [locations])
  const tuinMap = maps.find(m => ['garden', 'tuin'].some(k => m.name.toLowerCase().includes(k) || (m as any).slug?.toLowerCase().includes(k)))
  const huisMap = maps.find(m => ['huis', 'house', 'indoor'].some(k => m.name.toLowerCase().includes(k) || (m as any).slug?.toLowerCase().includes(k)))

  const currentArea: 'tuin' | 'huis' | null = locationId == null ? null
    : locations.find(l => l.id === locationId && isTuinLoc(l.name)) ? 'tuin'
    : locations.find(l => l.id === locationId) ? 'huis'
    : null

  function selectArea(area: 'tuin' | 'huis') {
    if (currentArea === area) { setLocationId(undefined); return }
    const pool = area === 'tuin' ? tuinLocs : huisLocs
    if (pool.length > 0) setLocationId(pool[0].id)
  }

  useEffect(() => {
    async function load() {
      try {
        const p = await fetchPlant(plantId)
        setPlant(p)
        setName(p.name)
        setSpecies(p.species ?? '')
        setLocationId(p.location_id ?? undefined)
        setPotSize(p.pot_size_cm ? String(p.pot_size_cm) : '')
        setAcquiredDate(p.acquired_date ?? '')
        setLastRepotted(p.last_repotted ?? '')
        setNotes(p.notes ?? '')
        setSunRequirement(p.sun_requirement ?? null)
        setIconKey(p.icon_key ?? null)
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
      await updatePlant(plantId, {
        name: name.trim(),
        species: species.trim() || null,
        location_id: locationId ?? null,
        pot_size_cm: potSize ? parseInt(potSize) : null,
        acquired_date: acquiredDate || null,
        last_repotted: lastRepotted || null,
        notes: notes.trim() || null,
        sun_requirement: sunRequirement ?? null,
        icon_key: iconKey,
      })

      if (photoFile) {
        await uploadPhoto(plantId, photoFile)
      }

      navigate(-1)
    } catch {
      // Error handled by store
    } finally {
      setSubmitting(false)
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
        <h1 className="text-2xl font-extrabold">Plant bewerken</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Photo */}
        <label className="card p-4 flex items-center gap-4 cursor-pointer">
          {photoPreview ? (
            <img src={photoPreview} alt="Preview" className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
          ) : (
            <div className="w-20 h-20 rounded-xl bg-bg border-2 border-dashed border-border flex flex-col items-center justify-center text-text-muted flex-shrink-0">
              <span className="text-2xl">📷</span>
              <span className="text-[10px] mt-0.5">Foto toevoegen</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text">Plantfoto</p>
            <p className="text-xs text-text-muted mt-0.5">Tik om foto te wijzigen</p>
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
          <label className="block text-sm font-medium text-text-muted mb-1.5">Naam *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className={inputClass}
          />
        </div>

        {/* Species */}
        <div>
          <label className="block text-sm font-medium text-text-muted mb-1.5">Botanische naam</label>
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
          <label className="block text-sm font-medium text-text-muted mb-1.5">Icoon</label>
          <IconPicker value={iconKey} onChange={setIconKey} />
        </div>

        {/* Sun requirement */}
        <div>
          <label className="block text-sm font-medium text-text-muted mb-1.5">Zonbehoefte</label>
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
                <span>{profile.labelNl}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Location */}
        <div>
          <label className="block text-sm font-medium text-text-muted mb-1.5">Locatie</label>
          <div className="flex gap-3">
            {([
              { area: 'tuin' as const, label: 'Tuin', emoji: '🌿', hasMap: !!tuinMap },
              { area: 'huis' as const, label: 'Huis', emoji: '🏠', hasMap: !!huisMap },
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
                  <span className="text-[10px] text-text-muted/60">kaart binnenkort</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Pot size & dates */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">Potmaat (cm)</label>
            <input
              type="number"
              value={potSize}
              onChange={(e) => setPotSize(e.target.value)}
              placeholder="15"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">Verkregen</label>
            <input
              type="date"
              value={acquiredDate}
              onChange={(e) => setAcquiredDate(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-muted mb-1.5">Laatste verpot</label>
          <input
            type="date"
            value={lastRepotted}
            onChange={(e) => setLastRepotted(e.target.value)}
            className={inputClass}
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-text-muted mb-1.5">Notities</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Houdt van indirect licht, van onderen water geven..."
            rows={2}
            className={`${inputClass} resize-none`}
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="w-full bg-primary text-white py-3.5 rounded-xl font-bold text-lg active:scale-[0.98] transition-transform disabled:opacity-50 shadow-sm"
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Opslaan...
            </span>
          ) : (
            'Opslaan'
          )}
        </button>
      </form>
    </div>
  )
}
