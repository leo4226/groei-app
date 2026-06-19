import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  adminPanel, admin,
  type AdminOverview, type AdminUserRow, type AdminPlantRow,
  type AdminSpeciesRow, type AdminActivityEvent, type AdminTableParams,
  type AdminSystemHealth, type AdminHealthStatus,
  type IconGenerateResult,
} from '../api/client'

type Section = 'overview' | 'users' | 'plants' | 'species' | 'tools' | 'activity'

const NAV: { id: Section; icon: string; label: string }[] = [
  { id: 'overview', icon: '📊', label: 'Overview' },
  { id: 'users',    icon: '👥', label: 'Users' },
  { id: 'plants',   icon: '🌿', label: 'Plants' },
  { id: 'species',  icon: '🔬', label: 'Species' },
  { id: 'tools',    icon: '🔧', label: 'Tools' },
  { id: 'activity', icon: '📋', label: 'Activity' },
]

const RESPONSIVE_STYLES = `@media (max-width: 767px) {
  [data-admin-sidebar] { position: fixed !important; top: 48px; left: 0; bottom: 0;
    z-index: 50; width: 240px !important; transform: translateX(-100%);
    transition: transform .2s ease; box-shadow: 4px 0 20px rgba(0,0,0,.15); }
  [data-admin-sidebar].open { transform: translateX(0) !important; }
  [data-admin-hamburger] { display: flex !important; }
  [data-admin-overlay] { display: block !important; }
  [data-admin-main] { padding: 16px !important; }
  [data-admin-stat-cards] { grid-template-columns: repeat(2, 1fr) !important; gap: 10px !important; }
  [data-admin-tools-grid] { grid-template-columns: 1fr !important; }
  [data-admin-overview-cards] { grid-template-columns: 1fr !important; }
  [data-admin-health-row] { grid-template-columns: 1fr !important; gap: 6px !important; }
}
@media (min-width: 768px) {
  [data-admin-hamburger] { display: none !important; }
  [data-admin-overlay] { display: none !important; }
}
@media (max-width: 480px) {
  [data-admin-stat-cards] { grid-template-columns: 1fr !important; }
  [data-admin-table-wrap] { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
}
`

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
    if (!token) { navigate('/dashboard', { replace: true }); return }
    adminPanel.me()
      .then(d => { setEmail(d.email); setChecking(false) })
      .catch(() => navigate('/dashboard', { replace: true }))
  }, [navigate])

  if (checking) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: 'var(--color-bg)', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text-muted)', letterSpacing: '.15em', textTransform: 'uppercase' }}>
      Checking access…
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: 'var(--color-bg)' }}><style>{RESPONSIVE_STYLES}</style><div data-admin-overlay onClick={closeSidebar} style={{ display: 'none', position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)', zIndex: 45 }} />
      <div style={{ background: 'var(--color-primary)', color: '#fff', height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', flexShrink: 0 }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 15, display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => navigate('/dashboard')}
            style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
            title="Back to app"
          >
            ←
          </button>
          🌿 Floreren
          <span style={{ background: 'rgba(255,255,255,.15)', borderRadius: 4, padding: '2px 8px', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase' }}>Admin</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><button data-admin-hamburger onClick={() => setSidebarOpen(prev => !prev)} style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '4px 8px', display: 'none', alignItems: 'center' }}>{sidebarOpen ? String.fromCharCode(10005) : String.fromCharCode(9776)}</button><span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, opacity: .7 }}>{email}</span></div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <aside data-admin-sidebar className={sidebarOpen ? "open" : ""} style={{ width: 200, background: 'var(--color-surface)', borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', padding: '16px 0', flexShrink: 0, overflowY: 'auto' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.2em', color: 'var(--color-text-muted)', padding: '0 16px 8px' }}>Platform</div>
          {NAV.slice(0, 4).map(item => (
            <NavItem key={item.id} item={item} active={section === item.id} onClick={() => handleNav(item.id)} />
          ))}
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.2em', color: 'var(--color-text-muted)', padding: '16px 16px 8px' }}>System</div>
          {NAV.slice(4).map(item => (
            <NavItem key={item.id} item={item} active={section === item.id} onClick={() => handleNav(item.id)} />
          ))}
        </aside>

        <main data-admin-main style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
          {section === 'overview'  && <OverviewView onNavigate={setSection} />}
          {section === 'users'     && <UsersView />}
          {section === 'plants'    && <PlantsView />}
          {section === 'species'   && <SpeciesView />}
          {section === 'tools'     && <ToolsView />}
          {section === 'activity'  && <ActivityView />}
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
      <span style={{ width: 16, textAlign: 'center' }}>{item.icon}</span>
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

function OverviewView({ onNavigate }: { onNavigate: (s: Section) => void }) {
  const [data, setData] = useState<AdminOverview | null>(null)
  const [err, setErr] = useState('')
  const [health, setHealth] = useState<AdminSystemHealth | null>(null)
  const [healthErr, setHealthErr] = useState('')
  const [healthLoading, setHealthLoading] = useState(false)

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

  if (err) return <div><PageHeader title="Overview" sub="Platform health at a glance" /><SystemHealthCard health={health} loading={healthLoading} error={healthErr} onRefresh={loadHealth} /><ErrorMsg msg={err} /></div>
  if (!data) return <div><PageHeader title="Overview" sub="Platform health at a glance" /><SystemHealthCard health={health} loading={healthLoading} error={healthErr} onRefresh={loadHealth} /><Loading /></div>

  const statCards = [
    { label: 'Accounts',      value: data.total_accounts, color: 'var(--color-primary)' },
    { label: 'Plants',        value: data.total_plants,   color: 'var(--color-text)' },
    { label: 'Maps',          value: data.total_maps,     color: 'var(--color-text)' },
    { label: 'Missing icons', value: data.missing_icons,  color: data.missing_icons > 0 ? 'var(--color-overdue)' : 'var(--color-text-muted)' },
  ]

  return (
    <div>
      <PageHeader title="Overview" sub={`Platform health at a glance — ${new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`} />

      <SystemHealthCard health={health} loading={healthLoading} error={healthErr} onRefresh={loadHealth} />

      <div data-admin-stat-cards style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        {statCards.map(c => (
          <div key={c.label} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.18em', color: 'var(--color-text-muted)', marginBottom: 8 }}>{c.label}</div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 32, fontWeight: 500, lineHeight: 1, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div data-admin-overview-cards style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 20 }}>
        <SectionCard title="Recent accounts" action={{ label: 'View all →', onClick: () => onNavigate('users') }}>
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

        <SectionCard title="Recent activity" action={{ label: 'Full log →', onClick: () => onNavigate('activity') }}>
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
                  <Td>{u.household_name}</Td>
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
            ]}
            sort={sortState}
            onSort={handleSort}
            scrollable
          >
            {rows.map(s => (
              <tr key={s.id}>
                <Td><strong>{s.common_name_nl}</strong></Td>
                <Td>{s.latin_name ? <em>{s.latin_name}</em> : <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>—</span>}</Td>
                <Td mono>{s.plant_count}</Td>
                <Td><Pill label={s.has_thresholds ? 'yes' : 'no'} tone={s.has_thresholds ? 'green' : 'red'} /></Td>
              </tr>
            ))}
          </AdminTable>
          {rows.length === 0 && <div style={{ padding: '20px 18px', fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center' }}>No species found.</div>}
          <PaginationFooter total={total} limit={PAGE_SIZE} offset={offset} onOffsetChange={setOffset} loading={loading} />
        </SectionCard>
      )}
    </div>
  )
}

function ToolsView() {
  const [thresholdsResult, setThresholdsResult] = useState('')
  const [thresholdsRunning, setThresholdsRunning] = useState(false)
  const [schedulesResult, setSchedulesResult] = useState('')
  const [schedulesRunning, setSchedulesRunning] = useState(false)
  const [iconsResult, setIconsResult] = useState<IconGenerateResult | null>(null)
  const [iconScope, setIconScope] = useState<'all' | 'in_use' | null>(null)
  const [iconsError, setIconsError] = useState('')
  const [mapOnly, setMapOnly] = useState(false)
  const [iconLimit, setIconLimit] = useState(25)
  const [ipAll, setIpAll] = useState<number | null>(null)
  const [ipInUse, setIpInUse] = useState<number | null>(null)
  const [iconRefresh, setIconRefresh] = useState(0)
  const [tp, setTp] = useState<{ active_total: number; missing_thresholds: number } | null>(null)
  const [sp, setSp] = useState<{ total_with_thresholds: number; missing_schedules: number } | null>(null)
  const [fp, setFp] = useState<{ total_species: number; missing_facts: number } | null>(null)
  const [pp, setPp] = useState<{ total_active_plants: number; missing_plant_type: number } | null>(null)
  const [factsResult, setFactsResult] = useState('')
  const [factsRunning, setFactsRunning] = useState(false)
  const [factsLimit, setFactsLimit] = useState(25)
  const [plantTypesResult, setPlantTypesResult] = useState('')
  const [plantTypesRunning, setPlantTypesRunning] = useState(false)

  useEffect(() => {
    admin.thresholdsPreview().then(setTp).catch(() => {})
    admin.schedulesPreview().then(setSp).catch(() => {})
    adminPanel.backfillFactsPreview().then(setFp).catch(() => {})
    admin.backfillPlantTypesPreview().then(setPp).catch(() => {})
  }, [])

  useEffect(() => {
    adminPanel.generateIconsPreview({ scope: 'all' }).then(r => setIpAll(r.count)).catch(() => {})
    adminPanel.generateIconsPreview({ scope: 'in_use', mapOnly }).then(r => setIpInUse(r.count)).catch(() => {})
  }, [mapOnly, iconRefresh])

  async function handleBackfillThresholds() {
    setThresholdsRunning(true)
    setThresholdsResult('')
    try {
      const r = await admin.backfillThresholds()
      setThresholdsResult(`✓ ${r.succeeded} updated · ${r.failed} failed out of ${r.processed}`)
      admin.thresholdsPreview().then(setTp).catch(() => {})
    } catch (e) {
      setThresholdsResult(`✗ ${e instanceof Error ? e.message : 'Failed'}`)
    } finally {
      setThresholdsRunning(false)
    }
  }

  async function handleBackfillSchedules() {
    setSchedulesRunning(true)
    setSchedulesResult('')
    try {
      const r = await admin.backfillCareSchedules()
      setSchedulesResult(`✓ ${r.seeded} schedules seeded out of ${r.checked} checked`)
      admin.schedulesPreview().then(setSp).catch(() => {})
    } catch (e) {
      setSchedulesResult(`✗ ${e instanceof Error ? e.message : 'Failed'}`)
    } finally {
      setSchedulesRunning(false)
    }
  }

  async function handleGenerateIcons(scope: 'all' | 'in_use') {
    setIconScope(scope)
    setIconsResult(null)
    setIconsError('')
    try {
      const r = await adminPanel.generateIcons({ scope, mapOnly: scope === 'in_use' ? mapOnly : false, limit: iconLimit })
      setIconsResult(r)
      setIconRefresh(n => n + 1)
    } catch (e) {
      setIconsError(e instanceof Error ? e.message : 'Failed to generate icons')
    } finally {
      setIconScope(null)
    }
  }

  async function handleBackfillFacts() {
    setFactsRunning(true)
    setFactsResult('')
    try {
      const r = await adminPanel.backfillFacts(factsLimit)
      setFactsResult('✓ ' + r.updated + ' updated · ' + r.skipped + ' skipped out of ' + r.processed)
      adminPanel.backfillFactsPreview().then(setFp).catch(() => {})
    } catch (e) {
      setFactsResult('✗ ' + (e instanceof Error ? e.message : 'Failed'))
    } finally {
      setFactsRunning(false)
    }
  }

  async function handleBackfillPlantTypes() {
    setPlantTypesRunning(true)
    setPlantTypesResult('')
    try {
      const r = await admin.backfillPlantTypes()
      setPlantTypesResult('✓ ' + r.updated + ' updated · ' + r.skipped + ' skipped out of ' + r.found)
      admin.backfillPlantTypesPreview().then(setPp).catch(() => {})
    } catch (e) {
      setPlantTypesResult('✗ ' + (e instanceof Error ? e.message : 'Failed'))
    } finally {
      setPlantTypesRunning(false)
    }
  }

  const tools = [
    {
      title: 'Backfill thresholds',
      desc: 'Generate care thresholds via DeepSeek for all plants that are missing them.',
      preview: tp ? `${tp.missing_thresholds} of ${tp.active_total} active plants need thresholds` : 'Loading…',
      running: thresholdsRunning, result: thresholdsResult, onRun: handleBackfillThresholds,
    },
    {
      title: 'Backfill care schedules',
      desc: 'Seed water & fertilize schedules for plants that have thresholds but no active schedule.',
      preview: sp ? `${sp.missing_schedules} of ${sp.total_with_thresholds} plants with thresholds need schedules` : 'Loading…',
      running: schedulesRunning, result: schedulesResult, onRun: handleBackfillSchedules,
    },
    {
      title: 'Backfill plant types',
      desc: 'Set plant_type from icon manifest cat field for plants where it is NULL.',
      preview: pp ? pp.missing_plant_type + ' of ' + pp.total_active_plants + ' active plants need a type' : 'Loading...',
      running: plantTypesRunning, result: plantTypesResult, onRun: handleBackfillPlantTypes,
    },
  ]

  const iconCard = iconsResult && (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '18px 20px', gridColumn: '1 / -1' }}>
      <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 16, margin: '0 0 8px' }}>Result</h3>
      {iconsResult.count > 0 ? (
        <>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-primary)', marginBottom: 10 }}>
            ✓ {iconsResult.count} icons generated · {iconsResult.skipped_count} skipped · {iconsResult.sync_result.matched} plants matched · {iconsResult.remaining ?? 0} still to do
          </p>
          <div style={{ maxHeight: 300, overflowY: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, lineHeight: 1.6 }}>
            {iconsResult.generated.map(g => (
              <div key={g.icon_id} style={{ display: 'flex', gap: 8, padding: '2px 0' }}>
                <span style={{ color: 'var(--color-primary)', flexShrink: 0 }}>+</span>
                <span>{g.name}</span>
                <span style={{ color: 'var(--color-text-muted)' }}>({g.latin})</span>
                <span style={{ color: 'var(--color-text-muted)' }}>→ {g.icon_id}.svg</span>
                <span style={{ color: '#aaa', fontStyle: 'italic' }}>{g.cat}</span>
              </div>
            ))}
            {iconsResult.skipped.map(s => (
              <div key={s.id} style={{ display: 'flex', gap: 8, padding: '2px 0', color: 'var(--color-overdue)' }}>
                <span>✗</span>
                <span>{s.name}</span>
                <span style={{ color: 'var(--color-text-muted)' }}>({s.latin})</span>
                <span>{s.error}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-border)', paddingTop: 8 }}>
            Synced: {iconsResult.sync_result.matched} plant{iconsResult.sync_result.matched !== 1 ? 's' : ''} got a new icon_key
          </div>
        </>
      ) : (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-muted)' }}>
          {iconsResult.skipped_count > 0
            ? `All species with latin names already have icons in the manifest. ${iconsResult.skipped_count} species were skipped.`
            : 'All species with latin names already have icons in the manifest.'}
        </p>
      )}
    </div>
  )

  const iconBtn = (busy: boolean) => ({
    background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 8,
    padding: '8px 16px', fontFamily: 'var(--font-mono)', fontSize: 11,
    cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? .6 : 1,
  } as const)

  const factsTool = (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '18px 20px', gridColumn: '1 / -1' }}>
      <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 16, margin: '0 0 6px' }}>Backfill interesting facts</h3>
      <p style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 13, color: 'var(--color-text-soft)', margin: '0 0 12px', lineHeight: 1.5 }}>
        Generate interesting_facts_nl via LLM for species that lack one. Each fact is one LLM call, so limit accordingly.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', marginBottom: 14, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          Batch limit
          <input type="number" min={1} max={500} value={factsLimit}
                 onChange={e => setFactsLimit(Math.max(1, Number(e.target.value) || 1))}
                 style={{ width: 64, fontFamily: 'var(--font-mono)', fontSize: 11, padding: '4px 6px', border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-bg)', color: 'var(--color-text)' }} />
        </label>
        <span style={{ color: 'var(--color-primary)' }}>
          {fp ? fp.missing_facts + ' of ' + fp.total_species + ' species need facts' : 'Loading preview...'}
        </span>
      </div>
      <button
        onClick={handleBackfillFacts}
        disabled={factsRunning}
        style={{ background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontFamily: 'var(--font-mono)', fontSize: 11, cursor: factsRunning ? 'not-allowed' : 'pointer', opacity: factsRunning ? .6 : 1 }}
      >
        {factsRunning ? 'Generating...' : 'Run for up to ' + factsLimit + ' species'}
      </button>
      {factsResult && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, marginTop: 10, color: factsResult.startsWith('✓') ? 'var(--color-primary)' : 'var(--color-overdue)' }}>
          {factsResult}
        </p>
      )}
    </div>
  )

  const iconTool = (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '18px 20px', gridColumn: '1 / -1' }}>
      <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 16, margin: '0 0 6px' }}>Generate icons</h3>
      <p style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 13, color: 'var(--color-text-soft)', margin: '0 0 12px', lineHeight: 1.5 }}>
        AI-generate distinctive SVGs (validated; procedural fallback) → R2 + DB, then re-match plants. Each icon is one LLM call, so start with your real plants.
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
          <button onClick={() => handleGenerateIcons('in_use')} disabled={iconScope !== null} style={iconBtn(iconScope !== null)}>
            {iconScope === 'in_use' ? 'Generating…' : `Generate for my plants${ipInUse != null ? ` (${Math.min(ipInUse, iconLimit)})` : ''}`}
          </button>
        </div>
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 8 }}>
            Whole species catalog uncovered: {ipAll ?? '…'}
          </div>
          <button onClick={() => handleGenerateIcons('all')} disabled={iconScope !== null} style={iconBtn(iconScope !== null)}>
            {iconScope === 'all' ? 'Generating…' : `Generate all catalog${ipAll != null ? ` (${Math.min(ipAll, iconLimit)})` : ''}`}
          </button>
        </div>
      </div>
      {iconsError && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, marginTop: 12, color: 'var(--color-overdue)' }}>{iconsError}</p>
      )}
    </div>
  )

  return (
    <div>
      <PageHeader title="Tools" sub="One-off maintenance operations" />
      <div data-admin-tools-grid style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {tools.map(tool => (
          <div key={tool.title} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '18px 20px' }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 16, margin: '0 0 6px' }}>{tool.title}</h3>
            <p style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 13, color: 'var(--color-text-soft)', margin: '0 0 8px', lineHeight: 1.5 }}>{tool.desc}</p>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-primary)', marginBottom: 10 }}>
              {tool.preview}
            </div>
            <button
              onClick={tool.onRun}
              disabled={tool.running}
              style={{ background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontFamily: 'var(--font-mono)', fontSize: 11, cursor: tool.running ? 'not-allowed' : 'pointer', opacity: tool.running ? .6 : 1 }}
            >
              {tool.running ? 'Running…' : 'Run'}
            </button>
            {tool.result && (
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, marginTop: 10, color: tool.result.startsWith('\u2713') ? 'var(--color-primary)' : 'var(--color-overdue)' }}>
                {tool.result}
              </p>
            )}
          </div>
        ))}
        {factsTool}
        {iconTool}
      </div>
      {iconCard}
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
