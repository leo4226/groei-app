import { useEffect, useRef } from 'react'
import { useT } from '../../context/LanguageContext'
import type { UseEditorTourReturn } from '../../hooks/useEditorTour'

interface Props {
  tour: UseEditorTourReturn
  onNavigateToSettings: () => void
}

export default function EditorTour({ tour, onNavigateToSettings }: Props) {
  const t = useT()
  const { isActive, currentStep, steps, next, skip } = tour
  const prevTargetRef = useRef<Element | null>(null)

  useEffect(() => {
    if (prevTargetRef.current) {
      prevTargetRef.current.classList.remove('tour-spotlight')
      prevTargetRef.current = null
    }
    if (!isActive) return
    const step = steps[currentStep]
    if (step?.tourTargetId) {
      const el = document.querySelector(`[data-tour-id="${step.tourTargetId}"]`)
      if (el) {
        el.classList.add('tour-spotlight')
        prevTargetRef.current = el
      }
    }
    return () => {
      if (prevTargetRef.current) {
        prevTargetRef.current.classList.remove('tour-spotlight')
        prevTargetRef.current = null
      }
    }
  }, [isActive, currentStep, steps])

  if (!isActive) return null

  const step = steps[currentStep]
  const isLast = currentStep === steps.length - 1
  const isSettingsStep = step.action === 'settings'
  const total = steps.length

  return (
    <>
      {/* Overlay — pointer events pass through except on the card */}
      <div
        className="fixed inset-0 z-[100] pointer-events-none"
        style={{ background: 'rgba(0,0,0,0.65)' }}
      />

      {/* Tour card */}
      <div className="fixed bottom-4 left-4 right-4 z-[110] mx-auto max-w-lg bg-surface rounded-2xl shadow-2xl border border-border p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-primary">
            {t.onboarding.stepLabel(currentStep + 1, total)}
          </span>
          <button
            onClick={skip}
            className="text-xs text-text-muted hover:text-text"
          >
            {t.editor.tour.skip}
          </button>
        </div>

        <div>
          <p className="font-semibold text-text mb-1">{step.title}</p>
          <p className="text-sm text-text-muted leading-relaxed">{step.body}</p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          {isSettingsStep ? (
            <>
              <button
                onClick={skip}
                className="text-xs px-3 py-1.5 rounded-lg border border-border text-text-muted hover:bg-bg"
              >
                {t.editor.tour.skipSettings}
              </button>
              <button
                onClick={() => { skip(); onNavigateToSettings() }}
                className="text-xs px-3 py-1.5 rounded-lg bg-primary text-white hover:opacity-90"
              >
                {t.editor.tour.goToSettings}
              </button>
            </>
          ) : (
            <button
              onClick={isLast ? skip : next}
              className="text-xs px-3 py-1.5 rounded-lg bg-primary text-white hover:opacity-90"
            >
              {isLast ? t.editor.tour.done : t.editor.tour.next}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
