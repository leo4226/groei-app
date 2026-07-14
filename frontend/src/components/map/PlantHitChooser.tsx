import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useT } from '../../context/LanguageContext'
import { resolveIconUrl } from '../../utils/icons'
import type { PlantHitCandidate } from '../../utils/plantHitTesting'
import { chooserLayout, chooserOptions, placeChooserPopover } from './plantHitChooserModel'

export interface PlantHitChooserProps {
  candidates: readonly PlantHitCandidate[]
  point: { x: number; y: number }
  isMobile: boolean
  onChoose: (candidate: PlantHitCandidate) => void
  onClose: () => void
}

function isolateModalBackground(dialog: HTMLElement): () => void {
  const records: Array<{ element: HTMLElement; inert: boolean; ariaHidden: string | null }> = []
  let branch = dialog
  while (branch.parentElement) {
    const parent = branch.parentElement
    for (const sibling of parent.children) {
      if (sibling === branch || !(sibling instanceof HTMLElement)) continue
      records.push({
        element: sibling,
        inert: Boolean(sibling.inert),
        ariaHidden: sibling.getAttribute('aria-hidden'),
      })
      sibling.inert = true
      sibling.setAttribute('aria-hidden', 'true')
    }
    branch = parent
    if (parent === document.body) break
  }

  let released = false
  return () => {
    if (released) return
    released = true
    for (const record of records) {
      record.element.inert = record.inert
      if (record.ariaHidden === null) record.element.removeAttribute('aria-hidden')
      else record.element.setAttribute('aria-hidden', record.ariaHidden)
    }
  }
}

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
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  )
  const releaseIsolationRef = useRef<() => void>(() => undefined)
  const [popoverPosition, setPopoverPosition] = useState<{ left: number; top: number } | null>(null)

  const restoreFocus = useCallback(() => {
    const previousFocus = previousFocusRef.current
    if (previousFocus?.isConnected) previousFocus.focus()
  }, [])

  const releaseIsolation = useCallback(() => {
    releaseIsolationRef.current()
    releaseIsolationRef.current = () => undefined
  }, [])

  const dismiss = useCallback(() => {
    releaseIsolation()
    restoreFocus()
    onClose()
  }, [onClose, releaseIsolation, restoreFocus])

  const choose = useCallback((candidate: PlantHitCandidate) => {
    releaseIsolation()
    restoreFocus()
    onChoose(candidate)
  }, [onChoose, releaseIsolation, restoreFocus])

  useEffect(() => {
    firstOptionRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        dismiss()
        return
      }
      if (event.key !== 'Tab' || layout !== 'sheet') return
      const focusable = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      } else if (!dialogRef.current?.contains(document.activeElement)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [dismiss, layout])

  useLayoutEffect(() => {
    if (layout !== 'popover') return
    const place = () => {
      const bounds = dialogRef.current?.getBoundingClientRect()
      if (!bounds) return
      setPopoverPosition(placeChooserPopover(
        point,
        { width: bounds.width, height: bounds.height },
        { width: window.innerWidth, height: window.innerHeight },
      ))
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [layout, options.length, point])

  useEffect(() => {
    if (layout !== 'sheet' || !dialogRef.current) return
    const release = isolateModalBackground(dialogRef.current)
    releaseIsolationRef.current = release
    return release
  }, [layout])

  useEffect(() => () => {
    releaseIsolation()
    restoreFocus()
  }, [releaseIsolation, restoreFocus])

  const optionList = (
    <div
      data-plant-hit-options
      className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain"
    >
      {options.map((option, index) => {
        const iconUrl = resolveIconUrl(option.iconKey)
        return (
          <button
            key={option.key}
            ref={index === 0 ? firstOptionRef : undefined}
            type="button"
            data-plant-hit-option={option.key}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-text transition-colors hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            onClick={() => choose(option.candidate)}
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
      ref={dialogRef}
      role="dialog"
      aria-label={t.mapPage.plantHitChooserTitle}
      aria-modal={layout === 'sheet'}
      className={layout === 'sheet'
        ? 'flex min-h-0 w-full flex-col overflow-hidden rounded-t-3xl border border-b-0 border-border bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl'
        : 'flex min-h-0 w-[272px] flex-col overflow-hidden rounded-2xl border border-border bg-surface/95 p-3 shadow-xl backdrop-blur-sm'}
      style={layout === 'popover'
        ? {
            position: 'fixed',
            zIndex: 80,
            left: popoverPosition?.left ?? 8,
            top: popoverPosition?.top ?? 8,
            maxHeight: 'calc(100dvh - 16px)',
            visibility: popoverPosition ? 'visible' : 'hidden',
          }
        : {
            maxHeight: 'calc(100dvh - max(1rem, env(safe-area-inset-top, 0px)))',
          }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="mb-2 flex shrink-0 items-center justify-between gap-3 px-1">
        <h2 className="font-heading text-base font-semibold text-text">
          {t.mapPage.plantHitChooserTitle}
        </h2>
        <button
          type="button"
          aria-label={t.mapPage.plantHitChooserClose}
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-xl leading-none text-text-muted transition-colors hover:bg-bg hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          onClick={dismiss}
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
        dismiss()
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {dialog}
    </div>
  )
}
