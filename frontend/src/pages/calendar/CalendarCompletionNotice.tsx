import { Link } from 'react-router-dom'
import Glyph from '../../components/ui/Glyph'
import { useT } from '../../context/LanguageContext'
import type { CalendarCompletion } from './useCalendarActions'
import { careLogAnchor, PLANT_PASSPORT_ANCHORS } from '../../utils/plantPassportLinks'

interface Props {
  completion: CalendarCompletion | null
  mapSlugs: ReadonlyMap<number, string>
  onDismiss: () => void
}

export default function CalendarCompletionNotice({ completion, mapSlugs, onDismiss }: Props) {
  const t = useT()
  if (!completion) return null

  const isPlant = completion.kind === 'plant'
  const message = isPlant
    ? t.calendar.completionPlant(completion.plantName)
    : t.calendar.completionMap(completion.mapName)
  const mapSlug = completion.kind === 'map' ? mapSlugs.get(completion.mapId) : undefined
  const historyAnchor = completion.kind === 'plant' && completion.careLogId !== null
    ? careLogAnchor(completion.careLogId)
    : PLANT_PASSPORT_ANCHORS.careHistory

  return (
    <section className="calendar-completion" role="status" aria-live="polite">
      <div className="calendar-completion-copy">
        <p className="calendar-completion-title">{t.calendar.completionConfirmed}</p>
        <p>{message}</p>
      </div>
      <div className="calendar-completion-actions">
        {completion.kind === 'plant' && (
          <>
            <Link to={`/plants/${completion.plantId}#${historyAnchor}`}>{t.calendar.reviewHistory}</Link>
            <Link to={`/plants/${completion.plantId}#${PLANT_PASSPORT_ANCHORS.photoJournal}`}>{t.calendar.addPhoto}</Link>
          </>
        )}
        {completion.kind === 'map' && mapSlug && (
          <Link to={`/map/${mapSlug}`}>{t.calendar.viewMap}</Link>
        )}
      </div>
      <button
        type="button"
        className="calendar-completion-dismiss"
        onClick={onDismiss}
        aria-label={t.calendar.dismissCompletion}
      >
        <Glyph name="x" size={14} aria-hidden />
      </button>
    </section>
  )
}
