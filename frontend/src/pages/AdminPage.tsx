import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  adminPanel, admin,
  type AdminOverview, type AdminUserRow, type AdminPlantRow,
  type AdminSpeciesRow, type AdminActivityEvent,
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

function AdminTable({ heads, children, scrollable }: { heads: string[]; children: React.ReactNode; scrollable?: boolean }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {heads.map(h => (
            <th key={h} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.15em', color: 'var(--color-text-muted)', padding: '10px 18px', textAlign: 'left', borderBottom: '1px solid var(--color-border-soft)' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  )
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

// ── Section views ─────────────────────────────────────────────────────────────

function OverviewView({ onNavigate }: { onNavigate: (s: Section) => void }) {
  const [data, setData] = useState<AdminOverview | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    adminPanel.overview().then(setData).catch(e => setErr(e.message))
  }, [])

  if (err) return <div><PageHeader title="Overview" sub="Platform health at a glance" /><ErrorMsg msg={err} /></div>
  if (!data) return <div><PageHeader title="Overview" sub="Platform health at a glance" /><Loading /></div>

  const statCards = [
    { label: 'Accounts',      value: data.total_accounts, color: 'var(--color-primary)' },
    { label: 'Plants',        value: data.total_plants,   color: 'var(--color-text)' },
    { label: 'Maps',          value: data.total_maps,     color: 'var(--color-text)' },
    { label: 'Missing icons', value: data.missing_icons,  color: data.missing_icons > 0 ? 'var(--color-overdue)' : 'var(--color-text-muted)' },
  ]

  return (
    <div>
      <PageHeader title="Overview" sub={`Platform health at a glance — ${new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        {statCards.map(c => (
          <div key={c.label} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.18em', color: 'var(--color-text-muted)', marginBottom: 8 }}>{c.label}</div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 32, fontWeight: 500, lineHeight: 1, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 20 }}>
        <SectionCard title="Recent accounts" action={{ label: 'View all →', onClick: () => onNavigate('users') }}>
          <AdminTable heads={['Name', 'Household', 'Plants', 'Status']}>
            {data.recent_accounts.map(a => (
              <tr key={a.id}>
                <Td><strong>{a.name}</strong></Td>
                <Td>{a.household_name}</Td>
                <Td mono>{a.plant_count}</Td>
                <Td><Pill label={a.email === 'leon_korbee@hotmail.com' ? 'Admin' : a.plant_count === 0 ? 'No plants' : 'Active'} tone={a.email === 'leon_korbee@hotmail.com' ? 'green' : a.plant_count === 0 ? 'amber' : 'green'} /></Td>
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
  const [err, setErr] = useState('')
  const [search, setSearch] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkConfirm, setBulkConfirm] = useState(false)

  useEffect(() => {
    adminPanel.users().then(setUsers).catch(e => setErr(e.message))
  }, [])

  async function handleDelete(id: number) {
    setDeletingId(id)
    try {
      await admin.deleteAccount(id)
      setUsers(u => u ? u.filter(x => x.id !== id) : u)
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

  function toggleAll() {
    if (!users) return
    const deletable = users.filter(u => u.email !== 'leon_korbee@hotmail.com')
    if (selectedIds.size === deletable.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(deletable.map(u => u.id)))
    }
  }

  const filtered = (users ?? []).filter(u =>
    !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
  )

  const deletableCount = filtered.filter(u => u.email !== 'leon_korbee@hotmail.com').length
  const allSelected = deletableCount > 0 && selectedIds.size === deletableCount

  return (
    <div>
      <PageHeader title="Users" sub={`${users?.length ?? '…'} accounts across all households`} />

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or email…"
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
      {!users && !err && <Loading />}

      {users && (
        <SectionCard title={`${filtered.length} accounts`}>
          <AdminTable heads={['', 'Name', 'Email', 'Household', 'Plants', 'Maps', 'Joined', 'Actions']} scrollable>
            <tr style={{ background: 'var(--color-bg-warm)' }}>
              <th style={{ padding: '8px 18px', textAlign: 'left', borderBottom: '1px solid var(--color-border-soft)' }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll}
                  style={{ accentColor: 'var(--color-primary)', cursor: 'pointer' }} />
              </th>
              <th colSpan={7} style={{ padding: '8px 0', textAlign: 'left', borderBottom: '1px solid var(--color-border-soft)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-muted)', letterSpacing: '.1em' }}>
                  {allSelected ? 'All selected' : selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
                </span>
              </th>
            </tr>
            {filtered.map(u => {
              const joined = new Date(u.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
              const isAdmin = u.email === 'leon_korbee@hotmail.com'
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
        </SectionCard>
      )}
    </div>
  )
}

function PlantsView() {
  const [plants, setPlants] = useState<AdminPlantRow[] | null>(null)
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    adminPanel.plants().then(setPlants).catch(e => setErr(e.message))
  }, [])

  const filtered = (plants ?? []).filter(p => {
    if (filter === 'no_icon') return !p.icon_key
    if (filter === 'no_thresholds') return !p.has_thresholds
    return true
  })

  return (
    <div>
      <PageHeader title="Plants" sub={`${plants?.length ?? '…'} active plants across all households`} />

      <FilterBar
        active={filter}
        onChange={setFilter}
        options={[
          { id: 'all', label: 'All' },
          { id: 'no_icon', label: 'No icon' },
          { id: 'no_thresholds', label: 'No thresholds' },
        ]}
      />

      {err && <ErrorMsg msg={err} />}
      {!plants && !err && <Loading />}

      {plants && (
        <SectionCard title={`${filtered.length} plants`}>
          <AdminTable heads={['Name', 'Species', 'Household', 'Phase', 'Icon', 'Thresholds']} scrollable>
            {filtered.map(p => (
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
        </SectionCard>
      )}
    </div>
  )
}

function SpeciesView() {
  const [species, setSpecies] = useState<AdminSpeciesRow[] | null>(null)
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    adminPanel.species().then(setSpecies).catch(e => setErr(e.message))
  }, [])

  const filtered = (species ?? []).filter(s => {
    if (filter === 'no_latin') return !s.has_latin_name
    if (filter === 'no_thresholds') return !s.has_thresholds
    return true
  })

  return (
    <div>
      <PageHeader title="Species" sub={`${species?.length ?? '…'} species in the catalogue`} />

      <FilterBar
        active={filter}
        onChange={setFilter}
        options={[
          { id: 'all', label: 'All' },
          { id: 'no_latin', label: 'No latin name' },
          { id: 'no_thresholds', label: 'No thresholds' },
        ]}
      />

      {err && <ErrorMsg msg={err} />}
      {!species && !err && <Loading />}

      {species && (
        <SectionCard title={`${filtered.length} species`}>
          <AdminTable heads={['Common name', 'Latin name', 'Plants', 'Thresholds']} scrollable>
            {filtered.map(s => (
              <tr key={s.id}>
                <Td><strong>{s.common_name_nl}</strong></Td>
                <Td>{s.latin_name ? <em>{s.latin_name}</em> : <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>—</span>}</Td>
                <Td mono>{s.plant_count}</Td>
                <Td><Pill label={s.has_thresholds ? 'yes' : 'no'} tone={s.has_thresholds ? 'green' : 'red'} /></Td>
              </tr>
            ))}
          </AdminTable>
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
  const [iconsRunning, setIconsRunning] = useState(false)
  const [iconsError, setIconsError] = useState('')
  const [tp, setTp] = useState<{ active_total: number; missing_thresholds: number } | null>(null)
  const [sp, setSp] = useState<{ total_with_thresholds: number; missing_schedules: number } | null>(null)

  useEffect(() => {
    admin.thresholdsPreview().then(setTp).catch(() => {})
    admin.schedulesPreview().then(setSp).catch(() => {})
  }, [])

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

  async function handleGenerateIcons() {
    setIconsRunning(true)
    setIconsResult(null)
    setIconsError('')
    try {
      const r = await adminPanel.generateIcons()
      setIconsResult(r)
    } catch (e) {
      setIconsError(e instanceof Error ? e.message : 'Failed to generate icons')
    } finally {
      setIconsRunning(false)
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
      title: 'Generate missing icons',
      desc: 'Auto-generate SVGs for all plant_species with a latin name that lack a manifest icon. Updates manifest + syncs plant icon_keys.',
      preview: '',
      running: iconsRunning, result: iconsRunning ? 'Generating…' : (iconsError || ''), onRun: handleGenerateIcons,
    },
  ]

  const iconCard = iconsResult && (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '18px 20px', gridColumn: '1 / -1' }}>
      <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 16, margin: '0 0 8px' }}>Result</h3>
      {iconsResult.count > 0 ? (
        <>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-primary)', marginBottom: 10 }}>
            ✓ {iconsResult.count} icons generated · {iconsResult.skipped_count} skipped · {iconsResult.sync_result.matched} plants matched
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
