import { DOMAIN_ICON, DOMAIN_SHORT } from '../lib/domains'

const R = 28
const C = 2 * Math.PI * R

// The ring is the only progress indicator on a domain: the number sits inside, no bar or percentage text.
export function DomainRing({ domain, value, className = '' }: { domain: number; value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <span role="img" aria-label={`Domain ${domain}, ${v}% read`} className={`ring-d relative inline-flex shrink-0 items-center justify-center ${className}`}>
      <svg viewBox="0 0 64 64" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <circle cx="32" cy="32" r={R} fill="none" strokeWidth="2" className="stroke-[var(--dc-track)]" />
        {v > 0 && (
          <circle
            cx="32"
            cy="32"
            r={R}
            fill="none"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeDasharray={`${(v / 100) * C} ${C}`}
            transform="rotate(-90 32 32)"
            className="stroke-dc"
          />
        )}
      </svg>
      <span aria-hidden="true" className="ring-num font-display text-dc-ink">
        {domain}
      </span>
    </span>
  )
}

export function DomainIcon({ domain, className = '' }: { domain: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 stroke-dc ${className}`}
    >
      <path d={DOMAIN_ICON[domain]} />
    </svg>
  )
}

export function DomainTile({ domain, title, value, onOpen }: { domain: number; title: string; value: number; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className={`d-${domain} tile domain-tile flex w-full flex-col justify-between text-left`}>
      <span className="flex items-start justify-between">
        <DomainRing domain={domain} value={value} />
        <DomainIcon domain={domain} className="domain-icon" />
      </span>
      <span className="domain-title font-bold leading-tight">
        <span className="md:hidden">{DOMAIN_SHORT[domain] ?? title}</span>
        <span className="hidden md:inline">{title}</span>
      </span>
    </button>
  )
}
