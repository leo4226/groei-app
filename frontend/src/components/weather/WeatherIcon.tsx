import type { WeatherIcon as WeatherIconType } from '../../hooks/useWeather'

/** Small SVG weather glyph shared by the dashboard WeatherCard and the map WeatherPill. */
export default function WeatherIcon({ icon, size = 22 }: { icon: WeatherIconType; size?: number }) {
  if (icon === 'sun') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#D9A418" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" fill="#F4C542" stroke="none"/>
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>
    </svg>
  )
  if (icon === 'snow') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#6B8FCA" strokeWidth="1.6" strokeLinecap="round">
      <path d="M12 2v20M2 12h20M5 5l14 14M19 5 5 19" opacity=".5"/>
      <circle cx="12" cy="12" r="2" fill="#6B8FCA" stroke="none"/>
    </svg>
  )
  if (icon === 'thunder') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#6B8FCA" strokeWidth="1.6" strokeLinecap="round">
      <path d="M6 14a4 4 0 1 1 1-7.9A5 5 0 0 1 17 7a4 4 0 0 1 0 8H6z" fill="#6B6F9E" stroke="#4A4F7A"/>
      <path d="M12 14l-2 5h3l-1.5 5 3.5-6h-2.5l2-4z" stroke="#F4C542" fill="#F4C542"/>
    </svg>
  )
  if (icon === 'rain') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#6B8FCA" strokeWidth="1.6" strokeLinecap="round">
      <path d="M6 14a4 4 0 1 1 1-7.9A5 5 0 0 1 17 7a4 4 0 0 1 0 8H6z" fill="#C5D4ED" stroke="#6B8FCA"/>
      <path d="M9 18l-1 3M13 18l-1 3M17 18l-1 3"/>
    </svg>
  )
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#8A9482" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="9" cy="10" r="3" fill="#F4C542" stroke="#D9A418"/>
      <path d="M8 16a4 4 0 1 1 1-7.9A5 5 0 0 1 19 9a4 4 0 0 1 0 8H8z" fill="#E8E0CC" stroke="#8A9482"/>
    </svg>
  )
}
