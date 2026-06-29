import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useT } from '../context/LanguageContext'
import { useFloreren } from '../store/useFloreren'
import { species as speciesApi, discoveries } from '../api/client'
import { resolveIconUrl } from '../utils/icons'
import Glyph from '../components/ui/Glyph'
import type { IdentifyCommitResult, EcologyOut } from '../types'

const MONTH_NL = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec']

type RouteState = {
  candidate: Partial<IdentifyCommitResult> & { scientific_name?: string; common_name?: string; common_name_nl?: string }
  thumbnail: string
  destination?: 'journal' | 'garden'
}

type GardenFit = { map_id: number; map_name: string; sun_fit: string | null; reason: string }

const FIT_COLOR: Record<string, string> = {
  perfect: '#24e34c',
  acceptable: '#a3e635',
  marginal: '#f59e0b',
  tolerated: '#6b7280',
}

export default function DiscoveryCard() {
  const t = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as RouteState | null
  const activeLang = useFloreren((s) => {
    const user = s.users.find((u) => u.id === s.activeUserId)
    return user?.language === 'en' ? 'en' : 'nl'
  })

  const [ecology, setEcology] = useState<EcologyOut | null>(null)
  const [funFact, setFunFact] = useState<string | null>(null)
  const [funFactLoading, setFunFactLoading] = useState(false)
  const [gardenFits, setGardenFits] = useState<GardenFit[] | null>(null)
  const [gardenFitLoading, setGardenFitLoading] = useState(false)
  const [showGardenFit, setShowGardenFit] = useState(false)
  const [savedId, setSavedId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [shared, setShared] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [ecologyLoading, setEcologyLoading] = useState(false)

  const speciesId = state?.candidate?.species_id ?? null
  const scientificName = state?.candidate?.scientific_name ?? ''
  const hideAddToGarden = state?.destination === 'journal'
  const displayName = state?.candidate?.name_nl_suggested
    ?? state?.candidate?.common_name_nl
    ?? state?.candidate?.common_name
    ?? scientificName

  useEffect(() => {
    if (!speciesId) return
    setEcologyLoading(true)
    speciesApi.ecology(speciesId).then(setEcology).catch(() => {}).finally(() => setEcologyLoading(false))

    setFunFactLoading(true)
    speciesApi.funFact(speciesId)
      .then((r) => setFunFact(activeLang === 'en' ? r.fun_fact_en : r.fun_fact_nl))
      .catch(() => setFunFact(null))
      .finally(() => setFunFactLoading(false))
  }, [speciesId, activeLang])

  function handleShowGardenFit() {
    if (showGardenFit) { setShowGardenFit(false); return }
    setShowGardenFit(true)
    if (gardenFits !== null || !speciesId) return
    setGardenFitLoading(true)
    speciesApi.gardenFit(speciesId)
      .then(setGardenFits)
      .catch(() => setGardenFits([]))
      .finally(() => setGardenFitLoading(false))
  }

  async function handleSave() {
    if (savedId) return
    setSaving(true)
    setSaveError(false)
    try {
      // Don't store raw camera data URLs — they're multi-MB blobs, not URLs.
      // Only pass thumbnail_url if it's already a real https:// URL.
      const thumbnail_url = state?.thumbnail?.startsWith('https://') ? state.thumbnail : undefined
      const result = await discoveries.save({
        species_id: speciesId ?? undefined,
        common_name: displayName,
        latin_name: scientificName || undefined,
        thumbnail_url,
      })
      setSavedId(result.id)
    } catch {
      setSaveError(true)
    }
    setSaving(false)
  }

  async function handleShare() {
    const text = `${displayName}${scientificName ? ` (${scientificName})` : ''} 🌿 — floreren.app`
    if (typeof navigator.share === 'function') {
      await navigator.share({ title: displayName, text }).catch(() => {})
    } else {
      try {
        await navigator.clipboard.writeText(text)
        setShared(true)
        setTimeout(() => setShared(false), 2000)
      } catch {
        // clipboard unavailable — fail silently
      }
    }
  }

  function handleAddToGarden() {
    navigate('/plants/add', { state: { prefill: state?.candidate, from: 'identify' } })
  }

  if (!state) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <p style={{ color: 'var(--color-text-soft)' }}>Geen plantdata beschikbaar.</p>
        <button onClick={() => navigate(-1)} style={{ marginTop: 16, padding: '8px 16px', borderRadius: 8, background: 'var(--color-primary)', color: '#fff', border: 'none', cursor: 'pointer' }}>
          Terug
        </button>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', paddingBottom: 100 }}>
      {/* Header */}
      <div style={{ position: 'relative' }}>
        {state.thumbnail && (
          <img
            src={state.thumbnail}
            alt={displayName}
            style={{ width: '100%', height: 260, objectFit: 'cover', display: 'block' }}
          />
        )}
        <button
          onClick={() => navigate(-1)}
          style={{
            position: 'absolute', top: 16, left: 16,
            background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%',
            width: 36, height: 36, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff',
          }}
        >
          <Glyph name="arrow-left" size={18} />
        </button>

        {state.candidate?.icon_key && (
          <div style={{
            position: 'absolute', bottom: -24, right: 20,
            width: 56, height: 56, borderRadius: '50%',
            background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}>
            <img src={resolveIconUrl(state.candidate.icon_key)!} alt="" style={{ width: 44, height: 44 }} />
          </div>
        )}
      </div>

      {/* Name block */}
      <div style={{ padding: state.candidate?.icon_key ? '36px 20px 0' : '20px 20px 0' }}>
        <h1 style={{
          fontFamily: 'var(--font-heading)',
          fontWeight: 500,
          fontSize: 28,
          lineHeight: 1.1,
          margin: '0 0 4px',
          color: 'var(--color-text)',
        }}>
          {displayName}
        </h1>
        {scientificName && (
          <p style={{ margin: 0, fontSize: 13, fontStyle: 'italic', color: 'var(--color-text-soft)' }}>
            {scientificName}
          </p>
        )}
      </div>

      {/* Fun fact */}
      <div style={{ margin: '20px 20px 0', padding: 16, background: 'var(--color-surface)', borderRadius: 12 }}>
        <p style={{ margin: '0 0 6px', fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-muted)' }}>
          {t.discovery.funFact}
        </p>
        {funFactLoading ? (
          <p style={{ margin: 0, color: 'var(--color-text-soft)', fontSize: 14 }}>{t.discovery.funFactLoading}</p>
        ) : funFact ? (
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--color-text)' }}>{funFact}</p>
        ) : (
          <p style={{ margin: 0, color: 'var(--color-text-soft)', fontSize: 14 }}>{t.discovery.funFactError}</p>
        )}
      </div>

      {/* Ecology badges */}
      {(ecologyLoading || ecology) && (
        <div style={{ margin: '16px 20px 0' }}>
          <p style={{ margin: '0 0 8px', fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-muted)' }}>
            {t.discovery.ecology}
          </p>
          {ecologyLoading && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-soft)' }}>{t.discovery.ecologyLoading}</p>
          )}
          {ecology && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {ecology.native_to_nl === true && (
                <Badge color="#24e34c" label={t.discovery.nativeNl} />
              )}
              {ecology.invasive_nl === true && (
                <Badge color="#ef4444" label={t.discovery.invasiveNl} />
              )}
              {ecology.pollinator_value !== null && ecology.pollinator_value !== undefined && ecology.pollinator_value >= 3 && (
                <Badge color="#f59e0b" label={t.discovery.pollinatorHigh} />
              )}
              {ecology.pollinator_value !== null && ecology.pollinator_value !== undefined && ecology.pollinator_value === 2 && (
                <Badge color="#fbbf24" label={t.discovery.pollinatorGood} />
              )}
              {ecology.pollinator_value !== null && ecology.pollinator_value !== undefined && ecology.pollinator_value === 1 && (
                <Badge color="#d1d5db" label={t.discovery.pollinatorLow} />
              )}
              {ecology.flowering_months && ecology.flowering_months.length > 0 && (
                <Badge
                  color="#6366f1"
                  label={`${t.discovery.floweringMonths}: ${ecology.flowering_months.map(m => MONTH_NL[m - 1]).join(', ')}`}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* Garden fit section */}
      {speciesId && (
        <div style={{ margin: '16px 20px 0' }}>
          <button
            onClick={handleShowGardenFit}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              background: 'none', border: '1px solid var(--color-border)',
              borderRadius: 10, padding: '10px 14px', cursor: 'pointer',
              color: 'var(--color-text)',
            }}
          >
            <span style={{ flex: 1, textAlign: 'left', fontSize: 14, fontWeight: 500 }}>
              {t.discovery.gardenFit}
            </span>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{showGardenFit ? '▲' : '▼'}</span>
          </button>
          {showGardenFit && (
            <div style={{ marginTop: 8, padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {gardenFitLoading ? (
                <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-soft)', padding: '0 4px' }}>
                  {t.discovery.gardenFitLoading}
                </p>
              ) : gardenFits && gardenFits.length === 0 ? (
                <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-soft)', padding: '0 4px' }}>
                  {t.discovery.gardenFitNone}
                </p>
              ) : gardenFits?.map((gf) => (
                <div key={gf.map_id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
                  background: 'var(--color-surface)', borderRadius: 10,
                }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                    background: gf.sun_fit ? (FIT_COLOR[gf.sun_fit] ?? '#6b7280') : '#d1d5db',
                  }} />
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>{gf.map_name}</p>
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-soft)' }}>{gf.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ margin: '24px 20px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button
          onClick={handleSave}
          disabled={saving || !!savedId}
          style={{
            padding: '14px 24px', borderRadius: 12, border: '2px solid var(--color-primary)',
            background: savedId ? 'var(--color-primary)' : 'transparent',
            color: savedId ? '#fff' : 'var(--color-primary)',
            fontSize: 15, fontWeight: 600, cursor: savedId ? 'default' : 'pointer',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {savedId ? t.discovery.savedToJournal : saving ? '...' : t.discovery.saveToJournal}
        </button>
        {saveError && (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-overdue)', textAlign: 'center' }}>
            {t.discovery.saveError}
          </p>
        )}
        <button
          onClick={handleShare}
          style={{
            padding: '14px 24px', borderRadius: 12,
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            color: shared ? 'var(--color-primary)' : 'var(--color-text-soft)',
            fontSize: 15, fontWeight: 500, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {shared ? t.discovery.shareCopied : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                <polyline points="16 6 12 2 8 6"/>
                <line x1="12" y1="2" x2="12" y2="15"/>
              </svg>
              {t.discovery.share}
            </>
          )}
        </button>
        {!hideAddToGarden && (
          <button
            onClick={handleAddToGarden}
            style={{
              padding: '14px 24px', borderRadius: 12,
              background: 'var(--color-primary)', color: '#fff',
              border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {t.discovery.addToGarden}
          </button>
        )}
      </div>
    </div>
  )
}

function Badge({ color, label }: { color: string; label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '4px 10px', borderRadius: 100,
      background: color + '22', border: `1px solid ${color}55`,
      fontSize: 12, color: 'var(--color-text)', fontWeight: 500,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block' }} />
      {label}
    </span>
  )
}
