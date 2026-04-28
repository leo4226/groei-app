/**
 * Static compass rose showing the garden's cardinal orientation.
 *
 * The landscape SVG has top = brick fence (NNW, ~347°), so N is 13° CW from screen-top.
 */
export default function GardenCompass({ isMobile = false }: { isMobile?: boolean }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 10,
        right: 10,
        zIndex: 20,
        pointerEvents: 'none',
        width: 56,
        height: 56,
        transform: isMobile ? 'rotate(-77deg)' : 'rotate(13deg)',
      }}
    >
      <svg width="56" height="56" viewBox="0 0 56 56">
        {/* Background */}
        <circle cx="28" cy="28" r="26" fill="rgba(12,18,28,0.72)" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />

        {/* Tick marks */}
        <line x1="28" y1="5"  x2="28" y2="10" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
        <line x1="28" y1="46" x2="28" y2="51" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
        <line x1="5"  y1="28" x2="10" y2="28" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
        <line x1="46" y1="28" x2="51" y2="28" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />

        {/* North arrow — filled warm gold (prominent) */}
        <polygon points="28,9 24.5,22 28,19.5 31.5,22" fill="#d4a843" />
        {/* South arrow — faint */}
        <polygon points="28,47 24.5,34 28,36.5 31.5,34" fill="rgba(255,255,255,0.22)" />

        {/* Centre dot */}
        <circle cx="28" cy="28" r="2.5" fill="rgba(255,255,255,0.55)" />

        {/* N label */}
        <text x="28" y="7.5" textAnchor="middle" dominantBaseline="middle"
          fill="#d4a843" fontSize="9.5" fontWeight="700" fontFamily="system-ui,sans-serif">N</text>

        {/* S label */}
        <text x="28" y="50" textAnchor="middle" dominantBaseline="middle"
          fill="rgba(255,255,255,0.40)" fontSize="8" fontFamily="system-ui,sans-serif">S</text>

        {/* E label (right side on screen) */}
        <text x="49" y="28.5" textAnchor="middle" dominantBaseline="middle"
          fill="rgba(255,255,255,0.40)" fontSize="8" fontFamily="system-ui,sans-serif">E</text>

        {/* W label (left side on screen = house side) */}
        <text x="7" y="28.5" textAnchor="middle" dominantBaseline="middle"
          fill="rgba(255,255,255,0.40)" fontSize="8" fontFamily="system-ui,sans-serif">W</text>
      </svg>
    </div>
  )
}
