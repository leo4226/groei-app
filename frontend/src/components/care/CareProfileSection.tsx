import { useState } from 'react'
import { usePlantCareProfile } from '../../hooks/usePlantCareProfile'
import { CARE_TYPE_INFO, type CareType } from '../../types'
import { useFloreren } from '../../store/useFloreren'
import { useT } from '../../context/LanguageContext'
import CareIcon, { type CareIconType } from '../ui/CareIcon'

interface Props {
  plantId: number
}

export function CareProfileSection({ plantId }: Props) {
  const t = useT()
  const isEN = t.locale?.startsWith('en') ?? false
  const { state, loading } = usePlantCareProfile(plantId)
  const { markCareDone, patchCareProfile } = useFloreren()
  const [saving, setSaving] = useState<string | null>(null)

  const STATUS_PILL: Record<string, { label: string; className: string }> = {
    overdue:   { label: isEN ? 'Overdue'  : 'Achter',     className: 'text-overdue bg-overdue/10' },
    due_today: { label: isEN ? 'Today'    : 'Vandaag',    className: 'text-amber-600 bg-amber-50' },
    good:      { label: isEN ? 'Good'     : 'Goed',       className: 'text-good bg-good/10' },
    soon:      { label: isEN ? 'Soon'     : 'Binnenkort', className: 'text-sky-600 bg-sky-50' },
    inactive:  { label: isEN ? 'Off'      : 'Uit',        className: 'text-text-muted bg-bg' },
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="skeleton h-14 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  if (!state) {
    return (
      <p className="text-sm text-text-muted">
        {isEN ? 'Could not load care profile.' : 'Kon verzorgingsprofiel niet laden.'}
      </p>
    )
  }

  const envLabel = state.environment === 'outdoor' ? t.common.garden : t.common.envIndoor

  async function handleQuickAction(careType: string) {
    await markCareDone(plantId, careType)
  }

  async function handleToggle(careType: string, currentActive: boolean) {
    setSaving(careType)
    try {
      await patchCareProfile(plantId, { [careType]: { active: !currentActive } })
    } finally {
      setSaving(null)
    }
  }

  // Combine active care_types with care_summary keys to get all known types
  const allTypes = [...new Set([...state.active_care_types, ...Object.keys(state.care_summary)])]

  // Sort: active first, by priority (water > fertilize > mist > rotate > repot_check > prune)
  const PRIORITY: Record<string, number> = { water: 0, fertilize: 1, mist: 2, rotate: 3, repot_check: 4, prune: 5, protect_cold: 6, protect_heat: 7 }
  allTypes.sort((a, b) => {
    const aActive = state.active_care_types.includes(a) ? 0 : 1
    const bActive = state.active_care_types.includes(b) ? 0 : 1
    if (aActive !== bActive) return aActive - bActive
    return (PRIORITY[a] ?? 99) - (PRIORITY[b] ?? 99)
  })

  return (
    <div>
      {/* Environment + top warning */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted bg-bg px-2 py-0.5 rounded-full">
          {envLabel}
        </span>
        {state.top_warning && (
          <span className="text-xs flex items-center gap-1" style={{ color: state.top_warning.color }}>
            <CareIcon type={state.top_warning.care_type as CareIconType} size={13} strokeWidth={2} /> {isEN ? state.top_warning.message_en : state.top_warning.message_nl}
          </span>
        )}
      </div>

      {/* Care type rows */}
      <div className="space-y-2">
        {allTypes.map(careType => {
          const info = CARE_TYPE_INFO[careType as CareType]
          const summary = state.care_summary[careType]
          const status = summary?.status ?? 'inactive'
          const pill = STATUS_PILL[status] ?? STATUS_PILL.inactive
          const isActive = state.active_care_types.includes(careType)

          return (
            <div
              key={careType}
              className={`card p-3 flex items-center gap-3 transition-opacity ${saving === careType ? 'opacity-50' : ''}`}
            >
              {/* Icon */}
              <span className="shrink-0 text-text-soft"><CareIcon type={careType as CareIconType} size={22} strokeWidth={1.8} /></span>

              {/* Label + status */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm">{info?.label ?? careType}</p>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${pill.className}`}>
                    {pill.label}
                  </span>
                </div>
                {summary?.last_done && (
                  <p className="text-xs text-text-muted">
                    {isEN ? 'Last:' : 'Laatst:'} {new Date(summary.last_done).toLocaleDateString(t.locale || 'nl-NL', { day: 'numeric', month: 'short' })}
                  </p>
                )}
              </div>

              {/* Quick action button (only when active) */}
              {isActive && (
                <button
                  onClick={() => handleQuickAction(careType)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white rounded-full text-xs font-semibold active:scale-95 transition-transform whitespace-nowrap"
                >
                  {isEN ? 'Done' : 'Doen'}
                </button>
              )}

              {/* Toggle */}
              <button
                onClick={() => handleToggle(careType, isActive)}
                className={`w-9 h-9 rounded-full flex items-center justify-center text-xs transition-colors border shrink-0 ${
                  isActive
                    ? 'bg-primary text-white border-primary'
                    : 'text-text-muted border-border hover:border-primary/50'
                }`}
                title={isActive ? (isEN ? 'Disable' : 'Uitschakelen') : (isEN ? 'Enable' : 'Inschakelen')}
              >
                {isActive ? '✓' : '+'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
