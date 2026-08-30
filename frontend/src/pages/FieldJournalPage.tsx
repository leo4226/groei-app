import { lazy, useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '../context/LanguageContext'
import PageMasthead, { type MastheadStat } from '../components/ui/PageMasthead'
import type { DiscoveryStats } from '../components/discoveries/DiscoveriesSection'
import { useCapabilities } from '../hooks/useCapabilities'
import { studyApi, type StudyStats } from '../api/study'

const DiscoveriesSection = lazy(() => import('../components/discoveries/DiscoveriesSection'))

export default function FieldJournalPage() {
  const t = useT()
  const navigate = useNavigate()
  const { canEdit } = useCapabilities()
  const [stats, setStats] = useState<DiscoveryStats | null>(null)
  const handleStats = useCallback((s: DiscoveryStats) => setStats(s), [])
  // Counts only — the card itself is fetched when they tap through, so opening
  // the field guide never pays for a study session nobody asked for.
  const [studyStats, setStudyStats] = useState<StudyStats | null>(null)
  useEffect(() => {
    let cancelled = false
    studyApi.stats()
      .then((s) => { if (!cancelled) setStudyStats(s) })
      // A missing count costs a nicer label and nothing else.
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

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
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              {/* Identifying a wild plant writes a discovery, so it stays
                  editor-only. Learning does not: study progress is per
                  account and all three study endpoints admit a viewer, so
                  gating the only link to it behind canEdit would have hidden
                  the feature from exactly the people it costs nothing. */}
              {canEdit && (
                <button
                  onClick={() => navigate('/identify')}
                  className="cursor-pointer rounded-full border border-primary bg-primary px-4 py-2 text-[13px] font-medium text-white transition-all hover:bg-primary-dark"
                >
                  + {t.discovery.identifyWild}
                </button>
              )}
              {/* Recording a find and learning its name are different acts, and
                  the field guide is where you notice you cannot remember. The
                  count is the hook: "7 te herhalen" is a reason to tap. */}
              <button
                onClick={() => navigate('/study')}
                className="cursor-pointer rounded-full border border-border bg-transparent px-4 py-2 text-[13px] font-medium text-text transition-all hover:border-primary hover:text-primary"
              >
                {studyStats && studyStats.total > 0
                  ? `${t.study.entryTitle} · ${t.study.entryBody
                      .replace('{due}', String(studyStats.due))
                      .replace('{new}', String(studyStats.new))}`
                  : t.study.entryTitle}
              </button>
            </div>
          )}
        />
        <div className="px-4 pt-6 sm:px-6">
          <DiscoveriesSection onStats={handleStats} />
        </div>
      </div>
    </div>
  )
}
