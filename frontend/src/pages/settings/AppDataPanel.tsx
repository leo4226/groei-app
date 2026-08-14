import { useState } from 'react'
import { useT } from '../../context/LanguageContext'
import { dataExport } from '../../api/client'
import Glyph from '../../components/ui/Glyph'

interface Props {
  onInstallClick: () => void
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * The app itself: installing it, getting your data out, resetting the
 * assistant, and which build you're on.
 *
 * "Install the app" lives here rather than under Notifications, where it used
 * to sit because push depends on it. Someone looking for it looks under the
 * app, not under alerts.
 */
export default function AppDataPanel({ onInstallClick }: Props) {
  const t = useT()
  const [busy, setBusy] = useState<'json' | 'csv' | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [assistantReset, setAssistantReset] = useState(false)

  async function download(kind: 'json' | 'csv') {
    setBusy(kind)
    setError(null)
    setReady(false)
    try {
      const blob = kind === 'json'
        ? await dataExport.bundle()
        : await dataExport.careLogCsv()
      const day = new Date().toISOString().slice(0, 10)
      downloadBlob(
        blob,
        kind === 'json' ? `floreren-export-${day}.json` : `floreren-care-log-${day}.csv`,
      )
      setReady(true)
      setTimeout(() => setReady(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : t.settings.downloadError)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-5">
      {/* ── Install ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{t.installNudge.title}</div>
          <div className="mt-0.5 text-xs text-text-muted">{t.installNudge.subtitle}</div>
        </div>
        <button
          onClick={onInstallClick}
          className="shrink-0 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold text-text transition-colors hover:border-primary/50"
        >
          {t.installPrompt.androidCta}
        </button>
      </div>

      {/* ── Export ───────────────────────────────────────────────────────── */}
      <div className="border-t border-border pt-4">
        <div className="text-sm font-semibold">{t.settings.dataTitle}</div>
        <p className="mt-1 text-xs leading-relaxed text-text-muted">{t.settings.dataDescription}</p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            onClick={() => download('json')}
            disabled={busy !== null}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {busy === 'json' ? (
              <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> {t.settings.downloading}</>
            ) : t.settings.downloadData}
          </button>
          <button
            onClick={() => download('csv')}
            disabled={busy !== null}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-border bg-surface py-2.5 text-sm font-semibold text-text transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {busy === 'csv' ? (
              <><span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" /> {t.settings.downloading}</>
            ) : t.settings.downloadCareLogCsv}
          </button>
        </div>
        {ready && <p className="mt-2 text-sm text-primary">{t.settings.downloadReady}</p>}
        {error && <p className="mt-2 text-sm text-fiery-red">{error}</p>}
      </div>

      {/* ── Assistant ────────────────────────────────────────────────────── */}
      <div className="border-t border-border pt-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-semibold">{t.settings.assistantTitle}</div>
            <div className="mt-0.5 text-xs text-text-muted">{t.settings.assistantDescription}</div>
          </div>
          <button
            onClick={() => {
              localStorage.removeItem('floreren_stekkie_pos')
              localStorage.removeItem('floreren_help_dismissed')
              setAssistantReset(true)
              setTimeout(() => setAssistantReset(false), 2500)
            }}
            className="shrink-0 rounded-xl border border-border px-3 py-2 text-sm font-semibold text-text transition-transform active:scale-[0.98]"
          >
            {assistantReset ? (
              <span className="inline-flex items-center gap-1.5 text-primary">
                <Glyph name="check" size={14} /> {t.settings.resetAssistantDone}
              </span>
            ) : t.settings.resetAssistant}
          </button>
        </div>
      </div>

      {/* ── Version ──────────────────────────────────────────────────────── */}
      <div className="border-t border-border pt-4">
        <div className="text-sm font-semibold">{t.settings.about}</div>
        <p className="mt-1 font-mono text-xs text-text-muted">
          {`v${__APP_VERSION__} · ${__BUILD_HASH__}`}
        </p>
      </div>
    </div>
  )
}
