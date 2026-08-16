import { useT } from '../../context/LanguageContext'
import ReadOnlyBanner from './ReadOnlyBanner'
import Glyph from './Glyph'

interface Props {
  /** Route back to where the user came from (e.g. /plants, /maps). */
  onBack?: () => void
  /** Optional heading shown above the standard notice. Defaults to the shared
   * "editing page" copy so every blocked write surface reads the same. */
  title?: string
  /** Optional body shown under the heading. Defaults to the shared copy. */
  body?: string
}

/**
 * Full-page block for pure write surfaces (add/edit plant, photo round,
 * identify, …). A viewer can read everything else in the app, but these pages
 * have nothing to read — the form *is* the write. A calm notice beats a 403.
 *
 * Distinct from ReadOnlyBanner (a small strip on a readable page) — this is a
 * whole-screen state.
 */
export default function ReadOnlyWritePage({ onBack, title, body }: Props) {
  const t = useT()
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <ReadOnlyBanner />
      <div>
        <p className="font-heading text-lg font-medium text-text">
          {title ?? t.settings.editorOnlyPage}
        </p>
        {body && (
          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-text-muted">{body}</p>
        )}
      </div>
      {onBack && (
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white"
        >
          <Glyph name="arrow-left" size={14} aria-hidden />
          {t.common.back}
        </button>
      )}
    </div>
  )
}
