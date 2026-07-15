import { useEffect, useState } from 'react'
import { household } from '../../api/client'
import type {
  CalendarGroupingCareType,
  CalendarGroupingPreferences,
  CalendarGroupingRule,
} from '../../api/client'
import { useT } from '../../context/LanguageContext'

const GROUPABLE_CARE_TYPES: readonly CalendarGroupingCareType[] = [
  'water',
  'fertilize',
  'prune',
  'repot',
  'mist',
  'rotate',
  'pest_check',
  'dust',
]

function replaceRule(
  rules: CalendarGroupingRule[],
  mapId: number,
  careTypes: CalendarGroupingCareType[],
): CalendarGroupingRule[] {
  const next = rules.map((rule) => (
    rule.map_id === mapId ? { ...rule, care_types: [...careTypes] } : rule
  ))
  if (!next.some((rule) => rule.map_id === mapId)) {
    next.push({ map_id: mapId, care_types: [...careTypes] })
  }
  return next
}

export default function CalendarGroupingSettings({ embedded = false }: { embedded?: boolean }) {
  const t = useT()
  const [preferences, setPreferences] = useState<CalendarGroupingPreferences | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    household.calendarGrouping()
      .then((loaded) => {
        if (!cancelled) setPreferences(loaded)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => { cancelled = true }
  }, [])

  async function saveRules(rules: CalendarGroupingRule[]) {
    if (!preferences) return
    const previous = preferences
    setPreferences({ ...preferences, rules })
    setError(false)
    setSaving(true)
    try {
      setPreferences(await household.updateCalendarGrouping({ rules }))
    } catch {
      setPreferences(previous)
      setError(true)
    } finally {
      setSaving(false)
    }
  }

  function selectedTypes(mapId: number): CalendarGroupingCareType[] {
    return preferences?.rules.find((rule) => rule.map_id === mapId)?.care_types ?? []
  }

  function setMapTypes(mapId: number, careTypes: CalendarGroupingCareType[]) {
    if (!preferences) return
    void saveRules(replaceRule(preferences.rules, mapId, careTypes))
  }

  function copyToSimilarMaps(mapId: number) {
    if (!preferences) return
    const source = preferences.maps.find((map) => map.id === mapId)
    if (!source) return
    const careTypes = selectedTypes(mapId)
    const similarIds = new Set(
      preferences.maps
        .filter((map) => map.map_type === source.map_type)
        .map((map) => map.id),
    )
    void saveRules(preferences.rules.map((rule) => (
      similarIds.has(rule.map_id) ? { ...rule, care_types: [...careTypes] } : rule
    )))
  }

  const content = (
    <div className="card p-4">
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:justify-between sm:gap-4">
          <div>
            <h3
              className="font-heading text-base font-medium text-text"
              data-calendar-grouping-title
            >
              {t.settings.carePlanningTitle}
            </h3>
            <div className="mt-1 max-w-2xl text-xs leading-relaxed text-text-muted">
              {t.settings.carePlanningDescription}
            </div>
          </div>
          <span
            className="inline-flex self-start items-center gap-1.5 text-xs font-medium text-primary"
            data-calendar-sharing-status
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
            {t.settings.calendarGroupingShared}
          </span>
        </div>

        {!preferences && !error && (
          <div className="text-xs text-text-muted mt-4">{t.common.loading}</div>
        )}

        {preferences?.maps.length === 0 && (
          <div className="text-xs text-text-muted mt-4">{t.settings.calendarGroupingNoMaps}</div>
        )}

        {preferences && preferences.maps.length > 0 && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mt-4">
            {preferences.maps.map((map) => {
              const selected = selectedTypes(map.id)
              const similarCount = preferences.maps.filter(
                (candidate) => candidate.map_type === map.map_type,
              ).length
              return (
                <article
                  key={map.id}
                  data-calendar-grouping-map={map.id}
                  className="rounded-2xl border border-border bg-paper p-3.5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 break-words font-heading font-semibold text-base text-text">{map.name}</div>
                    <span
                      className="shrink-0 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary"
                      data-calendar-map-type
                    >
                      {map.map_type === 'indoor'
                        ? t.settings.calendarGroupingIndoor
                        : t.settings.calendarGroupingOutdoor}
                    </span>
                  </div>

                  <div
                    className="mt-3 text-xs font-medium text-text-muted"
                    data-calendar-quick-setup
                  >
                    {t.settings.calendarGroupingQuickSetup}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => setMapTypes(map.id, map.recommended_care_types)}
                      className="min-h-11 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-text-soft hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50"
                    >
                      {t.settings.calendarGroupingRecommended}
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => setMapTypes(map.id, map.recurring_care_types)}
                      className="min-h-11 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-text-soft hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50"
                    >
                      {t.settings.calendarGroupingAllRecurring}
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => setMapTypes(map.id, [])}
                      className="min-h-11 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-text-soft hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50"
                    >
                      {t.settings.calendarGroupingClear}
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-3">
                    {GROUPABLE_CARE_TYPES.map((careType) => {
                      const isSelected = selected.includes(careType)
                      return (
                        <button
                          key={careType}
                          type="button"
                          aria-pressed={isSelected}
                          disabled={saving}
                          onClick={() => setMapTypes(
                            map.id,
                            isSelected
                              ? selected.filter((type) => type !== careType)
                              : GROUPABLE_CARE_TYPES.filter((type) => (
                                  type === careType || selected.includes(type)
                                )),
                          )}
                          className={`min-h-11 font-heading text-sm rounded-full border px-3 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                            isSelected
                              ? 'bg-primary/10 border-primary text-primary font-medium'
                              : 'bg-surface border-border text-text-soft'
                          } disabled:opacity-50`}
                        >
                          {t.careTypes[careType]}
                        </button>
                      )
                    })}
                  </div>

                  <div className="mt-3 flex flex-col items-start gap-1 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <div className="text-xs text-text-soft">
                      {t.settings.calendarGroupingRecurring}: {' '}
                      {map.recurring_care_types.length > 0
                        ? map.recurring_care_types.map((careType) => t.careTypes[careType]).join(', ')
                        : t.settings.calendarGroupingNone}
                    </div>
                    {similarCount > 1 && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => copyToSimilarMaps(map.id)}
                        className="inline-flex min-h-11 max-w-full items-center text-left text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50"
                      >
                        {map.map_type === 'indoor'
                          ? t.settings.calendarGroupingCopyIndoor
                          : t.settings.calendarGroupingCopyOutdoor}
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}

        {error && (
          <div role="alert" className="text-xs text-red-600 mt-3">
            {t.settings.calendarGroupingSaveError}
          </div>
        )}
    </div>
  )

  if (embedded) return content

  return (
    <section aria-labelledby="care-planning-title">
      <h2
        id="care-planning-title"
        className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted"
      >
        {t.settings.carePlanning}
      </h2>
      {content}
    </section>
  )
}
