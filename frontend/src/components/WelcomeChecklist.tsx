import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '../context/LanguageContext'

interface Props {
  hasMap: boolean
  hasPlant: boolean
  accountId: number
  onCreateMap: () => void
}

const STORAGE_PREFIX = 'floreren-onboarding-dismissed-'

function dismissedKey(accountId: number): string {
  return `${STORAGE_PREFIX}${accountId}`
}

function isDismissed(accountId: number): boolean {
  try {
    return localStorage.getItem(dismissedKey(accountId)) === '1'
  } catch {
    return false
  }
}

function setDismissed(accountId: number) {
  try {
    localStorage.setItem(dismissedKey(accountId), '1')
  } catch { /* noop */ }
}

export default function WelcomeChecklist({ hasMap, hasPlant, accountId, onCreateMap }: Props) {
  const t = useT()
  const navigate = useNavigate()
  const [dismissed, setDismissedState] = useState(() => isDismissed(accountId))
  const [isInstalled, setIsInstalled] = useState(
    () => window.matchMedia('(display-mode: standalone)').matches
  )

  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent)

  useEffect(() => {
    const mq = window.matchMedia('(display-mode: standalone)')
    const handler = (e: MediaQueryListEvent) => setIsInstalled(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const complete = hasMap && hasPlant

  // Auto-hide when map + plant are done
  useEffect(() => {
    if (complete && !isDismissed(accountId)) {
      setDismissed(accountId)
      setDismissedState(true)
    }
  }, [complete, accountId])

  if (dismissed) return null

  type Step = {
    key: string
    done: boolean
    label: string
    cta?: string
    action?: () => void
    hint?: string
  }

  const steps: Step[] = [
    {
      key: 'map',
      done: hasMap,
      label: t.onboarding.createMap.label,
      cta: t.onboarding.createMap.cta,
      action: onCreateMap,
    },
    {
      key: 'plant',
      done: hasPlant,
      label: t.onboarding.addPlant.label,
      cta: t.onboarding.addPlant.cta,
      action: () => navigate('/plants/add'),
    },
    ...(isMobile ? [{
      key: 'install',
      done: isInstalled,
      label: t.onboarding.installApp.label,
      hint: isIos
        ? t.onboarding.installApp.hintIos
        : t.onboarding.installApp.hintAndroid,
    }] : []),
  ]

  const completedCount = steps.filter((s) => s.done).length
  const totalSteps = steps.length

  return (
    <div
      style={{
        margin: '0 24px 20px',
        padding: '18px 20px',
        borderRadius: 14,
        border: '1px solid var(--color-border)',
        background: 'linear-gradient(135deg, var(--color-surface) 0%, #F0F7E8 100%)',
      }}
    >
      {/* Title + dismiss */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 16, color: 'var(--color-text)' }}>
          {t.onboarding.title}
        </div>
        <button
          onClick={() => { setDismissed(accountId); setDismissedState(true) }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-mono)', fontSize: 9,
            textTransform: 'uppercase', letterSpacing: '0.18em',
            color: 'var(--color-text-muted)', padding: 4,
          }}
        >
          {t.onboarding.dismiss}
        </button>
      </div>

      {/* Step list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {steps.map((step) => (
          <div
            key={step.key}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              opacity: step.done ? 0.5 : 1,
            }}
          >
            {/* Status icon */}
            <div
              style={{
                width: 22, height: 22, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                border: step.done ? 'none' : '2px solid var(--color-border)',
                background: step.done ? 'var(--color-primary)' : 'transparent',
                fontSize: 11, color: '#fff',
              }}
            >
              {step.done ? '✓' : ''}
            </div>

            {/* Label */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: 'var(--font-heading)', fontWeight: 400,
                  fontSize: 13, color: step.done ? 'var(--color-text-muted)' : 'var(--color-text)',
                  textDecoration: step.done ? 'line-through' : 'none',
                }}
              >
                {step.label}
              </div>
              {/* Hint for steps without a CTA (e.g. install) */}
              {!step.done && step.hint && (
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9,
                  textTransform: 'uppercase', letterSpacing: '0.13em',
                  color: 'var(--color-text-muted)', marginTop: 3,
                }}>
                  {step.hint}
                </div>
              )}
            </div>

            {/* CTA button — only show if not done and has an action */}
            {!step.done && step.cta && step.action && (
              <button
                onClick={step.action}
                style={{
                  background: 'var(--color-primary)', color: '#fff', border: 'none',
                  borderRadius: 8, padding: '7px 14px', cursor: 'pointer',
                  fontFamily: 'var(--font-mono)', fontSize: 9,
                  textTransform: 'uppercase', letterSpacing: '0.15em',
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >
                {step.cta}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            flex: 1, height: 4, borderRadius: 2,
            background: 'var(--color-border-soft)', overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%', borderRadius: 2,
              width: `${(completedCount / totalSteps) * 100}%`,
              background: completedCount === totalSteps
                ? 'var(--color-primary)'
                : 'linear-gradient(90deg, var(--color-primary), var(--color-due))',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)', fontSize: 9,
            color: 'var(--color-text-muted)', whiteSpace: 'nowrap',
            textTransform: 'uppercase', letterSpacing: '0.12em',
          }}
        >
          {t.onboarding.stepLabel(completedCount, totalSteps)}
        </div>
      </div>
    </div>
  )
}
