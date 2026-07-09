import type { WaterStatus, TempStatus } from '../hooks/usePlantStatus'

// Placeholder SVG icons — swap out the path data for final artwork.
// Each icon is a 24×24 viewBox SVG rendered inline.

interface WaterIconProps { status: WaterStatus; size?: number; className?: string }
interface TempIconProps  { status: TempStatus;  size?: number; className?: string }

export function WaterStatusIcon({ status, size = 24, className }: WaterIconProps) {
  if (status === 'hydrated') {
    // Blooming / happy drop — solid teal drop shape
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="Goed bewaterd" className={className}>
        <path d="M12 3 C12 3 5 11 5 15.5 A7 7 0 0 0 19 15.5 C19 11 12 3 12 3Z" fill="#22c55e" />
        <path d="M9 16 Q12 19 15 16" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      </svg>
    )
  }
  if (status === 'thirsty') {
    // Drooping drop — amber, slight droop
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="Bijna dorstig" className={className}>
        <path d="M12 3 C12 3 5 11 5 15.5 A7 7 0 0 0 19 15.5 C19 11 12 3 12 3Z" fill="#f59e0b" />
        <path d="M9 17 Q12 15 15 17" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      </svg>
    )
  }
  // dry — wilted / cracked drop
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="Droog" className={className}>
      <path d="M12 3 C12 3 5 11 5 15.5 A7 7 0 0 0 19 15.5 C19 11 12 3 12 3Z" fill="#ef4444" opacity="0.85" />
      <path d="M10 13 L12 17 L14 13" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

export function TempStatusIcon({ status, size = 24 }: TempIconProps) {
  if (status === 'comfortable') return null

  if (status === 'chilling') {
    // Faint snowflake
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="Koud">
        <line x1="12" y1="3" x2="12" y2="21" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" />
        <line x1="3" y1="12" x2="21" y2="12" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" />
        <line x1="5.6" y1="5.6" x2="18.4" y2="18.4" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" />
        <line x1="18.4" y1="5.6" x2="5.6" y2="18.4" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  }
  if (status === 'freezing') {
    // Bold snowflake with dots
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="Vrieskou">
        <line x1="12" y1="2" x2="12" y2="22" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="2" y1="12" x2="22" y2="12" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="5" y1="5" x2="19" y2="19" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="19" y1="5" x2="5" y2="19" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="12" cy="5" r="1.5" fill="#3b82f6" />
        <circle cx="12" cy="19" r="1.5" fill="#3b82f6" />
        <circle cx="5" cy="12" r="1.5" fill="#3b82f6" />
        <circle cx="19" cy="12" r="1.5" fill="#3b82f6" />
      </svg>
    )
  }
  // heatstress — flame
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="Hittestress">
      <path d="M12 2 C12 2 8 7 10 10 C10 10 7 8 8 13 C8 17 10 20 12 21 C14 20 16 17 16 13 C17 8 14 10 14 10 C16 7 12 2 12 2Z" fill="#f97316" />
      <path d="M12 14 C12 14 10 16 11 18 C11.5 19.5 12 20 12 20 C12 20 13 19 13 17.5 C13 16 12 14 12 14Z" fill="#fef08a" />
    </svg>
  )
}
