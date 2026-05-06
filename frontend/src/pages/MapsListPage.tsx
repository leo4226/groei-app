import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchMaps, createMap, deleteMap } from '../api/client'
import { useGroeiStore } from '../store/useGroeiStore'
import type { MapInfo } from '../types'

export default function MapsListPage() {
  const [maps, setMaps] = useState<MapInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const loadMaps = useGroeiStore(s => s.loadMaps)

  async function load() {
    try {
      setMaps(await fetchMaps())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleCreate() {
    if (!newName.trim() || creating) return
    setCreating(true)
    setError(null)
    try {
      const map = await createMap(newName.trim())
      setShowCreate(false)
      setNewName('')
      await loadMaps()
      navigate(`/maps/${map.id}/edit-layout`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create map')
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(map: MapInfo) {
    if (!confirm(`Delete "${map.name}"?`)) return
    setError(null)
    try {
      await deleteMap(map.id)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete map')
    }
  }

  if (loading) {
    return <div className="p-6 text-text-muted text-center">Loading maps...</div>
  }

  return (
    <div className="p-4 max-w-lg mx-auto">
      {error && (
        <div className="bg-overdue/10 text-overdue text-sm px-3 py-2 rounded-lg mb-3 flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-bold ml-2">✕</button>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-text">Maps</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          + New map
        </button>
      </div>

      {showCreate && (
        <div className="bg-surface border border-border rounded-xl p-4 mb-4">
          <label className="text-sm text-text-muted block mb-1">Map name</label>
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="e.g. Balcony, Mum's garden..."
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-bg text-text mb-3"
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || creating}
              className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button
              onClick={() => { setShowCreate(false); setNewName('') }}
              className="text-text-muted px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {maps.map((map) => (
          <div key={map.id} className="bg-surface border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-text">{map.name}</h2>
              {map.id !== 1 && (
                <button
                  onClick={() => handleDelete(map)}
                  className="text-text-muted text-xs hover:text-overdue"
                >
                  Delete
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => navigate(`/map/${map.slug}`)}
                className="flex-1 border border-border rounded-lg px-3 py-2 text-sm text-text font-medium"
              >
                View
              </button>
              {map.canvas_data ? (
                <button
                  onClick={() => navigate(`/maps/${map.id}/edit-layout`)}
                  className="flex-1 border border-primary/30 bg-primary/5 rounded-lg px-3 py-2 text-sm text-primary font-medium"
                >
                  Edit layout
                </button>
              ) : (
                <div className="flex-1 border border-border rounded-lg px-3 py-2 text-sm text-text-muted text-center opacity-50">
                  SVG import
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
