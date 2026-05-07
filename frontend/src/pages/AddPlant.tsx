import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import type { LocalPlant } from '../data/plants-dataset'
import { useGroeiStore } from '../store/useGroeiStore'
import IconPicker from '../components/IconPicker'

function randomMapPos(viewbox: string) {
  const [, , w, h] = viewbox.split(' ').map(Number)
  const pad = Math.min(w, h) * 0.12
  return {
    x: Math.round((pad + Math.random() * (w - pad * 2)) * 10) / 10,
    y: Math.round((pad + Math.random() * (h - pad * 2)) * 10) / 10,
  }
}

const MAP_TYPE_LABEL: Record<string, string> = {
  outdoor: 'Tuin',
  indoor: 'Binnen',
}

export default function AddPlant() {
  const navigate = useNavigate()
  const location = useLocation()
  const prefill = location.state?.prefill as LocalPlant | { name: string } | undefined
  const { maps, addPlant } = useGroeiStore()

  const [name, setName] = useState(prefill?.name ?? '')
  const [species, setSpecies] = useState(
    prefill && 'latinName' in prefill ? prefill.latinName : ''
  )
  const [iconKey, setIconKey] = useState<string | null>(null)
  const [mapId, setMapId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const isFromDatabase = prefill && 'latinName' in prefill

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    setSubmitting(true)
    try {
      const selectedMap = mapId != null ? maps.find(m => m.id === mapId) : null
      const mapPos = selectedMap ? randomMapPos(selectedMap.viewbox) : undefined

      await addPlant({
        name: name.trim(),
        species: species.trim() || undefined,
        icon_key: iconKey ?? undefined,
        map_id: selectedMap?.id,
        map_x: mapPos?.x,
        map_y: mapPos?.y,
        plant_type: isFromDatabase ? (prefill as LocalPlant).type : undefined,
        sun_requirement: isFromDatabase ? (prefill as LocalPlant).sunRequirement : undefined,
        care_schedules: [],
      })

      navigate('/plants')
    } catch {
      // Error handled by store
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass = "w-full px-3.5 py-2.5 rounded-full bg-surface border border-border text-text placeholder:text-text-muted/50 focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"

  return (
    <div className="px-4 pt-6 pb-8">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full bg-surface border border-border flex items-center justify-center text-text"
        >
          ←
        </button>
        <h1 className="text-2xl font-extrabold">Plant toevoegen</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-text-muted mb-1.5">Naam *</label>
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

        {isFromDatabase && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-primary/5 border border-primary/15 text-sm text-primary">
            <span className="text-base">📋</span>
            <span>Ingevuld uit plantendatabase — pas aan waar nodig</span>
          </div>
        )}

        {/* Map picker */}
        <div>
          <label className="block text-sm font-medium text-text-muted mb-1.5">Locatie</label>
          {maps.length === 0 ? (
            <p className="text-sm text-text-muted bg-surface rounded-xl p-3">
              Nog geen kaarten beschikbaar. Maak eerst een kaart aan.
            </p>
          ) : (
            <div className="flex gap-3">
              {maps.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMapId(mapId === m.id ? null : m.id)}
                  className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border text-sm font-medium transition-colors ${
                    mapId === m.id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-text-muted hover:border-text-muted'
                  }`}
                >
                  <span className="text-2xl">{m.map_type === 'outdoor' ? '🌿' : '🏠'}</span>
                  <span>{m.name}</span>
                  <span className="text-[10px] text-text-muted/60">{MAP_TYPE_LABEL[m.map_type] ?? m.map_type}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="w-full bg-primary text-white py-3.5 rounded-full font-bold text-lg active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Toevoegen...
            </span>
          ) : (
            'Plant toevoegen 🌱'
          )}
        </button>
      </form>
    </div>
  )
}
