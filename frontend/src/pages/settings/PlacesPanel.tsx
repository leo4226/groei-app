import { useState } from 'react'
import { useFloreren } from '../../store/useFloreren'
import { useT } from '../../context/LanguageContext'
import { apiRequest, users as usersApi } from '../../api/client'
import type { Location } from '../../types'
import Glyph from '../../components/ui/Glyph'
import ConfirmDialog from '../../components/ui/ConfirmDialog'

/** Reorder arrows, hoisted out of the render body so React keeps the instance. */
function OrderButtons({ loc, locations, onReorder, upLabel, downLabel }: {
  loc: Location
  locations: Location[]
  onReorder: (loc: Location, dir: 'up' | 'down') => void
  upLabel: string
  downLabel: string
}) {
  const sorted = [...locations].sort((a, b) => a.sort_order - b.sort_order)
  const idx = sorted.findIndex((l) => l.id === loc.id)
  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        onClick={() => onReorder(loc, 'up')}
        disabled={idx === 0}
        title={upLabel}
        aria-label={upLabel}
        className="flex h-4 w-6 items-center justify-center leading-none text-text-muted transition-all hover:text-text active:scale-90 disabled:opacity-20"
      >
        <Glyph name="chevron-up" size={12} />
      </button>
      <button
        onClick={() => onReorder(loc, 'down')}
        disabled={idx === sorted.length - 1}
        title={downLabel}
        aria-label={downLabel}
        className="flex h-4 w-6 items-center justify-center leading-none text-text-muted transition-all hover:text-text active:scale-90 disabled:opacity-20"
      >
        <Glyph name="chevron-down" size={12} />
      </button>
    </div>
  )
}

/**
 * Locations — the named places a plant can live ("Windowsill", "Balcony").
 *
 * Distinct from maps, which are drawn floor plans; these are the plain labels
 * used when a plant isn't placed on a map.
 */
export default function PlacesPanel() {
  const t = useT()
  const locations = useFloreren((s) => s.locations)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editIcon, setEditIcon] = useState('')
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Location | null>(null)

  const lang: 'nl' | 'en' = t.locale?.startsWith('en') ? 'en' : 'nl'

  async function handleUpdate(id: number) {
    if (!editName.trim()) return
    setError(null)
    try {
      const body: Record<string, string> = { name: editName.trim() }
      if (editIcon.trim()) body.icon = editIcon.trim()
      await usersApi.updateLocation(id, body)
      setEditingId(null)
      void useFloreren.getState().load()
    } catch (e) {
      setError(e instanceof Error ? e.message : t.common.error)
    }
  }

  async function handleAdd() {
    if (!newName.trim()) return
    setError(null)
    try {
      const body: Record<string, string> = { name: newName.trim() }
      if (newIcon.trim()) body.icon = newIcon.trim()
      setAdding(false)
      setNewName('')
      setNewIcon('')
      await apiRequest('POST', '/locations', { body })
      void useFloreren.getState().load()
    } catch (e) {
      setError(e instanceof Error ? e.message : t.common.error)
    }
  }

  async function handleDelete(loc: Location) {
    setError(null)
    try {
      await usersApi.deleteLocation(loc.id, lang)
      void useFloreren.getState().load()
    } catch (e) {
      // 409 means the location still holds plants. Branch on the status, never
      // on the message text — the backend localises its details (CLAUDE.md).
      const status = (e as { status?: number }).status
      setError(status === 409 ? t.settings.locationHasPlants : t.common.error)
    } finally {
      setDeleting(null)
    }
  }

  async function handleReorder(loc: Location, direction: 'up' | 'down') {
    const sorted = [...locations].sort((a, b) => a.sort_order - b.sort_order)
    const idx = sorted.findIndex((l) => l.id === loc.id)
    if (idx === -1) return
    if (direction === 'up' && idx === 0) return
    if (direction === 'down' && idx >= sorted.length - 1) return
    const newOrder = direction === 'up'
      ? sorted[idx].sort_order - 1
      : sorted[idx].sort_order + 1
    try {
      await usersApi.updateLocation(loc.id, { sort_order: newOrder })
      void useFloreren.getState().load()
    } catch (e) {
      setError(e instanceof Error ? e.message : t.common.error)
    }
  }

  return (
    <div>
      <p className="mb-3 text-xs text-text-muted">{t.settings.locationsDescription}</p>

      <div className="divide-y divide-border/50 rounded-xl border border-border">
        {locations.length === 0 && (
          <p className="px-4 py-3 text-sm text-text-muted">{t.settings.noLocations}</p>
        )}

        {locations.map((loc) => (
          <div key={loc.id} className="flex items-center gap-2 px-3 py-2.5">
            {editingId === loc.id ? (
              <>
                <input
                  className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium outline-none focus:border-primary/50"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder={t.settings.locationNamePlaceholder}
                  autoFocus
                />
                <input
                  className="h-10 w-10 rounded-lg border border-border bg-surface text-center text-xl outline-none focus:border-primary/50"
                  value={editIcon}
                  onChange={(e) => setEditIcon(e.target.value)}
                  maxLength={2}
                  aria-label={t.settings.locationIcon}
                />
                <button
                  onClick={() => handleUpdate(loc.id)}
                  title={t.settings.save}
                  aria-label={t.settings.save}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white transition-transform active:scale-90"
                >
                  <Glyph name="check" size={16} />
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  title={t.settings.cancel}
                  aria-label={t.settings.cancel}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-text transition-transform active:scale-90"
                >
                  <Glyph name="x" size={15} />
                </button>
              </>
            ) : (
              <>
                <span className="w-8 shrink-0 text-center text-xl">{loc.icon}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{loc.name}</span>
                <button
                  onClick={() => {
                    setEditingId(loc.id)
                    setEditName(loc.name)
                    setEditIcon(loc.icon ?? '')
                    setError(null)
                  }}
                  title={t.settings.rename}
                  aria-label={t.settings.renameNamed.replace('{name}', loc.name)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-all hover:bg-surface active:scale-90"
                >
                  <Glyph name="edit" size={14} />
                </button>
                <OrderButtons
                  loc={loc}
                  locations={locations}
                  onReorder={handleReorder}
                  upLabel={t.settings.moveUp}
                  downLabel={t.settings.moveDown}
                />
                <button
                  onClick={() => setDeleting(loc)}
                  title={t.settings.deleteLocation}
                  aria-label={t.settings.deleteLocationNamed.replace('{name}', loc.name)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-red-400 transition-all hover:bg-red-50 active:scale-90 dark:hover:bg-red-500/10"
                >
                  <Glyph name="trash" size={15} />
                </button>
              </>
            )}
          </div>
        ))}

        {adding ? (
          <div className="flex items-center gap-2 px-3 py-2.5">
            <input
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium outline-none focus:border-primary/50"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder={t.settings.locationNamePlaceholder}
              autoFocus
            />
            <input
              className="h-10 w-10 rounded-lg border border-border bg-surface text-center text-xl outline-none focus:border-primary/50"
              value={newIcon}
              onChange={(e) => setNewIcon(e.target.value)}
              maxLength={2}
              aria-label={t.settings.locationIcon}
            />
            <button
              onClick={handleAdd}
              disabled={!newName.trim()}
              title={t.settings.save}
              aria-label={t.settings.save}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white transition-transform active:scale-90 disabled:opacity-40"
            >
              <Glyph name="check" size={16} />
            </button>
            <button
              onClick={() => setAdding(false)}
              title={t.settings.cancel}
              aria-label={t.settings.cancel}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-text transition-transform active:scale-90"
            >
              <Glyph name="x" size={15} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium text-primary transition-colors active:bg-surface/50"
          >
            <Glyph name="sprout" size={15} />
            {t.settings.addLocation}
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-fiery-red">{error}</p>}

      {deleting && (
        <ConfirmDialog
          title={t.settings.deleteLocation}
          message={t.settings.confirmDeleteLocationNamed.replace('{name}', deleting.name)}
          confirmLabel={t.settings.deleteLocation}
          cancelLabel={t.settings.cancel}
          destructive
          onConfirm={() => handleDelete(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  )
}
