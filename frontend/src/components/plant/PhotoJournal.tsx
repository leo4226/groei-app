import { useEffect, useRef, useState } from 'react'
import { photos as photosApi } from '../../api/client'
import type { PlantPhoto } from '../../types'
import { compressImage } from '../../utils/compressImage'
import { useT } from '../../context/LanguageContext'
import { useFloreren } from '../../store/useFloreren'
import { photoViewerControlsClassName } from './photoJournalLayout'
import Glyph from '../ui/Glyph'
import { useCapabilities } from '../../hooks/useCapabilities'

const REMINDER_PRESETS = [14, 30, 90]

interface Props {
  plantId: number
  /** bump to re-fetch the list (e.g. after a care-photo upload elsewhere) */
  refreshKey?: number
  /** initial reminder state, derived from the plant's care_schedules */
  reminder?: { enabled: boolean; intervalDays: number }
}

export default function PhotoJournal({ plantId, refreshKey = 0, reminder }: Props) {
  const t = useT()
  const { canEdit } = useCapabilities()
  const [photos, setPhotos] = useState<PlantPhoto[]>([])
  const [uploading, setUploading] = useState(false)
  const [viewer, setViewer] = useState<number | null>(null)  // index into photos
  const [compare, setCompare] = useState(false)               // before/after split view
  const [reminderOn, setReminderOn] = useState(reminder?.enabled ?? false)
  const [reminderDays, setReminderDays] = useState(reminder?.intervalDays ?? 30)

  // Sync local state from prop after the store refreshes (e.g. after loadPlants()),
  // so the toggle always reflects the persisted backend state.
  useEffect(() => {
    setReminderOn(reminder?.enabled ?? false)
    setReminderDays(reminder?.intervalDays ?? 30)
  }, [reminder])

  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    photosApi.list(plantId).then(setPhotos).catch(() => setPhotos([]))
  }, [plantId, refreshKey])

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const blob = await compressImage(file)
      const created = await photosApi.upload(plantId, blob)
      setPhotos(prev => [created, ...prev])
    } finally {
      setUploading(false)
    }
  }

  async function onDelete(photo: PlantPhoto) {
    if (!window.confirm(t.photoJournal.deleteConfirm)) return
    await photosApi.remove(photo.id)
    setPhotos(prev => prev.filter(p => p.id !== photo.id))
    setViewer(null)
  }

  async function setReminder(enabled: boolean, days: number) {
    setReminderOn(enabled)
    setReminderDays(days)
    try {
      await photosApi.photoReminder(plantId, enabled, days)
      // Refresh the store so plant.care_schedules (and any other view
      // deriving reminder state from it) doesn't go stale.
      useFloreren.getState().loadPlants()
    } catch {
      setReminderOn(!enabled)  // revert on failure
    }
  }

  return (
    <div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment"
             className="hidden" onChange={onPick} />
      <button
        className="w-full flex items-center justify-center gap-2 py-2.5 mb-3 rounded-full bg-primary text-white font-semibold text-sm active:scale-[0.98] transition-transform disabled:opacity-60"
        disabled={uploading || !canEdit}
        title={canEdit ? undefined : t.settings.onlyEditorsCanChange}
        aria-label={canEdit ? (uploading ? t.photoJournal.uploading : t.photoJournal.addPhoto) : t.settings.onlyEditorsCanChange}
        onClick={() => fileRef.current?.click()}
      >
        <Glyph name="camera" size={16} />
        {uploading ? t.photoJournal.uploading : t.photoJournal.addPhoto}
      </button>

      <div className="card p-3 mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-sm">{t.photoJournal.reminderLabel}</div>
          <div className="text-xs text-text-muted mt-0.5">{t.photoJournal.reminderHint}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {reminderOn && (
            <select
              value={reminderDays}
              disabled={!canEdit}
              onChange={e => setReminder(true, Number(e.target.value))}
              className="bg-surface border border-border rounded-lg px-2 py-1 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {REMINDER_PRESETS.map(d => (
                <option key={d} value={d}>{d} {t.photoJournal.daysSuffix}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => setReminder(!reminderOn, reminderDays)}
            disabled={!canEdit}
            title={canEdit ? undefined : t.settings.onlyEditorsCanChange}
            aria-label={canEdit ? undefined : t.settings.onlyEditorsCanChange}
            className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${reminderOn ? 'bg-primary' : 'bg-border'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${reminderOn ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>
      </div>

      {photos.length === 0 ? (
        <p className="text-sm text-text-muted">{t.photoJournal.empty}</p>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {photos.map((p, i) => (
            <button key={p.id} className="relative aspect-square overflow-hidden rounded-lg"
                    onClick={() => setViewer(i)}>
              <img src={p.url} loading="lazy" alt={p.note ?? ''}
                   className="h-full w-full object-cover" />
              {p.care_log_id != null && (
                <span title={t.photoJournal.careBadgeHint}
                      className="absolute top-1 right-1 bg-primary/90 text-white rounded p-0.5 flex"><Glyph name="droplet" size={11} /></span>
              )}
              {p.species_mismatch && (
                <span title={t.photoJournal.mismatchHint}
                      className="absolute top-1 left-1 text-xs bg-amber-500/90 text-white rounded px-1">?</span>
              )}
              <span className="absolute bottom-0 inset-x-0 bg-black/40 text-white text-[10px] px-1">
                {new Date(p.taken_at).toLocaleDateString()}
              </span>
            </button>
          ))}
        </div>
      )}

      {viewer !== null && photos[viewer] && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col"
             onClick={() => setViewer(null)}>
          {compare ? (
            // before/after: oldest photo next to the one being viewed
            <div className="flex-1 min-h-0 grid grid-cols-2 gap-0.5">
              <img src={photos[photos.length - 1].url} alt="" className="h-full w-full object-contain" />
              <img src={photos[viewer].url} alt="" className="h-full w-full object-contain" />
            </div>
          ) : (
            <img src={photos[viewer].url} alt=""
                 className="flex-1 object-contain min-h-0" />
          )}
          <div className={photoViewerControlsClassName()} onClick={e => e.stopPropagation()}>
            <p>{new Date(photos[viewer].taken_at).toLocaleDateString()}</p>
            {photos[viewer].note && <p className="text-white/80">{photos[viewer].note}</p>}
            {photos[viewer].species_mismatch && (
              <p className="text-amber-400 text-xs mt-1 flex items-center gap-1"><Glyph name="alert" size={12} className="shrink-0" /> {t.photoJournal.mismatchHint}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2">
              <button disabled={viewer >= photos.length - 1} className="disabled:opacity-40 shrink-0"
                      onClick={() => setViewer(v => (v ?? 0) + 1)}>‹ {t.photoJournal.older}</button>
              <button disabled={viewer <= 0} className="disabled:opacity-40 shrink-0"
                      onClick={() => setViewer(v => (v ?? 0) - 1)}>{t.photoJournal.newer} ›</button>
              {photos.length > 1 && (
                <button className="shrink-0" onClick={() => setCompare(c => !c)}>
                  {compare ? t.photoJournal.compareOff : t.photoJournal.compare}
                </button>
              )}
              {canEdit && (
                <button className="ml-auto shrink-0 text-red-300 font-semibold"
                        onClick={() => onDelete(photos[viewer])}>{t.photoJournal.delete}</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
