import { lazy } from 'react'
import { useT } from '../context/LanguageContext'

const DiscoveriesSection = lazy(() => import('../components/discoveries/DiscoveriesSection'))

export default function FieldJournalPage() {
  const t = useT()

  return (
    <div className="page-container">
      <div style={{ padding: '16px 20px 0' }}>
        <h1 style={{
          fontFamily: 'var(--font-heading)', fontWeight: 500,
          fontSize: 24, margin: '0 0 4px', letterSpacing: '-0.01em',
        }}>
          {t.weeds.sightingsList.title}
        </h1>
        <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--color-text-muted)' }}>
          {t.discovery.journalEmptyHint}
        </p>
      </div>
      <DiscoveriesSection />
    </div>
  )
}
