import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useFloreren } from '../store/useFloreren'
import { CARE_TYPE_INFO } from '../types'
import type { RecentLogEntry, MapInfo, Plant, PlantFactOut, WarningSummaryOut, BucketPlantOut } from '../types'
import type { WeatherData } from '../hooks/useWeather'
import { useWeather } from '../hooks/useWeather'
import UserSwitcher from '../components/UserSwitcher'
import { useT } from '../context/LanguageContext'
import { getToken } from '../api/auth'
import type { Translations } from '../i18n/translations'
import PageDecor from '../components/PageDecor'
import WelcomeChecklist from '../components/WelcomeChecklist'
import WeatherCard from '../components/dashboard/WeatherCard'
import NewMapModal from '../components/dashboard/NewMapModal'
import { resolveIconUrl } from '../utils/icons'

const PX_PER_M = 46

function parseMapDimensions(viewbox: string): { w: number; h: number } | null {
  const parts = viewbox.trim().split(/\s+/).map(Number)
  if (parts.length !== 4 || parts.some(Number.isNaN)) return null
  const [, , wPx, hPx] = parts
  if (wPx <= 0 || hPx <= 0) return null
  return { w: Math.round(wPx / PX_PER_M), h: Math.round(hPx / PX_PER_M) }
}

export default function Dashboard() {
  const { dashboardV2, activeUserId, users, maps, plants, loadDashboardV2, loadPlants, loadWarningSummary, warningSummary } = useFloreren()
  const isLoading = useFloreren((s) => s.isLoading)
  const activeUser = users.find((u) => u.id === activeUserId)
  const t = useT()

  const [showNewMap, setShowNewMap] = useState(false)

  const greeting = (() => {
    const hour = new Date().getHours()
    if (hour < 6) return t.dashboard.greeting.night
    if (hour < 12) return t.dashboard.greeting.morning
    if (hour < 18) return t.dashboard.greeting.afternoon
    return t.dashboard.greeting.evening
  })()

  const outdoorMap = maps.find((m) => m.map_type === 'outdoor')
  const { weather, loading: weatherLoading, error: weatherError } = useWeather(outdoorMap?.lat ?? null, outdoorMap?.lon ?? null)

  useEffect(() => {
    if (getToken()) { loadDashboardV2(); loadPlants(); loadWarningSummary() }
  }, [loadDashboardV2, loadPlants, loadWarningSummary])

  const nuCount      = warningSummary?.buckets.nu.length           ?? 0
  const vandaagCount = warningSummary?.buckets.vandaag.length      ?? 0

  const date = new Date().toLocaleDateString(t.locale, { weekday: 'long', day: 'numeric', month: 'long' })

  function leadCopy(): string {
    if (nuCount > 0) return `${nuCount} ${t.dashboard.warnings.bucketNow.toLowerCase()}${vandaagCount > 0 ? `, ${vandaagCount} ${t.dashboard.warnings.bucketToday.toLowerCase()}` : ''}.`
    if (vandaagCount > 0) return `${vandaagCount} ${t.dashboard.warnings.bucketToday.toLowerCase()}.`
    return t.dashboard.tasks.calm
  }

  return (
    <div style={{ paddingBottom: 80, position: 'relative' }}>
      <PageDecor />
      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* ── Header ── */}
        <DashboardHeader
          t={t}
          greeting={greeting}
          userName={activeUser?.name ?? '…'}
          date={date}
          lede={leadCopy()}
          weather={weather}
          />

        {/* ── Onboarding Checklist — only show when data is definitely loaded ── */}
        {!isLoading && (
          <WelcomeChecklist
            hasMap={maps.length > 0}
            hasPlant={plants.length > 0}
            accountId={activeUserId ?? 0}
            onCreateMap={() => setShowNewMap(true)}
          />
        )}

        {/* ── Mijn Tuinen — hero position ── */}
        <section style={{ padding: '0 24px' }}>
          <SectionHeader
            leftLede={maps.length === 0 ? t.dashboard.actions.addGarden : maps.length === 1 ? t.dashboard.actions.view : `${t.dashboard.actions.view} (${maps.length})`}
            rightMarker={t.dashboard.sections.myGardens}
          />
          {maps.length > 0 ? (
            <div className="no-scrollbar dash-map-scroll" style={{ display: 'flex', overflowX: 'auto', gap: 14, margin: '0 -24px', padding: '4px 24px 16px' }}>
              {maps.map((map) => <MapCard key={map.id} map={map} t={t} warningSummary={warningSummary ?? null} plants={plants} />)}
              <NewMapCard t={t} onNewMap={() => setShowNewMap(true)} />
            </div>
          ) : isLoading ? (
            <div style={{ display: 'flex', width: '100%', height: 132, alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: 18 }}>
              {'Loading…'}
            </div>
          ) : (
            <button onClick={() => setShowNewMap(true)} style={{
              display: 'flex', width: '100%', height: 132,
              border: '1px dashed var(--color-border)', borderRadius: 14,
              flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              color: 'var(--color-text-muted)', background: 'var(--color-surface)',
              cursor: 'pointer', marginBottom: 18,
            }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 28, color: 'var(--color-primary)' }}>+</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.2em', marginTop: 6 }}>{t.dashboard.actions.addGarden}</span>
            </button>
          )}
        </section>

        {/* ── Responsive grid: signals + log + sidebar ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 0 }} className="dashboard-grid">
          {/* SIGNALS column */}
          {warningSummary && (
            <div className="dash-signals-col">
              <CareWarningsSection summary={warningSummary} plants={plants} t={t} />
            </div>
          )}
          {/* LOG column */}
          <div>
            {/* Logboek */}
            {dashboardV2 && dashboardV2.recent_log.length > 0 && (
              <section className="dash-section-hpad" style={{ padding: '0 24px' }}>
                <SectionHeader rightMarker={t.dashboard.sections.logbook} />
                <LogboekCollapsible t={t} entries={dashboardV2.recent_log} />
              </section>
            )}
          </div>

          {/* SIDEBAR column */}
          <div className="dash-section-hpad dashboard-sidebar" style={{ padding: '0 24px' }}>
            <WeatherCard t={t} weather={weather} loading={weatherLoading} error={weatherError} />
            {dashboardV2?.plant_fact && (
              <CareTipCard t={t} fact={dashboardV2.plant_fact} />
            )}
          </div>
        </div>

      </div>

      <style>{`
        /* ── Generic card shrink guard ── */
        .weather-card, .weather-card .card,
        .log-card { min-width: 0; }

        .dashboard-grid > div { min-width: 0; }
        @media (min-width: 900px) {
          .dashboard-grid { grid-template-columns: 1fr 1fr 340px !important; align-items: stretch; padding: 0 24px; gap: 28px; }
          .dashboard-sidebar { padding: 0 !important; }
          .dash-signals-col > section { padding-left: 0 !important; padding-right: 0 !important; }
        }

        /* ── Sidebar shrink guard ── */
        /* Clip horizontal spill without making vertical overflow auto; hover lifts cards up 2px. */
        .dashboard-sidebar { min-width: 0; overflow-x: clip; overflow-y: visible; }

        /* ── Weather card ── */
        .weather-card { min-width: 0; }
        .weather-card-header { padding: 16px 18px 6px; }
        .weather-card-header .condition-text { font-size: 16px; overflow-wrap: break-word; }
        .weather-stats { display: grid; grid-template-columns: 1fr 1fr 1fr; border-top: 1px solid var(--color-border-soft); border-bottom: 1px solid var(--color-border-soft); min-width: 0; overflow: hidden; }
        .weather-stats-cell { padding: 10px 4px; text-align: center; min-width: 0; overflow: hidden; }
        .weather-stats-cell:not(:last-child) { border-right: 1px solid var(--color-border-soft); }
        .weather-stats-value { font-family: var(--font-heading); font-size: 16px; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
        .weather-stats-label { font-family: var(--font-mono); font-size: 10px; text-transform: uppercase; letter-spacing: 0.15em; color: var(--color-text-muted); }
        .weather-forecast { display: grid; grid-template-columns: repeat(7, 1fr); padding: 12px 8px 14px; min-width: 0; overflow: hidden; }
        .weather-forecast > div { min-width: 0; }

        /* ── Logboek ── */
        .log-card-wrapper { min-width: 0; }
        .log-entry { min-width: 0; }
        .log-entry > div:nth-child(2) { min-width: 0; }

        @media (max-width: 480px) {
          .weather-card-header { padding: 12px 14px 4px !important; }
          .weather-card-header .condition-text { font-size: 14px !important; }
          .weather-stats { grid-template-columns: 1fr 1fr !important; }
          .weather-stats-cell:nth-child(3) { display: none !important; }
          .weather-stats-value { font-size: 12px !important; white-space: normal !important; overflow-wrap: break-word !important; }
          .weather-forecast { padding: 8px 4px 10px !important; }
          .weather-forecast > div > div:first-child { font-size: 9px !important; }

          .log-entry {
            grid-template-columns: 40px 1fr !important;
            gap: 10px !important;
            padding: 12px 14px !important;
          }
          .log-entry > div:first-child {
            width: 40px !important;
            height: 40px !important;
          }
          .log-desktop-tag { display: none !important; }
          .log-mobile-tag { display: inline-flex !important; margin-top: 4px !important; }
          .log-entry > div:nth-child(2) > div:nth-child(2) {
            white-space: normal !important;
            line-height: 1.3 !important;
          }
          .log-entry > div:nth-child(2) > div:first-child {
            font-size: 8px !important;
          }
        }
      `}</style>

      <NewMapModal open={showNewMap} onClose={() => setShowNewMap(false)} />
    </div>
  )
}

// ── Helper components ──

function DashboardHeader({
  t, greeting, userName, date, lede, weather,
}: {
  t: Translations; greeting: string; userName: string; date: string; lede: string
  weather: WeatherData | null
}) {
  const sunrise = weather ? new Date(weather.sunrise).toLocaleTimeString(t.locale, { hour: '2-digit', minute: '2-digit' }) : '—'
  const sunset  = weather ? new Date(weather.sunset).toLocaleTimeString(t.locale, { hour: '2-digit', minute: '2-digit' }) : '—'
  const temp    = weather ? `${weather.currentTemp}°C` : '—'

  return (
    <header className="dashboard-header" style={{
      padding: '40px 24px 20px', borderBottom: '1px solid var(--color-border)',
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 20,
    }}>
      <div style={{ flex: 1, minWidth: 240 }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-text-muted)', margin: '0 0 8px 0', borderBottom: '1px solid var(--color-border)', paddingBottom: 8 }}>
          {greeting} · {date}
        </p>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 'clamp(36px, 5vw, 56px)', lineHeight: 0.95, letterSpacing: '-0.02em', color: 'var(--color-text)', margin: 0 }}>
          {greeting},{' '}
          <em style={{ fontStyle: 'italic', color: 'var(--color-primary)', fontWeight: 400 }}>{userName}</em>.
        </h1>
        <p className="dashboard-lede" style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 15, lineHeight: 1.5, color: 'var(--color-text-soft)', maxWidth: 440, margin: '8px 0 10px 0' }}>
          {lede}
        </p>
        {(sunrise !== '—' || temp !== '—') && (
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.15em', color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.6 }}>
            {sunrise !== '—' && `☀ ${sunrise} — ${sunset}`}{temp !== '—' && ` · ${temp}`}
          </p>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 16, paddingTop: 4 }}>
        <UserSwitcher />
      </div>
    </header>
  )
}

// ── Map grouping ──

interface MapGroup {
  mapName: string
  isIndoor: boolean
  nu: BucketPlantOut[]
  vandaag: BucketPlantOut[]
  week: BucketPlantOut[]
}

function buildMapGroups(summary: WarningSummaryOut): MapGroup[] {
  const maps = new Map<string, MapGroup>()
  const add = (plants: BucketPlantOut[], bucket: 'nu' | 'vandaag' | 'week') => {
    for (const p of plants) {
      const key = p.map_name ?? 'Overige planten'
      if (!maps.has(key)) maps.set(key, { mapName: key, isIndoor: p.environment === 'indoor', nu: [], vandaag: [], week: [] })
      maps.get(key)![bucket].push(p)
    }
  }
  add(summary.buckets.nu, 'nu')
  add(summary.buckets.vandaag, 'vandaag')
  add(summary.buckets.komende_week, 'week')
  return [...maps.values()].sort((a, b) => {
    if (a.isIndoor !== b.isIndoor) return a.isIndoor ? -1 : 1
    return a.mapName.localeCompare(b.mapName)
  })
}

// ── Grouped warning types ──

interface GroupedWarning {
  care_type: string
  plants: BucketPlantOut[]
  severity: string
  maxDaysOverdue: number
  hint: string | null
}

type BucketItem =
  | { kind: 'individual'; plant: BucketPlantOut }
  | { kind: 'group'; group: GroupedWarning }


function buildBucketItems(plants: BucketPlantOut[], doneIds: Set<string>, grouped: boolean): BucketItem[] {
  const visible = plants.filter(p => !doneIds.has(`${p.plant_id}_${p.care_type ?? ''}`))
  if (!grouped) return visible.map(p => ({ kind: 'individual', plant: p }))

  const outdoor = visible.filter(p => p.environment !== 'indoor' && p.care_type)
  const indoor  = visible.filter(p => p.environment === 'indoor' || !p.care_type)

  const byType = new Map<string, BucketPlantOut[]>()
  for (const p of outdoor) {
    const arr = byType.get(p.care_type!) ?? []
    arr.push(p)
    byType.set(p.care_type!, arr)
  }

  const sevOrder: Record<string, number> = { urgent: 0, warning: 1, info: 2 }
  const groupItems: BucketItem[] = [...byType.entries()].map(([care_type, ps]) => {
    const sorted = [...ps].sort((a, b) => (sevOrder[a.top_warning?.severity ?? 'info'] ?? 3) - (sevOrder[b.top_warning?.severity ?? 'info'] ?? 3))
    const top = sorted[0]
    return {
      kind: 'group' as const,
      group: {
        care_type,
        plants: sorted,
        severity: top?.top_warning?.severity ?? 'info',
        maxDaysOverdue: Math.max(...ps.map(p => p.days_overdue ?? 0)),
        hint: top?.top_warning?.message_nl ?? null,
      },
    }
  })

  return [...groupItems, ...indoor.map(p => ({ kind: 'individual' as const, plant: p }))]
}

function itemsPlantCount(items: BucketItem[]): number {
  return items.reduce((sum, item) => sum + (item.kind === 'group' ? item.group.plants.length : 1), 0)
}

function CareWarningsSection({ summary, plants, t }: { summary: WarningSummaryOut; plants: { id: number; icon_key: string | null }[]; t: Translations }) {
  const { markCareDone, skipCare } = useFloreren()
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function showToast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  function bucketKey(p: BucketPlantOut) { return `${p.plant_id}_${p.care_type ?? ''}` }

  const allBucketPlants = [...summary.buckets.nu, ...summary.buckets.vandaag, ...summary.buckets.komende_week]
  const totalVisible = allBucketPlants.filter(p => !doneIds.has(bucketKey(p))).length

  async function handleDone(plant: BucketPlantOut) {
    if (!plant.care_type) return
    const key = bucketKey(plant)
    setSaving(key)
    try {
      await markCareDone(plant.plant_id, plant.care_type)
      setDoneIds(prev => new Set([...prev, key]))
    } finally {
      setSaving(null)
    }
  }

  async function handleSkip(plant: BucketPlantOut) {
    if (!plant.care_type) return
    const key = bucketKey(plant)
    setSaving(key)
    try {
      await skipCare(plant.plant_id, plant.care_type)
      setDoneIds(prev => new Set([...prev, key]))
    } finally {
      setSaving(null)
    }
  }

  async function handleDoneGroup(group: GroupedWarning) {
    setSaving(`group_${group.care_type}`)
    try {
      await Promise.all(group.plants.map(p => markCareDone(p.plant_id, p.care_type!)))
      setDoneIds(prev => {
        const next = new Set([...prev])
        group.plants.forEach(p => next.add(`${p.plant_id}_${p.care_type ?? ''}`))
        return next
      })
      const careLabel = CARE_TYPE_INFO[group.care_type as keyof typeof CARE_TYPE_INFO]?.label ?? group.care_type
      showToast(`${group.plants.length} ${group.plants.length === 1 ? 'plant' : t.dashboard.status.collection.toLowerCase()} ${careLabel.toLowerCase()} ${t.dashboard.actions.done.toLowerCase()}`)
    } finally {
      setSaving(null)
    }
  }

  async function handleSkipGroup(group: GroupedWarning) {
    setSaving(`group_${group.care_type}`)
    try {
      await Promise.all(group.plants.map(p => skipCare(p.plant_id, p.care_type!)))
      setDoneIds(prev => {
        const next = new Set([...prev])
        group.plants.forEach(p => next.add(`${p.plant_id}_${p.care_type ?? ''}`))
        return next
      })
      showToast(`${group.plants.length} ${group.plants.length === 1 ? 'plant' : t.dashboard.status.collection.toLowerCase()} ${t.dashboard.actions.skip.toLowerCase()}`)
    } finally {
      setSaving(null)
    }
  }

  const [showAll, setShowAll] = useState(false)
  const mapGroups = buildMapGroups(summary)

  if (totalVisible === 0) {
    return (
      <section style={{ padding: '0 24px' }}>
        <SectionHeader leftLede="" rightMarker={t.dashboard.sections.careSignals} />
        <div style={{ textAlign: 'center', padding: '20px 0 36px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 14 }}>
          {t.dashboard.warnings.allOnSchedule}
        </div>
      </section>
    )
  }

  const nuTotal      = summary.buckets.nu.filter(p => !doneIds.has(bucketKey(p))).length
  const vandaagTotal = summary.buckets.vandaag.filter(p => !doneIds.has(bucketKey(p))).length

  return (
    <section style={{ padding: '0 24px' }}>
      <SectionHeader leftLede={t.dashboard.warnings.signalCount(totalVisible)} rightMarker={t.dashboard.sections.careSignals} />

      {/* Collapsed toggle row */}
      <button
        onClick={() => setShowAll(v => !v)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid var(--color-border-soft)', background: 'var(--color-surface)', cursor: 'pointer', marginBottom: showAll ? 16 : 0, textAlign: 'left' }}
      >
        <span style={{ fontFamily: 'var(--font-heading)', fontSize: 13, color: 'var(--color-text-soft)' }}>
          {nuTotal > 0 && <span style={{ color: 'var(--color-overdue)', fontWeight: 600 }}>{nuTotal} nu</span>}
          {nuTotal > 0 && vandaagTotal > 0 && <span style={{ color: 'var(--color-text-muted)' }}> · </span>}
          {vandaagTotal > 0 && <span style={{ color: 'var(--color-due)', fontWeight: 600 }}>{vandaagTotal} vandaag</span>}
          {nuTotal === 0 && vandaagTotal === 0 && <span style={{ color: 'var(--color-primary)' }}>{totalVisible} deze week</span>}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--color-text-muted)', marginLeft: 12, flexShrink: 0 }}>
          {showAll ? '↑ verberg' : '↓ bekijk alles'}
        </span>
      </button>

      {/* Expanded: map-grouped care lists */}
      {showAll && mapGroups.map((mg, mi) => {
        const grouped = !mg.isIndoor
        const nuItemsMap      = buildBucketItems(mg.nu,      doneIds, grouped)
        const vandaagItemsMap = buildBucketItems(mg.vandaag, doneIds, grouped)
        const weekItemsMap    = buildBucketItems(mg.week,    doneIds, grouped)
        const mapTotal = itemsPlantCount(nuItemsMap) + itemsPlantCount(vandaagItemsMap) + itemsPlantCount(weekItemsMap)
        if (mapTotal === 0) return null
        const isLast = mi === mapGroups.length - 1
        return (
          <div key={mg.mapName} style={{ marginBottom: isLast ? 0 : 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                {mg.mapName}
              </span>
              <div style={{ flex: 1, height: 1, background: 'var(--color-border-soft)' }} />
            </div>
            <WarningBucket label={t.dashboard.warnings.bucketNow}      icon="🔴" items={nuItemsMap}      plantsLookup={plants} t={t} saving={saving} onDone={handleDone} onSkip={handleSkip} onDoneGroup={handleDoneGroup} onSkipGroup={handleSkipGroup} />
            <WarningBucket label={t.dashboard.warnings.bucketToday}    icon="🟡" items={vandaagItemsMap} plantsLookup={plants} t={t} saving={saving} onDone={handleDone} onSkip={handleSkip} onDoneGroup={handleDoneGroup} onSkipGroup={handleSkipGroup} />
            <WarningBucket label={t.dashboard.warnings.bucketThisWeek} icon="🟢" items={weekItemsMap}    plantsLookup={plants} t={t} saving={saving} onDone={handleDone} onSkip={handleSkip} onDoneGroup={handleDoneGroup} onSkipGroup={handleSkipGroup} noBorder />
          </div>
        )
      })}

      {toast && (
        <div style={{ position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)', background: 'var(--color-text)', color: 'var(--color-surface)', padding: '10px 20px', borderRadius: 99, fontSize: 13, fontFamily: 'var(--font-heading)', whiteSpace: 'nowrap', zIndex: 1000, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', pointerEvents: 'none' }}>
          {toast}
        </div>
      )}
    </section>
  )
}

function GroupedWarningRow({ group, saving, onDone, onSkip, t }: {
  group: GroupedWarning; saving: string | null
  onDone: (g: GroupedWarning) => void; onSkip: (g: GroupedWarning) => void; t: Translations
}) {
  const careInfo = CARE_TYPE_INFO[group.care_type as keyof typeof CARE_TYPE_INFO]
  const key = `group_${group.care_type}`
  const isSaving = saving === key
  const isUrgent = group.severity === 'urgent'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', opacity: isSaving ? 0.5 : 1, transition: 'opacity 0.15s' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 13 }}>
          {careInfo?.icon ?? '🌿'} {careInfo?.label ?? group.care_type}
          <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}> · {group.plants.length} {group.plants.length === 1 ? 'plant' : t.dashboard.status.collection.toLowerCase()}</span>
          {group.maxDaysOverdue > 0 && (
            <span style={{ color: isUrgent ? 'var(--color-overdue)' : 'var(--color-due)', marginLeft: 4, fontSize: 11 }}>+{group.maxDaysOverdue}d</span>
          )}
        </div>
        {group.hint && (
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2, fontFamily: 'var(--font-heading)', fontStyle: 'italic' }}>
            {group.hint}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <button disabled={isSaving} onClick={() => onDone(group)} style={{ padding: '5px 11px', borderRadius: 99, background: 'var(--color-primary)', color: '#fff', border: 'none', fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          {t.dashboard.actions.done}
        </button>
        <button disabled={isSaving} onClick={() => onSkip(group)} title={t.dashboard.actions.skip} style={{ width: 24, height: 24, borderRadius: '50%', background: 'transparent', color: 'var(--color-text-muted)', border: 'none', fontFamily: 'var(--font-heading)', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: 0.6 }}>
          ×
        </button>
      </div>
    </div>
  )
}

function WarningBucket({ label, icon, items, plantsLookup, t, saving, onDone, onSkip, onDoneGroup, onSkipGroup, noBorder }: {
  label: string; icon: string; items: BucketItem[]
  plantsLookup: { id: number; icon_key: string | null }[]
  t: Translations; saving: string | null
  onDone: (p: BucketPlantOut) => void; onSkip: (p: BucketPlantOut) => void
  onDoneGroup: (g: GroupedWarning) => void; onSkipGroup: (g: GroupedWarning) => void
  noBorder?: boolean
}) {
  const BUCKET_DOT: Record<string, string> = {
    '🔴': 'var(--color-overdue)',
    '🟡': 'var(--color-due)',
    '🟢': 'var(--color-primary)',
  }
  if (items.length === 0) return null
  const plantCount = itemsPlantCount(items)
  return (
    <div style={{ marginBottom: noBorder ? 0 : 10, marginTop: noBorder ? 0 : 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--color-text-muted)', marginBottom: 6 }}>
        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: BUCKET_DOT[icon] ?? 'var(--color-text-muted)', flexShrink: 0 }} />
        {label} · {t.dashboard.warnings.plantCount(plantCount)}
      </div>
      <div style={{ border: '1px solid var(--color-border-soft)', borderRadius: 10, overflow: 'hidden' }}>
        {items.map((item, i) => {
          const borderBottom = i < items.length - 1 ? '1px solid var(--color-border-soft)' : 'none'
          if (item.kind === 'group') {
            return (
              <div key={`group_${item.group.care_type}`} style={{ borderBottom }}>
                <GroupedWarningRow group={item.group} saving={saving} onDone={onDoneGroup} onSkip={onSkipGroup} t={t} />
              </div>
            )
          }
          const plant = item.plant
          const iconKey = plantsLookup.find(p => p.id === plant.plant_id)?.icon_key ?? plant.plant_icon_variant
          const careInfo = plant.care_type ? CARE_TYPE_INFO[plant.care_type as keyof typeof CARE_TYPE_INFO] : null
          const key = `${plant.plant_id}_${plant.care_type ?? ''}`
          const isSaving = saving === key
          return (
            <div key={plant.plant_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom, opacity: isSaving ? 0.5 : 1, transition: 'opacity 0.15s' }}>
              <Link to={`/plants/${plant.plant_id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(145deg, #FDFAF1, #F4EEDB)', border: '1px solid var(--color-border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                  {iconKey ? <img src={resolveIconUrl(iconKey)!} alt="" style={{ width: '70%', height: '70%', objectFit: 'contain' }} /> : <span style={{ fontSize: 16 }}>🌱</span>}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{plant.plant_name}</div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                    {careInfo && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 99, fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', background: plant.top_warning?.severity === 'urgent' ? 'rgba(200,60,60,.08)' : 'rgba(47,93,58,.06)', border: `1px solid ${plant.top_warning?.severity === 'urgent' ? 'rgba(200,60,60,.2)' : 'rgba(47,93,58,.12)'}`, color: plant.top_warning?.severity === 'urgent' ? 'var(--color-overdue)' : 'var(--color-primary)' }}>
                        {careInfo.icon} {t.care[plant.care_type as keyof typeof t.care] ?? plant.care_type}{plant.days_overdue != null && plant.days_overdue > 0 ? ` +${plant.days_overdue}` : ''}
                      </span>
                    )}
                    {plant.top_warning?.message_nl && !['schedule_overdue', 'schedule_due_today', 'seasonal'].includes(plant.top_warning.trigger) && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 7px', borderRadius: 99, fontFamily: 'var(--font-mono)', fontSize: 9, background: 'rgba(250,200,50,.1)', border: '1px solid rgba(250,200,50,.25)', color: 'var(--color-text)', whiteSpace: 'nowrap' as const }}>
                        {plant.top_warning.icon} {plant.top_warning.message_nl}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
              {plant.care_type ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <button disabled={isSaving} onClick={() => onDone(plant)} style={{ padding: '5px 11px', borderRadius: 99, background: 'var(--color-primary)', color: '#fff', border: 'none', fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {t.dashboard.actions.done}
                  </button>
                  <button disabled={isSaving} onClick={() => onSkip(plant)} title={t.dashboard.actions.skip} style={{ width: 24, height: 24, borderRadius: '50%', background: 'transparent', color: 'var(--color-text-muted)', border: 'none', fontFamily: 'var(--font-heading)', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: 0.6 }}>
                    ×
                  </button>
                </div>
              ) : (
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)', flexShrink: 0 }}>→</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SectionHeader({ leftLede, rightMarker, rightAction }: { leftLede?: string; rightMarker: string; rightAction?: { to: string; label: string } }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '20px 0 18px', minHeight: 56, borderBottom: '1px solid var(--color-border)', marginBottom: 18, gap: 12 }}>
      {leftLede && <p style={{ margin: 0, fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 15, color: 'var(--color-text-soft)', flex: 1, minWidth: 0 }}>{leftLede}</p>}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexShrink: 0, marginLeft: 'auto' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--color-text-muted)' }}>{rightMarker}</span>
        {rightAction && <Link to={rightAction.to} style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-primary)', textDecoration: 'none' }}>{rightAction.label}</Link>}
      </div>
    </div>
  )
}

// ── Outdoor zone styles (flat coloured fills) ──
const OUTDOOR_STYLES: Record<string, { fill: string; stroke?: string; sw?: number; opacity: number }> = {
  deck:      { fill: '#C8A96A', stroke: 'rgba(180,150,80,0.4)',  sw: 0.8, opacity: 0.95 },
  soil:      { fill: '#9B7A3A', stroke: 'rgba(100,70,20,0.2)',   sw: 0.5, opacity: 0.65 },
  gravel:    { fill: '#B8B8B0', stroke: 'rgba(140,140,130,0.3)', sw: 0.5, opacity: 0.90 },
  lawn:      { fill: '#7A9E5A', stroke: 'rgba(80,130,60,0.25)',  sw: 0.6, opacity: 0.65 },
  path:      { fill: '#D4C9A8',                                           opacity: 0.75 },
  water:     { fill: '#3B8BD4', stroke: 'rgba(60,130,200,0.4)',  sw: 0.8, opacity: 0.55 },
}

// Indoor wall/room constants matching mapDefaults.ts
const WALL_COLOR_THUMB  = '#8B7355'
const ROOM_FILL_THUMB   = '#F5F0E8'
const WALL_T_EXTERIOR_CM = 20
const WALL_T_INTERIOR_CM = 10

function parseCanvasZones(canvasData: string | null) {
  if (!canvasData) return null
  try {
    const data = JSON.parse(canvasData)
    const raw: Array<{ x: number; y: number; width: number; height: number; type?: string; shape?: string; wallThickness?: string }> = data.zones ?? []
    const rects = raw.filter(z => !z.shape || z.shape === 'rect')
    if (!rects.length) return null
    const scalePxPerM: number = data.scale_px_per_m ?? 46
    const minX = Math.min(...rects.map(z => z.x))
    const minY = Math.min(...rects.map(z => z.y))
    const maxX = Math.max(...rects.map(z => z.x + z.width))
    const maxY = Math.max(...rects.map(z => z.y + z.height))
    const bw = maxX - minX, bh = maxY - minY
    const pad = Math.max(bw, bh) * 0.1
    return {
      zones: rects.map(z => ({ x: z.x, y: z.y, w: z.width, h: z.height, type: z.type ?? 'soil', wallThickness: z.wallThickness })),
      vb: { x: minX - pad, y: minY - pad, w: bw + pad * 2, h: bh + pad * 2 },
      scalePxPerM,
    }
  } catch { return null }
}


function MapCard({ map, t, warningSummary, plants }: { map: MapInfo; t: Translations; warningSummary: WarningSummaryOut | null; plants: Plant[] }) {
  const typeLabel = map.map_type === 'outdoor' ? t.dashboard.actions.mapTypeOutdoor : t.dashboard.actions.mapTypeIndoor
  const dims = parseMapDimensions(map.viewbox)
  const subLine = dims ? `${typeLabel} · ${dims.w} m × ${dims.h} m` : typeLabel
  const [imgLoaded, setImgLoaded] = useState(false)

  // Single source of truth: derive everything from warningSummary buckets
  const nuIds      = new Set(warningSummary?.buckets.nu.filter(p => p.map_name === map.name).map(p => p.plant_id) ?? [])
  const vandaagIds = new Set(warningSummary?.buckets.vandaag.filter(p => p.map_name === map.name).map(p => p.plant_id) ?? [])
  const weekIds    = new Set(warningSummary?.buckets.komende_week.filter(p => p.map_name === map.name).map(p => p.plant_id) ?? [])

  const nuCount      = nuIds.size
  const vandaagCount = vandaagIds.size
  const signalTotal  = nuCount + vandaagCount + weekIds.size
  const badgeColor   = nuCount > 0 ? 'var(--color-overdue)' : vandaagCount > 0 ? 'var(--color-due)' : 'var(--color-primary)'

  // Dots: only positioned plants that are in a warning bucket — same plants as the badge counts
  const dotPlants = plants
    .filter(p => p.map_id === map.id && p.map_x != null && p.map_y != null)
    .filter(p => nuIds.has(p.id) || vandaagIds.has(p.id))
    .map(p => ({ ...p, dotColor: nuIds.has(p.id) ? '#C83C3C' : '#D4943A' }))

  // Inline rendering from canvas_data — unified coordinate system for zones + dots
  const parsed = parseCanvasZones(map.canvas_data)
  const vb = parsed?.vb ?? (() => {
    const p = map.viewbox.trim().split(/\s+/).map(Number)
    return p.length === 4 ? { x: p[0], y: p[1], w: p[2], h: p[3] } : { x: 0, y: 0, w: 400, h: 300 }
  })()
  const dotR = Math.max(vb.w, vb.h) / 26

  const bgColor = map.map_type === 'indoor' ? ROOM_FILL_THUMB : '#FDFAF1'
  const wallT = parsed ? (WALL_T_EXTERIOR_CM / 100) * parsed.scalePxPerM : 9

  return (
    <div className="card dash-map-card" style={{ flexShrink: 0, width: 300, borderRadius: 14, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <Link to={`/map/${map.slug}`} style={{ display: 'block', textDecoration: 'none', color: 'inherit', position: 'relative' }}>
        <div style={{ aspectRatio: '4 / 3', background: bgColor, position: 'relative', overflow: 'hidden' }}>
          {parsed ? (
            // Inline SVG: zones + care dots in one unified coordinate system
            <svg
              viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
              preserveAspectRatio="xMidYMid meet"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            >
              <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill={bgColor} />
              {parsed.zones.map((z, i) => {
                const isIndoor = z.type === 'room' || z.type === 'structure'
                if (isIndoor) {
                  // Replicate RoomWallRenderer: brown outer rect + cream inner rect = wall borders only
                  const t = z.wallThickness === 'interior'
                    ? (WALL_T_INTERIOR_CM / 100) * parsed.scalePxPerM
                    : wallT
                  const innerW = Math.max(0, z.w - 2 * t)
                  const innerH = Math.max(0, z.h - 2 * t)
                  return (
                    <g key={i}>
                      <rect x={z.x} y={z.y} width={z.w} height={z.h} fill={WALL_COLOR_THUMB} />
                      {innerW > 0 && innerH > 0 && (
                        <rect x={z.x + t} y={z.y + t} width={innerW} height={innerH} fill={ROOM_FILL_THUMB} />
                      )}
                    </g>
                  )
                }
                const s = OUTDOOR_STYLES[z.type] ?? OUTDOOR_STYLES.soil
                return (
                  <rect key={i} x={z.x} y={z.y} width={z.w} height={z.h}
                    fill={s.fill} opacity={s.opacity}
                    stroke={s.stroke} strokeWidth={s.sw}
                    rx={2}
                  />
                )
              })}
              {dotPlants.map(p => (
                <g key={p.id}>
                  <circle cx={p.map_x!} cy={p.map_y!} r={dotR * 2.2} fill={p.dotColor} opacity={0.18} />
                  <circle cx={p.map_x!} cy={p.map_y!} r={dotR} fill={p.dotColor} stroke="white" strokeWidth={dotR * 0.35} />
                </g>
              ))}
            </svg>
          ) : (
            // Fallback: pre-generated img + dot overlay
            <>
              {!imgLoaded && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
                  <div className="skeleton" style={{ width: '60%', height: '60%', borderRadius: 10 }} />
                </div>
              )}
              <img
                src={map.thumbnail_file ?? map.svg_file ?? ''}
                alt={map.name}
                onLoad={() => setImgLoaded(true)}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', padding: '8%', boxSizing: 'border-box' }}
              />
              {imgLoaded && dotPlants.length > 0 && (
                <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet"
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', padding: '8%', boxSizing: 'border-box' }}>
                  {dotPlants.map(p => (
                    <g key={p.id}>
                      <circle cx={p.map_x!} cy={p.map_y!} r={dotR * 2.2} fill={p.dotColor} opacity={0.18} />
                      <circle cx={p.map_x!} cy={p.map_y!} r={dotR} fill={p.dotColor} stroke="white" strokeWidth={dotR * 0.35} />
                    </g>
                  ))}
                </svg>
              )}
            </>
          )}
        </div>
        <span style={{ position: 'absolute', top: 8, left: 8, fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-muted)', background: 'rgba(251,247,238,0.92)', padding: '2px 7px', borderRadius: 5, border: '1px solid var(--color-border-soft)' }}>
          {typeLabel}
        </span>
        {signalTotal > 0 && (
          <span style={{ position: 'absolute', top: 8, right: 8, fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: '#fff', background: badgeColor, padding: '2px 8px', borderRadius: 99, letterSpacing: '0.04em' }}>
            {nuCount > 0 ? `${nuCount} nu` : `${vandaagCount} vandaag`}
          </span>
        )}
      </Link>
      <div style={{ padding: '12px 14px 10px', borderTop: '1px solid var(--color-border-soft)' }}>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 16, lineHeight: 1.15, color: 'var(--color-text)', letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{map.name}</h3>
        <p style={{ margin: '2px 0 0', fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 12, color: 'var(--color-text-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subLine}</p>
      </div>
      <div style={{ display: 'flex', borderTop: '1px solid var(--color-border-soft)', marginTop: 'auto' }}>
        <Link to={`/map/${map.slug}`} style={{ flex: 1, textAlign: 'center', padding: '9px 0', fontFamily: 'var(--font-heading)', fontSize: 12, fontWeight: 500, color: 'var(--color-primary)', textDecoration: 'none', borderRight: '1px solid var(--color-border-soft)' }}>{t.dashboard.actions.view}</Link>
        <Link to={`/maps/${map.id}/edit-layout`} style={{ flex: 1, textAlign: 'center', padding: '9px 0', fontFamily: 'var(--font-heading)', fontSize: 12, fontWeight: 500, color: 'var(--color-text-soft)', textDecoration: 'none', borderRight: '1px solid var(--color-border-soft)' }}>{t.dashboard.actions.edit}</Link>
        <Link to={`/maps/${map.id}/settings`} title={t.mapSettings.pageTitle} style={{ padding: '9px 14px', fontFamily: 'var(--font-heading)', fontSize: 12, fontWeight: 500, color: 'var(--color-text-soft)', textDecoration: 'none' }}>⚙</Link>
      </div>
    </div>
  )
}

function NewMapCard({ t, onNewMap }: { t: Translations; onNewMap: () => void }) {
  return (
    <button onClick={onNewMap} style={{ flexShrink: 0, width: 300, borderRadius: 14, border: '1px dashed var(--color-border)', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', cursor: 'pointer', aspectRatio: '4 / 3' }}>
      <span style={{ fontFamily: 'var(--font-heading)', fontSize: 28, color: 'var(--color-primary)' }}>+</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', marginTop: 6 }}>{t.dashboard.actions.newGarden}</span>
    </button>
  )
}

const LOG_TAG: Record<string, { color: string; bg: string; border: string }> = {
  water:       { color: 'var(--color-primary)',    bg: 'rgba(47,93,58,.08)',      border: 'rgba(47,93,58,.2)' },
  fertilize:   { color: 'var(--color-primary)',    bg: 'rgba(47,93,58,.08)',      border: 'rgba(47,93,58,.2)' },
  repot_check: { color: 'var(--color-text-soft)',  bg: 'rgba(74,90,71,.06)',      border: 'var(--color-border)' },
  prune:       { color: 'var(--color-text-soft)',  bg: 'rgba(74,90,71,.06)',      border: 'var(--color-border)' },
  mist:        { color: 'var(--color-primary)',    bg: 'rgba(47,93,58,.08)',      border: 'rgba(47,93,58,.2)' },
  rotate:      { color: 'var(--color-text-muted)', bg: 'rgba(138,148,130,.08)',  border: 'var(--color-border-soft)' },
}

function LogboekCollapsible({ entries, t }: { entries: RecentLogEntry[]; t: Translations }) {
  const [showAll, setShowAll] = useState(false)
  const latest = entries[0]
  const latestLabel = latest ? `${t.care[latest.care_type as keyof typeof t.care] ?? latest.care_type} · ${latest.plant_name}` : ''
  const dateStr = latest ? new Date(latest.done_at).toLocaleDateString(t.locale, { day: 'numeric', month: 'short' }) : ''
  return (
    <div>
      <button
        onClick={() => setShowAll(v => !v)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid var(--color-border-soft)', background: 'var(--color-surface)', cursor: 'pointer', marginBottom: showAll ? 10 : 24, textAlign: 'left' }}
      >
        <span style={{ fontFamily: 'var(--font-heading)', fontSize: 13, color: 'var(--color-text-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
          <span style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', marginRight: 8 }}>{dateStr}</span>
          {latestLabel}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--color-text-muted)', marginLeft: 12, flexShrink: 0 }}>
          {showAll ? '↑ verberg' : `↓ ${entries.length} entries`}
        </span>
      </button>
      {showAll && <LogboekSection entries={entries} t={t} />}
    </div>
  )
}

function LogboekSection({ entries, t }: { entries: RecentLogEntry[]; t: Translations }) {
  return (
    <div className="card" style={{ borderRadius: 14, overflow: 'hidden', marginBottom: 24 }}>
      {entries.map((entry, i) => {
        const tag = LOG_TAG[entry.care_type] ?? LOG_TAG.water
        const dateStr = new Date(entry.done_at).toLocaleDateString(t.locale, { day: 'numeric', month: 'long' })
        const timeStr = new Date(entry.done_at).toLocaleTimeString(t.locale, { hour: '2-digit', minute: '2-digit' })
        const actionLabel = t.care[entry.care_type as keyof typeof t.care] ?? entry.care_type
        return (
          <div key={entry.id} className="log-entry" style={{ display: 'grid', gridTemplateColumns: '56px 1fr auto', gap: 14, padding: '16px 18px', alignItems: 'flex-start', borderTop: i > 0 ? '1px solid var(--color-border-soft)' : 'none', overflow: 'hidden' }}>
            <div style={{ width: 56, height: 56, borderRadius: 8, background: 'linear-gradient(145deg, #FDFAF1, #EDE5D1)', border: '1px solid var(--color-border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
              {entry.icon_key ? <img src={resolveIconUrl(entry.icon_key)!} alt="" style={{ width: '80%', height: '80%', objectFit: 'contain' }} /> : <span style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 11, color: 'var(--color-text-muted)' }}>🌿</span>}
            </div>
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--color-text-muted)', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{dateStr} · {timeStr}</div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 15, color: 'var(--color-text)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {actionLabel} · <em style={{ color: 'var(--color-primary)' }}>{entry.plant_name}</em>
              </div>
              {entry.notes && <p style={{ margin: 0, fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 12, color: 'var(--color-text-soft)', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'break-word', wordBreak: 'break-word' }}>{entry.notes}</p>}
              <span className="log-mobile-tag" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: tag.color, background: tag.bg, padding: '2px 7px', borderRadius: 99, border: `1px solid ${tag.border}`, whiteSpace: 'nowrap', display: 'none' }}>{actionLabel}</span>
            </div>
            <span className="log-desktop-tag" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: tag.color, background: tag.bg, padding: '3px 8px', borderRadius: 99, border: `1px solid ${tag.border}`, whiteSpace: 'nowrap', flexShrink: 0 }}>{actionLabel}</span>
          </div>
        )
      })}
      <div style={{ borderTop: '1px solid var(--color-border-soft)', padding: '12px 18px', display: 'flex', justifyContent: 'flex-end' }}>
        <Link to="/log" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-primary)', textDecoration: 'none' }}>{t.dashboard.actions.fullLog}</Link>
      </div>
    </div>
  )
}

function CareTipCard({ fact, t }: { fact: PlantFactOut; t: Translations }) {
  return (
    <div className="card" style={{ borderRadius: 14, overflow: 'hidden', marginBottom: 18 }}>
      <div style={{ padding: '16px 18px 6px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.22em', color: 'var(--color-primary)', marginBottom: 4 }}>{t.dashboard.sections.didYouKnow}</div>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 22, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>
          <em style={{ fontStyle: 'italic', fontWeight: 400, color: 'var(--color-primary)' }}>{fact.plant_name}</em>.
        </div>
      </div>
      <div style={{ padding: '10px 18px 18px', borderTop: '1px solid var(--color-border-soft)', marginTop: 8 }}>
        <p style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 14, lineHeight: 1.5, color: 'var(--color-text-soft)', margin: '0 0 14px', position: 'relative' }}>
          <span style={{ color: 'var(--color-overdue)', fontSize: 32, lineHeight: 0, position: 'relative', top: 10, marginRight: 3, fontStyle: 'normal' }}>"</span>
          {fact.fact_nl}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {fact.icon_key && (
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(145deg, #FDFAF1, #EDE5D1)', border: '1px solid var(--color-border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <img src={resolveIconUrl(fact.icon_key)!} alt="" style={{ width: '78%', height: '78%', objectFit: 'contain' }} />
            </div>
          )}
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 12, color: 'var(--color-text)' }}>{fact.plant_name}</div>
            {fact.species_name && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-text-muted)' }}>{fact.species_name}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
