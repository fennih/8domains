import { StreakBadge } from '../views/Home'

export type Tab = 'home' | 'feed' | 'coverage' | 'browse' | 'me'

// Every hash route; only three of them are in the nav. Coverage and Browse are reached from Home.
export const ROUTES: Tab[] = ['home', 'feed', 'coverage', 'browse', 'me']

const NAV: { id: Tab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'feed', label: 'Feed' },
  { id: 'me', label: 'Me' },
]

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`font-display font-medium tracking-[-0.01em] ${className}`}>
      <span className="text-accent">8</span>Domains
    </span>
  )
}

export function Nav({ tab, onChange, due }: { tab: Tab; onChange: (t: Tab) => void; due: number }) {
  // Coverage and Browse live under Home in the nav.
  const section = tab === 'coverage' || tab === 'browse' ? 'home' : tab
  return (
    <nav
      aria-label="Main"
      className="nav-bar fixed inset-x-0 bottom-0 z-10 border-t border-line bg-bg desk:static desk:flex desk:w-[240px] desk:shrink-0 desk:flex-col desk:gap-8 desk:border-r desk:border-t-0 desk:px-5 desk:py-8"
    >
      <Logo className="hidden text-2xl desk:block" />
      <ul className="grid h-[var(--nav-h)] grid-cols-3 desk:flex desk:h-auto desk:flex-col desk:gap-1">
        {NAV.map((t) => {
          const current = t.id === section
          return (
            <li key={t.id} className="flex">
              <button
                type="button"
                onClick={() => onChange(t.id)}
                aria-current={current ? 'page' : undefined}
                className={`flex w-full items-center justify-center gap-2 text-[13px] font-bold md:text-[15px] desk:min-h-11 desk:justify-start desk:rounded-[10px] desk:px-3.5 ${
                  current ? 'text-accent desk:bg-[color-mix(in_srgb,var(--c-accent)_10%,transparent)]' : 'text-muted hover:text-fg'
                }`}
              >
                {t.label}
                {t.id === 'feed' && due > 0 && (
                  <span className="text-xs font-bold text-fg-2">
                    {due > 99 ? '99+' : due}
                    <span className="sr-only"> cards due</span>
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      <div className="mt-auto hidden desk:block">
        <StreakBadge />
      </div>
    </nav>
  )
}
