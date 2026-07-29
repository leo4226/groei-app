import { useT } from '../../context/LanguageContext'
import { isoToDisplay } from '../../utils/dateFormat'

export interface WateringRoundSelectableMember {
  schedule_id: number
  plant_name: string
  canonical_date?: string | null
}

interface Props {
  members: WateringRoundSelectableMember[]
  selected: Set<number>
  disabled: boolean
  onSelectedChange(selected: Set<number>): void
}

export default function WateringRoundMemberList({
  members,
  selected,
  disabled,
  onSelectedChange,
}: Props) {
  const t = useT()

  function toggle(scheduleId: number) {
    const next = new Set(selected)
    if (next.has(scheduleId)) next.delete(scheduleId)
    else next.add(scheduleId)
    onSelectedChange(next)
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSelectedChange(new Set(
            members.map((member) => member.schedule_id),
          ))}
          className="min-h-11 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-primary disabled:opacity-50"
        >
          {t.calendar.wateringRoundSelectAll}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSelectedChange(new Set())}
          className="min-h-11 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-text-soft disabled:opacity-50"
        >
          {t.calendar.wateringRoundSelectNone}
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {members.map((member) => (
          <label
            key={member.schedule_id}
            className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2.5 transition-colors ${selected.has(member.schedule_id)
              ? 'border-primary bg-primary/5'
              : 'border-border bg-surface'}`}
          >
            <input
              type="checkbox"
              value={member.schedule_id}
              checked={selected.has(member.schedule_id)}
              disabled={disabled}
              onChange={() => toggle(member.schedule_id)}
              className="h-5 w-5 shrink-0 accent-primary"
            />
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-heading text-sm font-bold text-primary">
              {member.plant_name.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 break-words">
              <span className="block font-heading text-sm font-semibold text-text">
                {member.plant_name}
              </span>
              {member.canonical_date && (
                <span
                  data-canonical-due={member.schedule_id}
                  className="mt-0.5 block text-xs font-normal text-text-muted"
                >
                  {t.calendar.wateringRoundDueDate(
                    isoToDisplay(member.canonical_date),
                  )}
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
    </>
  )
}
