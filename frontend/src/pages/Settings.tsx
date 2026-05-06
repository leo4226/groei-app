import { useState } from 'react'
import { useGroeiStore } from '../store/useGroeiStore'
import { syncIcons } from '../api/client'
import type { IconSyncResult } from '../types'

export default function Settings() {
  const { users, locations, activeUserId, setActiveUser } = useGroeiStore()
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<IconSyncResult | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

  async function handleSyncIcons() {
    setSyncing(true)
    setSyncResult(null)
    setSyncError(null)
    try {
      const result = await syncIcons()
      setSyncResult(result)
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : 'Sync mislukt')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="px-4 pt-6">
      <h1 className="text-2xl font-extrabold mb-6">Settings</h1>

      <section className="mb-8">
        <h2 className="text-base font-bold mb-3">Who's gardening?</h2>
        <div className="grid grid-cols-2 gap-3">
          {users.map((user) => (
            <button
              key={user.id}
              onClick={() => setActiveUser(user.id)}
              className={`card p-4 flex flex-col items-center gap-2 transition-all ${
                user.id === activeUserId
                  ? 'ring-2 ring-primary border-primary/20'
                  : 'hover:border-primary/20'
              }`}
            >
              <span className="text-3xl">{user.avatar}</span>
              <span className={`font-semibold ${user.id === activeUserId ? 'text-primary' : 'text-text'}`}>
                {user.name}
              </span>
              {user.id === activeUserId && (
                <span className="text-[10px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                  Active
                </span>
              )}
            </button>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-bold mb-3">Locations</h2>
        <div className="card divide-y divide-border/50">
          {locations.map((loc) => (
            <div key={loc.id} className="flex items-center gap-3 px-4 py-3">
              <span className="text-xl">{loc.icon}</span>
              <span className="font-medium text-sm">{loc.name}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-bold mb-3">Iconen</h2>
        <div className="card p-4 space-y-3">
          <p className="text-sm text-text-muted">
            Nieuwe SVG-bestanden in de icoonmap worden opgepikt en planten zonder icoon worden automatisch gekoppeld.
          </p>
          <button
            onClick={handleSyncIcons}
            disabled={syncing}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full bg-primary text-white font-semibold text-sm active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            {syncing ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Synchroniseren…
              </>
            ) : (
              <>🔄 Iconen synchroniseren</>
            )}
          </button>

          {syncError && (
            <p className="text-sm text-fiery-red">{syncError}</p>
          )}

          {syncResult && (
            <div className="text-sm space-y-2">
              <p className="font-medium text-text">Resultaat</p>
              <p className="text-text-muted">
                📦 {syncResult.total_icons} iconen totaal
                {syncResult.new_icons > 0 && (
                  <> — <span className="text-primary font-medium">+{syncResult.new_icons} nieuw</span>{' '}
                  <span className="text-xs">({syncResult.new_icon_ids.join(', ')})</span></>
                )}
              </p>
              {syncResult.matched_plants > 0 && (
                <p className="text-text-muted">
                  ✅ Gekoppeld: {syncResult.matches.map((m) => (
                    <span key={m.plant_id} className="inline-block mr-1">
                      <span className="font-medium text-text">{m.plant_name}</span>
                      <span className="text-xs"> → {m.icon_key}</span>
                    </span>
                  ))}
                </p>
              )}
              {syncResult.unmatched_plants > 0 && (
                <p className="text-text-muted">
                  ⚠️ Geen icoon gevonden voor:{' '}
                  <span className="font-medium text-text">
                    {syncResult.unmatched.map((u) => u.plant_name).join(', ')}
                  </span>
                  <span className="block text-xs mt-0.5">Stel een icoon handmatig in via Plant bewerken.</span>
                </p>
              )}
              {syncResult.new_icons === 0 && syncResult.matched_plants === 0 && syncResult.unmatched_plants === 0 && (
                <p className="text-text-muted italic">Alles is al up-to-date ✓</p>
              )}
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-base font-bold mb-3">About</h2>
        <div className="card p-4">
          <p className="text-sm text-text-muted">
            <span className="font-bold text-primary text-base">Groei</span> v0.1
          </p>
          <p className="text-xs text-text-muted mt-1">
            Plant care for Leon & Lisbeth 🌱
          </p>
        </div>
      </section>
    </div>
  )
}
