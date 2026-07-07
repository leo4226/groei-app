import { lazy } from 'react'

const WeedSightingsSection = lazy(() =>
  import('../components/discoveries/WeedSightingsSection').then(m => ({ default: m.default }))
)

export default function FieldJournalPage() {
  return (
    <div className="page-container">
      <div style={{ padding: '16px 20px 0' }}>
        <h1 style={{
          fontFamily: 'var(--font-heading)', fontWeight: 500,
          fontSize: 24, margin: '0 0 4px', letterSpacing: '-0.01em',
        }}>
          Veldwaarnemingen
        </h1>
        <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--color-text-muted)' }}>
          Al je gelogde onkruidwaarnemingen
        </p>
      </div>
      <WeedSightingsSection />
    </div>
  )
}
