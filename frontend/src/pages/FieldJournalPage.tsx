import { lazy, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '../context/LanguageContext'
import PageMasthead, { type MastheadStat } from '../components/ui/PageMasthead'
import type { DiscoveryStats } from '../components/discoveries/DiscoveriesSection'
import { useCapabilities } from '../hooks/useCapabilities'

const DiscoveriesSection = lazy(() => import('../components/discoveries/DiscoveriesSection'))

export default function FieldJournalPage() {
  const t = useT()
  const navigate = useNavigate()
  const { canEdit } = useCapabilities()
  const [stats, setStats] = useState<DiscoveryStats | null>(null)
  const handleStats = useCallback((s: DiscoveryStats) => setStats(s), [])

  const mastheadStats: MastheadStat[] = stats && stats.finds > 0
    ? [
        { value: stats.finds, label: t.discovery.statFinds },
        { value: stats.species, label: t.discovery.statSpecies },
        ...(stats.places > 0 ? [{ value: stats.places, label: t.discovery.statPlaces }] : []),
      ]
    : []

  return (
    <div className="pb-16">
      <div className="mx-auto max-w-[1380px]">
        <PageMasthead
          eyebrow={t.discovery.guideEyebrow}
          title={t.discovery.guideTitle}
          accent={t.discovery.guideAccent}
          lede={t.discovery.guideLede}
          stats={mastheadStats}
          actions={canEdit ? (
            <button
              onClick={() => navigate('/identify')}
              className="cursor-pointer rounded-full border border-primary bg-primary px-4 py-2 text-[13px] font-medium text-white transition-all hover:bg-primary-dark"
            >
              + {t.discovery.identifyWild}
            </button>
          ) : undefined}
        />
        <div className="px-4 pt-6 sm:px-6">
          <DiscoveriesSection onStats={handleStats} />
        </div>
      </div>
    </div>
  )
}
