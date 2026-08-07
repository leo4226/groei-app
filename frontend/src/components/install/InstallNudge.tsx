import { useState } from 'react'
import { useT } from '../../context/LanguageContext'
import { useInstallPrompt } from '../../hooks/useInstallPrompt'
import Glyph from '../ui/Glyph'
import InstallPromptSheet from './InstallPromptSheet'

/**
 * Persistent install nudge for mobile users who haven't installed the PWA.
 *
 * Shows a slim, dismissible banner above the bottom nav on the map page.
 * It appears only when the user is on a phone, not running standalone, and
 * hasn't dismissed it within the last RE_SHOW_AFTER_DAYS days. Tapping it
 * opens the full InstallPromptSheet (native prompt on Android, step-by-step
 * on iOS).
 *
 * Auto-hides once installed (`display-mode: standalone` flips) — the hook
 * tracks that.
 */
export default function InstallNudge() {
  const t = useT()
  const { shouldOffer, dismiss } = useInstallPrompt()
  const [sheetOpen, setSheetOpen] = useState(false)

  if (!shouldOffer) return null

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-[max(env(safe-area-inset-bottom,0px),76px)] z-[60] flex justify-center px-4">
        <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.18)] animate-slide-up">
          <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-primary/10">
            <Glyph name="home" size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-text">{t.installNudge.title}</p>
            <p className="truncate text-[12px] text-text-muted">{t.installNudge.subtitle}</p>
          </div>
          <button
            onClick={() => setSheetOpen(true)}
            className="flex-none cursor-pointer rounded-full border-none bg-primary px-3.5 py-2 text-[12px] font-medium text-white"
          >
            {t.installNudge.cta}
          </button>
          <button
            onClick={dismiss}
            aria-label={t.installNudge.dismissAria}
            className="flex-none cursor-pointer rounded-full p-1.5 text-text-muted hover:text-text"
          >
            <span className="text-[14px] leading-none">×</span>
          </button>
        </div>
      </div>

      {sheetOpen && <InstallPromptSheet onClose={() => setSheetOpen(false)} />}
    </>
  )
}
