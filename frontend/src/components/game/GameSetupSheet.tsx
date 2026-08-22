import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '../../context/LanguageContext'
import { maps as mapsApi } from '../../api/client'
import { gameApi, type GameCreateOptions } from '../../api/game'
import type { MapInfo, MapPlant } from '../../types'
import { plantDisplayName } from '../../utils/plantDisplayName'
import Glyph from '../ui/Glyph'
import ReadOnlyBanner from '../ui/ReadOnlyBanner'

interface Props {
  mapId: number
  mapSlug: string
  onClose: () => void
  /** Server-derived write capability — creating a game is an editor write
   * (POST /games is require_editor). Defaults to true for non-gated call
   * sites; the map gamepad already hides this sheet from viewers. */
  canEdit?: boolean
}

/** A plant plus which map it came from — a hunt can span several. */
interface GamePlant extends MapPlant {
  mapId: number
  mapName: string
  mapType: 'outdoor' | 'indoor'
}

const ROUND_SECONDS_CHOICES = [60, 120, 180, 300]

/** Rounds in a quick game. The backend floor is 3, so this is also the minimum. */
const QUICK_ROUNDS = 3
/**
 * Quick-game round length, by where the hunt runs.
 *
 * Indoors everything is a few steps away and 60s is generous. In the garden the
 * walking IS the game — the far end is a good half-minute away — so a 60s round
 * there is a sprint or a shrug, not an introduction. A mixed selection gets the
 * outdoor budget, since any round could be the far corner.
 */
const QUICK_SECONDS_INDOOR = 60
const QUICK_SECONDS_OUTDOOR = 120

export default function GameSetupSheet({ mapId, mapSlug, onClose, canEdit = true }: Props) {
  const t = useT()
  const navigate = useNavigate()
  const writeDisabled = !canEdit
  const [allMaps, setAllMaps] = useState<MapInfo[]>([])
  const [selectedMaps, setSelectedMaps] = useState<Set<number>>(new Set([mapId]))
  const [plants, setPlants] = useState<GamePlant[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [clueMode, setClueMode] = useState<'photo' | 'name' | 'logbook'>('name')
  const [pacing, setPacing] = useState<'host' | 'race'>('race')
  const [roundSeconds, setRoundSeconds] = useState(180)
  const [roundCount, setRoundCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Plants we hold photo embeddings for. Null while unknown — an empty Set
  // would claim "none are ready", which is a different and alarming statement.
  const [readyIds, setReadyIds] = useState<Set<number> | null>(null)

  // Which maps are available to pull plants from.
  useEffect(() => {
    mapsApi.list()
      .then(setAllMaps)
      .catch(() => setAllMaps([]))
  }, [])

  // Load plants for every selected map. Maps are few and the payloads small,
  // so re-fetching the whole selection on each toggle keeps this simple.
  useEffect(() => {
    const chosen = allMaps.filter((m) => selectedMaps.has(m.id))
    // Before the map list arrives, fall back to the map we were opened from.
    const targets = chosen.length > 0
      ? chosen
      : [{ id: mapId, slug: mapSlug, name: '', map_type: 'outdoor' as const }]

    let cancelled = false
    setLoading(true)
    Promise.all(
      targets.map((m) =>
        mapsApi.plants(m.slug)
          .then((ps) => ps
            .filter((p) => p.photo_path)
            .map((p): GamePlant => ({
              ...p,
              mapId: m.id,
              mapName: m.name,
              mapType: (m.map_type ?? 'outdoor') as 'outdoor' | 'indoor',
            })))
          .catch(() => [] as GamePlant[]),
      ),
    ).then((results) => {
      if (cancelled) return
      const merged = results.flat()
      setPlants(merged)
      // Drop selections whose map was just deselected.
      const available = new Set(merged.map((p) => p.id))
      setSelected((prev) => new Set([...prev].filter((id) => available.has(id))))
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [allMaps, selectedMaps, mapId, mapSlug])

  // Readiness follows the map selection, not the plant selection.
  useEffect(() => {
    const ids = [...selectedMaps]
    if (ids.length === 0) return
    let cancelled = false
    // Readiness is an enhancement, so nothing it does may take the sheet down
    // with it. `.catch()` alone is not enough — it only covers a REJECTED
    // promise, and a call that throws synchronously (a stubbed client, a
    // module that failed to load) escapes the effect and unmounts the tree.
    // That is not theoretical: it rendered this sheet as an empty box.
    Promise.resolve()
      .then(() => gameApi.plantReadiness(ids))
      .then((r) => { if (!cancelled) setReadyIds(new Set(r.ready_plant_ids)) })
      // null means "unknown", and every badge and hint below says nothing then.
      .catch(() => { if (!cancelled) setReadyIds(null) })
    return () => { cancelled = true }
  }, [selectedMaps])

  const readyPlants = useMemo(
    () => (readyIds ? plants.filter((p) => readyIds.has(p.id)) : []),
    [plants, readyIds],
  )

  /**
   * The 60-second introduction: hand someone the QR, they photograph three
   * plants against the clock.
   *
   * It picks only plants we hold photographs of, which is the whole reason it
   * beats setting this up by hand. Grading falls back to species-name matching
   * for a plant with no references, and a name cannot tell two plants of a
   * species apart — so an unready plant is a round that can tell a guest they
   * are wrong when they are right. That is a poor first minute with the app.
   */
  function startQuickGame() {
    if (readyPlants.length < QUICK_ROUNDS || creating) return
    const chosenMaps = allMaps.filter((m) => selectedMaps.has(m.id))
    const allIndoor = chosenMaps.length > 0
      && chosenMaps.every((m) => m.map_type === 'indoor')
    // The backend rejects more than MAX_SELECTABLE (50) plants, and a garden
    // can hold more ready ones than that. Shuffle before trimming so repeat
    // games draw from the whole collection instead of the same first fifty.
    // Fisher-Yates, not `sort(() => Math.random() - 0.5)`: that comparator is
    // inconsistent, and the engine's sort leaves the front of the array barely
    // moved — the exact positions the slice below keeps.
    const pool = [...readyPlants]
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    pool.length = Math.min(pool.length, 50)
    void createGame({
      plantIds: pool.map((p) => p.id),
      clueMode: 'photo',
      pacing: 'race',
      roundSeconds: allIndoor ? QUICK_SECONDS_INDOOR : QUICK_SECONDS_OUTDOOR,
      roundCount: QUICK_ROUNDS,
    })
  }

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleMap(id: number) {
    setSelectedMaps((prev) => {
      // Always leave at least one map selected — an empty hunt has no plants.
      if (prev.has(id) && prev.size === 1) return prev
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const scanMode = clueMode !== 'logbook'

  // Plants with no species link can't be identified by name — the target would
  // be the nickname their owner typed, which no identifier will ever return.
  // In scan modes they are only winnable via photo similarity, so flag them.
  const unlinkedSelected = useMemo(
    () => plants.filter((p) => selected.has(p.id) && !p.species_id).length,
    [plants, selected],
  )

  /** One create path for both the quick preset and the hand-built hunt. */
  async function createGame(opts: Omit<GameCreateOptions, 'mapIds'>) {
    setCreating(true)
    setError(null)
    try {
      const { join_code } = await gameApi.create({ mapIds: [...selectedMaps], ...opts })
      navigate(`/game/${join_code}/host`)
    } catch (e) {
      setError(e instanceof Error ? e.message : t.common.error)
      setCreating(false)
    }
  }

  function handleCreate() {
    if (selected.size < 3 || creating) return
    void createGame({
      plantIds: [...selected],
      clueMode,
      pacing,
      roundSeconds: pacing === 'race' ? roundSeconds : undefined,
      roundCount: roundCount ?? undefined,
    })
  }

  const canCreate = selected.size >= 3 && selected.size <= 50
  const effectiveRounds = Math.min(roundCount ?? selected.size, 15, selected.size)
  const countChoices = [5, 10, 15].filter((n) => n < selected.size)

  const modeButton = (
    mode: 'photo' | 'name' | 'logbook',
    icon: 'camera' | 'text' | 'book',
    label: string,
  ) => (
    <button
      onClick={() => setClueMode(mode)}
      className={`flex-1 min-h-[64px] py-2 text-sm font-medium transition-colors flex flex-col items-center justify-center gap-1.5 ${
        clueMode === mode ? 'bg-primary text-white' : 'bg-bg text-text-muted hover:bg-surface'
      }`}
    >
      <Glyph name={icon} size={20} />
      {label}
    </button>
  )

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black/40" onClick={onClose}>
      <div
        className="mt-auto bg-surface rounded-t-2xl max-h-[88vh] flex flex-col max-w-md mx-auto w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>
        <div className="flex items-center justify-between px-5 pt-3 pb-3 flex-shrink-0">
          <div>
            <h2 className="font-heading text-lg font-semibold text-text">{t.game.setupTitle}</h2>
            <p className="text-xs text-text-muted mt-0.5">{t.game.setupSubtitle}</p>
          </div>
          <button
            onClick={onClose}
            aria-label={t.common.close}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-bg text-text-muted hover:text-text"
          >
            <Glyph name="x" size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 pb-2 space-y-4">
          {writeDisabled && <ReadOnlyBanner />}

          {/* Maps — a hunt can cross from the living room into the garden */}
          {allMaps.length > 1 && (
            <div>
              <p className="text-xs text-text-muted mb-2">{t.game.mapsSectionLabel}</p>
              <div className="flex flex-wrap gap-1.5">
                {allMaps.map((m) => {
                  const on = selectedMaps.has(m.id)
                  return (
                    <button
                      key={m.id}
                      onClick={() => toggleMap(m.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors inline-flex items-center gap-1.5 ${
                        on ? 'bg-primary text-white border-primary' : 'border-border text-text-muted'
                      }`}
                    >
                      <Glyph name={m.map_type === 'indoor' ? 'home' : 'sprout'} size={12} />
                      {m.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Quick game — the 60-second introduction for someone who just
              scanned the QR. Sits above the manual controls because it is the
              answer to "can they just play?", and skips all of them. */}
          <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <Glyph name="sparkle" size={16} className="text-primary shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text">{t.game.quickTitle}</p>
                <p className="text-xs text-text-muted">
                  {t.game.quickSubtitle.replace('{count}', String(QUICK_ROUNDS))}
                </p>
              </div>
            </div>
            {readyIds !== null && (
              <p className="text-xs text-text-muted">
                {readyPlants.length >= QUICK_ROUNDS
                  ? t.game.quickReadyCount.replace('{count}', String(readyPlants.length))
                  : t.game.quickNotEnough.replace('{count}', String(QUICK_ROUNDS))}
              </p>
            )}
            <button
              onClick={startQuickGame}
              // Same gate as the manual create button: POST /games is an
              // editor write, so a viewer must not get a one-tap path past it.
              disabled={creating || readyPlants.length < QUICK_ROUNDS || writeDisabled}
              title={writeDisabled ? t.settings.onlyEditorsCanChange : undefined}
              className="w-full py-2.5 rounded-lg bg-primary text-white font-semibold text-sm disabled:opacity-40 transition-opacity"
            >
              {creating ? t.game.creating : t.game.quickStart}
            </button>
          </div>

          {/* Clue mode */}
          <div>
            <p className="text-xs text-text-muted mb-2">{t.game.clueModeSectionLabel}</p>
            <div className="flex rounded-xl overflow-hidden border border-border">
              {modeButton('name', 'text', t.game.clueModeName)}
              {modeButton('photo', 'camera', t.game.clueModePhoto)}
              {modeButton('logbook', 'book', t.game.clueModeLogbook)}
            </div>
            <p className="text-xs text-text-muted mt-1.5">
              {clueMode === 'name'
                ? t.game.clueModeNameHint
                : clueMode === 'photo'
                  ? t.game.clueModePhotoHint
                  : t.game.clueModeLogbookHint}
            </p>
          </div>

          {/* Pacing */}
          <div>
            <p className="text-xs text-text-muted mb-2">{t.game.pacingSectionLabel}</p>
            <div className="flex rounded-xl overflow-hidden border border-border">
              <button
                onClick={() => setPacing('race')}
                className={`flex-1 py-2 text-sm font-medium transition-colors inline-flex items-center justify-center gap-1.5 ${
                  pacing === 'race' ? 'bg-primary text-white' : 'bg-bg text-text-muted hover:bg-surface'
                }`}
              >
                <Glyph name="sparkle" size={15} />
                {t.game.pacingRace}
              </button>
              <button
                onClick={() => setPacing('host')}
                className={`flex-1 py-2 text-sm font-medium transition-colors inline-flex items-center justify-center gap-1.5 ${
                  pacing === 'host' ? 'bg-primary text-white' : 'bg-bg text-text-muted hover:bg-surface'
                }`}
              >
                <Glyph name="eye" size={15} />
                {t.game.pacingHost}
              </button>
            </div>
            <p className="text-xs text-text-muted mt-1.5">
              {pacing === 'race' ? t.game.pacingRaceHint : t.game.pacingHostHint}
            </p>
          </div>

          {/* Round length — race only */}
          {pacing === 'race' && (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-text-muted">{t.game.roundLength}</p>
              <div className="flex gap-1.5">
                {ROUND_SECONDS_CHOICES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setRoundSeconds(s)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                      roundSeconds === s
                        ? 'bg-primary text-white border-primary'
                        : 'border-border text-text-muted'
                    }`}
                  >
                    {s < 60 ? `${s}s` : `${s / 60}m`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Warnings */}
          <div className="space-y-2">
            <p className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-500 rounded-lg px-3 py-2 flex items-start gap-1.5">
              <Glyph name="camera" size={14} className="shrink-0 mt-0.5" />
              <span>{t.game.noPhotosWarning}</span>
            </p>
            {scanMode && unlinkedSelected > 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-500 rounded-lg px-3 py-2 flex items-start gap-1.5">
                <Glyph name="leaf" size={14} className="shrink-0 mt-0.5" />
                <span>
                  {t.game.unlinkedSpeciesWarning.replace('{count}', String(unlinkedSelected))}
                </span>
              </p>
            )}
          </div>

          {/* Select all / clear */}
          {!loading && plants.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-text-muted">{selected.size}/{plants.length}</p>
              <button
                onClick={() =>
                  selected.size === plants.length
                    ? setSelected(new Set())
                    : setSelected(new Set(plants.map((p) => p.id)))
                }
                className="text-xs font-semibold text-primary"
              >
                {selected.size === plants.length ? t.game.deselectAll : t.game.selectAll}
              </button>
            </div>
          )}

          {/* Plant list */}
          {loading ? (
            <p className="text-text-muted text-sm py-4">{t.common.loading}</p>
          ) : plants.length === 0 ? (
            <p className="text-text-muted text-sm py-4">{t.game.noPlantsWithPhotos}</p>
          ) : (
            <div className="space-y-2">
              {plants.map((p) => {
                const sel = selected.has(p.id)
                const displayName = plantDisplayName(p, t.locale)
                return (
                  <button
                    key={`${p.mapId}-${p.id}`}
                    onClick={() => toggle(p.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${
                      sel ? 'border-primary bg-primary/8' : 'border-border bg-bg hover:bg-surface'
                    }`}
                  >
                    {p.photo_path ? (
                      <img
                        src={p.photo_path}
                        alt={displayName}
                        className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-border flex items-center justify-center text-text-muted flex-shrink-0">
                        <Glyph name="sprout" size={22} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${sel ? 'text-primary' : 'text-text'}`}>
                        {displayName}
                      </p>
                      <p className="text-xs text-text-muted truncate flex items-center gap-1">
                        {selectedMaps.size > 1 && (
                          <>
                            <Glyph
                              name={p.mapType === 'indoor' ? 'home' : 'sprout'}
                              size={11}
                            />
                            {p.mapName}
                          </>
                        )}
                        {p.species && <span className="truncate">{p.species}</span>}
                        {scanMode && !p.species_id && (
                          <span className="text-amber-600">· {t.game.notIdentifiable}</span>
                        )}
                        {/* Only ever shown as a positive: a plant we hold
                            photographs of is graded on them. Its absence is
                            not flagged as a fault — plenty of good rounds are
                            won on a name, and readiness may simply be unknown. */}
                        {readyIds?.has(p.id) && (
                          <span className="text-primary inline-flex items-center gap-0.5 shrink-0">
                            · <Glyph name="camera" size={11} /> {t.game.photoReady}
                          </span>
                        )}
                      </p>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                        sel ? 'border-primary bg-primary' : 'border-border'
                      }`}
                    >
                      {sel && <Glyph name="check" size={13} className="text-white" />}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pt-3 pb-[max(env(safe-area-inset-bottom,0px),20px)] flex-shrink-0 border-t border-border space-y-3">
          {error && <p className="text-sm text-red-600 text-center">{error}</p>}
          {selected.size > 3 && (
            <div className="space-y-2">
              <p className="text-xs text-text-muted">{t.game.questionCount}</p>
              <div className="flex flex-wrap gap-1.5">
                {countChoices.map((n) => (
                  <button
                    key={n}
                    onClick={() => setRoundCount(n)}
                    className={`px-3 py-2 rounded-full text-xs font-semibold border transition-colors ${
                      roundCount === n
                        ? 'bg-primary text-white border-primary'
                        : 'border-border text-text-muted'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <button
                  onClick={() => setRoundCount(null)}
                  className={`px-3 py-2 rounded-full text-xs font-semibold border transition-colors ${
                    roundCount === null
                      ? 'bg-primary text-white border-primary'
                      : 'border-border text-text-muted'
                  }`}
                >
                  {t.game.allQuestions}
                </button>
              </div>
            </div>
          )}
          {!canCreate && selected.size > 0 && (
            <p className="text-xs text-text-muted text-center">
              {selected.size < 3 ? t.game.selectMin : t.game.selectMax}
            </p>
          )}
          <button
            onClick={handleCreate}
            disabled={!canCreate || creating || writeDisabled}
            title={writeDisabled ? t.settings.onlyEditorsCanChange : undefined}
            className="w-full py-3.5 rounded-xl bg-primary text-white font-semibold text-base disabled:opacity-40 transition-opacity"
          >
            {creating ? t.game.creating : `${t.game.createGame} (${effectiveRounds})`}
          </button>
        </div>
      </div>
    </div>
  )
}
