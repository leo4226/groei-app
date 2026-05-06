import type { WaterStatus, TempStatus } from '../hooks/usePlantStatus'

interface WaterIconProps { status: WaterStatus; size?: number }
interface TempIconProps  { status: TempStatus;  size?: number }

export function WaterStatusIcon({ status, size = 24 }: WaterIconProps) {
  if (status === 'hydrated') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="Goed bewaterd">
        <path d="M12 3 C12 3 5 11 5 15.5 A7 7 0 0 0 19 15.5 C19 11 12 3 12 3Z" fill="#24e34c" />
        <path d="M9 16 Q12 19 15 16" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      </svg>
    )
  }
  if (status === 'thirsty') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="Bijna dorstig">
        <path d="M12 3 C12 3 5 11 5 15.5 A7 7 0 0 0 19 15.5 C19 11 12 3 12 3Z" fill="#ff7701" />
        <path d="M9 17 Q12 15 15 17" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="Droog">
      <path d="M12 3 C12 3 5 11 5 15.5 A7 7 0 0 0 19 15.5 C19 11 12 3 12 3Z" fill="#ea0706" opacity="0.85" />
      <path d="M10 13 L12 17 L14 13" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

export function TempStatusIcon({ status, size = 24 }: TempIconProps) {
  if (status === 'comfortable') return null

  if (status === 'chilling') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="Koud">
        <line x1="12" y1="3" x2="12" y2="21" stroke="#24e3dc" strokeWidth="2" strokeLinecap="round" />
        <line x1="3" y1="12" x2="21" y2="12" stroke="#24e3dc" strokeWidth="2" strokeLinecap="round" />
        <line x1="5.6" y1="5.6" x2="18.4" y2="18.4" stroke="#24e3dc" strokeWidth="2" strokeLinecap="round" />
        <line x1="18.4" y1="5.6" x2="5.6" y2="18.4" stroke="#24e3dc" strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  }
  if (status === 'freezing') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="Vrieskou">
        <line x1="12" y1="2" x2="12" y2="22" stroke="#2544a0" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="2" y1="12" x2="22" y2="12" stroke="#2544a0" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="5" y1="5" x2="19" y2="19" stroke="#2544a0" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="19" y1="5" x2="5" y2="19" stroke="#2544a0" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="12" cy="5" r="1.5" fill="#2544a0" />
        <circle cx="12" cy="19" r="1.5" fill="#2544a0" />
        <circle cx="5" cy="12" r="1.5" fill="#2544a0" />
        <circle cx="19" cy="12" r="1.5" fill="#2544a0" />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="Hittestress">
      <path d="M12 2 C12 2 8 7 10 10 C10 10 7 8 8 13 C8 17 10 20 12 21 C14 20 16 17 16 13 C17 8 14 10 14 10 C16 7 12 2 12 2Z" fill="#d64e2e" />
      <path d="M12 14 C12 14 10 16 11 18 C11.5 19.5 12 20 12 20 C12 20 13 19 13 17.5 C13 16 12 14 12 14Z" fill="#f9e44d" />
    </svg>
  )
}
