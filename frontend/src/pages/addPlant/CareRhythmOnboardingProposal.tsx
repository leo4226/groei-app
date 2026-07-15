import { useEffect, useRef, useState } from 'react'
import { careRhythm } from '../../api/client'
import type { CareRhythmOnboardingPreview } from '../../api/client'
import { useT } from '../../context/LanguageContext'
import { isoToDisplay } from '../../utils/dateFormat'

interface Props {
  mapId: number
  intervalDays: number
  onAccepted(nextDue: string | null): void
}

export default function CareRhythmOnboardingProposal({
  mapId,
  intervalDays,
  onAccepted,
}: Props) {
  const t = useT()
  const onAcceptedRef = useRef(onAccepted)
  const [proposal, setProposal] = useState<CareRhythmOnboardingPreview | null>(null)
  const [accepted, setAccepted] = useState(false)

  useEffect(() => {
    onAcceptedRef.current = onAccepted
  }, [onAccepted])

  useEffect(() => {
    let cancelled = false
    setProposal(null)
    setAccepted(false)
    onAcceptedRef.current(null)
    careRhythm.onboardingPreview(mapId, intervalDays)
      .then((result) => {
        if (!cancelled) setProposal(result)
      })
      .catch(() => {
        if (!cancelled) setProposal(null)
      })
    return () => { cancelled = true }
  }, [mapId, intervalDays])

  if (!proposal?.available || !proposal.proposed_date) return null

  function toggleAccepted() {
    if (!proposal?.proposed_date) return
    const next = !accepted
    setAccepted(next)
    onAcceptedRef.current(next ? proposal.proposed_date : null)
  }

  return (
    <div className="mt-3 rounded-2xl border border-primary/25 bg-primary/5 p-3">
      <div className="font-heading text-sm font-semibold text-text">
        {t.addPlant.careRhythmJoin}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-text-soft">
        {t.addPlant.careRhythmProposal(isoToDisplay(proposal.proposed_date))}
      </p>
      <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-paper px-3 py-2 text-sm font-semibold text-text">
        <input
          type="checkbox"
          checked={accepted}
          onChange={toggleAccepted}
          className="h-5 w-5 shrink-0 accent-primary"
        />
        <span>{t.addPlant.careRhythmAccept}</span>
      </label>
    </div>
  )
}
