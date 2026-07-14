import { useEffect, useMemo, useRef } from 'react'
import { useT } from '../../context/LanguageContext'
import { resolveIconUrl } from '../../utils/icons'
import type { PlantHitCandidate } from '../../utils/plantHitTesting'
import { chooserLayout, chooserOptions } from './plantHitChooserModel'

export interface PlantHitChooserProps {
  candidates: readonly PlantHitCandidate[]
  point: { x: number; y: number }
  isMobile: boolean
  onChoose: (candidate: PlantHitCandidate) => void
  onClose: () => void
}

const POPOVER_WIDTH = 272
const POPOVER_GAP = 12

export default function PlantHitChooser({
  candidates,
  point,
  isMobile,
  onChoose,
  onClose,
}: PlantHitChooserProps) {
  const t = useT()
  const layout = chooserLayout(isMobile)
  const options = useMemo(() => chooserOptions(candidates), [candidates])
  const firstOptionRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    firstOptionRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const optionList = (
    <div className="flex flex-col gap-1">
      {options.map((option, index) => {
        const iconUrl = resolveIconUrl(option.iconKey)
        return (
          <button
            key={option.key}
            ref={index === 0 ? firstOptionRef : undefined}
            type="button"
            data-plant-hit-option={option.key}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-text transition-colors hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            onClick={() => onChoose(option.candidate)}
          >
            <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-bg">
              {iconUrl ? (
                <img src={iconUrl} alt="" className="size-8 object-contain" />
              ) : (
                <span className="size-3 rounded-full bg-primary/70" aria-hidden="true" />
              )}
            </span>
            <span className="min-w-0 truncate">{option.label}</span>
          </button>
        )
      })}
    </div>
  )

  const dialog = (
    <div
      role="dialog"
      aria-label={t.mapPage.plantHitChooserTitle}
      aria-modal={layout === 'sheet'}
      className={layout === 'sheet'
        ? 'w-full rounded-t-3xl border border-b-0 border-border bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl'
        : 'w-[272px] rounded-2xl border border-border bg-surface/95 p-3 shadow-xl backdrop-blur-sm'}
      style={layout === 'popover'
        ? {
            position: 'fixed',
            zIndex: 80,
            left: Math.max(8, Math.min(point.x + POPOVER_GAP, window.innerWidth - POPOVER_WIDTH - 8)),
            top: Math.max(8, Math.min(point.y + POPOVER_GAP, window.innerHeight - 240)),
          }
        : undefined}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <h2 className="font-heading text-base font-semibold text-text">
          {t.mapPage.plantHitChooserTitle}
        </h2>
        <button
          type="button"
          aria-label={t.mapPage.plantHitChooserClose}
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-xl leading-none text-text-muted transition-colors hover:bg-bg hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {optionList}
    </div>
  )

  if (layout === 'popover') return dialog

  return (
    <div
      data-plant-hit-chooser-backdrop
      className="fixed inset-0 z-[80] flex items-end bg-black/30"
      onClick={(event) => {
        event.stopPropagation()
        onClose()
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {dialog}
    </div>
  )
}
