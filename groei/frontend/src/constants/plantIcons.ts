export const PLANT_ICONS: Record<string, string> = {
  tree: `<circle cx="50" cy="35" r="22" fill="white" opacity="0.9"/>
         <rect x="46" y="55" width="8" height="18" rx="2" fill="white" opacity="0.9"/>`,

  shrub: `<ellipse cx="50" cy="48" rx="28" ry="22" fill="white" opacity="0.9"/>
          <rect x="44" y="65" width="12" height="8" rx="2" fill="white" opacity="0.7"/>`,

  grass: `<path d="M50 70 Q38 45 30 20" stroke="white" stroke-width="3.5" fill="none" stroke-linecap="round"/>
          <path d="M50 70 Q50 40 50 18" stroke="white" stroke-width="3.5" fill="none" stroke-linecap="round"/>
          <path d="M50 70 Q62 45 70 20" stroke="white" stroke-width="3.5" fill="none" stroke-linecap="round"/>`,

  herb: `<ellipse cx="50" cy="52" rx="20" ry="16" fill="white" opacity="0.9"/>
         <ellipse cx="36" cy="48" rx="12" ry="10" fill="white" opacity="0.85"/>
         <ellipse cx="64" cy="48" rx="12" ry="10" fill="white" opacity="0.85"/>`,

  flower: `<circle cx="50" cy="50" r="9" fill="white"/>
           <ellipse cx="50" cy="32" rx="7" ry="11" fill="white" opacity="0.85"/>
           <ellipse cx="50" cy="68" rx="7" ry="11" fill="white" opacity="0.85"/>
           <ellipse cx="32" cy="50" rx="11" ry="7" fill="white" opacity="0.85"/>
           <ellipse cx="68" cy="50" rx="11" ry="7" fill="white" opacity="0.85"/>`,

  climber: `<path d="M30 75 Q40 55 35 35" stroke="white" stroke-width="2.5" fill="none"/>
            <ellipse cx="35" cy="35" rx="10" ry="7" fill="white" opacity="0.9" transform="rotate(-30 35 35)"/>
            <ellipse cx="38" cy="55" rx="9" ry="6" fill="white" opacity="0.85" transform="rotate(20 38 55)"/>
            <ellipse cx="55" cy="45" rx="9" ry="6" fill="white" opacity="0.85" transform="rotate(-15 55 45)"/>`,

  bulb: `<ellipse cx="50" cy="58" rx="16" ry="12" fill="white" opacity="0.9"/>
         <path d="M50 47 Q44 35 44 25 Q50 20 56 25 Q56 35 50 47Z" fill="white" opacity="0.9"/>`,

  tomato: `<circle cx="50" cy="54" r="20" fill="white" opacity="0.9"/>
           <path d="M44 36 Q50 28 56 36" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round"/>
           <line x1="50" y1="28" x2="50" y2="36" stroke="white" stroke-width="2.5" stroke-linecap="round"/>`,

  pepper: `<ellipse cx="50" cy="56" rx="13" ry="20" fill="white" opacity="0.9"/>
           <path d="M50 37 Q56 30 54 24" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,

  pot_plant: `<path d="M50 65 Q30 50 36 30 Q50 22 64 30 Q70 50 50 65Z" fill="white" opacity="0.9"/>
              <path d="M50 65 Q40 52 44 38" stroke="white" stroke-width="1.5" fill="none" opacity="0.6"/>
              <path d="M50 65 Q60 52 56 38" stroke="white" stroke-width="1.5" fill="none" opacity="0.6"/>`,

  bamboo: `<rect x="44" y="15" width="5" height="70" rx="2.5" fill="white" opacity="0.9"/>
           <rect x="51" y="20" width="5" height="60" rx="2.5" fill="white" opacity="0.85"/>
           <line x1="44" y1="35" x2="38" y2="30" stroke="white" stroke-width="2" stroke-linecap="round"/>
           <line x1="51" y1="40" x2="62" y2="34" stroke="white" stroke-width="2" stroke-linecap="round"/>`,

  cactus: `<rect x="44" y="30" width="12" height="50" rx="6" fill="white" opacity="0.9"/>
           <rect x="28" y="42" width="18" height="10" rx="5" fill="white" opacity="0.85"/>
           <rect x="54" y="48" width="18" height="10" rx="5" fill="white" opacity="0.85"/>
           <rect x="28" y="38" width="8" height="14" rx="4" fill="white" opacity="0.85"/>
           <rect x="64" y="44" width="8" height="14" rx="4" fill="white" opacity="0.85"/>`,

  fern: `<path d="M50 72 Q32 55 22 30" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round"/>
         <path d="M36 52 Q28 44 24 38" stroke="white" stroke-width="2" fill="none" stroke-linecap="round"/>
         <path d="M30 40 Q22 34 20 28" stroke="white" stroke-width="1.5" fill="none" stroke-linecap="round"/>`,

  unknown: `<path d="M50 22 Q66 22 66 38 Q66 50 50 50 Q50 58 50 62" stroke="white" stroke-width="4" fill="none" stroke-linecap="round"/>
            <circle cx="50" cy="72" r="3.5" fill="white"/>`,
}

export const DEFAULT_PLANT_ICON = PLANT_ICONS.unknown

export function getPlantIcon(plantType: string | null | undefined): string {
  if (!plantType) return DEFAULT_PLANT_ICON
  return PLANT_ICONS[plantType] ?? DEFAULT_PLANT_ICON
}
