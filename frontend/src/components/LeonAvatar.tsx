interface Props {
  size?: number
  className?: string
}

export default function LeonAvatar({ size = 100, className }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label="Leon"
      className={className}
    >
      <title>Leon</title>

      {/* Neck + shoulders */}
      <path d="M 34 84 Q 30 94 28 100 L 72 100 Q 70 94 66 84 Z" fill="#D9A87E" />
      <path d="M 36 98 L 64 98" stroke="#C48960" strokeWidth="1.5" opacity="0.4" />

      {/* Shirt body */}
      <rect x="24" y="92" width="52" height="8" rx="2" fill="#4A7C4E" />

      {/* Head */}
      <circle cx="50" cy="48" r="26" fill="#E8C09A" />
      {/* Cheek highlights */}
      <ellipse cx="36" cy="52" rx="5" ry="3" fill="#F5D8B8" opacity="0.5" />
      <ellipse cx="64" cy="52" rx="5" ry="3" fill="#F5D8B8" opacity="0.5" />

      {/* Blond curly hair */}
      <path
        d="M 26 40 Q 24 28 32 22 Q 38 18 44 18 Q 48 16 52 18 Q 58 16 64 20 Q 72 24 74 32 Q 76 40 74 42 Q 72 34 66 28 Q 60 22 50 20 Q 40 22 34 28 Q 28 34 26 40 Z"
        fill="#E8C06A"
      />
      {/* Hair curls detail */}
      <ellipse cx="34" cy="28" rx="5" ry="6" fill="#D4A84E" />
      <ellipse cx="48" cy="22" rx="6" ry="5" fill="#D4A84E" />
      <ellipse cx="62" cy="26" rx="5" ry="6" fill="#D4A84E" />
      <ellipse cx="70" cy="34" rx="4" ry="5" fill="#D4A84E" />
      {/* Hair highlight */}
      <ellipse cx="42" cy="24" rx="3" ry="2" fill="#F0D48A" opacity="0.6" />
      <ellipse cx="56" cy="22" rx="3" ry="2" fill="#F0D48A" opacity="0.6" />

      {/* Eyes */}
      <circle cx="40" cy="44" r="3" fill="#4A3429" />
      <circle cx="60" cy="44" r="3" fill="#4A3429" />
      <circle cx="41" cy="43" r="1" fill="#FFF" opacity="0.6" />
      <circle cx="61" cy="43" r="1" fill="#FFF" opacity="0.6" />

      {/* Eyebrows: evil arched */}
      <path
        d="M 33 38 Q 36 34 42 37"
        stroke="#D4A84E"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M 58 37 Q 64 34 67 38"
        stroke="#D4A84E"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />

      {/* Mustache */}
      <path
        d="M 36 52 Q 40 56 50 56 Q 54 56 58 54 Q 62 52 64 52 Q 62 60 50 60 Q 40 60 36 52 Z"
        fill="#D4A84E"
      />
      <path
        d="M 40 54 Q 50 58 58 54"
        stroke="#C49A3E"
        strokeWidth="0.8"
        fill="none"
        opacity="0.4"
      />

      {/* Subtle smile behind stache */}
      <path
        d="M 44 62 Q 50 66 56 62"
        stroke="#C48960"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />

      {/* Highlight on nose */}
      <path d="M 48 47 Q 50 46 52 47 L 51 51 Q 50 52 49 51 Z" fill="#C48960" />
    </svg>
  )
}
