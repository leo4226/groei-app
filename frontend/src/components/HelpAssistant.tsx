import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useFloreren } from '../store/useFloreren'
import { useT } from '../context/LanguageContext'
import LeonAvatar from './LeonAvatar'
import Glyph from './ui/Glyph'
import {
  sendChatMessage, draftFeedback, submitFeedback, ChatRequestError,
  type ChatMessage, type PageContext, type StekkieAction,
  type FeedbackDraft, type FeedbackKind,
} from '../api/chat'
import { renderChatText } from '../utils/chatMarkdown'
import {
  getAssistantPanelConfig,
  canRequestDraft,
  feedbackChatContext,
  careCompletionArgs,
  resolveNavigateHref,
  type AssistantSheetState,
  type FeedbackStep,
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


function extractPlantIdFromRoute(pathname: string): number | undefined {
  const match = pathname.match(/^\/(?:plants|log)\/(\d+)(?:\/|$)/)
  if (!match) return undefined
  const id = Number(match[1])
  return Number.isFinite(id) ? id : undefined
}

interface DisplayMessage extends ChatMessage {
  action?: StekkieAction | null
}

type ActionPhase = 'confirm' | 'loading' | 'done' | 'error'

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
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [sheetState, setSheetState] = useState<AssistantSheetState>('compact')
  const [dismissed, setDismissed] = useState(() => !!localStorage.getItem(DISMISS_KEY))
  const [bubble, setBubble] = useState('')
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [bubbleVisible, setBubbleVisible] = useState(false)
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [actionPhase, setActionPhase] = useState<Record<number, ActionPhase>>({})
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Feedback flow state — one box, a confirmable draft, then filed.
  const [feedbackMode, setFeedbackMode] = useState(false)
  const [feedbackStep, setFeedbackStep] = useState<FeedbackStep>('compose')
  const [reportText, setReportText] = useState('')
  const [draft, setDraft] = useState<FeedbackDraft | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<{
    ok: boolean
    url?: string
    kind?: FeedbackKind
  } | null>(null)
  const [feedbackError, setFeedbackError] = useState<string | null>(null)

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
  const assistantPageContext = useFloreren((s) => s.assistantPageContext)
  const maps = useFloreren((s) => s.maps)
  const markCareDone = useFloreren((s) => s.markCareDone)
  const activeUser = users.find((u) => u.id === activeUserId)
  const userName = activeUser?.name ?? 'user'

  const pageKey = detectPage(location.pathname)
  const panelConfig = getAssistantPanelConfig({ isMobile, sheetState })
  const canSubmitReport = canRequestDraft(reportText)

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
    if (!input.trim() || loading || feedbackMode) return
    const userMsg = input.trim()
    setInput('')
    const updated = [...messages, { role: 'user' as const, content: userMsg }]
    setMessages(updated)
    setLoading(true)

    try {
      const pageContext: PageContext = {
        ...assistantPageContext,
        route: location.pathname,
      }
      if (pageKey === 'map') {
        const slug = location.pathname.replace(/^\/map\//, '')
        if (slug) pageContext.map_slug = slug
      }
      const routePlantId = extractPlantIdFromRoute(location.pathname)
      if (routePlantId !== undefined) pageContext.plant_id = routePlantId
      const { response, suggestedAction } = await sendChatMessage(userMsg, messages, pageContext, {
        activeUserId,
        language: activeUser?.language,
      })
      setMessages(prev => [...prev, { role: 'assistant', content: response, action: suggestedAction }])
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

  // ---------- Stekkie action buttons (#410) ----------
  function handleActionClick(index: number, action: StekkieAction) {
    if (action.type === 'navigate') {
      const href = resolveNavigateHref(action.payload, maps)
      if (!href) return
      navigate(href)
      closeAssistant()
      return
    }
    // mark_care_done always requires confirmation before it touches anything.
    setActionPhase(prev => ({ ...prev, [index]: 'confirm' }))
  }

  function cancelActionConfirm(index: number) {
    setActionPhase(prev => {
      const next = { ...prev }
      delete next[index]
      return next
    })
  }

  async function confirmMarkCareDone(index: number, action: StekkieAction & { type: 'mark_care_done' }) {
    setActionPhase(prev => ({ ...prev, [index]: 'loading' }))
    try {
      const { plantId, careType, scheduleId } = careCompletionArgs(action.payload)
      await markCareDone(plantId, careType, undefined, undefined, scheduleId)
      setActionPhase(prev => ({ ...prev, [index]: 'done' }))
    } catch {
      setActionPhase(prev => ({ ...prev, [index]: 'error' }))
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

  // ---------- feedback (bug / idea) ----------
  // The chat is deliberately NOT cleared here: if the user has been describing
  // a problem to Stekkie, that transcript is the best context we have and it
  // rides along with the report.
  function startFeedback() {
    setFeedbackMode(true)
    setFeedbackStep('compose')
    setReportText('')
    setDraft(null)
    setSubmitResult(null)
    setFeedbackError(null)
    setSheetState('compact')
  }

  function cancelFeedback() {
    setFeedbackMode(false)
    setFeedbackStep('compose')
    setReportText('')
    setDraft(null)
    setSubmitResult(null)
    setFeedbackError(null)
  }

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, 'true')
    setDismissed(true)
    setOpen(false)
  }

  async function handleRequestDraft() {
    if (submitting || !canSubmitReport) return
    setSubmitting(true)
    setFeedbackError(null)
    try {
      const composed = await draftFeedback(reportText, feedbackChatContext(messages))
      setDraft(composed)
      setFeedbackStep('preview')
    } catch {
      setFeedbackError(t.help.feedback.error)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSubmitFeedback() {
    if (submitting || !draft) return
    setSubmitting(true)
    setFeedbackError(null)
    try {
      const result = await submitFeedback(reportText, draft, feedbackChatContext(messages))
      setSubmitResult({
        ok: true,
        url: result.issue_url ?? undefined,
        kind: result.kind ?? draft.kind,
      })
      setFeedbackStep('done')
    } catch {
      setFeedbackError(t.help.feedback.error)
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
              maxWidth: isMobile ? 150 : 260,
            }}
          >
            <p style={{ margin: 0, fontSize: isMobile ? 12 : 14, color: 'var(--color-text-soft)', lineHeight: 1.35 }}>
              {isMobile
                ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Glyph name="sprout" size={13} style={{ flexShrink: 0 }} />{t.help.askStekkie}</span>
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
                  {feedbackMode ? t.help.feedback.header : 'Stekkie'}
                </p>
                <p className="text-[11px] sm:text-xs text-text-muted font-heading italic flex items-center gap-1 flex-wrap leading-tight">
                  {feedbackMode
                    ? t.help.feedback.prompt
                    : <>
                        <span className="truncate">— {t.help.subtitle(userName)}</span>
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
                  if (feedbackMode) cancelFeedback()
                  else closeAssistant()
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center text-text-muted hover:text-text transition-colors"
                aria-label={feedbackMode ? t.common.cancel : t.help.close}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 space-y-2 px-0.5 overscroll-contain">
              {feedbackMode ? (
                <div className="space-y-3">
                  {/* Compose deliberately has no card of its own — the header
                      asks the question and the textarea below answers it. */}
                  {feedbackStep === 'compose' && messages.length > 0 && (
                    <div className="rounded-2xl bg-bg border border-border-soft p-3">
                      <p className="text-xs text-text-muted leading-relaxed">
                        {t.help.feedback.chatAttached}
                      </p>
                    </div>
                  )}

                  {feedbackStep === 'preview' && draft && (
                    <div className="rounded-2xl bg-bg border border-border-soft p-3 space-y-3">
                      <div>
                        <h3 className="font-heading font-bold text-base text-text">{t.help.feedback.previewTitle}</h3>
                        <p className="text-sm text-text-soft leading-relaxed mt-1">
                          {draft.composed_by === 'llm'
                            ? t.help.feedback.previewHint
                            : t.help.feedback.fallbackHint}
                        </p>
                      </div>

                      {/* Stekkie's guess is only a suggestion — one tap corrects it. */}
                      <div>
                        <p className="text-[11px] font-semibold text-text-muted mb-1.5">{t.help.feedback.kindQuestion}</p>
                        <div className="flex gap-2">
                          {(['bug', 'feature'] as const).map((kind) => (
                            <button
                              key={kind}
                              onClick={() => setDraft({ ...draft, kind })}
                              aria-pressed={draft.kind === kind}
                              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all active:scale-[0.98] ${
                                draft.kind === kind
                                  ? 'bg-primary text-white border-primary'
                                  : 'bg-surface text-text-muted border-border-soft hover:border-primary/40'
                              }`}
                            >
                              {kind === 'bug' ? t.help.feedback.kindBug : t.help.feedback.kindFeature}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-xl bg-surface border border-border-soft px-3 py-2">
                        <p className="text-sm font-semibold text-text break-words">{draft.title}</p>
                        <div className="text-sm text-text-soft leading-relaxed mt-1.5">
                          {renderChatText(draft.body)}
                        </div>
                      </div>
                    </div>
                  )}

                  {feedbackStep === 'done' && submitResult?.ok && (
                    <div className="rounded-2xl px-4 py-3 text-sm leading-relaxed bg-green-100 text-green-800">
                      <p className="font-semibold">
                        {submitResult.kind === 'feature'
                          ? t.help.feedback.doneFeature
                          : t.help.feedback.doneBug}
                      </p>
                      {submitResult.url && (
                        <a
                          href={submitResult.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline text-green-700 text-xs mt-1 inline-block break-all"
                        >
                          {t.help.feedback.viewIssue}
                        </a>
                      )}
                    </div>
                  )}

                  {feedbackError && (
                    <div className="rounded-2xl px-4 py-3 text-sm leading-relaxed bg-red-50 text-red-700">
                      <p>{feedbackError}</p>
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
                    <div key={i} className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <div className={`max-w-[88%] sm:max-w-[80%] rounded-2xl px-3.5 sm:px-4 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                        msg.role === 'user'
                          ? 'bg-primary text-white rounded-br-md'
                          : 'bg-bg text-text-soft rounded-bl-md'
                      }`}>
                        {msg.role === 'assistant' ? renderChatText(msg.content) : msg.content}
                      </div>
                      {msg.role === 'assistant' && msg.action && (
                        <div className="max-w-[88%] sm:max-w-[80%]">
                          {actionPhase[i] === 'done' ? (
                            <p className="text-xs text-green-700 px-1">{t.help.chat.actionDone}</p>
                          ) : actionPhase[i] === 'error' ? (
                            <p className="text-xs text-red-600 px-1">{t.help.chat.actionError}</p>
                          ) : actionPhase[i] === 'confirm' || actionPhase[i] === 'loading' ? (
                            <div className="flex gap-2">
                              <button
                                onClick={() => cancelActionConfirm(i)}
                                disabled={actionPhase[i] === 'loading'}
                                className="px-3 py-1.5 rounded-xl border border-border-soft text-text-muted text-xs font-medium active:scale-[0.98] transition-all disabled:opacity-40"
                              >
                                {t.help.chat.actionCancel}
                              </button>
                              <button
                                onClick={() => msg.action?.type === 'mark_care_done' && confirmMarkCareDone(i, msg.action)}
                                disabled={actionPhase[i] === 'loading'}
                                className="px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-semibold active:scale-[0.98] transition-all disabled:opacity-40"
                              >
                                {actionPhase[i] === 'loading' ? '…' : t.help.chat.actionConfirm}
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleActionClick(i, msg.action!)}
                              className="px-3 py-1.5 rounded-xl bg-primary/10 text-primary border border-primary/30 text-xs font-semibold active:scale-[0.98] transition-all hover:bg-primary/15"
                            >
                              {msg.action.label}
                            </button>
                          )}
                        </div>
                      )}
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

            {feedbackMode ? (
              <div className="border-t border-border-soft pt-3 shrink-0 space-y-2">
                {feedbackStep === 'compose' && (
                  <>
                    <textarea
                      value={reportText}
                      onChange={(e) => setReportText(e.target.value)}
                      placeholder={t.help.feedback.placeholder}
                      rows={isMobile ? 3 : 2}
                      disabled={submitting}
                      autoFocus
                      className="w-full bg-bg rounded-xl px-3.5 py-2.5 text-sm border border-border-soft focus:outline-none focus:border-primary text-text placeholder:text-text-muted/50 disabled:opacity-60 resize-none leading-relaxed"
                    />
                    <button
                      onClick={handleRequestDraft}
                      disabled={!canSubmitReport || submitting}
                      className="w-full h-11 rounded-xl bg-primary text-white flex items-center justify-center gap-1.5 disabled:opacity-40 active:scale-[0.98] transition-all text-sm font-semibold"
                    >
                      {submitting ? (
                        <>
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                          </svg>
                          {t.help.feedback.drafting}
                        </>
                      ) : (
                        t.help.feedback.next
                      )}
                    </button>
                  </>
                )}

                {feedbackStep === 'preview' && (
                  <div className="grid grid-cols-[auto_1fr] gap-2">
                    <button
                      onClick={() => { setFeedbackStep('compose'); setFeedbackError(null) }}
                      disabled={submitting}
                      className="px-4 h-11 rounded-xl border border-border text-text-muted text-sm font-semibold active:scale-[0.98] transition-all disabled:opacity-40"
                    >
                      {t.help.feedback.back}
                    </button>
                    <button
                      onClick={handleSubmitFeedback}
                      disabled={submitting}
                      className="h-11 rounded-xl bg-green-600 text-white flex items-center justify-center gap-1.5 disabled:opacity-40 active:scale-[0.98] transition-all text-sm font-semibold"
                    >
                      {submitting ? (
                        <>
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                          </svg>
                          {t.help.feedback.submitting}
                        </>
                      ) : (
                        t.help.feedback.submit
                      )}
                    </button>
                  </div>
                )}

                <button
                  onClick={cancelFeedback}
                  className="text-xs text-text-muted/60 hover:text-text-muted transition-colors underline underline-offset-2"
                >
                  {feedbackStep === 'done' ? t.help.close : t.common.cancel}
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
                    disabled={loading}
                    className="flex-1 bg-bg rounded-xl px-3.5 py-2.5 text-sm border border-border-soft focus:outline-none focus:border-primary text-text placeholder:text-text-muted/50 disabled:opacity-60 resize-none leading-relaxed max-h-24"
                  />
                  <button
                    onClick={handleSend}
                    disabled={loading || !input.trim()}
                    className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center disabled:opacity-40 active:scale-95 transition-all shrink-0"
                    aria-label={t.help.chat.send}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M14 8L2 2l2.5 6L2 14l12-6z" fill="currentColor"/>
                    </svg>
                  </button>
                </div>

                <div className="flex items-center justify-between shrink-0 gap-3">
                  <p className="text-[11px] text-text-muted/50 italic min-w-0">{t.help.disclaimer}</p>
                  <button
                    onClick={startFeedback}
                    className="px-3 py-2 rounded-xl bg-bg border border-border-soft text-text-muted text-xs sm:text-sm font-medium hover:border-primary/40 hover:text-text active:scale-[0.98] transition-all shrink-0"
                  >
                    {t.help.feedback.open}
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
