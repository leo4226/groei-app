import { useT } from '../../context/LanguageContext'
import Glyph from './Glyph'

/**
 * Small muted banner for viewer accounts: "you can look, but only editors can
 * change this". Calm on purpose — viewing mode, not an error. Rendered at the
 * top of the main read surfaces (map, plants, plant detail, settings).
 */
export default function ReadOnlyBanner({ className = '' }: { className?: string }) {
  const t = useT()
  return (
    <div
      role="status"
      className={`flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs text-text-muted ${className}`}
    >
      <Glyph name="eye" size={14} className="shrink-0" />
      <span>{t.settings.readOnlyBanner}</span>
    </div>
  )
}
