import { useState } from 'react'
import { useT } from '../../context/LanguageContext'
import Glyph from '../ui/Glyph'
import { useInstallPrompt } from '../../hooks/useInstallPrompt'

/**
 * Install prompt sheet — the single entry point for "put Floreren on your
 * home screen".
 *
 * - Android/Chrome: triggers the native install dialog via the captured
 *   `beforeinstallprompt` event. One tap, OS handles the rest.
 * - iOS: no native prompt exists, so we hand-guide Share → Add to Home Screen
 *   with explicit steps. We also surface the push-notification hook (iOS push
 *   only works from a Home Screen install) to make the step worth taking.
 *
 * Never rendered for users already running in standalone mode (the parent
 * decides visibility via `shouldOffer` / the settings entry).
 */
interface Props {
  onClose: () => void
}

export default function InstallPromptSheet({ onClose }: Props) {
  const t = useT()
  const { isIos, canNativePrompt, promptInstall } = useInstallPrompt()
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function handleInstall() {
    if (done) return
    setBusy(true)
    const ok = await promptInstall()
    setBusy(false)
    if (ok) {
      setDone(true)
      setTimeout(onClose, 900)
    } else if (!isIos && !canNativePrompt) {
      // No native prompt available (e.g. desktop with its own address-bar
      // install UI, or criteria not met yet) — fall back to guidance.
      setDone(true)
    }
  }

  const kicker = isIos ? t.installPrompt.iosKicker : t.installPrompt.androidKicker
  const title = isIos ? t.installPrompt.iosTitle : t.installPrompt.androidTitle
  const lede = isIos ? t.installPrompt.iosLede : t.installPrompt.androidLede

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-black/45"
      onClick={done ? onClose : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-t-3xl border border-border bg-surface p-5 pb-[max(env(safe-area-inset-bottom,0px),20px)] shadow-[0_-8px_40px_rgba(0,0,0,0.25)] animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />

        <div className="mb-1 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
          {kicker}
        </div>
        <h2 className="mb-2 text-center font-heading text-[20px] font-medium text-text">
          {done ? t.installPrompt.doneTitle : title}
        </h2>
        <p className="mb-4 text-center text-[13px] leading-snug text-text-soft">
          {done ? t.installPrompt.doneLede : lede}
        </p>

        {!done && isIos && (
          <ol className="mb-4 space-y-2.5">
            <li className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-primary/10 font-mono text-[12px] font-semibold text-primary">1</span>
              <span className="text-[13px] text-text">{t.installPrompt.iosStepShare}</span>
            </li>
            <li className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-primary/10 font-mono text-[12px] font-semibold text-primary">2</span>
              <span className="text-[13px] text-text">{t.installPrompt.iosStepHomeScreen}</span>
            </li>
            <li className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-primary/10 font-mono text-[12px] font-semibold text-primary">3</span>
              <span className="text-[13px] text-text">{t.installPrompt.iosStepAdd}</span>
            </li>
          </ol>
        )}

        {!done && (
          <p className="mb-4 flex items-center justify-center gap-1.5 text-center text-[12px] text-text-muted">
            <Glyph name="alert" size={13} />
            {isIos ? t.installPrompt.iosPushHook : t.installPrompt.androidPushHook}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <button
            onClick={() => void handleInstall()}
            disabled={busy || done}
            className="w-full cursor-pointer rounded-full border-none bg-primary py-3 text-[14px] font-medium text-white disabled:opacity-60"
          >
            {busy
              ? t.installPrompt.installing
              : isIos
                ? t.installPrompt.iosCta
                : t.installPrompt.androidCta}
          </button>
          <button
            onClick={onClose}
            className="w-full cursor-pointer rounded-full border border-border bg-surface py-3 text-[14px] font-medium text-text"
          >
            {t.installPrompt.later}
          </button>
        </div>
      </div>
    </div>
  )
}
