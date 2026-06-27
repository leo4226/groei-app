import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useFloreren } from '../store/useFloreren'
import { useT } from '../context/LanguageContext'
import LeonAvatar from './LeonAvatar'
import { sendChatMessage, submitBugReport, ChatRequestError, type ChatMessage, type PageContext } from '../api/chat'

type PageKey = 'calendar' | 'settings' | 'editor' | 'map' | 'plants' | 'identify'


const STORAGE_KEY_POS = 'floreren_stekkie_pos'
const DISMISS_KEY = 'floreren_help_dismissed'

const BTN_SIZE = 48 // w-12 h-12
const DEFAULT_RIGHT = 16 // right-4
const DEFAULT_BOTTOM = 80 // bottom-20

function detectPage(pathname: string): PageKey | null {
  if (pathname.startsWith('/maps/') && pathname.includes('/edit-layout')) return 'editor'
  if (pathname.startsWith('/maps/') && pathname.includes('/settings')) return 'editor'
  if (pathname.startsWith('/calendar')) return 'calendar'
  if (pathname.startsWith('/settings')) return 'settings'
  if (pathname.startsWith('/map/')) return 'map'
  if (pathname.startsWith('/plants')) return 'plants'
  if (pathname.startsWith('/identify')) return 'identify'
  if (pathname.startsWith('/log')) return 'plants'
  return null
}

function randomBubble(pageKey: PageKey, name: string): string {
  const bubbles: Record<PageKey, string[]> = {
    calendar: [
      `Want to know what's on the schedule this week?`,
      `Ask me about care tips for this month!`,
      `Something unclear in the calendar? I'll explain.`,
    ],
    settings: [
      `Want to change something? I can explain what everything does.`,
      `Stuck on something? Happy to help!`,
      `Questions about your account or household? Ask away.`,
    ],
    editor: [
      `How does the editor work again? Ask me!`,
      `Moving walls? I'll explain everything about the editor.`,
      `Stuck with your layout? I can help, ${name}.`,
    ],
    map: [
      `Need help with your garden map? Ask me!`,
      `Tap me if something's unclear about your plants!`,
      `Questions about a plant's position? I'm here!`,
      `${name}, want to know more about a plant on your map?`,
    ],
    plants: [
      `Want help picking a new plant? Ask me!`,
      `Curious about a plant's care needs?`,
      `Need tips on keeping your plants happy? I can help!`,
      `Having trouble with a plant? Ask Stekkie!`,
    ],
    identify: [
      `Found a mystery plant? Let's figure it out together!`,
      `Upload a photo and I'll help identify it!`,
      `Not sure what plant this is? I can help!`,
    ],
  }
  const texts = bubbles[pageKey]
  return texts[Math.floor(Math.random() * texts.length)]
}

function getDefaultPos(): { x: number; y: number } {
  return {
    x: window.innerWidth - DEFAULT_RIGHT - BTN_SIZE,
    y: window.innerHeight - DEFAULT_BOTTOM - BTN_SIZE,
  }
}

export default function HelpAssistant() {
  const t = useT()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState(() => !!localStorage.getItem(DISMISS_KEY))
  const [bubble, setBubble] = useState('')
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [bubbleVisible, setBubbleVisible] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Bug report state
  const [bugReportMode, setBugReportMode] = useState(false)
  const [bugTurnCount, setBugTurnCount] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<{
    ok: boolean
    url?: string
    error?: string
  } | null>(null)
  const hasTriggeredRef = useRef(false)

  // Bubble throttle: set true once user opens chat — no more proactive bubbles
  const hasInteractedRef = useRef(false)
  // Track which pageKeys have already shown a bubble this session
  const shownPagesRef = useRef<Set<string>>(new Set())

  // Drag state
  const buttonRef = useRef<HTMLButtonElement>(null)
  const wasDraggedRef = useRef(false)
  const dragRef = useRef({
    isDragging: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
    moved: false,
  })

  const [buttonPos, setButtonPos] = useState<{ x: number; y: number } | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_POS)
    if (saved) {
      try {
        const p = JSON.parse(saved)
        if (typeof p.x === 'number' && typeof p.y === 'number') return p
      } catch { /* ignore */ }
    }
    return null
  })

  // Compute default on first client render if nothing saved
  const pos = buttonPos ?? getDefaultPos()

  const users = useFloreren((s) => s.users)
  const activeUserId = useFloreren((s) => s.activeUserId)
  const userName = users.find((u) => u.id === activeUserId)?.name ?? 'user'

  const pageKey = detectPage(location.pathname)

  // ---------- bubble cycle ----------
  useEffect(() => {
    if (!pageKey || open || dismissed || hasInteractedRef.current) {
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current)
      setBubbleVisible(false)
      return
    }

    // Show at most once per page per session
    if (shownPagesRef.current.has(pageKey)) return

    shownPagesRef.current.add(pageKey)

    const delayTimer = setTimeout(() => {
      setBubble(randomBubble(pageKey, userName))
      setBubbleVisible(true)
      bubbleTimerRef.current = setTimeout(() => setBubbleVisible(false), 4000)
    }, 5000)

    return () => {
      clearTimeout(delayTimer)
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current)
    }
  }, [pageKey, open, dismissed, userName])

  // ---------- auto-scroll chat ----------
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ---------- Bug report: client-side 3-question flow ----------
  const BUG_QUESTIONS = [
    'Je gaat nu een bug melden. Ik help je er een duidelijke melding van te maken.\n\n**Op welke pagina was je en wat probeerde je te doen?**',
    '**Wat gebeurde er?** Kreeg je een foutmelding, gebeurde er niks, werd de pagina wit, of zag je iets anders dan verwacht?',
    '**Wat was de laatste stap voordat het misging?** (Bijv. "ik tikte op het water-icoontje" of "ik opende de plantenlijst")',
  ]

  useEffect(() => {
    if (bugReportMode && !hasTriggeredRef.current) {
      hasTriggeredRef.current = true
      setMessages([{ role: 'assistant', content: BUG_QUESTIONS[0] }])
    }
  }, [bugReportMode])

  // When user answers in bug mode, append next question or wait for submit
  useEffect(() => {
    if (bugReportMode && bugTurnCount > 0 && bugTurnCount < BUG_QUESTIONS.length) {
      const nextQuestion = BUG_QUESTIONS[bugTurnCount]
      // Small delay so the user answer renders first
      const timer = setTimeout(() => {
        setMessages(prev => [...prev, { role: 'assistant', content: nextQuestion }])
      }, 400)
      return () => clearTimeout(timer)
    }
  }, [bugTurnCount, bugReportMode])

  if (!pageKey) return null
  if (dismissed) return null

  // ---------- helpers ----------
  async function handleSend() {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    const updated = [...messages, { role: 'user' as const, content: userMsg }]
    setMessages(updated)
    setLoading(true)

    // In bug report mode, count user turns — no chatbot call
    if (bugReportMode) {
      setBugTurnCount(prev => prev + 1)
      setLoading(false)
      return
    }

    try {
      const pageContext: PageContext = { route: location.pathname }
      if (pageKey === 'map') {
        const slug = location.pathname.replace(/^\/map\//, '')
        if (slug) pageContext.map_slug = slug
      }
      const reply = await sendChatMessage(userMsg, messages, pageContext)
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch (err) {
      // "Offline" covers a true browser network failure (TypeError) and the
      // backend's gateway statuses when the Stekkie worker is down/timing out
      // (502 Bad Gateway, 503, 504 Gateway Timeout). Anything else is generic.
      const isOffline =
        err instanceof TypeError ||
        (err instanceof ChatRequestError && [502, 503, 504].includes(err.status))
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: isOffline ? t.help.chat.unavailable : t.help.chat.error,
      }])
    } finally {
      setLoading(false)
    }
  }

  function startBugReport() {
    setMessages([])
    setBugReportMode(true)
    setBugTurnCount(0)
    setSubmitResult(null)
    hasTriggeredRef.current = false
  }

  function cancelBugReport() {
    setBugReportMode(false)
    setBugTurnCount(0)
    setMessages([])
    setSubmitResult(null)
    hasTriggeredRef.current = false
  }

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, 'true')
    setDismissed(true)
    setOpen(false)
  }

  async function handleSubmitBugReport() {
    if (submitting) return
    setSubmitting(true)
    setSubmitResult(null)
    try {
      const result = await submitBugReport(
        messages,
        window.location.pathname,
      )
      setSubmitResult({ ok: true, url: result.issue_url ?? undefined })
      // Reset to normal after 3s
      setTimeout(() => {
        setBugReportMode(false)
        setBugTurnCount(0)
        setMessages([])
        setSubmitResult(null)
        hasTriggeredRef.current = false
      }, 3000)
    } catch (err) {
      setSubmitResult({
        ok: false,
        error: err instanceof Error ? err.message : t.help.chat.submitError,
      })
    } finally {
      setSubmitting(false)
    }
  }

  // ---------- drag handlers ----------
  function handlePointerDown(e: React.PointerEvent) {
    const btn = buttonRef.current
    if (!btn) return
    btn.setPointerCapture(e.pointerId)
    const rect = btn.getBoundingClientRect()
    dragRef.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: rect.left,
      origY: rect.top,
      moved: false,
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragRef.current.isDragging) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    if (!dragRef.current.moved && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
      dragRef.current.moved = true
    }
    setButtonPos({
      x: dragRef.current.origX + dx,
      y: dragRef.current.origY + dy,
    })
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (!dragRef.current.isDragging) return
    dragRef.current.isDragging = false

    if (dragRef.current.moved) {
      wasDraggedRef.current = true
      const finalX = buttonPos?.x ?? dragRef.current.origX
      const finalY = buttonPos?.y ?? dragRef.current.origY
      localStorage.setItem(STORAGE_KEY_POS, JSON.stringify({ x: finalX, y: finalY }))
    }

    const btn = buttonRef.current
    if (btn) {
      try { btn.releasePointerCapture(e.pointerId) } catch { /* already released */ }
    }
  }

  // ---------- render ----------
  return (
    <>
      {/* Speech bubble — positioned to the left of the button, vertically centered */}
      {bubbleVisible && !open && (
        <div
          style={{
            position: 'fixed',
            right: typeof window !== 'undefined' ? window.innerWidth - pos.x + 12 : undefined,
            top: typeof window !== 'undefined' ? pos.y + BTN_SIZE / 2 : undefined,
            transform: 'translateY(-50%)',
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

      {/* Floating avatar button — draggable */}
      <button
        ref={buttonRef}
        onClick={() => {
          if (wasDraggedRef.current) {
            wasDraggedRef.current = false
            return
          }
          hasInteractedRef.current = true
          setOpen(true)
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          position: 'fixed',
          left: pos.x,
          top: pos.y,
          zIndex: 90,
          width: BTN_SIZE,
          height: BTN_SIZE,
          touchAction: 'none', /* prevent scroll while dragging on mobile */
          cursor: 'grab',
        }}
        className="rounded-full bg-surface border-2 border-primary shadow-lg hover:shadow-xl active:scale-95 active:cursor-grabbing transition-shadow duration-200 flex items-center justify-center overflow-hidden"
        aria-label={t.help.title}
      >
        <LeonAvatar size={BTN_SIZE} className="scale-[1.3] translate-y-[-2px]" />
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
        <div className="fixed bottom-0 left-0 right-0 z-[210] animate-slide-up bg-surface rounded-t-3xl border-t-2 border-primary shadow-2xl flex flex-col max-h-[85dvh] pb-[calc(env(safe-area-inset-bottom)+16px)]">
          <button
            onClick={() => setOpen(false)}
            className="block mx-auto mt-3 mb-2 px-6 py-2 -my-1 group"
            aria-label={t.help.close}
          >
            <div className="w-10 h-1 bg-border rounded-full group-active:bg-text-muted transition-colors shrink-0" />
          </button>

          <div className="px-5 pb-4 flex flex-col gap-3 flex-1 min-h-0">
            {/* Avatar + Title */}
            <div className="flex items-center gap-4 shrink-0">
              <div className="w-14 h-14 rounded-full bg-bg-warm border-2 border-primary/30 flex items-center justify-center overflow-hidden shrink-0">
                <LeonAvatar size={56} className="scale-[1.3] translate-y-[-2px]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-heading font-bold text-lg text-text">
                  {bugReportMode ? t.help.chat.bugReportHeader : t.help.title}
                </p>
                <p className="text-xs text-text-muted font-heading italic flex items-center gap-1 flex-wrap">
                  {bugReportMode
                    ? `${t.help.chat.bugReport}`
                    : <>
                        <span>— {userName}s persoonlijke plantenhulp</span>
                        <span className="text-text-muted/40 mx-1">·</span>
                        <button
                          onClick={handleDismiss}
                          className="text-primary hover:text-primary/70 underline underline-offset-2 transition-colors cursor-pointer"
                        >
                          {t.help.dismiss}
                        </button>
                      </>
                  }
                </p>
              </div>
              <button
                onClick={() => {
                  if (bugReportMode) cancelBugReport()
                  else setOpen(false)
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center text-text-muted hover:text-text transition-colors"
                aria-label={bugReportMode ? 'Cancel bug report' : t.help.close}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* Chat messages */}
            <div className="flex-1 overflow-y-auto min-h-0 space-y-2 px-1">
              {messages.length === 0 && !bugReportMode && (
                <div className="text-center py-6 text-text-muted text-sm">
                  <p>{t.help.chat.empty}</p>
                  <p className="text-xs mt-1 opacity-60">{t.help.chat.example}</p>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-primary text-white rounded-br-md'
                      : 'bg-bg text-text-soft rounded-bl-md'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-bg rounded-2xl rounded-bl-md px-4 py-2.5 text-sm text-text-muted italic">
                    <span className="animate-pulse">{t.help.chat.thinking}</span>
                  </div>
                </div>
              )}

              {/* Submit result message */}
              {submitResult && (
                <div className={`flex justify-start`}>
                  <div className={`max-w-[80%] rounded-2xl rounded-bl-md px-4 py-2.5 text-sm leading-relaxed ${
                    submitResult.ok
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-50 text-red-700'
                  }`}>
                    {submitResult.ok ? (
                      <>
                        <p className="font-semibold">{t.help.chat.submitted}</p>
                        {submitResult.url && (
                          <a
                            href={submitResult.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline text-green-700 text-xs mt-1 inline-block"
                          >
                            {submitResult.url}
                          </a>
                        )}
                      </>
                    ) : (
                      <p>{submitResult.error ?? t.help.chat.submitError}</p>
                    )}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input area - hide during submission result */}

            <div className="flex gap-2 items-center border-t border-border-soft pt-3 shrink-0">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder={bugReportMode
                  ? bugTurnCount >= 3 ? '' : t.help.chat.inputPlaceholder
                  : t.help.chat.inputPlaceholder
                }
                disabled={loading || submitting || !!submitResult}
                className="flex-1 bg-bg rounded-xl px-4 py-2.5 text-sm border border-border-soft focus:outline-none focus:border-primary text-text placeholder:text-text-muted/50 disabled:opacity-60"
              />
              <button
                onClick={handleSend}
                disabled={loading || !input.trim() || !!submitResult}
                className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center disabled:opacity-40 active:scale-95 transition-all shrink-0"
                aria-label={t.help.chat.send}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M14 8L2 2l2.5 6L2 14l12-6z" fill="currentColor"/>
                </svg>
              </button>

              {/* Submit to GitHub button — shown after 3 bug answers */}
              {bugReportMode && bugTurnCount >= 3 && !submitResult && (
                <button
                  onClick={handleSubmitBugReport}
                  disabled={submitting}
                  className="w-auto px-4 h-10 rounded-xl bg-green-600 text-white flex items-center justify-center gap-1.5 disabled:opacity-40 active:scale-95 transition-all shrink-0 text-sm font-semibold whitespace-nowrap"
                  aria-label={t.help.chat.submit}
                >
                  {submitting ? (
                    <span className="flex items-center gap-1.5">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      {t.help.chat.submitting}
                    </span>
                  ) : (
                    t.help.chat.submit
                  )}
                </button>
              )}
            </div>

            {/* Footer: bug report button or disclaimer */}
            <div className="flex items-center justify-between shrink-0">
              {bugReportMode ? (
                <button
                  onClick={cancelBugReport}
                  className="text-xs text-text-muted/60 hover:text-text-muted transition-colors underline underline-offset-2"
                >
                  Cancel bug report
                </button>
              ) : (
                <p className="text-[11px] text-text-muted/50 italic">Stekkie is a simple clanker — please be patient for a response.</p>
              )}
            </div>

            {/* Report a bug button — shown below footer in normal mode */}
            {!bugReportMode && (
              <button
                onClick={startBugReport}
                className="w-full mt-1 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium hover:bg-red-100 active:scale-[0.98] transition-all shrink-0"
              >
                {t.help.chat.bugReport}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}
