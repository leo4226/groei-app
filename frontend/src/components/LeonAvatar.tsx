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
      aria-label="Stekkie"
      className={className}
    >
      <title>Stekkie</title>

      {/* Neck + shoulders */}
      <path d="M 34 84 Q 30 94 28 100 L 72 100 Q 70 94 66 84 Z" fill="#D9A87E" />
      <path d="M 36 98 L 64 98" stroke="#C48960" strokeWidth="1.5" opacity="0.4" />

      {/* Shirt body */}
      <rect x="24" y="92" width="52" height="8" rx="2" fill="#4A7C4E" />

      {/* Head — lowered to connect to neck */}
      <circle cx="50" cy="58" r="26" fill="#E8C09A" />
      {/* Cheek highlights */}
      <ellipse cx="36" cy="62" rx="5" ry="3" fill="#F5D8B8" opacity="0.5" />
      <ellipse cx="64" cy="62" rx="5" ry="3" fill="#F5D8B8" opacity="0.5" />

      {/* Blond curly hair */}
      <path
        d="M 26 50 Q 24 38 32 32 Q 38 28 44 28 Q 48 26 52 28 Q 58 26 64 30 Q 72 34 74 42 Q 76 50 74 52 Q 72 44 66 38 Q 60 32 50 30 Q 40 32 34 38 Q 28 44 26 50 Z"
        fill="#E8C06A"
      />
      {/* Hair curls detail */}
      <ellipse cx="34" cy="38" rx="5" ry="6" fill="#D4A84E" />
      <ellipse cx="48" cy="32" rx="6" ry="5" fill="#D4A84E" />
      <ellipse cx="62" cy="36" rx="5" ry="6" fill="#D4A84E" />
      <ellipse cx="70" cy="44" rx="4" ry="5" fill="#D4A84E" />
      {/* Hair highlight */}
      <ellipse cx="42" cy="34" rx="3" ry="2" fill="#F0D48A" opacity="0.6" />
      <ellipse cx="56" cy="32" rx="3" ry="2" fill="#F0D48A" opacity="0.6" />

      {/* Eyes */}
      <circle cx="40" cy="54" r="3" fill="#4A3429" />
      <circle cx="60" cy="54" r="3" fill="#4A3429" />
      <circle cx="41" cy="53" r="1" fill="#FFF" opacity="0.6" />
      <circle cx="61" cy="53" r="1" fill="#FFF" opacity="0.6" />

      {/* Eyebrows: evil arched */}
      <path
        d="M 33 48 Q 36 44 42 47"
        stroke="#D4A84E"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M 58 47 Q 64 44 67 48"
        stroke="#D4A84E"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />

      {/* Mustache */}
      <path
        d="M 36 62 Q 40 66 50 66 Q 54 66 58 64 Q 62 62 64 62 Q 62 70 50 70 Q 40 70 36 62 Z"
        fill="#D4A84E"
      />
      <path
        d="M 40 64 Q 50 68 58 64"
        stroke="#C49A3E"
        strokeWidth="0.8"
        fill="none"
        opacity="0.4"
      />

      {/* Subtle smile behind stache */}
      <path
        d="M 44 72 Q 50 76 56 72"
        stroke="#C48960"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />

      {/* Highlight on nose */}
      <path d="M 48 57 Q 50 56 52 57 L 51 61 Q 50 62 49 61 Z" fill="#C48960" />
    </svg>
  )
}
