import { useState } from 'react'
import { useT } from '../../context/LanguageContext'

const stepBtnStyle: React.CSSProperties = {
  width: 40, height: 40, borderRadius: '50%',
  border: '1px solid var(--color-border)', background: 'var(--color-surface)',
  color: 'var(--color-text)', fontSize: 20, lineHeight: 1, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

interface Props {
  /** Current stored override, or null when the modelled value is in use. */
  measured: number | null
  /** Value the stepper starts from when no override is stored. */
  fallback: number
  saving?: boolean
  /** null clears the override and falls back to the modelled sun hours. */
  onSave: (value: number | null) => void | Promise<void>
  onCancel: () => void
}

/**
 * Stepper for the manually measured sun hours at a plant's spot (#645).
 *
 * Extracted from PlantQuickSheet so the passport can offer the same edit — it
 * reads `measured_sun_hours` but had no way to set it, which left the two panes
 * able to disagree with no way to reconcile them from the passport (#878).
 */
export default function MeasuredSunEditor({ measured, fallback, saving = false, onSave, onCancel }: Props) {
  const t = useT()
  const [draft, setDraft] = useState(measured ?? Math.round(fallback * 2) / 2)

  return (
    <div style={{ padding: '12px', borderRadius: '0 0 10px 10px', background: 'var(--color-bg)', borderTop: '1px solid var(--color-border-soft)' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-muted)', marginBottom: 4 }}>
        {t.plantQuickSheet.sunMeasureTitle}
      </div>
      <p style={{ margin: '0 0 10px', fontFamily: 'var(--font-heading)', fontSize: 12, color: 'var(--color-text-soft)' }}>
        {t.plantQuickSheet.sunMeasureHint}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 12 }}>
        <button
          onClick={() => setDraft((d) => Math.max(0, Math.round((d - 0.5) * 2) / 2))}
          aria-label={t.plantQuickSheet.sunMeasureLess}
          style={stepBtnStyle}
        ><span aria-hidden="true">−</span></button>
        <span style={{ minWidth: 64, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--color-text)' }}>
          {draft.toFixed(1)}{t.plantQuickSheet.sunHoursUnit}
        </span>
        <button
          onClick={() => setDraft((d) => Math.min(12, Math.round((d + 0.5) * 2) / 2))}
          aria-label={t.plantQuickSheet.sunMeasureMore}
          style={stepBtnStyle}
        ><span aria-hidden="true">＋</span></button>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {measured != null && (
          <button
            onClick={() => { void onSave(null); onCancel() }}
            disabled={saving}
            style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-muted)', fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
          >
            {t.plantQuickSheet.sunMeasureClear}
          </button>
        )}
        <button
          onClick={() => { void onSave(draft); onCancel() }}
          disabled={saving}
          style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', background: 'var(--color-primary)', color: '#fff', fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}
        >
          {t.plantQuickSheet.sunMeasureSave}
        </button>
      </div>
    </div>
  )
}
