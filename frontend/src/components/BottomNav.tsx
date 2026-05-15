     1|import { NavLink } from 'react-router-dom'
     2|import { useFloreren } from '../store/useFloreren'
     3|import { useT } from '../context/LanguageContext'
     4|
     5|export default function BottomNav() {
     6|  const setShowPlantPicker = useFloreren((s) => s.setShowPlantPicker)
     7|  const t = useT()
     8|
     9|  const tabs = [
    10|    {
    11|      to: '/dashboard',
    12|      label: t.nav.home,
    13|      icon: (active: boolean) => (
    14|        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
    15|          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    16|          <polyline points="9 22 9 12 15 12 15 22" />
    17|        </svg>
    18|      ),
    19|    },
    20|    {
    21|      to: '/plants',
    22|      label: t.nav.plants,
    23|      icon: (active: boolean) => (
    24|        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
    25|          <path d="M7 20h10" />
    26|          <path d="M10 20c5.5-2.5.8-6.4 3-10" />
    27|          <path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z" />
    28|          <path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z" />
    29|        </svg>
    30|      ),
    31|    },
    32|    {
    33|      to: '/calendar',
    34|      label: t.nav.calendar,
    35|      icon: (active: boolean) => (
    36|        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
    37|          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    38|          <line x1="16" y1="2" x2="16" y2="6" />
    39|          <line x1="8" y1="2" x2="8" y2="6" />
    40|          <line x1="3" y1="10" x2="21" y2="10" />
    41|        </svg>
    42|      ),
    43|    },
    44|    {
    45|      to: '/settings',
    46|      label: t.nav.settings,
    47|      icon: (active: boolean) => (
    48|        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
    49|          <circle cx="12" cy="12" r="3" />
    50|          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    51|        </svg>
    52|      ),
    53|    },
    54|  ]
    55|
    56|  return (
    57|    <nav className="fixed bottom-0 left-0 right-0 bg-surface/95 backdrop-blur-md border-t border-border flex justify-around items-end h-16 pb-[env(safe-area-inset-bottom)] z-50">
    58|      {tabs.map((tab) => (
    59|        <NavLink
    60|          key={tab.to}
    61|          to={tab.to}
    62|          end={tab.to === '/dashboard'}
    63|          className={({ isActive }) =>
    64|            `flex flex-col items-center justify-center gap-0.5 px-3 pt-2 pb-1 text-[10px] transition-colors min-w-[64px] ${
    65|              isActive
    66|                ? 'text-primary font-semibold'
    67|                : 'text-text-muted'
    68|            }`
    69|          }
    70|        >
    71|          {({ isActive }) => (
    72|            <>
    73|              {tab.icon(isActive)}
    74|              <span>{tab.label}</span>
    75|            </>
    76|          )}
    77|        </NavLink>
    78|      ))}
    79|      <button
    80|        onClick={() => setShowPlantPicker(true)}
    81|        className="flex flex-col items-center justify-center gap-0.5 px-3 pt-2 pb-1 text-[10px] transition-colors min-w-[64px] text-primary"
    82|      >
    83|        <div className="w-10 h-10 -mt-4 rounded-full bg-primary text-white flex items-center justify-center">
    84|          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    85|            <line x1="12" y1="5" x2="12" y2="19" />
    86|            <line x1="5" y1="12" x2="19" y2="12" />
    87|          </svg>
    88|        </div>
    89|        <span className="-mt-1">{t.nav.add}</span>
    90|      </button>
    91|    </nav>
    92|  )
    93|}
    94|