import { useT } from '../../context/LanguageContext'

interface Props {
  error: string | null
  onRetry(): void
}

export default function CalendarRefreshNotice({ error, onRetry }: Props) {
  const t = useT()
  if (!error) return null

  return (
    <div className="calendar-refresh-notice" role="alert">
      <span>{t.common.error}</span>
      <button type="button" onClick={onRetry}>{t.calendar.retry}</button>
    </div>
  )
}
