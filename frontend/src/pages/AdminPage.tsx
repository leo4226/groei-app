import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Glyph, { type GlyphName } from '../components/ui/Glyph'
import {
  adminPanel, admin,
  type AdminOverview, type AdminUserRow, type AdminPlantRow,
  type AdminSpeciesRow, type AdminActivityEvent, type AdminTableParams,
  type AdminSystemHealth, type AdminHealthStatus,
  type AdminGrowthMetrics, type AdminGrowthMetricPoint,
  type AdminHouseholdDetail, type AdminAuditRow,
  type AdminJob, type AdminJobStatus, type AdminCoverage, type AdminSkippedDetail,
  type AdminBackfillFactsPreview, type AdminBackfillNamesPreview,
} from '../api/client'
import {
  ADMIN_RESPONSIVE_STYLES,
  adminBrandStyle,
  adminHeaderActionsStyle,
  adminHeaderStyle,
  adminMainStyle,
  adminOverlayClassName,
  adminOverlayStyle,
  adminRootStyle,
  adminShellStyle,
  adminSidebarStyle,
  adminTopbarStyle,
} from './adminPageLayout'
import {
  FACTS_MAP_ONLY_DEFAULT,
  scopedFactsCountLabel,
  scopedFactsMissingCount,
  scopedFactsPreviewIsStaleOrUnsupported,
  scopedFactsRunParams,
} from './adminFactsToolModel'
import {
  describeSkip,
  etaSeconds,
  formatDuration,
  iconJobSummary,
  skipSubject,
} from './adminJobModel'

type Section = 'overview' | 'users' | 'plants' | 'species' | 'coverage' | 'tools' | 'activity' | 'audit'

const NAV: { id: Section; icon: GlyphName; label: string }[] = [
  { id: 'overview', icon: 'chart',     label: 'Overview' },
  { id: 'users',    icon: 'users',     label: 'Users' },
  { id: 'plants',   icon: 'leaf',      label: 'Plants' },
  { id: 'species',  icon: 'flask',     label: 'Species' },
  { id: 'coverage', icon: 'compass',   label: 'Coverage' },
  { id: 'tools',    icon: 'wrench',    label: 'Tools' },
  { id: 'activity', icon: 'clipboard', label: 'Activity' },
  { id: 'audit',    icon: 'lock',      label: 'Audit log' },
]

const PAGE_SIZE = 50
const SEARCH_DEBOUNCE_MS = 300

type SortDir = 'asc' | 'desc'
type SortState = { sort: string; dir: SortDir }
type AdminTableHead = string | { label: string; sortKey?: string }

const HEALTH_SERVICES: { key: keyof AdminSystemHealth; label: string }[] = [
  { key: 'database', label: 'Database' },
  { key: 'bioclip', label: 'BioCLIP worker' },
  { key: 'r2', label: 'R2 storage' },
  { key: 'llm', label: 'LLM (Nous)' },
  { key: 'email', label: 'Email (Resend)' },
]

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timeout)
  }, [value, delayMs])

  return debounced
}

function nextSortDir(current: SortState, sortKey: string, initialDir: SortDir = 'asc'): SortDir {
  if (current.sort !== sortKey) return initialDir
  return current.dir === 'asc' ? 'desc' : 'asc'
}

export default function AdminPage() {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const closeSidebar = useCallback(() => setSidebarOpen(false), [])
  const handleNav = useCallback((s: Section) => { setSection(s); setSidebarOpen(false) }, [])
  const [email, setEmail] = useState('')
  const [section, setSection] = useState<Section>('overview')

  useEffect(() => {
    const token = localStorage.getItem('floreren-token')
    if (!token) { navigate('/maps', { replace: true }); return }
    adminPanel.me()
      .then(d => { setEmail(d.email); setChecking(false) })
      .catch(() => navigate('/maps', { replace: true }))
  }, [navigate])

  if (checking) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: 'var(--color-bg)', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text-muted)', letterSpacing: '.15em', textTransform: 'uppercase' }}>
      Checking access…
    </div>
  )

  return (
    <div style={adminRootStyle()}>
      <style>{ADMIN_RESPONSIVE_STYLES}</style>
      <div
        data-admin-overlay
        className={adminOverlayClassName(sidebarOpen)}
        aria-hidden={!sidebarOpen}
        onClick={closeSidebar}
        style={adminOverlayStyle()}
      />
      <div style={adminHeaderStyle()}>
        <div data-admin-topbar style={adminTopbarStyle()}>
          <div data-admin-brand style={adminBrandStyle()}>
            <button
              onClick={() => navigate('/maps')}
              style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
              title="Back to app"
            >
              <Glyph name="arrow-left" size={16} />
            </button>
            <Glyph name="leaf" size={16} /> Floreren
            <span style={{ background: 'rgba(255,255,255,.15)', borderRadius: 4, padding: '2px 8px', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase' }}>Admin</span>
          </div>
          <div style={adminHeaderActionsStyle()}><button data-admin-hamburger onClick={() => setSidebarOpen(prev => !prev)} style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '4px 8px', display: 'none', alignItems: 'center' }}>{sidebarOpen ? String.fromCharCode(10005) : String.fromCharCode(9776)}</button><span data-admin-email style={{ fontFamily: 'var(--font-mono)', fontSize: 10, opacity: .7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{email}</span></div>
        </div>
      </div>

      <div data-admin-shell style={adminShellStyle()}>
        <aside data-admin-sidebar className={sidebarOpen ? "open" : ""} style={adminSidebarStyle()}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.2em', color: 'var(--color-text-muted)', padding: '0 16px 8px' }}>Platform</div>
          {NAV.slice(0, 4).map(item => (
            <NavItem key={item.id} item={item} active={section === item.id} onClick={() => handleNav(item.id)} />
          ))}
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.2em', color: 'var(--color-text-muted)', padding: '16px 16px 8px' }}>System</div>
          {NAV.slice(4).map(item => (
            <NavItem key={item.id} item={item} active={section === item.id} onClick={() => handleNav(item.id)} />
          ))}
        </aside>

        <main data-admin-main style={adminMainStyle()}>
          {section === 'overview'  && <OverviewView onNavigate={setSection} />}
          {section === 'users'     && <UsersView />}
          {section === 'plants'    && <PlantsView />}
          {section === 'species'   && <SpeciesView />}
          {section === 'coverage'  && <CoverageView />}
          {section === 'tools'     && <ToolsView />}
          {section === 'activity'  && <ActivityView />}
          {section === 'audit'     && <AuditView />}
        </main>
      </div>
    </div>
  )
}

function NavItem({ item, active, onClick }: { item: typeof NAV[0]; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', width: '100%', textAlign: 'left',
      fontFamily: 'var(--font-body)', fontSize: 13, cursor: 'pointer', border: 'none',
      borderLeft: active ? '3px solid var(--color-primary)' : '3px solid transparent',
      background: active ? 'var(--color-bg-warm)' : 'transparent',
      color: active ? 'var(--color-primary)' : 'var(--color-text-soft)',
      fontWeight: active ? 600 : 400,
      transition: 'all .12s',
    }}>
      <span style={{ width: 16, display: 'inline-flex', justifyContent: 'center' }}><Glyph name={item.icon} size={15} /></span>
      {item.label}
    </button>
  )
}

function PageHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ marginBottom: 24, paddingBottom: 18, borderBottom: '1px solid var(--color-border)' }}>
      <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 26, letterSpacing: '-.02em', margin: '0 0 4px' }}>{title}</h1>
      <p style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 13, color: 'var(--color-text-soft)', margin: 0 }}>{sub}</p>
    </div>
  )
}

function Pill({ label, tone }: { label: string; tone: 'green' | 'amber' | 'red' | 'muted' }) {
  const styles: Record<string, { color: string; bg: string; border: string }> = {
    green: { color: 'var(--color-primary)',    bg: 'rgba(47,93,58,.1)',      border: 'rgba(47,93,58,.2)' },
    amber: { color: '#9A7010',                 bg: 'rgba(217,164,24,.12)',   border: 'rgba(217,164,24,.25)' },
    red:   { color: 'var(--color-overdue)',    bg: 'rgba(178,102,74,.1)',    border: 'rgba(178,102,74,.2)' },
    muted: { color: 'var(--color-text-muted)', bg: 'rgba(138,148,130,.08)', border: 'var(--color-border-soft)' },
  }
  const s = styles[tone]
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.1em', color: s.color, background: s.bg, border: `1px solid ${s.border}` }}>
      {label}
    </span>
  )
}

function SectionCard({ title, action, children }: { title: string; action?: { label: string; onClick: () => void }; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
      <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.18em', color: 'var(--color-text-soft)' }}>{title}</span>
        {action && <button onClick={action.onClick} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '.1em' }}>{action.label}</button>}
      </div>
      {children}
    </div>
  )
}

function AdminTable({ heads, children, scrollable, sort, onSort }: { heads: AdminTableHead[]; children: React.ReactNode; scrollable?: boolean; sort?: SortState; onSort?: (sortKey: string) => void }) {
  const table = (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {heads.map(head => {
            const label = typeof head === 'string' ? head : head.label
            const sortKey = typeof head === 'string' ? undefined : head.sortKey
            const active = Boolean(sortKey && sort?.sort === sortKey)
            return (
              <th key={`${label}-${sortKey ?? 'static'}`} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.15em', color: 'var(--color-text-muted)', padding: '10px 18px', textAlign: 'left', borderBottom: '1px solid var(--color-border-soft)', whiteSpace: 'nowrap' }}>
                {sortKey && onSort ? (
                  <button
                    onClick={() => onSort(sortKey)}
                    style={{ background: 'none', border: 'none', padding: 0, margin: 0, cursor: 'pointer', font: 'inherit', color: active ? 'var(--color-primary)' : 'inherit', textTransform: 'inherit', letterSpacing: 'inherit' }}
                  >
                    {label} <span aria-hidden="true">{active ? (sort?.dir === 'asc' ? '↑' : '↓') : '↕'}</span>
                  </button>
                ) : label}
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  )
  return scrollable ? <div data-admin-table-wrap style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>{table}</div> : table
}

function Td({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <td style={{ padding: '10px 18px', fontSize: 12, fontFamily: mono ? 'var(--font-mono)' : 'var(--font-body)', color: 'var(--color-text)', borderBottom: '1px dashed var(--color-border-soft)', verticalAlign: 'middle' }}>
      {children}
    </td>
  )
}

function Loading() {
  return <div style={{ padding: '40px 18px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-muted)', letterSpacing: '.15em', textTransform: 'uppercase' }}>Loading…</div>
}

function ErrorMsg({ msg }: { msg: string }) {
  return <div style={{ padding: '16px 18px', color: 'var(--color-overdue)', fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 13 }}>{msg}</div>
}

function PaginationFooter({ total, limit, offset, onOffsetChange, loading }: { total: number; limit: number; offset: number; onOffsetChange: (offset: number) => void; loading?: boolean }) {
  const start = total === 0 ? 0 : offset + 1
  const end = Math.min(offset + limit, total)
  const canPrev = offset > 0
  const canNext = offset + limit < total
  const btnStyle = (disabled: boolean): React.CSSProperties => ({
    background: disabled ? 'var(--color-bg-warm)' : 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    color: disabled ? 'var(--color-text-muted)' : 'var(--color-primary)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    padding: '5px 10px',
    opacity: loading ? .65 : 1,
  })

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 18px', borderTop: '1px solid var(--color-border-soft)', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-muted)', flexWrap: 'wrap' }}>
      <span>{start}–{end} of {total}{loading ? ' · loading…' : ''}</span>
      <span style={{ display: 'flex', gap: 8 }}>
        <button disabled={!canPrev || loading} onClick={() => onOffsetChange(Math.max(0, offset - limit))} style={btnStyle(!canPrev || Boolean(loading))}>Prev</button>
        <button disabled={!canNext || loading} onClick={() => onOffsetChange(offset + limit)} style={btnStyle(!canNext || Boolean(loading))}>Next</button>
      </span>
    </div>
  )
}

function ActivityRow({ event }: { event: AdminActivityEvent }) {
  const dotColor: Record<string, string> = {
    account_registered: 'var(--color-primary)',
    plant_added:        'var(--color-primary)',
    icon_requested:     'var(--color-due)',
    care_log:           'var(--color-border)',
  }
  const color = dotColor[event.kind] ?? 'var(--color-border)'
  const ts = event.ts ? new Date(event.ts).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) : '—'
  return (
    <div style={{ display: 'flex', gap: 12, padding: '10px 18px', borderBottom: '1px dashed var(--color-border-soft)', alignItems: 'flex-start' }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 4 }} />
      <div>
        <div style={{ fontSize: 12, lineHeight: 1.4 }}>{event.label} <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>· {event.household}</span></div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-muted)', marginTop: 2 }}>{ts}</div>
      </div>
    </div>
  )
}

function FilterBar({ options, active, onChange }: { options: { id: string; label: string }[]; active: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
      {options.map(o => (
        <button key={o.id} onClick={() => onChange(o.id)} style={{
          padding: '5px 12px', borderRadius: 99, fontFamily: 'var(--font-mono)', fontSize: 9,
          textTransform: 'uppercase', letterSpacing: '.1em', cursor: 'pointer',
          border: '1px solid var(--color-border)',
          background: active === o.id ? 'var(--color-primary)' : 'var(--color-surface)',
          color: active === o.id ? '#fff' : 'var(--color-text-muted)',
          transition: 'all .12s',
        }}>{o.label}</button>
      ))}
    </div>
  )
}

function healthTone(status: AdminHealthStatus): 'green' | 'amber' | 'red' | 'muted' {
  if (status === 'ok') return 'green'
  if (status === 'degraded') return 'amber'
  if (status === 'down') return 'red'
  return 'muted'
}

function healthDotColor(status: AdminHealthStatus): string {
  if (status === 'ok') return 'var(--color-primary)'
  if (status === 'degraded') return 'var(--color-due)'
  if (status === 'down') return 'var(--color-overdue)'
  return 'var(--color-text-muted)'
}

function SystemHealthCard({ health, loading, error, onRefresh }: { health: AdminSystemHealth | null; loading: boolean; error: string; onRefresh: () => void }) {
  return (
    <SectionCard title="System health" action={{ label: loading ? 'Refreshing…' : 'Refresh ↻', onClick: onRefresh }}>
      {error && <ErrorMsg msg={error} />}
      {!health && !error && <Loading />}
      {health && (
        <div>
          {HEALTH_SERVICES.map(({ key, label }) => {
            const service = health[key]
            const tone = healthTone(service.status)
            const latency = service.latency_ms == null ? '—' : `${service.latency_ms} ms`
            return (
              <div key={key} data-admin-health-row style={{ display: 'grid', gridTemplateColumns: '180px 110px 86px 1fr', gap: 12, alignItems: 'center', padding: '10px 18px', borderBottom: '1px dashed var(--color-border-soft)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: healthDotColor(service.status), boxShadow: service.status === 'ok' ? '0 0 0 3px rgba(47,93,58,.08)' : 'none', flexShrink: 0 }} />
                  <strong style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</strong>
                </div>
                <Pill label={service.status} tone={tone} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{latency}</span>
                <span style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 12, color: 'var(--color-text-soft)', lineHeight: 1.35 }}>{service.detail}</span>
              </div>
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}

// ── Section views ─────────────────────────────────────────────────────────────

function SparkBarChart({ data, color = 'var(--color-primary)', height = 40 }: { data: AdminGrowthMetricPoint[]; color?: string; height?: number }) {
  const values = data.map(d => d.count)
  const max = Math.max(...values, 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1.5, height, width: '100%' }}>
      {data.map((d) => {
        const pct = (d.count / max) * 100
        return (
          <div key={d.date} title={d.date + ': ' + d.count} style={{
            flex: 1, height: Math.max(pct, 2) + '%',
            background: color, borderRadius: '2px 2px 0 0',
            opacity: d.count === 0 ? 0.25 : 0.8,
            transition: 'all .15s', cursor: 'default',
            minWidth: 3,
          }} />
        )
      })}
    </div>
  )
}

function MetricSparklineCard({ title, data, delta, color }: { title: string; data: AdminGrowthMetricPoint[]; delta: number; color: string }) {
  const total = data.reduce((s, d) => s + d.count, 0)
  const deltaStr = delta >= 0 ? '+' + delta : '' + delta
  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.18em', color: 'var(--color-text-muted)' }}>{title}</div>
        <div style={{ fontSize: 11, color: delta >= 0 ? 'var(--color-primary)' : 'var(--color-overdue)', fontWeight: 500 }}>{deltaStr}</div>
      </div>
      <div style={{ fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 500, lineHeight: 1.2, color, marginBottom: 8 }}>{total.toLocaleString()}</div>
      <SparkBarChart data={data} color={color} />
    </div>
  )
}


function OverviewView({ onNavigate }: { onNavigate: (s: Section) => void }) {
  const [data, setData] = useState<AdminOverview | null>(null)
  const [err, setErr] = useState('')
  const [health, setHealth] = useState<AdminSystemHealth | null>(null)
  const [healthErr, setHealthErr] = useState('')
  const [healthLoading, setHealthLoading] = useState(false)

  const [growth, setGrowth] = useState<AdminGrowthMetrics | null>(null)
  const [growthDays, setGrowthDays] = useState(30)
  const [growthLoading, setGrowthLoading] = useState(false)

  const loadHealth = useCallback(() => {
    setHealthLoading(true)
    setHealthErr('')
    adminPanel.health()
      .then(setHealth)
      .catch(e => setHealthErr(e instanceof Error ? e.message : 'System health unavailable'))
      .finally(() => setHealthLoading(false))
  }, [])

  useEffect(() => {
    adminPanel.overview().then(setData).catch(e => setErr(e.message))
  }, [])

  useEffect(() => {
    loadHealth()
  }, [loadHealth])

  useEffect(() => {
    setGrowthLoading(true)
    adminPanel.growthMetrics(growthDays)
      .then(setGrowth)
      .catch(() => {})
      .finally(() => setGrowthLoading(false))
  }, [growthDays])

  if (err) return <div><PageHeader title="Overview" sub="Platform health at a glance" /><SystemHealthCard health={health} loading={healthLoading} error={healthErr} onRefresh={loadHealth} /><ErrorMsg msg={err} /></div>
  if (!data) return <div><PageHeader title="Overview" sub="Platform health at a glance" /><SystemHealthCard health={health} loading={healthLoading} error={healthErr} onRefresh={loadHealth} /><Loading /></div>

  const statCards = [
    { label: 'Accounts',      value: data.total_accounts, color: 'var(--color-primary)', deltaKey: 'signups' as const },
    { label: 'Plants',        value: data.total_plants,   color: 'var(--color-text)',    deltaKey: 'plants_added' as const },
    { label: 'Maps',          value: data.total_maps,     color: 'var(--color-text)',    deltaKey: undefined },
    { label: 'Missing icons', value: data.missing_icons,  color: data.missing_icons > 0 ? 'var(--color-overdue)' : 'var(--color-text-muted)', deltaKey: undefined },
  ]
  return (
    <div>
      <PageHeader title="Overview" sub={'Platform health at a glance ' + String.fromCharCode(8212) + ' ' + new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} />

      <SystemHealthCard health={health} loading={healthLoading} error={healthErr} onRefresh={loadHealth} />

      <div data-admin-stat-cards style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        {statCards.map(c => {
          const delta = c.deltaKey && growth?.deltas[c.deltaKey]
          return (
            <div key={c.label} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '16px 18px', position: 'relative' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.18em', color: 'var(--color-text-muted)', marginBottom: 8 }}>{c.label}</div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 32, fontWeight: 500, lineHeight: 1, color: c.color }}>{c.value}</div>
              {delta !== undefined && delta !== null && (
                <div style={{
                  position: 'absolute', top: 12, right: 14,
                  fontSize: 10, fontWeight: 600,
                  color: delta >= 0 ? 'var(--color-primary)' : 'var(--color-overdue)',
                  background: delta >= 0 ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)' : 'color-mix(in srgb, var(--color-overdue) 12%, transparent)',
                  padding: '2px 7px', borderRadius: 99,
                  fontFamily: 'var(--font-mono)',
                }}>
                  {delta >= 0 ? '+' : ''}{delta} this period
                </div>
              )}
            </div>
          )
        })}
      </div>

      <SectionCard title="Growth metrics">
        <FilterBar
          options={[
            { id: '7', label: '7 days' },
            { id: '30', label: '30 days' },
            { id: '90', label: '90 days' },
          ]}
          active={String(growthDays)}
          onChange={v => setGrowthDays(Number(v))} />
        {growthLoading && <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-muted)', fontFamily: 'var(--font-heading)', fontSize: 13 }}>Loading growth data...</div>}
        {growth && !growthLoading && (
          <>
            <div data-growth-metrics style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
              <MetricSparklineCard title="Signups" data={growth.metrics.signups} delta={growth.deltas.signups} color="var(--color-primary)" />
              <MetricSparklineCard title="Plants added" data={growth.metrics.plants_added} delta={growth.deltas.plants_added} color="var(--color-secondary)" />
              <MetricSparklineCard title="Care logs" data={growth.metrics.care_logs} delta={growth.deltas.care_logs} color="var(--color-due)" />
              <MetricSparklineCard title="Active households" data={growth.metrics.active_households} delta={growth.deltas.active_households} color="var(--color-text-muted)" />
              <MetricSparklineCard title="Plant IDs" data={growth.metrics.identifies} delta={growth.deltas.identifies} color="var(--color-secondary)" />
            </div>
            {growth.top_identifiers.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.18em', color: 'var(--color-text-muted)', marginBottom: 8 }}>Plant IDs by household</div>
                {growth.top_identifiers.map((t, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--color-border)', fontSize: 13 }}>
                    <span style={{ color: 'var(--color-text)' }}>{t.household}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>{t.count}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {!growth && !growthLoading && <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-muted)', fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 13 }}>Growth data unavailable.</div>}
      </SectionCard>

      <div data-admin-overview-cards style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 20, marginTop: 20 }}>
        <SectionCard title="Recent accounts" action={{ label: 'View all ' + String.fromCharCode(8594), onClick: () => onNavigate('users') }}>
          <AdminTable heads={['Name', 'Household', 'Plants', 'Status']}>
            {data.recent_accounts.map(a => (
              <tr key={a.id}>
                <Td><strong>{a.name}</strong></Td>
                <Td>{a.household_name}</Td>
                <Td mono>{a.plant_count}</Td>
                <Td><Pill label={a.is_admin ? 'Admin' : a.plant_count === 0 ? 'No plants' : 'Active'} tone={a.is_admin ? 'green' : a.plant_count === 0 ? 'amber' : 'green'} /></Td>
              </tr>
            ))}
          </AdminTable>
        </SectionCard>

        <SectionCard title="Recent activity" action={{ label: 'Full log ' + String.fromCharCode(8594), onClick: () => onNavigate('activity') }}>
          <div>
            {data.recent_activity.map((ev, i) => (
              <ActivityRow key={i} event={ev} />
            ))}
            {data.recent_activity.length === 0 && <div style={{ padding: '20px 18px', fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center' }}>No recent activity.</div>}
          </div>
        </SectionCard>
      </div>
    </div>
  )
}

function UsersView() {
  const [users, setUsers] = useState<AdminUserRow[] | null>(null)
  const [total, setTotal] = useState(0)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS)
  const [sortState, setSortState] = useState<SortState>({ sort: 'created_at', dir: 'desc' })
  const [offset, setOffset] = useState(0)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkConfirm, setBulkConfirm] = useState(false)
  const [selectedHousehold, setSelectedHousehold] = useState<{ id: number; name: string } | null>(null)

  if (selectedHousehold) {
    return (
      <HouseholdDetailView
        householdId={selectedHousehold.id}
        householdName={selectedHousehold.name}
        onBack={() => setSelectedHousehold(null)}
      />
    )
  }

  useEffect(() => {
    let cancelled = false
    const params: AdminTableParams = { limit: PAGE_SIZE, offset, q: debouncedSearch, sort: sortState.sort, dir: sortState.dir }
    setLoading(true)
    setErr('')
    adminPanel.users(params)
      .then(data => {
        if (cancelled) return
        setUsers(data.rows)
        setTotal(data.total)
      })
      .catch(e => {
        if (cancelled) return
        setErr(e.message)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [debouncedSearch, offset, sortState])

  function handleSearch(value: string) {
    setSearch(value)
    setOffset(0)
  }

  function handleSort(sortKey: string) {
    setSortState(current => ({
      sort: sortKey,
      dir: nextSortDir(current, sortKey, sortKey === 'created_at' ? 'desc' : 'asc'),
    }))
    setOffset(0)
  }

  async function handleDelete(id: number) {
    setDeletingId(id)
    try {
      await admin.deleteAccount(id)
      setUsers(u => u ? u.filter(x => x.id !== id) : u)
      setTotal(t => Math.max(0, t - 1))
      setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next })
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeletingId(null)
      setConfirmId(null)
    }
  }

  async function handleBulkDelete() {
    setBulkDeleting(true)
    try {
      const ids = [...selectedIds]
      await admin.deleteAccounts(ids)
      setUsers(u => u ? u.filter(x => !selectedIds.has(x.id)) : u)
      setTotal(t => Math.max(0, t - ids.length))
      setSelectedIds(new Set())
      setBulkConfirm(false)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Bulk delete failed')
    } finally {
      setBulkDeleting(false)
    }
  }

  function toggleSelect(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const pageRows = users ?? []
  const deletableRows = pageRows.filter(u => !u.is_admin)
  const allSelected = deletableRows.length > 0 && deletableRows.every(u => selectedIds.has(u.id))

  function toggleAll() {
    if (!users) return
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (allSelected) {
        deletableRows.forEach(u => next.delete(u.id))
      } else {
        deletableRows.forEach(u => next.add(u.id))
      }
      return next
    })
  }

  return (
    <div>
      <PageHeader title="Users" sub={`${users ? total : '…'} accounts across all households`} />

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => handleSearch(e.target.value)}
          placeholder="Search by name, email or household…"
          style={{ flex: 1, minWidth: 200, maxWidth: 360, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', fontFamily: 'var(--font-body)', fontSize: 13, boxSizing: 'border-box' }}
        />

        {selectedIds.size > 0 && (
          bulkConfirm ? (
            <span style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 'auto', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-overdue)' }}>
                Delete {selectedIds.size} account{selectedIds.size > 1 ? 's' : ''} and all data?
              </span>
              <button onClick={handleBulkDelete} disabled={bulkDeleting}
                style={{ background: 'var(--color-overdue)', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', fontFamily: 'var(--font-mono)', fontSize: 9, cursor: 'pointer' }}>
                {bulkDeleting ? 'Deleting…' : `Yes, delete ${selectedIds.size}`}
              </button>
              <button onClick={() => setBulkConfirm(false)}
                style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 4, padding: '4px 12px', fontFamily: 'var(--font-mono)', fontSize: 9, cursor: 'pointer', color: 'var(--color-text-muted)' }}>
                Cancel
              </button>
            </span>
          ) : (
            <button onClick={() => setBulkConfirm(true)}
              style={{ marginLeft: 'auto', background: 'var(--color-overdue)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 16px', fontFamily: 'var(--font-mono)', fontSize: 10, cursor: 'pointer', letterSpacing: '.08em' }}>
              Delete selected ({selectedIds.size})
            </button>
          )
        )}
      </div>

      {err && <ErrorMsg msg={err} />}
      {loading && !users && !err && <Loading />}

      {users && (
        <SectionCard title={`${total} accounts`}>
          <AdminTable
            heads={[
              '',
              { label: 'Name', sortKey: 'name' },
              { label: 'Email', sortKey: 'email' },
              { label: 'Household', sortKey: 'household' },
              { label: 'Plants', sortKey: 'plant_count' },
              { label: 'Maps', sortKey: 'map_count' },
              { label: 'Joined', sortKey: 'created_at' },
              'Actions',
            ]}
            sort={sortState}
            onSort={handleSort}
            scrollable
          >
            <tr style={{ background: 'var(--color-bg-warm)' }}>
              <th style={{ padding: '8px 18px', textAlign: 'left', borderBottom: '1px solid var(--color-border-soft)' }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll}
                  style={{ accentColor: 'var(--color-primary)', cursor: 'pointer' }} />
              </th>
              <th colSpan={7} style={{ padding: '8px 0', textAlign: 'left', borderBottom: '1px solid var(--color-border-soft)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-muted)', letterSpacing: '.1em' }}>
                  {allSelected ? 'Page selected' : selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select this page'}
                </span>
              </th>
            </tr>
            {pageRows.map(u => {
              const joined = new Date(u.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
              const isAdmin = u.is_admin
              return (
                <tr key={u.id}>
                  <Td>
                    {!isAdmin && (
                      <input type="checkbox" checked={selectedIds.has(u.id)} onChange={() => toggleSelect(u.id)}
                        style={{ accentColor: 'var(--color-primary)', cursor: 'pointer' }} />
                    )}
                  </Td>
                  <Td><strong>{u.name}</strong></Td>
                  <Td mono>{u.email}</Td>
                  <Td>
                    <button
                      onClick={() => setSelectedHousehold({ id: u.household_id, name: u.household_name })}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--color-primary)', fontFamily: 'var(--font-body)', fontSize: 12, textDecoration: 'underline' }}
                    >
                      {u.household_name}
                    </button>
                  </Td>
                  <Td mono>{u.plant_count}</Td>
                  <Td mono>{u.map_count}</Td>
                  <Td mono>{joined}</Td>
                  <Td>
                    {!isAdmin && (
                      confirmId === u.id ? (
                        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-overdue)' }}>Delete all data?</span>
                          <button onClick={() => handleDelete(u.id)} disabled={deletingId === u.id}
                            style={{ background: 'var(--color-overdue)', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 8px', fontFamily: 'var(--font-mono)', fontSize: 9, cursor: 'pointer' }}>
                            {deletingId === u.id ? '…' : 'Yes'}
                          </button>
                          <button onClick={() => setConfirmId(null)}
                            style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 4, padding: '3px 8px', fontFamily: 'var(--font-mono)', fontSize: 9, cursor: 'pointer', color: 'var(--color-text-muted)' }}>
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmId(u.id)}
                          style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 4, padding: '3px 10px', fontFamily: 'var(--font-mono)', fontSize: 9, cursor: 'pointer', color: 'var(--color-text-muted)' }}>
                          Delete
                        </button>
                      )
                    )}
                  </Td>
                </tr>
              )
            })}
          </AdminTable>
          {pageRows.length === 0 && <div style={{ padding: '20px 18px', fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center' }}>No accounts found.</div>}
          <PaginationFooter total={total} limit={PAGE_SIZE} offset={offset} onOffsetChange={setOffset} loading={loading} />
        </SectionCard>
      )}
    </div>
  )
}

function HouseholdDetailView({ householdId, householdName, onBack }: { householdId: number; householdName: string; onBack: () => void }) {
  const [data, setData] = useState<AdminHouseholdDetail | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    adminPanel.household(householdId).then(setData).catch(e => setErr(e instanceof Error ? e.message : 'Failed to load'))
  }, [householdId])

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div>
      <div style={{ marginBottom: 24, paddingBottom: 18, borderBottom: '1px solid var(--color-border)' }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <Glyph name="arrow-left" size={12} /> Users
        </button>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 26, letterSpacing: '-.02em', margin: '0 0 4px' }}>{householdName}</h1>
        <p style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 13, color: 'var(--color-text-soft)', margin: 0 }}>Household detail</p>
      </div>

      {err && <ErrorMsg msg={err} />}
      {!data && !err && <Loading />}

      {data && (
        <>
          <SectionCard title={`${data.accounts.length} account${data.accounts.length !== 1 ? 's' : ''}`}>
            <AdminTable heads={['Name', 'Email', 'Role', 'Joined']}>
              {data.accounts.map(a => (
                <tr key={a.id}>
                  <Td><strong>{a.name}</strong></Td>
                  <Td mono>{a.email}</Td>
                  <Td><Pill label={a.is_admin ? 'Admin' : 'Member'} tone={a.is_admin ? 'green' : 'muted'} /></Td>
                  <Td mono>{formatDate(a.created_at)}</Td>
                </tr>
              ))}
            </AdminTable>
            {data.accounts.length === 0 && <div style={{ padding: '20px 18px', fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center' }}>No accounts.</div>}
          </SectionCard>

          <SectionCard title={`${data.maps.length} map${data.maps.length !== 1 ? 's' : ''}`}>
            <AdminTable heads={['Name', 'Type', 'Plants on map']}>
              {data.maps.map(m => (
                <tr key={m.id}>
                  <Td><strong>{m.name}</strong></Td>
                  <Td><Pill label={m.map_type} tone={m.map_type === 'outdoor' ? 'green' : 'muted'} /></Td>
                  <Td mono>{m.plant_count}</Td>
                </tr>
              ))}
            </AdminTable>
            {data.maps.length === 0 && <div style={{ padding: '20px 18px', fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center' }}>No maps.</div>}
          </SectionCard>

          <SectionCard title={`${data.plants.length} active plant${data.plants.length !== 1 ? 's' : ''}`}>
            <AdminTable heads={['Name', 'Species', 'Phase', 'Thresholds', 'Added']} scrollable>
              {data.plants.map(p => (
                <tr key={p.id}>
                  <Td><strong>{p.name}</strong></Td>
                  <Td>{p.species ?? <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>—</span>}</Td>
                  <Td>{p.phase ?? '—'}</Td>
                  <Td><Pill label={p.has_thresholds ? 'Yes' : 'No'} tone={p.has_thresholds ? 'green' : 'amber'} /></Td>
                  <Td mono>{formatDate(p.created_at)}</Td>
                </tr>
              ))}
            </AdminTable>
            {data.plants.length === 0 && <div style={{ padding: '20px 18px', fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center' }}>No active plants.</div>}
          </SectionCard>

          <SectionCard title="Recent care log">
            <AdminTable heads={['Plant', 'Care type', 'Done at']}>
              {data.care_log.map(c => (
                <tr key={c.id}>
                  <Td>{c.plant_name}</Td>
                  <Td mono>{c.care_type}</Td>
                  <Td mono>{formatDate(c.done_at)}</Td>
                </tr>
              ))}
            </AdminTable>
            {data.care_log.length === 0 && <div style={{ padding: '20px 18px', fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center' }}>No care log entries.</div>}
          </SectionCard>
        </>
      )}
    </div>
  )
}

function PlantsView() {
  const [plants, setPlants] = useState<AdminPlantRow[] | null>(null)
  const [total, setTotal] = useState(0)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS)
  const [sortState, setSortState] = useState<SortState>({ sort: 'created_at', dir: 'desc' })
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    let cancelled = false
    const params: AdminTableParams = { limit: PAGE_SIZE, offset, q: debouncedSearch, filter, sort: sortState.sort, dir: sortState.dir }
    setLoading(true)
    setErr('')
    adminPanel.plants(params)
      .then(data => {
        if (cancelled) return
        setPlants(data.rows)
        setTotal(data.total)
      })
      .catch(e => {
        if (cancelled) return
        setErr(e.message)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [debouncedSearch, filter, offset, sortState])

  function handleSearch(value: string) {
    setSearch(value)
    setOffset(0)
  }

  function handleFilter(value: string) {
    setFilter(value)
    setOffset(0)
  }

  function handleSort(sortKey: string) {
    setSortState(current => ({
      sort: sortKey,
      dir: nextSortDir(current, sortKey, sortKey === 'created_at' ? 'desc' : 'asc'),
    }))
    setOffset(0)
  }

  const rows = plants ?? []

  return (
    <div>
      <PageHeader title="Plants" sub={`${plants ? total : '…'} active plants across all households`} />

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => handleSearch(e.target.value)}
          placeholder="Search by name, species or household…"
          style={{ flex: 1, minWidth: 200, maxWidth: 360, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', fontFamily: 'var(--font-body)', fontSize: 13, boxSizing: 'border-box' }}
        />
      </div>

      <FilterBar
        active={filter}
        onChange={handleFilter}
        options={[
          { id: 'all', label: 'All' },
          { id: 'no_icon', label: 'No icon' },
          { id: 'no_thresholds', label: 'No thresholds' },
        ]}
      />

      {err && <ErrorMsg msg={err} />}
      {loading && !plants && !err && <Loading />}

      {plants && (
        <SectionCard title={`${total} plants`}>
          <AdminTable
            heads={[
              { label: 'ID', sortKey: 'id' },
              { label: 'Name', sortKey: 'name' },
              { label: 'Species', sortKey: 'species' },
              { label: 'Household', sortKey: 'household' },
              { label: 'Phase', sortKey: 'phase' },
              { label: 'Icon', sortKey: 'icon' },
              { label: 'Thresholds', sortKey: 'thresholds' },
            ]}
            sort={sortState}
            onSort={handleSort}
            scrollable
          >
            {rows.map(p => (
              <tr key={p.id}>
                <Td mono>{p.id}</Td>
                <Td><strong>{p.name}</strong></Td>
                <Td>{p.species ?? <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>—</span>}</Td>
                <Td>{p.household_name}</Td>
                <Td mono>{p.phase}</Td>
                <Td>{p.icon_key ? <Pill label={p.icon_key} tone="green" /> : <Pill label="missing" tone={p.icon_requested ? 'amber' : 'red'} />}</Td>
                <Td><Pill label={p.has_thresholds ? 'yes' : 'no'} tone={p.has_thresholds ? 'green' : 'red'} /></Td>
              </tr>
            ))}
          </AdminTable>
          {rows.length === 0 && <div style={{ padding: '20px 18px', fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center' }}>No plants found.</div>}
          <PaginationFooter total={total} limit={PAGE_SIZE} offset={offset} onOffsetChange={setOffset} loading={loading} />
        </SectionCard>
      )}
    </div>
  )
}

function SpeciesEditPanel({ species: initial, allSpecies, onSaved, onClose }: {
  species: AdminSpeciesRow
  allSpecies: AdminSpeciesRow[]
  onSaved: (updated: Partial<AdminSpeciesRow>) => void
  onClose: () => void
}) {
  const [commonName, setCommonName] = useState(initial.common_name_nl)
  const [latinName, setLatinName] = useState(initial.latin_name ?? '')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const [threshResult, setThreshResult] = useState('')
  const [threshRunning, setThreshRunning] = useState(false)
  const [propagate, setPropagate] = useState(false)

  const [factResult, setFactResult] = useState('')
  const [factRunning, setFactRunning] = useState(false)

  const [mergeTarget, setMergeTarget] = useState('')
  const [mergeConfirm, setMergeConfirm] = useState(false)
  const [mergeRunning, setMergeRunning] = useState(false)
  const [mergeMsg, setMergeMsg] = useState('')

  const otherSpecies = allSpecies.filter(s => s.id !== initial.id)
  const mergeTargetObj = otherSpecies.find(s => String(s.id) === mergeTarget)

  async function handleSave() {
    setSaving(true)
    setSaveMsg('')
    try {
      const updated = await adminPanel.patchSpecies(initial.id, {
        common_name_nl: commonName.trim(),
        latin_name: latinName.trim() || undefined,
      })
      setSaveMsg('✓ Saved')
      onSaved({ common_name_nl: updated.common_name_nl ?? undefined, latin_name: updated.latin_name ?? undefined })
    } catch (e) {
      setSaveMsg('✗ ' + (e instanceof Error ? e.message : 'Save failed'))
    } finally {
      setSaving(false)
    }
  }

  async function handleRegenThresholds() {
    setThreshRunning(true)
    setThreshResult('')
    try {
      const r = await adminPanel.regenerateSpeciesThresholds(initial.id, propagate)
      setThreshResult(`✓ Thresholds regenerated${r.propagated_to_plants ? ` · propagated to ${r.propagated_to_plants} plant${r.propagated_to_plants !== 1 ? 's' : ''}` : ''}`)
      onSaved({ has_thresholds: true })
    } catch (e) {
      setThreshResult('✗ ' + (e instanceof Error ? e.message : 'Failed'))
    } finally {
      setThreshRunning(false)
    }
  }

  async function handleRegenFact() {
    setFactRunning(true)
    setFactResult('')
    try {
      const r = await adminPanel.regenerateSpeciesFact(initial.id)
      setFactResult(`✓ NL: "${r.fact}" · EN: "${r.fact_en}"`)
    } catch (e) {
      setFactResult('✗ ' + (e instanceof Error ? e.message : 'Failed'))
    } finally {
      setFactRunning(false)
    }
  }

  async function handleMerge() {
    if (!mergeTargetObj) return
    setMergeRunning(true)
    setMergeMsg('')
    try {
      const r = await adminPanel.mergeSpecies(initial.id, mergeTargetObj.id)
      setMergeMsg(`✓ Merged — ${r.plants_moved} plant${r.plants_moved !== 1 ? 's' : ''} moved to "${r.target_name}". This species is now deleted.`)
      onClose()
    } catch (e) {
      setMergeMsg('✗ ' + (e instanceof Error ? e.message : 'Merge failed'))
      setMergeRunning(false)
      setMergeConfirm(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--color-border)',
    background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'var(--font-body)', fontSize: 13,
    boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase',
    letterSpacing: '.15em', color: 'var(--color-text-muted)', marginBottom: 5,
  }
  const runBtn = (busy: boolean, danger = false): React.CSSProperties => ({
    background: danger ? 'var(--color-overdue)' : 'var(--color-primary)', color: '#fff', border: 'none',
    borderRadius: 7, padding: '7px 14px', fontFamily: 'var(--font-mono)', fontSize: 10,
    cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? .6 : 1, whiteSpace: 'nowrap',
  })

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
      background: 'rgba(0,0,0,.35)',
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        width: 420, maxWidth: '100vw', height: '100%', overflowY: 'auto',
        background: 'var(--color-bg)', borderLeft: '1px solid var(--color-border)',
        padding: '28px 24px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 24,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.18em', color: 'var(--color-text-muted)', marginBottom: 4 }}>Edit species</div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 20, margin: 0 }}>{initial.common_name_nl}</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--color-text-muted)', lineHeight: 1, padding: 4 }}>×</button>
        </div>

        {/* Edit fields */}
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.18em', color: 'var(--color-text-soft)', marginBottom: -4 }}>Names</div>
          <div>
            <label style={labelStyle}>Common name (NL)</label>
            <input value={commonName} onChange={e => setCommonName(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Latin name</label>
            <input value={latinName} onChange={e => setLatinName(e.target.value)} placeholder="e.g. Rosa canina" style={{ ...inputStyle, fontStyle: 'italic' }} />
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={handleSave} disabled={saving} style={runBtn(saving)}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            {saveMsg && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: saveMsg.startsWith('✓') ? 'var(--color-primary)' : 'var(--color-overdue)' }}>{saveMsg}</span>}
          </div>
        </div>

        {/* Regenerate thresholds */}
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.18em', color: 'var(--color-text-soft)' }}>Thresholds</div>
          <p style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 12, color: 'var(--color-text-soft)', margin: 0, lineHeight: 1.5 }}>
            Re-run the LLM threshold generator for this species.
          </p>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={propagate} onChange={e => setPropagate(e.target.checked)} style={{ accentColor: 'var(--color-primary)' }} />
            Also propagate to linked plants ({initial.plant_count})
          </label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={handleRegenThresholds} disabled={threshRunning} style={runBtn(threshRunning)}>
              {threshRunning ? 'Generating…' : 'Regenerate thresholds'}
            </button>
            {threshResult && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: threshResult.startsWith('✓') ? 'var(--color-primary)' : 'var(--color-overdue)' }}>{threshResult}</span>}
          </div>
        </div>

        {/* Regenerate fact */}
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.18em', color: 'var(--color-text-soft)' }}>Interesting fact</div>
          <p style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 12, color: 'var(--color-text-soft)', margin: 0, lineHeight: 1.5 }}>
            Re-generate the Dutch and English interesting facts stored in phenology_json.
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={handleRegenFact} disabled={factRunning} style={runBtn(factRunning)}>
              {factRunning ? 'Generating…' : 'Regenerate fact'}
            </button>
          </div>
          {factResult && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, margin: 0, color: factResult.startsWith('✓') ? 'var(--color-primary)' : 'var(--color-overdue)', lineHeight: 1.5 }}>{factResult}</p>}
        </div>

        {/* Merge into another species */}
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.18em', color: 'var(--color-text-soft)' }}>Merge into…</div>
          <p style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 12, color: 'var(--color-text-soft)', margin: 0, lineHeight: 1.5 }}>
            Move all {initial.plant_count} plants to the target species, then delete this one. Irreversible.
          </p>
          <select
            value={mergeTarget}
            onChange={e => { setMergeTarget(e.target.value); setMergeConfirm(false); setMergeMsg('') }}
            style={{ ...inputStyle, fontFamily: 'var(--font-body)', cursor: 'pointer' }}
          >
            <option value="">— pick target species —</option>
            {otherSpecies.map(s => (
              <option key={s.id} value={String(s.id)}>
                {s.common_name_nl}{s.latin_name ? ` (${s.latin_name})` : ''}
              </option>
            ))}
          </select>
          {mergeTarget && mergeTargetObj && !mergeConfirm && (
            <button onClick={() => setMergeConfirm(true)} style={runBtn(false, true)}>
              Merge into "{mergeTargetObj.common_name_nl}" →
            </button>
          )}
          {mergeConfirm && mergeTargetObj && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-overdue)' }}>
                Move {initial.plant_count} plant{initial.plant_count !== 1 ? 's' : ''} → "{mergeTargetObj.common_name_nl}" and delete this species?
              </span>
              <button onClick={handleMerge} disabled={mergeRunning} style={runBtn(mergeRunning, true)}>
                {mergeRunning ? 'Merging…' : 'Yes, merge'}
              </button>
              <button onClick={() => setMergeConfirm(false)} style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 6, padding: '5px 10px', fontFamily: 'var(--font-mono)', fontSize: 9, cursor: 'pointer', color: 'var(--color-text-muted)' }}>
                Cancel
              </button>
            </div>
          )}
          {mergeMsg && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, margin: 0, color: mergeMsg.startsWith('✓') ? 'var(--color-primary)' : 'var(--color-overdue)' }}>{mergeMsg}</p>}
        </div>
      </div>
    </div>
  )
}

function SpeciesView() {
  const [species, setSpecies] = useState<AdminSpeciesRow[] | null>(null)
  const [total, setTotal] = useState(0)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS)
  const [sortState, setSortState] = useState<SortState>({ sort: 'common_name', dir: 'asc' })
  const [offset, setOffset] = useState(0)
  const [editingSpecies, setEditingSpecies] = useState<AdminSpeciesRow | null>(null)

  useEffect(() => {
    let cancelled = false
    const params: AdminTableParams = { limit: PAGE_SIZE, offset, q: debouncedSearch, filter, sort: sortState.sort, dir: sortState.dir }
    setLoading(true)
    setErr('')
    adminPanel.species(params)
      .then(data => {
        if (cancelled) return
        setSpecies(data.rows)
        setTotal(data.total)
      })
      .catch(e => {
        if (cancelled) return
        setErr(e.message)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [debouncedSearch, filter, offset, sortState])

  function handleSearch(value: string) {
    setSearch(value)
    setOffset(0)
  }

  function handleFilter(value: string) {
    setFilter(value)
    setOffset(0)
  }

  function handleSort(sortKey: string) {
    setSortState(current => ({
      sort: sortKey,
      dir: nextSortDir(current, sortKey),
    }))
    setOffset(0)
  }

  function handleSaved(id: number, updated: Partial<AdminSpeciesRow>) {
    setSpecies(prev => prev ? prev.map(s => s.id === id ? { ...s, ...updated } : s) : prev)
    if (editingSpecies?.id === id) setEditingSpecies(prev => prev ? { ...prev, ...updated } : prev)
  }

  const rows = species ?? []

  return (
    <div>
      <PageHeader title="Species" sub={`${species ? total : '…'} species in the catalogue`} />

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => handleSearch(e.target.value)}
          placeholder="Search by common or latin name…"
          style={{ flex: 1, minWidth: 200, maxWidth: 360, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', fontFamily: 'var(--font-body)', fontSize: 13, boxSizing: 'border-box' }}
        />
      </div>

      <FilterBar
        active={filter}
        onChange={handleFilter}
        options={[
          { id: 'all', label: 'All' },
          { id: 'no_latin', label: 'No latin name' },
          { id: 'no_thresholds', label: 'No thresholds' },
        ]}
      />

      {err && <ErrorMsg msg={err} />}
      {loading && !species && !err && <Loading />}

      {species && (
        <SectionCard title={`${total} species`}>
          <AdminTable
            heads={[
              { label: 'Common name', sortKey: 'common_name' },
              { label: 'Latin name', sortKey: 'latin_name' },
              { label: 'Plants', sortKey: 'plant_count' },
              { label: 'Thresholds', sortKey: 'thresholds' },
              '',
            ]}
            sort={sortState}
            onSort={handleSort}
            scrollable
          >
            {rows.map(s => (
              <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => setEditingSpecies(s)}>
                <Td><strong>{s.common_name_nl}</strong></Td>
                <Td>{s.latin_name ? <em>{s.latin_name}</em> : <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>—</span>}</Td>
                <Td mono>{s.plant_count}</Td>
                <Td><Pill label={s.has_thresholds ? 'yes' : 'no'} tone={s.has_thresholds ? 'green' : 'red'} /></Td>
                <Td>
                  <button
                    onClick={e => { e.stopPropagation(); setEditingSpecies(s) }}
                    style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 5, padding: '3px 8px', fontFamily: 'var(--font-mono)', fontSize: 9, cursor: 'pointer', color: 'var(--color-text-muted)' }}
                  >
                    <Glyph name="edit" size={11} className="inline-block align-[-1px] mr-1" /> Edit
                  </button>
                </Td>
              </tr>
            ))}
          </AdminTable>
          {rows.length === 0 && <div style={{ padding: '20px 18px', fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center' }}>No species found.</div>}
          <PaginationFooter total={total} limit={PAGE_SIZE} offset={offset} onOffsetChange={setOffset} loading={loading} />
        </SectionCard>
      )}

      {editingSpecies && (
        <SpeciesEditPanel
          species={editingSpecies}
          allSpecies={rows}
          onSaved={updated => handleSaved(editingSpecies.id, updated)}
          onClose={() => setEditingSpecies(null)}
        />
      )}
    </div>
  )
}

type KindJobState = {
  jobId: number | null
  status: AdminJobStatus | 'idle'
  done: number
  total: number
  result: string
  /** Epoch ms the run was observed to start — drives elapsed time and the ETA. */
  startedAt: number | null
  details: AdminSkippedDetail[]
}

const IDLE_JOB: KindJobState = {
  jobId: null, status: 'idle', done: 0, total: 0, result: '', startedAt: null, details: [],
}

function jobResultSummary(kind: string, job: AdminJob): string {
  if (job.status === 'failed') return `✗ ${job.error ?? 'Failed'}`
  // Jobs run inside the API process and the Fly machine stops when it goes
  // idle, so a long run only survives while something keeps talking to the
  // server — which, in practice, is this page polling. Everything finished
  // before the stop is already saved, and every tool works off what is still
  // missing, so re-running resumes rather than redoing.
  if (job.status === 'interrupted') {
    const done = job.progress_done ?? 0
    return `✗ Stopped early${done ? ` after ${done}` : ''} — finished items were saved, run it again to continue`
  }
  const r = job.result
  if (!r) return '✓ Done'
  if (kind === 'backfill_thresholds') return `✓ ${r.succeeded ?? 0} updated · ${r.failed ?? 0} failed out of ${r.processed ?? 0}`
  if (kind === 'backfill_care_schedules') return `✓ ${r.seeded ?? 0} schedules seeded out of ${r.checked ?? 0} checked`
  if (kind === 'backfill_facts') return `✓ ${r.updated ?? 0} bilingual facts updated · ${r.skipped ?? 0} skipped out of ${r.processed ?? 0} candidates`
  if (kind === 'backfill_names') return `✓ ${r.updated ?? 0} species named · ${r.skipped ?? 0} skipped out of ${r.processed ?? 0} candidates`
  if (kind === 'backfill_plant_types') return `✓ ${r.updated ?? 0} updated · ${r.skipped ?? 0} skipped out of ${r.found ?? 0} active candidates`
  if (kind === 'generate_icons') return iconJobSummary(r)
  return '✓ Done'
}

/**
 * The outcome of a finished job: the one-line summary plus, when something did
 * not work, what and why. The details used to appear only in the Recent jobs
 * list at the bottom of the page, so the card you had just pressed reported a
 * bare "3 skipped" and left you to go looking.
 */
function JobOutcome({ job }: { job: KindJobState }) {
  if (!job.result) return null
  const ok = job.result.startsWith('✓')
  return (
    <div style={{ marginTop: 10 }}>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, margin: 0, color: ok ? 'var(--color-primary)' : 'var(--color-overdue)' }}>
        {job.result}
      </p>
      <SkippedDetails details={job.details} />
    </div>
  )
}

/**
 * Progress for a running job: how far, how long it has been going, and — once
 * there is enough of the run to extrapolate from — how much longer.
 *
 * These jobs are one LLM call per item and routinely run for minutes, so
 * "Running…" on its own gives no way to tell work from a hang. The elapsed
 * clock is the honest part; the ETA is a straight-line estimate from the items
 * completed so far and is only shown once two items are done, because the first
 * item's timing is dominated by cold start.
 */
function JobProgressBar({ done, total, status, startedAt }: {
  done: number; total: number; status: AdminJobStatus | 'idle'; startedAt?: number | null
}) {
  const [now, setNow] = useState(() => Date.now())
  const live = status === 'pending' || status === 'running'
  useEffect(() => {
    if (!live) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [live])

  if (!live) return null
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const indeterminate = total === 0
  const elapsed = startedAt ? (now - startedAt) / 1000 : null
  const eta = elapsed != null ? etaSeconds(done, total, elapsed) : null

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--color-border)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 2, background: 'var(--color-primary)',
          width: indeterminate ? '40%' : `${pct}%`,
          transition: 'width .4s ease',
          animation: indeterminate ? 'adminJobIndeterminate 1.4s ease-in-out infinite' : 'none',
        }} />
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-muted)', marginTop: 4 }}>
        {indeterminate ? 'starting…' : `${done} / ${total}`}
        {elapsed != null && ` · ${formatDuration(elapsed)} elapsed`}
        {eta != null && ` · ~${formatDuration(eta)} left`}
      </div>
    </div>
  )
}

/**
 * Shared background-job runner: tracks one live job per kind, polls the backend
 * while any are active, and calls `onComplete(kind)` when a job finishes. Used by
 * both the Tools view and the actionable Coverage "fix from here" panel.
 */
function useKindJobs(onComplete?: (kind: string) => void) {
  const [jobs, setJobs] = useState<Record<string, KindJobState>>({})
  const onCompleteRef = useRef(onComplete)
  useEffect(() => { onCompleteRef.current = onComplete })

  const getJob = useCallback((kind: string): KindJobState => jobs[kind] ?? IDLE_JOB, [jobs])
  const setJob = useCallback((kind: string, patch: Partial<KindJobState>) =>
    setJobs(prev => ({ ...prev, [kind]: { ...(prev[kind] ?? IDLE_JOB), ...patch } })), [])

  // Adopt jobs the server is already running. Job state used to live only in
  // this hook's memory, so switching to another admin section and back lost the
  // running job entirely: the card went idle, its button re-enabled, and
  // pressing it returned 409 "a job is already running" with nothing on screen
  // to explain why. A job is server state — read it on mount.
  useEffect(() => {
    let cancelled = false
    adminPanel.listJobs(20).then(rows => {
      if (cancelled) return
      const live = new Map<string, AdminJob>()
      for (const row of rows) {
        if ((row.status === 'running' || row.status === 'pending') && !live.has(row.kind)) {
          live.set(row.kind, row)
        }
      }
      if (live.size === 0) return
      setJobs(prev => {
        const next = { ...prev }
        for (const [kind, row] of live) {
          if (next[kind]?.jobId) continue  // this session already tracks it
          next[kind] = {
            ...IDLE_JOB,
            jobId: row.id,
            status: row.status,
            done: row.progress_done,
            total: row.progress_total,
            startedAt: Date.parse(row.created_at) || Date.now(),
          }
        }
        return next
      })
    }).catch(() => { /* the views show their own load errors */ })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const activeKinds = Object.entries(jobs)
      .filter(([, j]) => j.status === 'pending' || j.status === 'running')
      .map(([kind]) => kind)
    if (activeKinds.length === 0) return

    let cancelled = false
    const interval = window.setInterval(async () => {
      if (cancelled) return
      for (const kind of activeKinds) {
        const jobId = jobs[kind]?.jobId
        if (!jobId) continue
        try {
          const j = await adminPanel.getJob(jobId)
          if (cancelled) return
          const done = j.status === 'completed' || j.status === 'failed' || j.status === 'interrupted'
          setJob(kind, {
            status: j.status,
            done: j.progress_done,
            total: j.progress_total,
            result: done ? jobResultSummary(kind, j) : '',
            details: done ? skippedDetailsFromResult(j.result) : [],
          })
          if (done) onCompleteRef.current?.(kind)
        } catch { /* network blip */ }
      }
    }, 2000)

    return () => { cancelled = true; window.clearInterval(interval) }
  }, [jobs, setJob])

  const runJob = useCallback(async (kind: string, params: Record<string, unknown> = {}) => {
    setJob(kind, {
      jobId: null, status: 'pending', done: 0, total: 0, result: '',
      startedAt: Date.now(), details: [],
    })
    try {
      const { job_id } = await adminPanel.startJob(kind, params)
      setJob(kind, { jobId: job_id, status: 'pending' })
    } catch (e) {
      // 409 means the server already has this job in flight — most likely one
      // this browser started before a reload. Say that instead of "Failed".
      const status = e instanceof Error ? (e as Error & { status?: number }).status : undefined
      setJob(kind, {
        status: 'failed',
        result: status === 409
          ? '✗ Already running — see Recent jobs below for its progress'
          : `✗ ${e instanceof Error ? e.message : 'Failed'}`,
      })
    }
  }, [setJob])

  const busy = useCallback((kind: string) => {
    const s = (jobs[kind] ?? IDLE_JOB).status
    return s === 'pending' || s === 'running'
  }, [jobs])

  const anyRunning = Object.values(jobs).some(j => j.status === 'pending' || j.status === 'running')

  // Jobs are asyncio tasks inside the API process, and the Fly machine has
  // auto_stop_machines with min_machines_running = 0. A background task makes no
  // requests of its own, so what keeps the machine awake through a long run is
  // this page's 2-second poll. Close the tab and the machine can idle out
  // mid-run, taking the job with it. Until jobs move to a worker that owns its
  // own lifetime, the least we can do is not let it happen silently.
  useEffect(() => {
    if (!anyRunning) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [anyRunning])

  return { jobs, getJob, runJob, busy, anyRunning }
}

function RecentJobsCard({ jobs, loading }: { jobs: AdminJob[] | null; loading: boolean }) {
  if (loading) return null
  if (!jobs || jobs.length === 0) return null

  const statusColor = (s: AdminJobStatus) => {
    if (s === 'completed') return 'var(--color-primary)'
    if (s === 'failed' || s === 'interrupted') return 'var(--color-overdue)'
    return 'var(--color-text-muted)'
  }

  const statusLabel: Record<AdminJobStatus, string> = {
    pending: 'pending', running: 'running…', completed: 'done',
    failed: 'failed', interrupted: 'interrupted',
  }

  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '18px 20px', marginTop: 20 }}>
      <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 15, margin: '0 0 12px' }}>Recent jobs</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {jobs.map(j => {
          const details = skippedDetailsFromResult(j.result)
          return (
            <div key={j.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--color-border)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: statusColor(j.status), flexShrink: 0, width: 70 }}>{statusLabel[j.status]}</span>
                <span style={{ flex: 1 }}>{j.kind.replace(/_/g, ' ')}</span>
                {(j.status === 'running' || j.status === 'pending') && j.progress_total > 0 && (
                  <span style={{ color: 'var(--color-text-muted)' }}>{j.progress_done}/{j.progress_total}</span>
                )}
                <span style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>
                  {new Date(j.created_at).toLocaleTimeString('nl', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              {(j.status === 'completed' || j.status === 'failed' || j.status === 'interrupted') && (
                <div style={{ marginLeft: 80, marginTop: 4, color: j.status === 'completed' ? 'var(--color-text-muted)' : 'var(--color-overdue)' }}>
                  {jobResultSummary(j.kind, j)}
                  <SkippedDetails details={details} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CoverageStat({ label, value, tone = 'muted' }: { label: string; value: number | string; tone?: 'green' | 'amber' | 'red' | 'muted' }) {
  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '16px 18px' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.16em', color: 'var(--color-text-muted)', marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontFamily: 'var(--font-heading)', fontSize: 28, lineHeight: 1 }}>{value}</span>
        <Pill label={tone === 'green' ? 'ok' : tone === 'amber' ? 'check' : tone === 'red' ? 'gap' : 'info'} tone={tone} />
      </div>
    </div>
  )
}

function GapChip({ label }: { label: string }) {
  return (
    <span style={{ display: 'inline-block', fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em', padding: '2px 6px', borderRadius: 5, background: 'var(--color-overdue-soft, rgba(200,80,60,.14))', color: 'var(--color-overdue)', marginRight: 4, marginBottom: 2 }}>{label}</span>
  )
}

function CoverageView() {
  const [coverage, setCoverage] = useState<AdminCoverage | null>(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(() => {
    return adminPanel.coverage()
      .then(setCoverage)
      .catch(e => setErr(e instanceof Error ? e.message : 'Failed to load coverage'))
  }, [])

  // Re-pull coverage counts whenever a fix job finishes so the gaps shrink live.
  const { getJob, runJob, busy } = useKindJobs(() => { refetch() })

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setErr('')
    adminPanel.coverage()
      .then(data => { if (!cancelled) setCoverage(data) })
      .catch(e => { if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed to load coverage') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const bioclipTone: 'green' | 'amber' | 'red' | 'muted' = !coverage
    ? 'muted'
    : coverage.bioclip.status === 'ok' && coverage.bioclip.db_species_missing_from_bioclip === 0
      ? 'green'
      : coverage.bioclip.status === 'ok'
        ? 'amber'
        : coverage.bioclip.status === 'unconfigured'
          ? 'muted'
          : 'red'

  const fixBtnStyle = (isBusy: boolean) => ({
    background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 8,
    padding: '8px 14px', fontFamily: 'var(--font-mono)', fontSize: 11,
    cursor: isBusy ? 'not-allowed' : 'pointer', opacity: isBusy ? .6 : 1,
  } as const)

  const FixCard = ({ kind, title, count, label, params }: {
    kind: string; title: string; count: number; label: string; params: Record<string, unknown>
  }) => {
    const j = getJob(kind)
    const isBusy = busy(kind)
    return (
      <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '12px 14px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: count ? 'var(--color-primary)' : 'var(--color-text-muted)', marginBottom: 8 }}>{label}</div>
        <button onClick={() => runJob(kind, params)} disabled={isBusy || count === 0} style={fixBtnStyle(isBusy || count === 0)}>
          {isBusy ? 'Running…' : title}
        </button>
        <JobProgressBar done={j.done} total={j.total} status={j.status} startedAt={j.startedAt} />
        <JobOutcome job={j} />
      </div>
    )
  }

  const s = coverage?.species
  const missingNames = s ? Math.max(s.missing_common_name_nl, s.missing_common_name_en) : 0
  const missingFacts = s ? Math.max(s.missing_facts_nl, s.missing_facts_en) : 0
  const gaps = coverage?.species_gaps ?? []

  return (
    <div>
      <style>{`@keyframes adminJobIndeterminate { 0%{transform:translateX(-100%)} 100%{transform:translateX(350%)} }`}</style>
      <PageHeader title="Coverage" sub="Data completeness across garden plants, species knowledge, icons and BioCLIP reference material — with one-click fills for every gap" />
      {err && <ErrorMsg msg={err} />}
      {loading && !coverage && !err && <Loading />}

      {coverage && s && (
        <>
          <div data-admin-overview-cards style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14, marginBottom: 20 }}>
            <CoverageStat label="Incomplete species" value={s.incomplete ?? gaps.length} tone={(s.incomplete ?? gaps.length) ? 'amber' : 'green'} />
            <CoverageStat label="Species missing NL/EN name" value={missingNames} tone={missingNames ? 'red' : 'green'} />
            <CoverageStat label="Species missing facts" value={missingFacts} tone={missingFacts ? 'amber' : 'green'} />
            <CoverageStat label="Active stale icons" value={coverage.icons.active_stale_icon_key} tone={coverage.icons.active_stale_icon_key ? 'red' : 'green'} />
          </div>

          <SectionCard title="Complete species data">
            <div style={{ padding: '14px 18px' }}>
              <p style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 13, color: 'var(--color-text-soft)', margin: '0 0 12px', lineHeight: 1.5 }}>
                Fill every gap below straight from here. Each fills up to 500 species per run across the whole catalog (one LLM call each); re-run until the count reaches zero.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                <FixCard kind="backfill_names" title="Fill Dutch & English names"
                  count={missingNames}
                  label={`Missing a localized name: ${missingNames} (NL ${s.missing_common_name_nl} · EN ${s.missing_common_name_en})`}
                  params={{ scope: 'all', map_only: false, limit: 500 }} />
                <FixCard kind="backfill_facts" title="Fill interesting facts"
                  count={missingFacts}
                  label={`Missing facts: ${missingFacts} (NL ${s.missing_facts_nl} · EN ${s.missing_facts_en})`}
                  params={{ scope: 'all', map_only: false, limit: 500 }} />
                <FixCard kind="backfill_thresholds" title="Fill care thresholds"
                  count={s.missing_thresholds}
                  label={`Species missing thresholds: ${s.missing_thresholds}`}
                  params={{}} />
                <FixCard kind="generate_icons" title="Generate missing icons"
                  count={coverage.icons.active_missing_icon}
                  label={`Active plants without an icon: ${coverage.icons.active_missing_icon}`}
                  params={{ scope: 'all', map_only: false, limit: 100 }} />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Species knowledge">
            <div style={{ padding: '16px 18px', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              <span>Total species: <strong>{s.total}</strong></span>
              <span>Missing Latin: <strong>{s.missing_latin_name}</strong></span>
              <span>Missing NL name: <strong>{s.missing_common_name_nl}</strong></span>
              <span>Missing EN name: <strong>{s.missing_common_name_en}</strong></span>
              <span>Missing NL facts: <strong>{s.missing_facts_nl}</strong></span>
              <span>Missing EN facts: <strong>{s.missing_facts_en}</strong></span>
              <span>Missing phenology: <strong>{s.missing_phenology}</strong></span>
              <span>Missing thresholds: <strong>{s.missing_thresholds}</strong></span>
            </div>
          </SectionCard>

          {gaps.length > 0 && (
            <SectionCard title={`Incomplete species — what's missing (${gaps.length}${(s.incomplete ?? gaps.length) > gaps.length ? ` of ${s.incomplete}` : ''})`}>
              <div style={{ padding: '10px 18px', fontFamily: 'var(--font-heading)', fontSize: 12, color: 'var(--color-text-soft)' }}>
                In-use species (linked to an active garden plant) are marked and sorted first.
              </div>
              <AdminTable heads={['Species', 'Latin name', 'In use', 'Missing']} scrollable>
                {gaps.map(g => (
                  <tr key={g.id}>
                    <Td><strong>{g.common_name_nl || g.common_name_en || `#${g.id}`}</strong></Td>
                    <Td>{g.latin_name ? <em>{g.latin_name}</em> : '—'}</Td>
                    <Td>{g.in_use ? '✓' : '—'}</Td>
                    <Td>
                      {g.missing_name_nl && <GapChip label="NL name" />}
                      {g.missing_name_en && <GapChip label="EN name" />}
                      {g.missing_latin && <GapChip label="Latin" />}
                      {g.missing_facts_nl && <GapChip label="NL facts" />}
                      {g.missing_facts_en && <GapChip label="EN facts" />}
                      {g.missing_thresholds && <GapChip label="Thresholds" />}
                      {g.missing_phenology && <GapChip label="Phenology" />}
                    </Td>
                  </tr>
                ))}
              </AdminTable>
            </SectionCard>
          )}

          <SectionCard title="BioCLIP reference material">
            <div style={{ padding: '16px 18px', fontFamily: 'var(--font-heading)', fontSize: 13, lineHeight: 1.6 }}>
              <div style={{ marginBottom: 8 }}>
                <Pill label={coverage.bioclip.status} tone={bioclipTone} />{' '}
                <span style={{ color: 'var(--color-text-soft)' }}>{coverage.bioclip.detail ?? 'No detail'}</span>
              </div>
              <p style={{ margin: '0 0 10px', color: 'var(--color-text-soft)' }}>
                {coverage.bioclip.db_species_missing_from_bioclip} database species are missing from the loaded BioCLIP embeddings; {coverage.bioclip.active_plants_missing_from_bioclip} active plants depend on those species.
              </p>
              {coverage.bioclip.missing_species_rows.length > 0 && (
                <AdminTable heads={['Species', 'Latin name']}>
                  {coverage.bioclip.missing_species_rows.map(s => (
                    <tr key={s.id}>
                      <Td>{s.common_name_nl ?? `#${s.id}`}</Td>
                      <Td>{s.latin_name ? <em>{s.latin_name}</em> : '—'}</Td>
                    </tr>
                  ))}
                </AdminTable>
              )}
            </div>
          </SectionCard>

          {coverage.plants.missing_species_link_rows.length > 0 && (
            <SectionCard title="Active garden plants missing species DB link">
              <AdminTable heads={['Plant', 'User species', 'Icon']} scrollable>
                {coverage.plants.missing_species_link_rows.map(p => (
                  <tr key={p.id}>
                    <Td><strong>{p.name}</strong></Td>
                    <Td>{p.species ?? '—'}</Td>
                    <Td mono>{p.icon_key ?? '—'}</Td>
                  </tr>
                ))}
              </AdminTable>
            </SectionCard>
          )}

          {(coverage.icons.active_stale_icon_rows.length > 0 || coverage.icons.archived_stale_icon_rows.length > 0) && (
            <SectionCard title="Icon/catalog gaps">
              <div style={{ padding: '14px 18px', fontFamily: 'var(--font-heading)', fontSize: 13, color: 'var(--color-text-soft)', lineHeight: 1.6 }}>
                Active stale icon keys: {coverage.icons.active_stale_icon_key}. Archived stale icon keys: {coverage.icons.archived_stale_icon_key}. Active plants missing type: {coverage.icons.missing_plant_type}.
              </div>
              <AdminTable heads={['Plant', 'Icon key', 'Type']} scrollable>
                {[...coverage.icons.active_stale_icon_rows, ...coverage.icons.archived_stale_icon_rows].map(p => (
                  <tr key={p.id}>
                    <Td>{p.name}</Td>
                    <Td mono>{p.icon_key ?? '—'}</Td>
                    <Td mono>{p.plant_type ?? '—'}</Td>
                  </tr>
                ))}
              </AdminTable>
            </SectionCard>
          )}

          <SectionCard title="Manual name fixes">
            <div style={{ padding: '14px 18px' }}>
              <p style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 13, color: 'var(--color-text-soft)', margin: '0 0 12px', lineHeight: 1.5 }}>
                For species where LLM name generation failed, manually enter Dutch and/or English names. Saves directly to the database.
              </p>
              <ManualNameFixesPanel />
            </div>
          </SectionCard>
        </>
      )}
    </div>
  )
}

function ManualNameFixesPanel() {
  type IncompleteSpecies = { id: number; common_name_nl: string | null; common_name_en: string | null; latin_name: string | null; missing_nl: boolean; missing_en: boolean; missing_latin: boolean; active_count?: number }
  const [incomplete, setIncomplete] = useState<IncompleteSpecies[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValues, setEditValues] = useState({ nl: '', en: '', latin: '' })

  const loadIncomplete = useCallback(() => {
    setLoading(true)
    setErr('')
    adminPanel.incompleteSpeciesNames(100)
      .then(data => setIncomplete(data.species))
      .catch(e => setErr(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadIncomplete()
  }, [loadIncomplete])

  const startEdit = (species: IncompleteSpecies) => {
    setEditingId(species.id)
    setEditValues({
      nl: species.common_name_nl || '',
      en: species.common_name_en || '',
      latin: species.latin_name || '',
    })
  }

  const saveEdit = async (speciesId: number) => {
    try {
      const updates: Record<string, string> = {}
      if (editValues.nl) updates.common_name_nl = editValues.nl
      if (editValues.en) updates.common_name_en = editValues.en
      if (editValues.latin) updates.latin_name = editValues.latin
      if (Object.keys(updates).length === 0) {
        setEditingId(null)
        return
      }
      await adminPanel.patchSpecies(speciesId, updates)
      setEditingId(null)
      loadIncomplete()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save')
    }
  }

  if (err) return <ErrorMsg msg={err} />
  if (loading) return <Loading />
  if (!incomplete) return null

  return (
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 12 }}>
        {incomplete.length} species need name fixes
      </div>
      {incomplete.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>All species have complete localized names ✓</p>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {incomplete.map(species => (
            <div
              key={species.id}
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: 6,
                padding: '10px 12px',
                fontSize: 12,
              }}
            >
              {editingId === species.id ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <input
                    type="text"
                    placeholder="Dutch name"
                    value={editValues.nl}
                    onChange={e => setEditValues({ ...editValues, nl: e.target.value })}
                    style={{ padding: 6, fontFamily: 'var(--font-mono)', fontSize: 11, border: '1px solid var(--color-border)', borderRadius: 4 }}
                  />
                  <input
                    type="text"
                    placeholder="English name"
                    value={editValues.en}
                    onChange={e => setEditValues({ ...editValues, en: e.target.value })}
                    style={{ padding: 6, fontFamily: 'var(--font-mono)', fontSize: 11, border: '1px solid var(--color-border)', borderRadius: 4 }}
                  />
                  <input
                    type="text"
                    placeholder="Latin name"
                    value={editValues.latin}
                    onChange={e => setEditValues({ ...editValues, latin: e.target.value })}
                    style={{ padding: 6, fontFamily: 'var(--font-mono)', fontSize: 11, border: '1px solid var(--color-border)', borderRadius: 4 }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => saveEdit(species.id)}
                      style={{
                        flex: 1, padding: '6px 10px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 500,
                      }}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      style={{
                        flex: 1, padding: '6px 10px', background: 'var(--color-border)', color: 'var(--color-text)', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11,
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ fontWeight: 500 }}>
                    {species.common_name_nl ? (
                      <span>🇳🇱 {species.common_name_nl}</span>
                    ) : (
                      <span style={{ color: 'var(--color-overdue)' }}>🇳🇱 <em>missing</em></span>
                    )}
                  </div>
                  <div>
                    {species.common_name_en ? (
                      <span>🇬🇧 {species.common_name_en}</span>
                    ) : (
                      <span style={{ color: 'var(--color-overdue)' }}>🇬🇧 <em>missing</em></span>
                    )}
                  </div>
                  {species.latin_name && <div style={{ color: 'var(--color-text-soft)', fontSize: 11 }}>
                    <em>{species.latin_name}</em>
                  </div>}
                  <button
                    onClick={() => startEdit(species)}
                    style={{
                      padding: '6px 10px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 500, alignSelf: 'start',
                    }}
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function skippedDetailsFromResult(result: Record<string, unknown> | null): AdminSkippedDetail[] {
  if (!result) return []
  const details = result.skipped_details
  return Array.isArray(details) ? details as AdminSkippedDetail[] : []
}

function SkippedDetails({ details }: { details: AdminSkippedDetail[] }) {
  if (details.length === 0) return null
  // One hint usually covers the whole batch (same cause), so show it once
  // rather than repeating it on every row.
  const hint = details.find(d => d.hint)?.hint
  return (
    <details style={{ marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-muted)' }}>
      <summary style={{ cursor: 'pointer' }}>
        {details.length} item{details.length !== 1 ? 's' : ''} needing attention
      </summary>
      <ul style={{ margin: '6px 0 0 16px', padding: 0, lineHeight: 1.6 }}>
        {details.slice(0, 10).map((d, i) => {
          const described = describeSkip(d)
          return (
            <li key={`${d.id ?? d.species_id ?? i}-${i}`}>
              {skipSubject(d)} — {described}
              {d.reason && d.error && (
                <div style={{ opacity: .7, marginLeft: 8 }}>{d.error}</div>
              )}
            </li>
          )
        })}
        {details.length > 10 && <li style={{ opacity: .7 }}>…and {details.length - 10} more</li>}
      </ul>
      {hint && (
        <p style={{ margin: '8px 0 0', color: 'var(--color-text-soft)' }}>→ {hint}</p>
      )}
    </details>
  )
}

function ToolsView() {
  const [mapOnly, setMapOnly] = useState(false)
  const [factsMapOnly, setFactsMapOnly] = useState(FACTS_MAP_ONLY_DEFAULT)
  const [namesMapOnly, setNamesMapOnly] = useState(false)
  const [iconLimit, setIconLimit] = useState(25)
  const [factsLimit, setFactsLimit] = useState(25)
  const [namesLimit, setNamesLimit] = useState(50)
  const [ipAll, setIpAll] = useState<number | null>(null)
  const [ipInUse, setIpInUse] = useState<number | null>(null)
  const [iconRefresh, setIconRefresh] = useState(0)
  const [factsRefresh, setFactsRefresh] = useState(0)
  const [namesRefresh, setNamesRefresh] = useState(0)
  const [tp, setTp] = useState<{ active_total: number; missing_thresholds: number } | null>(null)
  const [sp, setSp] = useState<{ total_with_thresholds: number; missing_schedules: number } | null>(null)
  const [fpAll, setFpAll] = useState<AdminBackfillFactsPreview | null>(null)
  const [fpInUse, setFpInUse] = useState<AdminBackfillFactsPreview | null>(null)
  const [npAll, setNpAll] = useState<AdminBackfillNamesPreview | null>(null)
  const [npInUse, setNpInUse] = useState<AdminBackfillNamesPreview | null>(null)
  const [pp, setPp] = useState<{ total_active_plants: number; missing_plant_type: number } | null>(null)
  const [regenPlantId, setRegenPlantId] = useState('')
  const [regenBusy, setRegenBusy] = useState(false)
  const [regenResult, setRegenResult] = useState<string | null>(null)

  const [recentJobs, setRecentJobs] = useState<AdminJob[] | null>(null)
  const [recentLoading, setRecentLoading] = useState(true)

  const { getJob, runJob, busy, anyRunning } = useKindJobs(kind => {
    if (kind === 'generate_icons') setIconRefresh(n => n + 1)
    if (kind === 'backfill_facts') setFactsRefresh(n => n + 1)
    if (kind === 'backfill_names') setNamesRefresh(n => n + 1)
    adminPanel.listJobs(20).then(setRecentJobs).catch(() => {})
  })

  useEffect(() => {
    admin.thresholdsPreview().then(setTp).catch(() => {})
    admin.schedulesPreview().then(setSp).catch(() => {})
    admin.backfillPlantTypesPreview().then(setPp).catch(() => {})
    adminPanel.listJobs(20).then(j => { setRecentJobs(j); setRecentLoading(false) }).catch(() => setRecentLoading(false))
  }, [])

  useEffect(() => {
    adminPanel.generateIconsPreview({ scope: 'all' }).then(r => setIpAll(r.count)).catch(() => {})
    adminPanel.generateIconsPreview({ scope: 'in_use', mapOnly }).then(r => setIpInUse(r.count)).catch(() => {})
  }, [mapOnly, iconRefresh])

  useEffect(() => {
    adminPanel.backfillFactsPreview({ scope: 'all' }).then(setFpAll).catch(() => {})
    adminPanel.backfillFactsPreview({ scope: 'in_use', mapOnly: factsMapOnly }).then(setFpInUse).catch(() => {})
  }, [factsMapOnly, factsRefresh])

  useEffect(() => {
    adminPanel.backfillNamesPreview({ scope: 'all' }).then(setNpAll).catch(() => {})
    adminPanel.backfillNamesPreview({ scope: 'in_use', mapOnly: namesMapOnly }).then(setNpInUse).catch(() => {})
  }, [namesMapOnly, namesRefresh])

  const btnStyle = (isBusy: boolean) => ({
    background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 8,
    padding: '8px 16px', fontFamily: 'var(--font-mono)', fontSize: 11,
    cursor: isBusy ? 'not-allowed' : 'pointer', opacity: isBusy ? .6 : 1,
  } as const)

  async function handleRegenIcon() {
    const id = parseInt(regenPlantId, 10)
    if (!id || id < 1) { setRegenResult('✗ Invalid plant ID'); return }
    setRegenBusy(true)
    setRegenResult(null)
    try {
      const r = await adminPanel.regeneratePlantIcon(id)
      setRegenResult(`✓ Icon regenerated: ${r.name} (${r.icon_id}, ${r.source})`)
      setIconRefresh(n => n + 1)
    } catch (e) {
      setRegenResult(`✗ ${e instanceof Error ? e.message : 'Failed'}`)
    } finally {
      setRegenBusy(false)
    }
  }

  const simpleTool = (kind: string, title: string, desc: string, preview: string) => {
    const j = getJob(kind)
    return (
      <div key={kind} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '18px 20px' }}>
        <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 16, margin: '0 0 6px' }}>{title}</h3>
        <p style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 13, color: 'var(--color-text-soft)', margin: '0 0 8px', lineHeight: 1.5 }}>{desc}</p>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-primary)', marginBottom: 10 }}>{preview}</div>
        <button onClick={() => runJob(kind)} disabled={busy(kind)} style={btnStyle(busy(kind))}>
          {busy(kind) ? 'Running…' : 'Run'}
        </button>
        <JobProgressBar done={j.done} total={j.total} status={j.status} startedAt={j.startedAt} />
        <JobOutcome job={j} />
      </div>
    )
  }

  const iconsJob = getJob('generate_icons')
  const iconsBusy = busy('generate_icons')

  const factsJob = getJob('backfill_facts')
  const factsBusy = busy('backfill_facts')
  const scopedFactsCount = scopedFactsMissingCount(fpInUse, factsMapOnly)
  const scopedFactsUnsupported = scopedFactsPreviewIsStaleOrUnsupported(fpInUse, factsMapOnly)

  const factsTool = (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '18px 20px', gridColumn: '1 / -1' }}>
      <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 16, margin: '0 0 6px' }}>Backfill interesting facts</h3>
      <p style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 13, color: 'var(--color-text-soft)', margin: '0 0 12px', lineHeight: 1.5 }}>
        Generate bilingual interesting facts via LLM for species missing Dutch or English facts. Each species is one LLM call, so start with your map-placed plants.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', marginBottom: 14, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={factsMapOnly} onChange={e => setFactsMapOnly(e.target.checked)} />
          Map-placed plants only
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          Batch limit
          <input type="number" min={1} max={500} value={factsLimit}
                 onChange={e => setFactsLimit(Math.max(1, Number(e.target.value) || 1))}
                 style={{ width: 64, fontFamily: 'var(--font-mono)', fontSize: 11, padding: '4px 6px', border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-bg)', color: 'var(--color-text)' }} />
        </label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-primary)', marginBottom: 8 }}>
            {scopedFactsPreviewIsStaleOrUnsupported(fpInUse, factsMapOnly)
              ? 'Scoped facts preview needs the latest backend deploy'
              : scopedFactsCountLabel(scopedFactsCount, factsMapOnly)}
          </div>
          <button onClick={() => runJob('backfill_facts', scopedFactsRunParams(factsLimit, factsMapOnly))} disabled={factsBusy || scopedFactsUnsupported} style={btnStyle(factsBusy || scopedFactsUnsupported)}>
            {factsBusy ? 'Generating…' : `Generate for my plants${scopedFactsCount != null ? ` (${Math.min(scopedFactsCount, factsLimit)})` : ''}`}
          </button>
        </div>
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 8 }}>
            Whole species catalog missing facts: {fpAll?.missing_facts ?? '…'}{fpAll?.missing_facts_en != null ? ` · EN missing: ${fpAll.missing_facts_en}` : ''}
          </div>
          <button onClick={() => runJob('backfill_facts', { scope: 'all', map_only: false, limit: factsLimit })} disabled={factsBusy} style={btnStyle(factsBusy)}>
            {factsBusy ? 'Generating…' : `Generate catalog${fpAll ? ` (${Math.min(fpAll.missing_facts, factsLimit)})` : ''}`}
          </button>
        </div>
      </div>
      <JobProgressBar done={factsJob.done} total={factsJob.total} status={factsJob.status} startedAt={factsJob.startedAt} />
      <JobOutcome job={factsJob} />
    </div>
  )

  const namesJob = getJob('backfill_names')
  const namesBusy = busy('backfill_names')
  const namesInUseCount = npInUse?.missing_names ?? null
  const namesTool = (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '18px 20px', gridColumn: '1 / -1' }}>
      <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 16, margin: '0 0 6px' }}>Backfill Dutch &amp; English names</h3>
      <p style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 13, color: 'var(--color-text-soft)', margin: '0 0 12px', lineHeight: 1.5 }}>
        Generate the missing localized common name (Dutch <em>and</em> English) via LLM for species that only have one language or just a Latin name — the reason a plant shows an English name under a Dutch UI, or the raw entered name. One LLM call per species.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', marginBottom: 14, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={namesMapOnly} onChange={e => setNamesMapOnly(e.target.checked)} />
          Map-placed plants only
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          Batch limit
          <input type="number" min={1} max={500} value={namesLimit}
                 onChange={e => setNamesLimit(Math.max(1, Number(e.target.value) || 1))}
                 style={{ width: 64, fontFamily: 'var(--font-mono)', fontSize: 11, padding: '4px 6px', border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-bg)', color: 'var(--color-text)' }} />
        </label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-primary)', marginBottom: 8 }}>
            My plants{namesMapOnly ? ' on a map' : ''} missing a name: {namesInUseCount ?? '…'}
            {npInUse ? ` · NL ${npInUse.missing_names_nl} · EN ${npInUse.missing_names_en}` : ''}
          </div>
          <button onClick={() => runJob('backfill_names', { scope: 'in_use', map_only: namesMapOnly, limit: namesLimit })} disabled={namesBusy} style={btnStyle(namesBusy)}>
            {namesBusy ? 'Generating…' : `Fix my plants${namesInUseCount != null ? ` (${Math.min(namesInUseCount, namesLimit)})` : ''}`}
          </button>
        </div>
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 8 }}>
            Whole species catalog missing a name: {npAll?.missing_names ?? '…'}
            {npAll ? ` · NL ${npAll.missing_names_nl} · EN ${npAll.missing_names_en}` : ''}
          </div>
          <button onClick={() => runJob('backfill_names', { scope: 'all', map_only: false, limit: namesLimit })} disabled={namesBusy} style={btnStyle(namesBusy)}>
            {namesBusy ? 'Generating…' : `Fix catalog${npAll ? ` (${Math.min(npAll.missing_names, namesLimit)})` : ''}`}
          </button>
        </div>
      </div>
      <JobProgressBar done={namesJob.done} total={namesJob.total} status={namesJob.status} startedAt={namesJob.startedAt} />
      <JobOutcome job={namesJob} />
    </div>
  )

  const iconTool = (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '18px 20px', gridColumn: '1 / -1' }}>
      <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 16, margin: '0 0 6px' }}>Generate icons</h3>
      <p style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 13, color: 'var(--color-text-soft)', margin: '0 0 12px', lineHeight: 1.5 }}>
        AI-generate distinctive SVGs (validated; procedural fallback) → R2 + DB, then re-match plants. Generic procedural fallbacks still count here so they can be retried for unique AI art.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', marginBottom: 14, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={mapOnly} onChange={e => setMapOnly(e.target.checked)} />
          Map-placed plants only
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          Batch limit
          <input type="number" min={1} max={500} value={iconLimit}
                 onChange={e => setIconLimit(Math.max(1, Number(e.target.value) || 1))}
                 style={{ width: 64, fontFamily: 'var(--font-mono)', fontSize: 11, padding: '4px 6px', border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-bg)', color: 'var(--color-text)' }} />
        </label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-primary)', marginBottom: 8 }}>
            My plants{mapOnly ? ' on a map' : ''} needing an icon: {ipInUse ?? '…'}
          </div>
          <button onClick={() => runJob('generate_icons', { scope: 'in_use', map_only: mapOnly, limit: iconLimit })} disabled={iconsBusy} style={btnStyle(iconsBusy)}>
            {iconsBusy ? 'Generating…' : `Generate for my plants${ipInUse != null ? ` (${Math.min(ipInUse, iconLimit)})` : ''}`}
          </button>
        </div>
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 8 }}>
            Whole species catalog uncovered: {ipAll ?? '…'}
          </div>
          <button onClick={() => runJob('generate_icons', { scope: 'all', map_only: false, limit: iconLimit })} disabled={iconsBusy} style={btnStyle(iconsBusy)}>
            {iconsBusy ? 'Generating…' : `Generate all catalog${ipAll != null ? ` (${Math.min(ipAll, iconLimit)})` : ''}`}
          </button>
        </div>
      </div>
      <JobProgressBar done={iconsJob.done} total={iconsJob.total} status={iconsJob.status} startedAt={iconsJob.startedAt} />
      <JobOutcome job={iconsJob} />
    </div>
  )

  return (
    <div>
      <style>{`@keyframes adminJobIndeterminate { 0%{transform:translateX(-100%)} 100%{transform:translateX(350%)} }`}</style>
      <PageHeader title="Tools" sub="One-off maintenance operations" />
      {anyRunning && (
        <div style={{
          background: 'var(--color-surface)', border: '1px solid var(--color-primary)',
          borderRadius: 12, padding: '12px 16px', marginBottom: 14,
          fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-soft)',
        }}>
          A job is running — keep this tab open. The server sleeps when nothing is
          talking to it, and this page's polling is what keeps it awake. Anything
          already finished is saved either way, and re-running continues where it
          stopped.
        </div>
      )}
      <div data-admin-tools-grid style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {simpleTool('backfill_thresholds', 'Backfill thresholds',
          'Generate care thresholds via DeepSeek for all plants that are missing them.',
          tp ? `${tp.missing_thresholds} of ${tp.active_total} active plants need thresholds` : 'Loading…')}
        {simpleTool('backfill_care_schedules', 'Backfill care schedules',
          'Seed water & fertilize schedules for plants that have thresholds but no active schedule.',
          sp ? `${sp.missing_schedules} of ${sp.total_with_thresholds} plants with thresholds need schedules` : 'Loading…')}
        {simpleTool('backfill_plant_types', 'Backfill plant types',
          'Set plant_type from icon manifest cat field for active plants where it is NULL. Archived plants are ignored.',
          pp ? `${pp.missing_plant_type} of ${pp.total_active_plants} active plants need a type` : 'Loading…')}
        {namesTool}
        {factsTool}
        {iconTool}
        {/* Single-plant icon regeneration */}
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '18px 20px' }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 16, margin: '0 0 6px' }}>Regenerate plant icon</h3>
          <p style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 13, color: 'var(--color-text-soft)', margin: '0 0 12px', lineHeight: 1.5 }}>
            Regenerate just one plant's icon via AI. Paste a plant ID from the Plants table.
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={regenPlantId}
              onChange={e => setRegenPlantId(e.target.value)}
              placeholder="Plant ID"
              style={{ width: 120, fontFamily: 'var(--font-mono)', fontSize: 13, padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 8, background: 'var(--color-bg)', color: 'var(--color-text)', boxSizing: 'border-box' }}
              onKeyDown={e => { if (e.key === 'Enter') handleRegenIcon() }}
            />
            <button onClick={handleRegenIcon} disabled={regenBusy} style={btnStyle(regenBusy)}>
              {regenBusy ? 'Generating…' : 'Regenerate'}
            </button>
          </div>
          {regenResult && (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, marginTop: 10, color: regenResult.startsWith('✓') ? 'var(--color-primary)' : 'var(--color-overdue)' }}>{regenResult}</p>
          )}
        </div>
      </div>
      <RecentJobsCard jobs={recentJobs} loading={recentLoading} />
    </div>
  )
}

function ActivityView() {
  const [events, setEvents] = useState<AdminActivityEvent[] | null>(null)
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    adminPanel.activity().then(setEvents).catch(e => setErr(e.message))
  }, [])

  const kindLabel: Record<string, string> = {
    account_registered: 'New account',
    plant_added:        'Plant added',
    icon_requested:     'Icon requested',
    care_log:           'Care log',
  }

  const kinds = ['all', 'account_registered', 'plant_added', 'icon_requested', 'care_log']
  const filtered = (events ?? []).filter(e => filter === 'all' || e.kind === filter)

  return (
    <div>
      <PageHeader title="Activity" sub="Recent events across all households" />

      <FilterBar
        active={filter}
        onChange={setFilter}
        options={kinds.map(k => ({ id: k, label: k === 'all' ? 'All' : kindLabel[k] ?? k }))}
      />

      {err && <ErrorMsg msg={err} />}
      {!events && !err && <Loading />}

      {events && (
        <SectionCard title={`${filtered.length} events`}>
          {filtered.map((ev, i) => <ActivityRow key={i} event={ev} />)}
          {filtered.length === 0 && <div style={{ padding: '20px 18px', fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center' }}>No events.</div>}
        </SectionCard>
      )}
    </div>
  )
}

const ACTION_LABEL: Record<string, string> = {
  delete_account:                  'Delete account',
  bulk_delete_accounts:            'Bulk delete',
  backfill_thresholds:             'Backfill thresholds',
  backfill_care_schedules:         'Backfill schedules',
  backfill_facts:                  'Backfill facts',
  generate_icons:                  'Generate icons',
  patch_species:                   'Edit species',
  regenerate_species_thresholds:   'Regen thresholds',
  regenerate_species_fact:         'Regen fact',
  merge_species:                   'Merge species',
}

function AuditView() {
  const [rows, setRows] = useState<AdminAuditRow[] | null>(null)
  const [total, setTotal] = useState(0)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setErr('')
    adminPanel.audit({ limit: PAGE_SIZE, offset })
      .then(data => {
        if (cancelled) return
        setRows(data.rows)
        setTotal(data.total)
      })
      .catch(e => {
        if (cancelled) return
        setErr(e instanceof Error ? e.message : 'Failed to load audit log')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [offset])

  const formatTs = (iso: string) =>
    new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  const formatDetail = (detail: Record<string, unknown> | null) => {
    if (!detail) return null
    return Object.entries(detail)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
      .join(' · ')
  }

  return (
    <div>
      <PageHeader title="Audit log" sub={`${rows != null ? total : '…'} admin actions recorded`} />

      {err && <ErrorMsg msg={err} />}
      {loading && !rows && !err && <Loading />}

      {rows && (
        <SectionCard title={`${total} entries`}>
          <AdminTable heads={['When', 'Admin', 'Action', 'Target', 'Detail']} scrollable>
            {rows.map(r => (
              <tr key={r.id}>
                <Td mono>{formatTs(r.created_at)}</Td>
                <Td mono>{r.admin_email ?? <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>deleted</span>}</Td>
                <Td><Pill label={ACTION_LABEL[r.action] ?? r.action} tone="muted" /></Td>
                <Td>{r.target ?? '—'}</Td>
                <Td>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-muted)' }}>
                    {formatDetail(r.detail) ?? '—'}
                  </span>
                </Td>
              </tr>
            ))}
          </AdminTable>
          {rows.length === 0 && <div style={{ padding: '20px 18px', fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center' }}>No audit entries yet.</div>}
          <PaginationFooter total={total} limit={PAGE_SIZE} offset={offset} onOffsetChange={setOffset} loading={loading} />
        </SectionCard>
      )}
    </div>
  )
}
