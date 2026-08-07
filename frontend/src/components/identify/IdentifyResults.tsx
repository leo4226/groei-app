import { useEffect, useState } from 'react'
import { weeds } from '../../api/client'
import { useT } from '../../context/LanguageContext'
import type { IdentifyConfidence, PlantIdCandidate, WeedSpeciesListItem } from '../../types'
import { confidenceTone } from './confidenceTone'
import Glyph from '../ui/Glyph'

type Props = {
  candidates: PlantIdCandidate[]
  confidence: IdentifyConfidence
  capturedThumbnailUrl: string | null
  source: string                     // "bioclip" or "plantnet"
  lang: 'nl' | 'en'                 // active user language
  onChoose: (candidate: PlantIdCandidate) => void
  onRetry: () => void
  onManualFallback: () => void
  onTryPlantnet: () => void
  onLogSighting: (weedId: number, weedName: string) => void
}

// Confidence dot/label colors: primary green when trustworthy, warm ochre and
// terracotta (the herbarium accent tones) as certainty drops.
const CHIP_COLOR: Record<IdentifyConfidence, string> = {
  high: 'var(--color-primary)',
  medium: '#A8763E',
  low: '#B2664A',
  no_match: '#B2664A',
}

/** The "determination sheet": your photo + confidence at the top, three slim
 * candidate rows to compare against it, verification aids below, and one row
 * of actions. Sized to fit a phone viewport without scrolling. */
export function IdentifyResults({
  candidates, confidence, capturedThumbnailUrl, source, lang,
  onChoose, onRetry, onManualFallback, onTryPlantnet, onLogSighting,
}: Props) {
  const t = useT()
  const tone = confidenceTone(confidence)
  const fromBioclip = source !== 'plantnet'
  const confidenceSummary = t.identify.confidence.summary[confidence]
  const chipColor = CHIP_COLOR[confidence]
  const sourceLabel = fromBioclip
    ? t.identify.results.sourceBioclip
    : t.identify.results.sourcePlantnet
  // "How to verify" guidance only matters when we're not confident; on a high
  // match it stays hidden so it can't push the choices down.
  const showGuidance = confidence !== 'high'

  const [photoOpen, setPhotoOpen] = useState(false)
  const [weedCatalog, setWeedCatalog] = useState<WeedSpeciesListItem[] | null>(null)
  useEffect(() => {
    weeds.catalog().then(setWeedCatalog).catch(() => setWeedCatalog([]))
  }, [])

  // Weed strip is only shown when overall confidence isn't 'low' — "go dig this
  // up" is a worse false positive than a wrong plant name. 'no_match' never
  // renders the candidate branch because candidates is empty.
  const showWeedHints = confidence !== 'low'

  function matchWeed(scientificName: string): WeedSpeciesListItem | null {
    if (!weedCatalog || !showWeedHints) return null
    const lower = scientificName.toLowerCase()
    return weedCatalog.find((w) => w.latin_name.toLowerCase() === lower) ?? null
  }

  // Header: the photo you just took (tap to inspect full screen) beside the
  // sheet title and a compact confidence chip. Replaces the old separate
  // source pill + multi-line banner.
  const header = (
    <div className="mb-1.5 flex items-start gap-3.5">
      {capturedThumbnailUrl && (
        <button
          onClick={() => setPhotoOpen(true)}
          className="relative h-[76px] w-[76px] flex-none cursor-pointer overflow-hidden rounded-xl border border-border bg-surface p-0"
        >
          <img src={capturedThumbnailUrl} alt="" className="h-full w-full object-cover" />
          <span className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/45 text-white">
            <Glyph name="search" size={11} />
          </span>
        </button>
      )}
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="m-0 mb-1 flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.18em] text-text-muted">
          <span className="h-px w-4 flex-none bg-border" />
          <span className="truncate">{sourceLabel}</span>
        </p>
        <h2 className="m-0 font-heading text-[26px] font-medium leading-none tracking-[-0.01em] text-text">
          {t.identify.results.sheetTitle}<span className="text-primary">.</span>
        </h2>
        <div className="mt-2 flex items-center gap-1.5">
          <span className="h-[7px] w-[7px] flex-none rounded-full" style={{ background: chipColor }} />
          <span className="text-[12.5px] font-semibold leading-none" style={{ color: chipColor }}>
            {t.identify.confidence.chip[confidence]}
          </span>
        </div>
      </div>
    </div>
  )

  const photoLightbox = photoOpen && capturedThumbnailUrl ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
      onClick={() => setPhotoOpen(false)}
    >
      <img src={capturedThumbnailUrl} alt="" className="max-h-[85vh] max-w-[94vw] rounded-xl object-contain" />
    </div>
  ) : null

  // Verification aids: collapsed disclosure (only when not confident) plus the
  // safety one-liner, both small so they never crowd the candidates.
  const verifyAndSafety = (
    <div className="mt-3 flex flex-col gap-1.5 text-left">
      {showGuidance && (
        <details className="rounded-lg border border-border bg-surface text-[13px]">
          <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 font-medium text-text-soft">
            <Glyph name="search" size={14} />
            {t.identify.guidance.title}
          </summary>
          <ul className="m-0 list-disc space-y-1 px-3 pb-2.5 pl-8 text-text-soft">
            {t.identify.guidance.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      )}
      <p className="m-0 flex items-start gap-1.5 px-1 text-[11px] leading-snug text-text-muted">
        <Glyph name="alert" size={11} className="mt-0.5 shrink-0" />
        <span>{t.identify.guidance.safety}</span>
      </p>
    </div>
  )

  const retakeButton = (
    <button
      onClick={onRetry}
      className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-border bg-surface px-3 py-2.5 text-[13.5px] font-medium text-text"
    >
      <Glyph name="camera" size={15} />
      {t.identify.newPhoto}
    </button>
  )

  const plantnetButton = fromBioclip ? (
    <button
      onClick={onTryPlantnet}
      className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 py-2.5 text-[13.5px] font-medium ${
        tone.plantnetCtaProminent
          ? 'border-none bg-primary text-white'
          : 'border border-primary/40 bg-transparent text-primary'
      }`}
    >
      <Glyph name="flask" size={15} />
      {tone.plantnetCtaProminent
        ? t.identify.results.plantnetProminentCta
        : t.identify.results.plantnetCta}
    </button>
  ) : null

  if (candidates.length === 0) {
    const bodyText = tone.showDetailedNoMatch
      ? t.identify.noMatch.bodyDetailed
      : t.identify.noMatch.body
    return (
      <div className="mx-auto max-w-md p-4">
        {header}
        <p className="mb-1 mt-3 font-heading text-[17px] font-medium text-text">{t.identify.noMatch.title}</p>
        <p className="m-0 text-[13.5px] leading-snug text-text-soft">{bodyText}</p>
        {verifyAndSafety}
        <div className="mt-5 flex gap-2.5">
          {retakeButton}
          {plantnetButton}
        </div>
        <button
          onClick={onManualFallback}
          className="mt-3 w-full cursor-pointer border-none bg-transparent text-center text-[12.5px] font-medium text-primary"
        >
          {t.identify.noMatch.manualFallback}
        </button>
        {photoLightbox}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md p-4">
      {header}

      {/* One short line of context under the chip, replacing the old banner. */}
      <p className="mb-3 mt-1 text-[12px] leading-snug text-text-soft">{confidenceSummary.body}</p>

      {/* Candidates: slim numbered rows, field-guide style. Position conveys
          rank (no per-card status pills, no raw-% — see #442 §3.3). */}
      <div className="flex flex-col gap-2">
        {candidates.map((c, idx) => {
          const commonName = lang === 'nl'
            ? c.common_names_nl[0] || c.common_names_en[0] || c.scientific_name
            : c.common_names_en[0] || c.common_names_nl[0] || c.scientific_name
          const isTop = idx === 0
          const weed = matchWeed(c.scientific_name)
          return (
            <div key={c.scientific_name} className="flex flex-col gap-1.5">
              <button
                onClick={() => onChoose(c)}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 text-left active:opacity-80 ${
                  isTop ? 'border-primary/40 bg-primary/[0.06]' : 'border-border bg-surface'
                }`}
              >
                <span className={`w-6 flex-none text-center font-mono text-[10px] tracking-[0.08em] ${isTop ? 'font-bold text-primary' : 'text-text-muted'}`}>
                  {String(idx + 1).padStart(2, '0')}
                </span>
                {c.thumbnail_url ? (
                  <img src={c.thumbnail_url} alt="" className="h-12 w-12 flex-none rounded-lg border border-border object-cover" />
                ) : (
                  <div className="flex h-12 w-12 flex-none items-center justify-center rounded-lg border border-border bg-bg text-text-muted">
                    <Glyph name="leaf" size={22} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-medium text-text">{commonName}</span>
                    {weed && (
                      <span className="inline-flex flex-none items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10.5px] font-medium text-red-700">
                        <Glyph name="alert" size={10} />
                        {t.weeds.knownWeed}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[12px] italic text-text-muted">{c.scientific_name}</div>
                </div>
                <Glyph name="chevron-right" size={16} className="flex-none text-text-muted" />
              </button>
              {weed && (
                <div className="mx-3 -mt-0.5 flex items-center justify-between gap-2 rounded-r border-l-2 border-red-300 bg-red-50 px-3 py-2">
                  <div className="min-w-0 text-xs text-text-muted">
                    <span className="font-medium text-text">{weed.common_name_nl}</span>
                    {weed.places.length > 0 && <span className="truncate"> · {weed.places.join(', ')}</span>}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onLogSighting(weed.id, weed.common_name_nl) }}
                    className="inline-flex flex-none cursor-pointer items-center gap-1.5 rounded-full border-none bg-primary px-3 py-1.5 text-xs font-medium text-white"
                  >
                    <Glyph name="pin" size={13} />
                    {t.weeds.logSighting}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Escape hatch straight to manual entry. */}
      <button
        onClick={onManualFallback}
        className="mt-2 w-full cursor-pointer border-none bg-transparent py-1 text-center text-[12.5px] font-medium text-primary"
      >
        {t.identify.results.noneOfThese}
      </button>

      {verifyAndSafety}

      {/* Actions side by side; powered-by credit as a quiet mono caption. */}
      <div className="mt-4 flex gap-2.5">
        {retakeButton}
        {plantnetButton}
      </div>
      {!fromBioclip && (
        <p className="m-0 mt-2.5 text-center font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted">
          {t.identify.results.poweredBy}
        </p>
      )}
      {photoLightbox}
    </div>
  )
}
