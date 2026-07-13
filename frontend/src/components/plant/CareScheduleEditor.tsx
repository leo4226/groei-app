import CareIcon from '../ui/CareIcon'
import type {
  CareEnvironment,
  EditableCareType,
  ScheduleEditorState,
} from '../../pages/editPlantCareSchedules'
import { editableCareTypesForEnvironment } from '../../pages/editPlantCareSchedules'

interface CareScheduleEditorProps {
  environment: CareEnvironment
  intervalLabel: string
  daysLabel: string
  labels: Record<EditableCareType, string>
  state: ScheduleEditorState
  onChange: (state: ScheduleEditorState) => void
}

export default function CareScheduleEditor({
  environment,
  intervalLabel,
  daysLabel,
  labels,
  state,
  onChange,
}: CareScheduleEditorProps) {
  const careTypes = editableCareTypesForEnvironment(environment)

  function update(type: EditableCareType, patch: Partial<ScheduleEditorState[EditableCareType]>) {
    onChange({
      ...state,
      [type]: { ...state[type], ...patch },
    })
  }

  return (
    <div className="space-y-2">
      {careTypes.map(type => {
        const schedule = state[type]
        return (
          <div
            key={type}
            className={`rounded-xl border p-3 transition-colors ${
              schedule.enabled ? 'border-primary/30 bg-primary/5' : 'border-border bg-paper'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className={schedule.enabled ? 'text-primary' : 'text-text-muted'}>
                <CareIcon type={type} size={21} />
              </span>
              <span className="flex-1 font-heading text-sm font-medium text-text">
                {labels[type]}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={schedule.enabled}
                aria-label={labels[type]}
                onClick={() => update(type, { enabled: !schedule.enabled })}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  schedule.enabled ? 'bg-primary' : 'bg-border'
                }`}
              >
                <span
                  className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                    schedule.enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {schedule.enabled && (
              <label className="mt-3 flex items-center justify-between gap-3 border-t border-border/70 pt-3">
                <span className="text-xs text-text-muted">{intervalLabel}</span>
                <span className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    inputMode="numeric"
                    value={schedule.days}
                    onChange={event => {
                      const value = Number.parseInt(event.target.value, 10)
                      update(type, { days: Number.isFinite(value) ? Math.max(1, value) : 1 })
                    }}
                    className="w-24 rounded-lg border border-border bg-paper px-3 py-1.5 text-right font-mono text-sm text-text focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                  />
                  <span className="text-xs text-text-muted">{daysLabel}</span>
                </span>
              </label>
            )}
          </div>
        )
      })}
    </div>
  )
}
