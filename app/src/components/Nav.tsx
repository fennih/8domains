export type Tab = 'home' | 'feed' | 'coverage' | 'browse' | 'me'

export const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: 'M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z' },
  { id: 'feed', label: 'Feed', icon: 'M4 5h16v6H4zM4 13h16v6H4z' },
  { id: 'coverage', label: 'Coverage', icon: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z' },
  { id: 'browse', label: 'Browse', icon: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm9 2-4.3-4.3' },
  { id: 'me', label: 'Me', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0' },
]

export function Nav({ tab, onChange, due }: { tab: Tab; onChange: (t: Tab) => void; due: number }) {
  return (
    <nav
      aria-label="Main"
      className="nav-bar fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/95 backdrop-blur md:static md:w-24 md:border-r md:border-t-0 lg:w-48"
    >
      <ul className="flex h-[var(--nav-h)] items-stretch md:h-auto md:flex-col md:gap-1 md:px-2">
        {TABS.map((t) => {
          const current = t.id === tab
          return (
            <li key={t.id} className="flex-1 md:flex-none">
              <button
                type="button"
                onClick={() => onChange(t.id)}
                aria-current={current ? 'page' : undefined}
                className={`relative flex h-full w-full flex-col items-center justify-center gap-0.5 text-[0.7rem] font-medium md:rounded-xl md:py-3 lg:flex-row lg:justify-start lg:gap-3 lg:px-4 lg:text-sm ${
                  current ? 'font-bold text-accent md:bg-surface-2' : 'text-muted hover:text-fg'
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={t.icon} />
                </svg>
                {t.label}
                {t.id === 'feed' && due > 0 && (
                  <span className="absolute right-[calc(50%-1.6rem)] top-1 rounded-full bg-[var(--hl-y)] px-1.5 text-[0.6rem] font-bold text-[#1b1a20] lg:static lg:ml-auto lg:text-xs">
                    {due > 99 ? '99+' : due}
                    <span className="sr-only"> cards due</span>
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
