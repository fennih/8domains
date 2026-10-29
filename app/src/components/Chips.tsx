import type { ReactNode } from 'react'
import type { Kb, Priority } from '../kb/types'
import { DOMAIN_SHORT } from '../lib/domains'

export function DomainChip({ domain, label }: { domain: number; label?: string }) {
  return (
    <span className={`chip-domain d-${domain} inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold`}>
      {label ?? (domain > 0 ? `Domain ${domain}` : 'All domains')}
    </span>
  )
}

// Where a card sits in the syllabus: domain name on top, objective number and title under it.
export function CardContext({ kb, domain, objective }: { kb: Kb; domain: number; objective?: string }) {
  const o = objective ? kb.outline.domains.find((d) => d.number === domain)?.objectives.find((x) => x.id === objective) : undefined
  return (
    <span className={`flex min-w-0 flex-col text-left leading-snug`}>
      <span className="truncate text-xs font-bold uppercase tracking-[0.08em] text-dc-ink desk:text-[13px]">
        {domain > 0 ? `Domain ${domain} · ${DOMAIN_SHORT[domain]}` : 'All domains'}
      </span>
      {o && (
        <span className="truncate text-[13px] text-muted md:text-sm">
          <span className="font-bold tabular-nums">{o.id}</span> {o.title}
        </span>
      )}
    </span>
  )
}

const PRIORITY_STYLE: Record<Priority, string> = {
  core: 'bg-accent text-accent-fg',
  important: 'border border-fg/40 text-fg',
  nice: 'border border-line text-muted',
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[0.68rem] font-bold uppercase tracking-wide ${PRIORITY_STYLE[priority]}`}>
      {priority}
    </span>
  )
}

export function Label({ children }: { children: ReactNode }) {
  return <span className="text-xs font-bold uppercase tracking-wider text-muted">{children}</span>
}

// Neutral on purpose: marker colors carry meaning (fact, exam action, number) and are kept for highlights.
const PILL_STYLE = {
  trap: 'bg-bad-soft text-danger',
  manager: 'border border-line text-fg-2',
  mnemonic: 'border border-line text-fg-2',
  point: 'border border-line text-muted',
  recall: 'border border-line text-fg-2',
} as const

export function Pill({ kind, children }: { kind: keyof typeof PILL_STYLE; children: ReactNode }) {
  return <span className={`inline-flex self-start rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${PILL_STYLE[kind]}`}>{children}</span>
}

export function Bar({ done, total, className = '' }: { done: number; total: number; className?: string }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-surface-2 ${className}`} role="presentation">
      <div className="bar-domain h-full rounded-full" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Ring({ value, size = 52, label }: { value: number; size?: number; label?: string }) {
  const r = 20
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(100, value))
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} role="img" aria-label={label ?? `${v}% covered`} className="shrink-0">
      <circle cx="24" cy="24" r={r} fill="none" strokeWidth="5" className="stroke-surface-2" />
      {v > 0 && (
      <circle
        cx="24"
        cy="24"
        r={r}
        fill="none"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${(v / 100) * c} ${c}`}
        transform="rotate(-90 24 24)"
        className="stroke-dc"
      />
      )}
      <text x="24" y="28" textAnchor="middle" className="fill-fg text-[11px] font-bold">
        {v}%
      </text>
    </svg>
  )
}
