import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useFloreren } from '../store/useFloreren'
import { useT } from '../context/LanguageContext'
import LeonAvatar from './LeonAvatar'
import Glyph from './ui/Glyph'
import { sendChatMessage, submitBugReport, ChatRequestError, type ChatMessage, type PageContext } from '../api/chat'
import {
  bugStepFromAnswerCount,
  getAssistantPanelConfig,
  isBugReportReadyToSubmit,
  STEKKIE_BUG_QUESTIONS,
  type AssistantSheetState,
} from './helpAssistantModel'

type PageKey = 'calendar' | 'settings' | 'editor' | 'map' | 'plants' | 'identify'

const STORAGE_KEY_POS = 'floreren_stekkie_pos'
const DISMISS_KEY = 'floreren_help_dismissed'

const BTN_SIZE_DESKTOP = 48
const BTN_SIZE_MOBILE = 44
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

function getDefaultPos(buttonSize: number): { x: number; y: number } {
  return {
    x: window.innerWidth - DEFAULT_RIGHT - buttonSize,
    y: window.innerHeight - DEFAULT_BOTTOM - buttonSize,
  }
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(max-width: 640px)').matches
  })

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const handleChange = () => setIsMobile(mq.matches)
    handleChange()
    mq.addEventListener('change', handleChange)
    return () => mq.removeEventListener('change', handleChange)
  }, [])

  return isMobile
}

export default function HelpAssistant() {
  const t = useT()
  const location = useLocation()
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [sheetState, setSheetState] = useState<AssistantSheetState>('compact')
  const [dismissed, setDismissed] = useState(() => !!localStorage.getItem(DISMISS_KEY))
  const [bubble, setBubble] = useState('')
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [bubbleVisible, setBubbleVisible] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Bug report wizard state
  const [bugReportMode, setBugReportMode] = useState(false)
  const [bugAnswers, setBugAnswers] = useState<string[]>([])
  const [bugDraft, setBugDraft] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<{
    ok: boolean
    url?: string
    error?: string
  } | null>(null)

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

  const buttonSize = isMobile ? BTN_SIZE_MOBILE : BTN_SIZE_DESKTOP
  const pos = buttonPos ?? getDefaultPos(buttonSize)

  const users = useFloreren((s) => s.users)
  const activeUserId = useFloreren((s) => s.activeUserId)
  const activeUser = users.find((u) => u.id === activeUserId)
  const userName = activeUser?.name ?? 'user'

  const pageKey = detectPage(location.pathname)
  const panelConfig = getAssistantPanelConfig({ isMobile, sheetState })
  const bugStep = bugStepFromAnswerCount(bugAnswers.length)
  const currentBugQuestion = STEKKIE_BUG_QUESTIONS[bugAnswers.length]
  const canSubmitBugReport = isBugReportReadyToSubmit(bugAnswers)

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

  if (!pageKey) return null
  if (dismissed) return null

  // ---------- helpers ----------
  async function handleSend() {
    if (!input.trim() || loading || bugReportMode) return
    const userMsg = input.trim()
    setInput('')
    const updated = [...messages, { role: 'user' as const, content: userMsg }]
    setMessages(updated)
    setLoading(true)

    try {
      const pageContext: PageContext = { route: location.pathname }
      if (pageKey === 'map') {
        const slug = location.pathname.replace(/^\/map\//, '')
        if (slug) pageContext.map_slug = slug
      }
      const reply = await sendChatMessage(userMsg, messages, pageContext, {
        activeUserId,
        language: activeUser?.language,
      })
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

  function openAssistant() {
    hasInteractedRef.current = true
    setSheetState('compact')
    setOpen(true)
  }

  function closeAssistant() {
    setOpen(false)
  }

  function startBugReport() {
    setMessages([])
    setBugReportMode(true)
    setBugAnswers([])
    setBugDraft('')
    setSubmitResult(null)
    setSheetState('compact')
  }

  function cancelBugReport() {
    setBugReportMode(false)
    setBugAnswers([])
    setBugDraft('')
    setSubmitResult(null)
  }

  function handleBugNext() {
    const answer = bugDraft.trim()
    if (!answer || bugStep.readyToReview) return
    setBugAnswers(prev => [...prev, answer])
    setBugDraft('')
  }

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, 'true')
    setDismissed(true)
    setOpen(false)
  }

  function buildBugReportMessages(): ChatMessage[] {
    const reportMessages: ChatMessage[] = []
    STEKKIE_BUG_QUESTIONS.forEach((question, index) => {
      reportMessages.push({
        role: 'assistant',
        content: `${question.title}\n${question.prompt}`,
      })
      if (bugAnswers[index]) {
        reportMessages.push({ role: 'user', content: bugAnswers[index] })
      }
    })
    return reportMessages
  }

  async function handleSubmitBugReport() {
    if (submitting || !canSubmitBugReport) return
    setSubmitting(true)
    setSubmitResult(null)
    try {
      const result = await submitBugReport(
        buildBugReportMessages(),
        window.location.pathname,
      )
      setSubmitResult({ ok: true, url: result.issue_url ?? undefined })
      // Reset to normal after 3s
      setTimeout(() => {
        setBugReportMode(false)
        setBugAnswers([])
        setBugDraft('')
        setMessages([])
        setSubmitResult(null)
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

  const sheetHeightStyle = { maxHeight: panelConfig.maxHeight }
  const showBackdrop = open && (!isMobile || panelConfig.backdrop !== 'none')
  const backdropClass = isMobile ? 'fixed inset-0 z-[200] bg-black/15' : 'fixed inset-0 z-[200] bg-black/40'

  // ---------- render ----------
  return (
    <>
      {/* Speech bubble / mobile seed chip */}
      {bubbleVisible && !open && (
        <div
          style={{
            position: 'fixed',
            right: typeof window !== 'undefined' ? window.innerWidth - pos.x + 10 : undefined,
            top: typeof window !== 'undefined' ? pos.y + buttonSize / 2 : undefined,
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
              borderRadius: isMobile ? 999 : 16,
              padding: isMobile ? '7px 11px' : '10px 16px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              maxWidth: isMobile ? 150 : 200,
            }}
          >
            <p style={{ margin: 0, fontSize: isMobile ? 12 : 13, color: 'var(--color-text-soft)', lineHeight: 1.35 }}>
              {isMobile
                ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Glyph name="sprout" size={13} style={{ flexShrink: 0 }} />Vraag Stekkie</span>
                : bubble}
            </p>
            {!isMobile && (
              <div
                style={{
                  position: 'absolute', right: -6, top: '50%', transform: 'translateY(-50%) rotate(-45deg)',
                  width: 12, height: 12,
                  background: 'var(--color-surface)',
                  borderRight: '1px solid var(--color-border)',
                  borderTop: '1px solid var(--color-border)',
                }}
              />
            )}
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
          openAssistant()
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          position: 'fixed',
          left: pos.x,
          top: pos.y,
          zIndex: 90,
          width: buttonSize,
          height: buttonSize,
          touchAction: 'none', /* prevent scroll while dragging on mobile */
          cursor: 'grab',
        }}
        className="rounded-full bg-surface border-2 border-primary shadow-lg hover:shadow-xl active:scale-95 active:cursor-grabbing transition-shadow duration-200 flex items-center justify-center overflow-hidden"
        aria-label={t.help.title}
      >
        <LeonAvatar size={buttonSize} className="scale-[1.3] translate-y-[-2px]" />
      </button>

      {showBackdrop && (
        <div
          className={backdropClass}
          onClick={closeAssistant}
        />
      )}

      {/* Pocket dock */}
      {open && (
        <div
          className="fixed bottom-0 left-0 right-0 z-[210] animate-slide-up bg-surface rounded-t-3xl border-t-2 border-primary shadow-2xl flex flex-col pb-[calc(env(safe-area-inset-bottom)+12px)] sm:pb-[calc(env(safe-area-inset-bottom)+16px)]"
          style={sheetHeightStyle}
        >
          <button
            onClick={() => setSheetState(prev => prev === 'compact' ? 'expanded' : 'compact')}
            className="block mx-auto mt-2 mb-1 px-8 py-2 -my-1 group"
            aria-label={sheetState === 'compact' ? t.help.chat.expand : t.help.chat.collapse}
            aria-expanded={sheetState === 'expanded'}
          >
            <div className="w-10 h-1 bg-border rounded-full group-active:bg-text-muted transition-colors shrink-0" />
          </button>

          <div className="px-4 sm:px-5 pb-3 sm:pb-4 flex flex-col gap-2.5 sm:gap-3 flex-1 min-h-0">
            {/* Compact title row */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="w-9 h-9 sm:w-14 sm:h-14 rounded-full bg-bg-warm border-2 border-primary/30 flex items-center justify-center overflow-hidden shrink-0">
                <LeonAvatar size={isMobile ? 36 : 56} className="scale-[1.3] translate-y-[-2px]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-heading font-bold text-base sm:text-lg text-text leading-tight">
                  {bugReportMode ? t.help.chat.bugReportHeader : 'Stekkie'}
                </p>
                <p className="text-[11px] sm:text-xs text-text-muted font-heading italic flex items-center gap-1 flex-wrap leading-tight">
                  {bugReportMode
                    ? t.help.chat.stepLabel(bugStep.current, bugStep.total)
                    : <>
                        <span className="truncate">— {userName}s persoonlijke plantenhulp</span>
                        {!isMobile && <span className="text-text-muted/40 mx-1">·</span>}
                        {!isMobile && (
                          <button
                            onClick={handleDismiss}
                            className="text-primary hover:text-primary/70 underline underline-offset-2 transition-colors cursor-pointer"
                          >
                            {t.help.dismiss}
                          </button>
                        )}
                      </>
                  }
                </p>
              </div>
              <button
                onClick={() => setSheetState(prev => prev === 'compact' ? 'expanded' : 'compact')}
                className="w-8 h-8 rounded-full flex items-center justify-center text-text-muted hover:text-text transition-colors"
                aria-label={sheetState === 'compact' ? t.help.chat.expand : t.help.chat.collapse}
              >
                <span className="text-sm">{sheetState === 'compact' ? '⤢' : '⤡'}</span>
              </button>
              <button
                onClick={() => {
                  if (bugReportMode) cancelBugReport()
                  else closeAssistant()
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center text-text-muted hover:text-text transition-colors"
                aria-label={bugReportMode ? t.common.cancel : t.help.close}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 space-y-2 px-0.5 overscroll-contain">
              {bugReportMode ? (
                <div className="space-y-3">
                  {!bugStep.readyToReview && currentBugQuestion && (
                    <div className="rounded-2xl bg-bg border border-border-soft p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary mb-1">
                        {t.help.chat.stepLabel(bugStep.current, bugStep.total)}
                      </p>
                      <h3 className="font-heading font-bold text-base text-text">{currentBugQuestion.title}</h3>
                      <p className="text-sm text-text-soft leading-relaxed mt-1">{currentBugQuestion.prompt}</p>
                    </div>
                  )}

                  {bugStep.readyToReview && (
                    <div className="rounded-2xl bg-bg border border-border-soft p-3 space-y-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary mb-1">{t.help.chat.review}</p>
                        <h3 className="font-heading font-bold text-base text-text">{t.help.chat.reviewTitle}</h3>
                        <p className="text-sm text-text-soft leading-relaxed mt-1">{t.help.chat.reviewHint}</p>
                      </div>
                      <div className="rounded-xl bg-surface border border-border-soft px-3 py-2 text-xs text-text-muted break-all">
                        {window.location.pathname}
                      </div>
                      <ol className="space-y-2">
                        {bugAnswers.map((answer, index) => (
                          <li key={`${index}-${answer}`} className="rounded-xl bg-surface border border-border-soft px-3 py-2">
                            <p className="text-[11px] font-semibold text-text-muted mb-1">{STEKKIE_BUG_QUESTIONS[index]?.title}</p>
                            <p className="text-sm text-text whitespace-pre-wrap break-words">{answer}</p>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {submitResult && (
                    <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
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
                              className="underline text-green-700 text-xs mt-1 inline-block break-all"
                            >
                              {submitResult.url}
                            </a>
                          )}
                        </>
                      ) : (
                        <p>{submitResult.error ?? t.help.chat.submitError}</p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {messages.length === 0 && (
                    <div className="text-center py-5 sm:py-6 text-text-muted text-sm">
                      <p>{t.help.chat.empty}</p>
                      <p className="text-xs mt-1 opacity-60">{t.help.chat.example}</p>
                    </div>
                  )}
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[88%] sm:max-w-[80%] rounded-2xl px-3.5 sm:px-4 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words ${
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
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {bugReportMode ? (
              <div className="border-t border-border-soft pt-3 shrink-0 space-y-2">
                {!bugStep.readyToReview && !submitResult && (
                  <>
                    <textarea
                      value={bugDraft}
                      onChange={(e) => setBugDraft(e.target.value)}
                      placeholder={t.help.chat.inputPlaceholder}
                      rows={isMobile ? 3 : 2}
                      disabled={submitting}
                      className="w-full bg-bg rounded-xl px-3.5 py-2.5 text-sm border border-border-soft focus:outline-none focus:border-primary text-text placeholder:text-text-muted/50 disabled:opacity-60 resize-none leading-relaxed"
                    />
                    <button
                      onClick={handleBugNext}
                      disabled={!bugDraft.trim() || submitting}
                      className="w-full h-11 rounded-xl bg-primary text-white flex items-center justify-center disabled:opacity-40 active:scale-[0.98] transition-all text-sm font-semibold"
                    >
                      {bugAnswers.length + 1 >= STEKKIE_BUG_QUESTIONS.length ? t.help.chat.review : t.help.chat.next}
                    </button>
                  </>
                )}

                {bugStep.readyToReview && !submitResult && (
                  <div className="grid grid-cols-[auto_1fr] gap-2">
                    <button
                      onClick={() => {
                        setBugAnswers(prev => prev.slice(0, -1))
                        setBugDraft(bugAnswers[bugAnswers.length - 1] ?? '')
                      }}
                      disabled={submitting}
                      className="px-4 h-11 rounded-xl border border-border text-text-muted text-sm font-semibold active:scale-[0.98] transition-all disabled:opacity-40"
                    >
                      {t.common.back}
                    </button>
                    <button
                      onClick={handleSubmitBugReport}
                      disabled={submitting || !canSubmitBugReport}
                      className="h-11 rounded-xl bg-green-600 text-white flex items-center justify-center gap-1.5 disabled:opacity-40 active:scale-[0.98] transition-all text-sm font-semibold"
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
                  </div>
                )}

                <button
                  onClick={cancelBugReport}
                  className="text-xs text-text-muted/60 hover:text-text-muted transition-colors underline underline-offset-2"
                >
                  {t.common.cancel}
                </button>
              </div>
            ) : (
              <>
                <div className="flex gap-2 items-end border-t border-border-soft pt-3 shrink-0">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (!isMobile && e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSend()
                      }
                    }}
                    rows={1}
                    placeholder={t.help.chat.inputPlaceholder}
                    disabled={loading || submitting || !!submitResult}
                    className="flex-1 bg-bg rounded-xl px-3.5 py-2.5 text-sm border border-border-soft focus:outline-none focus:border-primary text-text placeholder:text-text-muted/50 disabled:opacity-60 resize-none leading-relaxed max-h-24"
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
                </div>

                <div className="flex items-center justify-between shrink-0 gap-3">
                  <p className="text-[11px] text-text-muted/50 italic min-w-0">Stekkie is a simple clanker — please be patient for a response.</p>
                  <button
                    onClick={startBugReport}
                    className="px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm font-medium hover:bg-red-100 active:scale-[0.98] transition-all shrink-0"
                  >
                    {t.help.chat.bugReport}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
