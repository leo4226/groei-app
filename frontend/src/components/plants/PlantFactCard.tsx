import { useState, useEffect } from 'react'
import { useFloreren } from '../../store/useFloreren'
import { useT } from '../../context/LanguageContext'
import { resolveIconUrl } from '../../utils/icons'

const DISMISS_KEY = 'floreren-fact-dismissed-date'

export default function PlantFactCard() {
  const t = useT()
  const plantFact = useFloreren((s) => s.plantFact)
  const loadPlantFact = useFloreren((s) => s.loadPlantFact)
  const today = new Date().toDateString()
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === today)

  useEffect(() => {
    if (!plantFact) loadPlantFact()
  }, [plantFact, loadPlantFact])

  if (dismissed || !plantFact) return null

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, today)
    setDismissed(true)
  }

  return (
    <div className="card" style={{ borderRadius: 14, overflow: 'hidden', marginBottom: 18, position: 'relative' }}>
      <button
        onClick={dismiss}
        aria-label="Sluiten"
        style={{
          position: 'absolute', top: 10, right: 12,
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--color-text-muted)', fontSize: 20, lineHeight: 1,
          padding: '2px 6px',
        }}
      >×</button>
      <div style={{ padding: '16px 18px 6px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.22em', color: 'var(--color-primary)', marginBottom: 4 }}>
          {t.dashboard.sections.didYouKnow}
        </div>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 22, color: 'var(--color-text)', letterSpacing: '-0.01em', paddingRight: 24 }}>
          <em style={{ fontStyle: 'italic', fontWeight: 400, color: 'var(--color-primary)' }}>{plantFact.plant_name}</em>.
        </div>
      </div>
      <div style={{ padding: '10px 18px 18px', borderTop: '1px solid var(--color-border-soft)', marginTop: 8 }}>
        <p style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 14, lineHeight: 1.5, color: 'var(--color-text-soft)', margin: '0 0 14px', position: 'relative' }}>
          <span style={{ color: 'var(--color-overdue)', fontSize: 32, lineHeight: 0, position: 'relative', top: 10, marginRight: 3, fontStyle: 'normal' }}>"</span>
          {plantFact.fact_nl}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {plantFact.icon_key && (
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(145deg, #FDFAF1, #EDE5D1)', border: '1px solid var(--color-border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <img src={resolveIconUrl(plantFact.icon_key)!} alt="" style={{ width: '78%', height: '78%', objectFit: 'contain' }} />
            </div>
          )}
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 12, color: 'var(--color-text)' }}>{plantFact.plant_name}</div>
            {plantFact.species_name && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-text-muted)' }}>
                {plantFact.species_name}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
