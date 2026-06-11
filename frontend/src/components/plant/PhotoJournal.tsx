import { useEffect, useRef, useState } from 'react'
import { photos as photosApi } from '../../api/client'
import type { PlantPhoto } from '../../types'
import { compressImage } from '../../utils/compressImage'
import { useT } from '../../context/LanguageContext'

export default function PhotoJournal({ plantId }: { plantId: number }) {
  const t = useT()
  const [photos, setPhotos] = useState<PlantPhoto[]>([])
  const [uploading, setUploading] = useState(false)
  const [viewer, setViewer] = useState<number | null>(null)  // index into photos
  const [compare, setCompare] = useState(false)               // before/after split view
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    photosApi.list(plantId).then(setPhotos).catch(() => setPhotos([]))
  }, [plantId])

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

  return (
    <div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment"
             className="hidden" onChange={onPick} />
      <button
        className="w-full flex items-center justify-center gap-2 py-2.5 mb-3 rounded-full bg-primary text-white font-semibold text-sm active:scale-[0.98] transition-transform disabled:opacity-60"
        disabled={uploading}
        onClick={() => fileRef.current?.click()}
      >
        📷 {uploading ? t.photoJournal.uploading : t.photoJournal.addPhoto}
      </button>

      {photos.length === 0 ? (
        <p className="text-sm text-text-muted">{t.photoJournal.empty}</p>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {photos.map((p, i) => (
            <button key={p.id} className="relative aspect-square overflow-hidden rounded-lg"
                    onClick={() => setViewer(i)}>
              <img src={p.url} loading="lazy" alt={p.note ?? ''}
                   className="h-full w-full object-cover" />
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
          <div className="p-4 text-white text-sm" onClick={e => e.stopPropagation()}>
            <p>{new Date(photos[viewer].taken_at).toLocaleDateString()}</p>
            {photos[viewer].note && <p className="text-white/80">{photos[viewer].note}</p>}
            <div className="flex gap-4 mt-2">
              <button disabled={viewer >= photos.length - 1} className="disabled:opacity-40"
                      onClick={() => setViewer(v => (v ?? 0) + 1)}>‹ {t.photoJournal.older}</button>
              <button disabled={viewer <= 0} className="disabled:opacity-40"
                      onClick={() => setViewer(v => (v ?? 0) - 1)}>{t.photoJournal.newer} ›</button>
              {photos.length > 1 && (
                <button onClick={() => setCompare(c => !c)}>
                  {compare ? t.photoJournal.compareOff : t.photoJournal.compare}
                </button>
              )}
              <button className="ml-auto text-red-400"
                      onClick={() => onDelete(photos[viewer])}>{t.photoJournal.delete}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
