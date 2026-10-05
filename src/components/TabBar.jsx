const Icon = {
  boosters: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3.5h12l-1 2H7l-1-2Z" /><rect x="6" y="5.5" width="12" height="15" rx="1" /><path d="M6 20.5l-.5 1h13l-.5-1" /><path d="M9 12.5h6" />
    </svg>
  ),
  collection: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="6" width="10" height="14" rx="1.5" /><path d="M7 3.5h9.5a1.5 1.5 0 0 1 1.5 1.5v12" /><path d="M20.5 8v10" />
    </svg>
  ),
  profile: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c.8-3.6 3.8-5.5 7-5.5s6.2 1.9 7 5.5" />
    </svg>
  ),
}

const TABS = [
  ['boosters', 'Boosters'],
  ['collection', 'Collection'],
  ['profile', 'Profil'],
]

export default function TabBar({ tab, onChange, boosters }) {
  return (
    <nav className="tabbar" aria-label="Navigation principale">
      <div className="tabbar-inner">
        {TABS.map(([id, label]) => (
          <button key={id} className={tab === id ? 'on' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => onChange(id)}>
            <span className="tab-icon">
              {Icon[id]}
              {id === 'boosters' && boosters > 0 && <span className="tab-badge">{boosters}</span>}
            </span>
            <span>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}
