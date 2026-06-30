/**
 * Branded full-height loader shown while the app fetches the user's maps on a
 * cold start. Replaces the bare "Loading maps…" line so the (often slow) first
 * load feels intentional rather than broken. Pure presentational — the caller
 * owns the loading state.
 */
export default function AppLoadingView({ title, lede }: { title: string; lede?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        minHeight: '70vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        padding: '40px 24px',
        textAlign: 'center',
      }}
    >
      <svg className="app-loader-leaf" width="56" height="56" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 22c0-6 0-9 2.5-11.5C16.5 8.5 19 8 21 8c0 6-2 9-4.5 10.5C14.5 19.5 12 20 12 22Z"
          fill="var(--color-primary)"
          opacity="0.9"
        />
        <path
          d="M12 22c0-5 0-7.5-2-9.5C8.5 11 6.5 10.5 5 10.5c0 5 1.5 7.5 3.5 9C9.8 20.3 11 20.8 12 22Z"
          fill="var(--color-primary-highlight)"
          opacity="0.8"
        />
        <path d="M12 22V11" stroke="var(--color-primary-dark)" strokeWidth="1.1" strokeLinecap="round" />
      </svg>

      <div>
        <h1
          style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: 500,
            fontSize: 26,
            color: 'var(--color-primary)',
            margin: 0,
            letterSpacing: '-0.01em',
          }}
        >
          {title}
        </h1>
        {lede && (
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 14,
              color: 'var(--color-text-muted)',
              maxWidth: 260,
              lineHeight: 1.5,
              margin: '8px auto 0',
            }}
          >
            {lede}
          </p>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6 }} aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="app-loader-dot"
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: 'var(--color-primary)',
              animationDelay: `${i * 0.16}s`,
            }}
          />
        ))}
      </div>
    </div>
  )
}
