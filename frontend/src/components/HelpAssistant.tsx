import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useT } from '../context/LanguageContext'
import LeonAvatar from './LeonAvatar'

type PageKey = 'dashboard' | 'plants' | 'maps' | 'calendar' | 'settings' | 'editor' | 'plantDetail' | 'addPlant'

function detectPage(pathname: string): PageKey {
  if (pathname.startsWith('/maps/') && pathname.includes('/edit-layout')) return 'editor'
  if (pathname.startsWith('/maps/') && pathname.includes('/settings')) return 'editor'
  if (pathname.startsWith('/map/')) return 'maps'
  if (pathname.startsWith('/plants/add')) return 'addPlant'
  if (pathname.startsWith('/plants/') && pathname.includes('/care')) return 'plantDetail'
  if (pathname.startsWith('/plants/') && pathname.includes('/edit')) return 'addPlant'
  if (pathname.startsWith('/plants/')) return 'plantDetail'
  if (pathname.startsWith('/dashboard')) return 'dashboard'
  if (pathname.startsWith('/calendar')) return 'calendar'
  if (pathname.startsWith('/settings')) return 'settings'
  return 'dashboard'
}

const BUBBLE_TEXTS: Record<PageKey, string[]> = {
  dashboard: ['Kijk eens aan! 🌱', 'Hulp nodig?', 'Ben je er klaar voor?'],
  plants: ['Planten genoeg!', 'Ziet er groen uit!', 'Allemaal in bloei?'],
  maps: ['Navigeren maar!', 'Waar staan je planten?', 'Lekker aan het tuinieren?'],
  calendar: ['Plannen is het halve werk!', 'Op schema blijven!'],
  settings: ['Instellingen naar wens?', 'Alles naar je zin?'],
  editor: ['Tijd om te tekenen!', 'Creatief bezig?', 'Zon of schaduw?'],
  plantDetail: ['Mooie plant!', 'Lekker aan het verzorgen?', 'Ziet er gezond uit!'],
  addPlant: ['Nieuwe aanwinst?', 'Welke plant wordt het?', 'Another one! 🌿'],
}

export default function HelpAssistant() {
  const t = useT()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [bubble, setBubble] = useState('')
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [bubbleVisible, setBubbleVisible] = useState(false)

  const pageKey = detectPage(location.pathname)
  const tip = t.help.tips[pageKey]

  // Show a random speech bubble every ~15s while the sheet is closed
  useEffect(() => {
    if (open) {
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current)
      setBubbleVisible(false)
      return
    }

    const showBubble = () => {
      const texts = BUBBLE_TEXTS[pageKey] || BUBBLE_TEXTS.dashboard
      setBubble(texts[Math.floor(Math.random() * texts.length)])
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
  }, [pageKey, open])

  return (
    <>
      {/* Speech bubble */}
      {bubbleVisible && !open && (
        <div className="fixed bottom-24 right-4 z-[100] animate-slide-up">
          <div className="relative bg-surface border border-border rounded-2xl px-4 py-2.5 shadow-lg max-w-[200px]">
            <p className="text-sm text-text-soft leading-snug">{bubble}</p>
            {/* Triangle pointing down */}
            <div
              className="absolute -bottom-[6px] right-6 w-3 h-3 bg-surface border-r border-b border-border rotate-45"
              style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%)' }}
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
                  — Je persoonlijke plantenmaatje
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
              {pageKey === 'addPlant' && <p>  Je kunt ook gewoon een eigen naam intypen!</p>}
              {pageKey === 'plantDetail' && <p>  ️ Vergeet niet taken af te tikken na verzorging</p>}
            </div>

            {/* Close button */}
            <button
              onClick={() => setOpen(false)}
              className="w-full py-2.5 rounded-xl bg-primary text-white font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              {t.help.close}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
