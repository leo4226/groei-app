import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useFloreren } from '../store/useFloreren'
import { useT } from '../context/LanguageContext'
import LeonAvatar from './LeonAvatar'

type PageKey = 'dashboard' | 'calendar' | 'settings' | 'editor'

/** Pages where Leonnetje is allowed to appear */
const ALLOWED_PAGES = new Set<PageKey>(['dashboard', 'calendar', 'settings', 'editor'])

function detectPage(pathname: string): PageKey | null {
  if (pathname.startsWith('/maps/') && pathname.includes('/edit-layout')) return 'editor'
  if (pathname.startsWith('/maps/') && pathname.includes('/settings')) return 'editor'
  if (pathname.startsWith('/dashboard')) return 'dashboard'
  if (pathname.startsWith('/calendar')) return 'calendar'
  if (pathname.startsWith('/settings')) return 'settings'
  return null
}

/**
 * Generate a random personal bubble for Leonnetje.
 * Takes the user's name so he can be a personal pestkop.
 */
function randomBubble(pageKey: PageKey, name: string): string {
  const bubbles: Record<PageKey, string[]> = {
    dashboard: [
      `Nou ${name}, weer wakker?`,
      `Mag ik iets voor je doen, ${name}? Nee? Mooi.`,
      `${name}, je planten kijken verdrietig.`,
      `Wist je dat ${name} de grappigste gebruiker is? Nou ik niet.`,
    ],
    calendar: [
      `Alsof jij je hieraan gaat houden, ${name}.`,
      `Veel succes met die planning, ${name}.`,
      `Haha ${name}, leuk geprobeerd.`,
      `Nog een herinnering vergeten, ${name}?`,
    ],
    settings: [
      `Alsof instellingen ${name} gaan helpen.`,
      `Veel klikken, niks veranderen, ${name}.`,
      `Gaat het al beter, ${name}? Nee.`,
      `${name} denkt dat instellingen het probleem oplossen. Schattig.`,
    ],
    editor: [
      `Nog meer muren optrekken, ${name}?`,
      `Tekenen kan je ook niet, ${name}.`,
      `Dit wordt vast weer een rommeltje, ${name}.`,
      `${name} is weer aan het slepen… hou ons op de hoogte.`,
    ],
  }
  const texts = bubbles[pageKey]
  return texts[Math.floor(Math.random() * texts.length)]
}

const DISMISS_KEY = 'floreren_help_dismissed'

export default function HelpAssistant() {
  const t = useT()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [bubble, setBubble] = useState('')
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [bubbleVisible, setBubbleVisible] = useState(false)
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === 'true')

  // Get the active user's name for personalization
  const users = useFloreren((s) => s.users)
  const activeUserId = useFloreren((s) => s.activeUserId)
  const userName = users.find((u) => u.id === activeUserId)?.name ?? 'gebruiker'

  const pageKey = detectPage(location.pathname)

  // Show a random speech bubble every ~15s while the sheet is closed
  // MUST be before the early return so all hooks always run (prevent #310).
  useEffect(() => {
    if (!pageKey || dismissed || open) {
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current)
      setBubbleVisible(false)
      return
    }

    const showBubble = () => {
      setBubble(randomBubble(pageKey, userName))
      setBubbleVisible(true)
      bubbleTimerRef.current = setTimeout(() => setBubbleVisible(false), 4000)
    }

    // Show one immediately
    showBubble()

    const interval = setInterval(showBubble, 15000)
    return () => {
      clearInterval(interval)
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current)
    }
  }, [pageKey, open, userName, dismissed])

  // Don't render at all if not on an allowed page (after all hooks for #310 safety)
  if (!pageKey || dismissed) return null

  const tip = t.help.tips[pageKey as keyof typeof t.help.tips]

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, 'true')
    setDismissed(true)
  }

  return (
    <>
      {/* Speech bubble — to the left of Leonnetje (who's on the right) */}
      {bubbleVisible && !open && (
        <div
          style={{
            position: 'fixed',
            bottom: 100,
            right: 72,
            zIndex: 100,
            animation: 'slide-up 0.25s ease-out',
          }}
        >
          <div
            style={{
              position: 'relative',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 16,
              padding: '10px 16px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              maxWidth: 200,
            }}
          >
            <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-soft)', lineHeight: 1.4 }}>{bubble}</p>
            {/* Triangle pointing right (towards avatar) */}
            <div
              style={{
                position: 'absolute', right: -6, top: '50%', transform: 'translateY(-50%) rotate(-45deg)',
                width: 12, height: 12,
                background: 'var(--color-surface)',
                borderRight: '1px solid var(--color-border)',
                borderTop: '1px solid var(--color-border)',
              }}
            />
          </div>
        </div>
      )}

      {/* Floating avatar button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-[90] w-12 h-12 rounded-full bg-surface border-2 border-primary shadow-lg hover:shadow-xl active:scale-95 transition-all duration-200 flex items-center justify-center overflow-hidden"
        aria-label={t.help.title}
      >
        <LeonAvatar size={48} className="scale-[1.3] translate-y-[-2px]" />
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-[200] bg-black/40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Bottom sheet */}
      {open && (
        <div className="fixed bottom-0 left-0 right-0 z-[210] animate-slide-up bg-surface rounded-t-3xl border-t-2 border-primary shadow-2xl pb-[calc(env(safe-area-inset-bottom)+16px)]">
          {/* Handle bar */}
          <div className="w-10 h-1 bg-border rounded-full mx-auto mt-3 mb-2" />

          <div className="px-5 pb-4 flex flex-col gap-4">
            {/* Avatar + Title */}
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-bg-warm border-2 border-primary/30 flex items-center justify-center overflow-hidden shrink-0">
                <LeonAvatar size={56} className="scale-[1.3] translate-y-[-2px]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-heading font-bold text-lg text-text">
                  {t.help.title}
                </p>
                <p className="text-xs text-text-muted font-heading italic">
                  — {userName}s persoonlijke plantenpestkop
                </p>
              </div>
            </div>

            {/* Tip card */}
            <div className="bg-bg rounded-xl border border-border-soft px-4 py-3.5">
              <p className="text-sm text-text-soft leading-relaxed">{tip}</p>
            </div>

            {/* Navigation hints per page */}
            <div className="text-xs text-text-muted text-center">
              {pageKey === 'editor' && <p>  Dubbeltik = verwijderen |  Sleep = pannen</p>}
              {pageKey === 'dashboard' && <p>  Wist je dat je planten kunt toevoegen via de + knop?</p>}
            </div>

            {/* Close button */}
            <button
              onClick={() => setOpen(false)}
              className="w-full py-2.5 rounded-xl bg-primary text-white font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              {t.help.close}
            </button>

            {/* Dismiss permanently */}
            <button
              onClick={handleDismiss}
              className="text-xs text-text-muted/60 hover:text-text-muted transition-colors text-center underline underline-offset-2"
            >
              {t.help.dismiss}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
