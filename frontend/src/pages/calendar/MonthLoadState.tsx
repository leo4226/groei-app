import { useT } from '../../context/LanguageContext'

interface Props {
  loading: boolean
  error: string | null
  onRetry(): void
}

export default function MonthLoadState({ loading, error, onRetry }: Props) {
  const t = useT()

  if (loading) {
    return (
      <div className="month-load-state" role="status">
        {t.common.loading}
      </div>
    )
  }

  if (!error) return null

  return (
    <div className="month-load-state" role="alert">
      <p>{t.calendar.monthLoadFailed}</p>
      <button type="button" onClick={onRetry}>{t.calendar.retry}</button>
    </div>
  )
}
