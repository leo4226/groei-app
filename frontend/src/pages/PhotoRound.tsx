/**
 * Walk the garden once, photograph every plant.
 *
 * A journal photo is not just a picture: `_run_photo_check` embeds it, and if
 * the plant is species-linked, `add_anchor` keeps that embedding as a
 * user-confirmed BioCLIP anchor. The garden game then reads the same rows as
 * its per-plant references. So one pass with a camera serves the plant record,
 * identification, and the game — which is only worth doing if taking 80 photos
 * does not mean opening 80 plant pages.
 *
 * The app picks the plant and the photo follows; the reverse (shoot freely,
 * let identification assign) would file photos under the wrong species, and a
 * wrong anchor is worse than no anchor.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { photos as photosApi } from '../api/client'
import type { PhotoRoundPlant } from '../types'
import { compressImage } from '../utils/compressImage'
import { useT } from '../context/LanguageContext'
import { useFloreren } from '../store/useFloreren'
import { resolveIconUrl } from '../utils/icons'
import Glyph from '../components/ui/Glyph'

function daysSince(iso: string): number {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 0
  return Math.max(0, Math.round((Date.now() - then) / 86_400_000))
}

export default function PhotoRound() {
  const t = useT()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const maps = useFloreren(s => s.maps)
  const loadPlants = useFloreren(s => s.loadPlants)

  const mapParam = params.get('map')
  const mapId = mapParam ? Number(mapParam) : undefined

  const [queue, setQueue] = useState<PhotoRoundPlant[] | null>(null)
  const [index, setIndex] = useState(0)
  const [done, setDone] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [failed, setFailed] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    setQueue(null)
    setIndex(0)
    photosApi.round(mapId)
      .then(rows => { if (!cancelled) setQueue(rows) })
      .catch(() => { if (!cancelled) setQueue([]) })
    return () => { cancelled = true }
  }, [mapId])

  const current = queue && index < queue.length ? queue[index] : null
  const total = queue?.length ?? 0
  // The round is finished once the queue runs out — refresh the store then, so
  // plant cards elsewhere show the photos this round just took.
  const finished = queue !== null && current === null
  const iconUrl = current ? resolveIconUrl(current.icon_key) : null

  useEffect(() => {
    if (finished && done > 0) loadPlants()
  }, [finished, done, loadPlants])

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !current) return
    setUploading(true)
    setFailed(false)
    try {
      const blob = await compressImage(file)
      await photosApi.upload(current.plant_id, blob)
      setDone(d => d + 1)
      setIndex(i => i + 1)
    } catch {
      // Stay on this plant: advancing past a plant whose photo never landed is
      // the one failure the walker cannot see and cannot redo without starting over.
      setFailed(true)
    } finally {
      setUploading(false)
    }
  }

  const scopeLabel = useMemo(
    () => maps.find(m => m.id === mapId)?.name ?? t.photoRound.scopeAll,
    [maps, mapId, t],
  )

  return (
    <div className="min-h-dvh bg-bg px-4 pt-6 pb-24 max-w-lg mx-auto">
      <header className="mb-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-text-muted">
              {t.photoRound.title}
            </p>
            <h1 className="text-2xl font-bold text-text mt-1">{scopeLabel}</h1>
          </div>
          <button
            onClick={() => navigate('/plants')}
            className="shrink-0 rounded-full border border-border px-3 py-1.5 text-sm text-text-soft"
          >
            {t.photoRound.finish}
          </button>
        </div>
        <p className="text-sm text-text-muted mt-2 leading-snug">{t.photoRound.lede}</p>
      </header>

      <label className="block mb-5">
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-text-muted">
          {t.photoRound.scopeLabel}
        </span>
        <select
          value={mapId ?? ''}
          onChange={e => setParams(e.target.value ? { map: e.target.value } : {})}
          className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text"
        >
          <option value="">{t.photoRound.scopeAll}</option>
          {maps.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </label>

      {queue === null && <p className="text-sm text-text-muted">{t.photoRound.loading}</p>}

      {queue !== null && total === 0 && (
        <p className="text-sm text-text-muted">{t.photoRound.empty}</p>
      )}

      {current && (
        <>
          <p className="font-mono text-xs text-text-muted mb-2">
            {t.photoRound.progress(index, total)}
          </p>
          <div className="card overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-4">
              {iconUrl && (
                <img src={iconUrl} alt="" className="h-12 w-12 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-lg font-bold text-text leading-tight truncate">{current.name}</p>
                <p className="text-xs text-text-muted mt-0.5">
                  {current.map_name ? `${current.map_name} · ` : ''}
                  {current.last_photo_at
                    ? t.photoRound.lastPhoto(daysSince(current.last_photo_at))
                    : t.photoRound.neverPhotographed}
                </p>
              </div>
            </div>

            {current.species_id == null && (
              <p className="border-t border-border/60 bg-pumpkin-swirl/8 px-4 py-2.5 text-xs text-text-soft leading-snug">
                {t.photoRound.noSpeciesWarning}
              </p>
            )}

            {failed && (
              <p className="border-t border-border/60 bg-fiery-red/8 px-4 py-2.5 text-xs text-text leading-snug">
                {t.photoRound.uploadFailed}
              </p>
            )}

            <div className="border-t border-border/60 p-4 flex flex-col gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full rounded-xl bg-primary px-4 py-3 text-base font-bold text-white disabled:opacity-60 flex items-center justify-center gap-2"
              >
                <Glyph name="camera" size={18} aria-hidden />
                {uploading
                  ? t.photoRound.uploading
                  : failed ? t.photoRound.retry : t.photoRound.takePhoto}
              </button>
              <button
                onClick={() => { setFailed(false); setIndex(i => i + 1) }}
                disabled={uploading}
                className="w-full rounded-xl border border-border px-4 py-2.5 text-sm text-text-soft disabled:opacity-60"
              >
                {t.photoRound.skip}
              </button>
            </div>
          </div>

          <input
            ref={fileRef} type="file" accept="image/*" capture="environment"
            onChange={onFile} className="hidden"
          />
        </>
      )}

      {finished && total > 0 && (
        <div className="card px-4 py-5 text-center">
          <p className="text-lg font-bold text-text">{t.photoRound.doneTitle}</p>
          <p className="text-sm text-text-muted mt-1">
            {done > 0 ? t.photoRound.doneBody(done) : t.photoRound.doneNothing}
          </p>
          <button
            onClick={() => navigate('/plants')}
            className="mt-4 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white"
          >
            {t.photoRound.finish}
          </button>
        </div>
      )}
    </div>
  )
}
