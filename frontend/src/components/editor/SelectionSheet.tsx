import { useState, type ReactNode } from 'react'
import Glyph from '../ui/Glyph'
import { useT } from '../../context/LanguageContext'

interface Props {
  /** Short description of what is selected, e.g. "Gazon · Zone". */
  title: string
  /** The properties panel for the selected element. */
  children: ReactNode
  onClose: () => void
}

/**
 * Touch-only sheet for the currently selected element.
 *
 * The properties panels live in the desktop sidebar, which on a phone is a
 * 224px full-height drawer that opens at the *top of the drawing palette* —
 * so editing the size of a shape you just tapped meant scrolling past the mode
 * switch, nine zone types, the underlay controls, objects and shadows, roughly
 * 1400px, while the drawer covered 57% of the screen and hid the shape itself.
 *
 * This sheet puts the same panel directly above the tool dock instead. It is
 * capped at 45dvh so the selected shape stays visible while you type, and it
 * collapses to a single bar when you want the canvas back without deselecting.
 */
export default function SelectionSheet({ title, children, onClose }: Props) {
  const t = useT()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div
      className="absolute inset-x-0 z-30 border-t border-border bg-surface/97 shadow-[0_-4px_20px_rgba(31,42,30,0.13)] backdrop-blur-md"
      // Sits directly above the floating tool dock (bottom-3, ~44px tall).
      style={{ bottom: 'calc(var(--safe-bottom) + 4.25rem)' }}
    >
      <div className="flex items-center gap-1 px-3 py-2">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-2 pr-2 text-left"
        >
          <Glyph
            name={collapsed ? 'chevron-up' : 'chevron-down'}
            size={16}
            className="shrink-0 text-text-muted"
          />
          <span className="truncate font-heading text-sm font-medium text-text">{title}</span>
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.editor.selection.deselect}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-text-muted"
        >
          <Glyph name="x" size={18} />
        </button>
      </div>

      {!collapsed && (
        <div className="max-h-[38dvh] overflow-y-auto overscroll-contain border-t border-border/60">
          {children}
        </div>
      )}
    </div>
  )
}
