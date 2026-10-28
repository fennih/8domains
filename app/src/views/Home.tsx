import { useMemo, useState } from 'react'
import type { Kb } from '../kb/types'
import { Bar, Ring } from '../components/Chips'
import { computeCoverage, nextObjective, pct } from '../lib/coverage'
import type { Plan } from '../lib/plan'
import { useProgress } from '../lib/progress'
import { scopeConcepts, scopeLabel, scopeTitle, type Scope } from '../lib/scope'
import { dueCount, streak } from '../lib/stats'

export function StreakBadge() {
  const { state } = useProgress()
  const n = streak(state, new Date())
  return (
    <span className="shrink-0 whitespace-nowrap rounded-full border border-line bg-surface px-3 py-1 text-xs font-bold text-muted" title="Days in a row with some study">
      {n > 0 ? `${n}-day streak` : 'No streak yet'}
    </span>
  )
}

const pillButton = 'rounded-full px-5 py-2.5 text-sm font-bold'

export function Home({ kb, plan, onPick }: { kb: Kb; plan: Plan; onPick: (s: Scope) => void }) {
  const { state } = useProgress()
  const [domainView, setDomainView] = useState<number | null>(null)
  const cov = useMemo(() => computeCoverage(kb, state.read, state.cards), [kb, state.read, state.cards])
  const due = dueCount(state.cards, kb, new Date())
  const suggested = nextObjective(kb, cov, plan.focus[0])
  const last = state.settings.scope

  if (domainView !== null) {
    const d = kb.outline.domains.find((x) => x.number === domainView)!
    const dc = cov.domains.get(d.number)!
    return (
      <div className={`d-${d.number} mx-auto flex h-full max-w-5xl flex-col gap-4 overflow-y-auto px-4 py-6 md:px-8`}>
        <button type="button" onClick={() => setDomainView(null)} className="self-start rounded-full border border-line bg-surface px-3 py-1 text-sm font-semibold">
          &larr; All domains
        </button>
        <header className="tile flex items-center gap-4 p-5">
          <Ring value={pct(dc.concepts)} size={64} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-dc-ink">Domain {d.number} · {d.weight}% of exam</p>
            <h1 className="text-2xl font-bold leading-tight md:text-3xl">{d.title}</h1>
            <p className="text-sm text-muted">{dc.concepts.total === 0 ? 'Content coming' : `${dc.concepts.done}/${dc.concepts.total} concepts read`}</p>
          </div>
        </header>
        {dc.concepts.total > 0 && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onPick({ kind: 'domain', domain: d.number })} className={`${pillButton} bg-accent text-accent-fg`}>
              Study whole domain
            </button>
            <button type="button" onClick={() => onPick({ kind: 'domain-mix', domain: d.number })} className={`${pillButton} border border-line bg-surface`}>
              Mix this domain
            </button>
          </div>
        )}
        <ul className="flex flex-col gap-2">
          {d.objectives.map((o) => {
            const oc = cov.objectives.get(o.id)!
            return (
              <li key={o.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 md:p-4">
                <span className="w-10 shrink-0 font-display text-sm font-bold text-dc-ink">{o.id}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug md:text-base">{o.title}</p>
                  {oc.concepts.total > 0 ? (
                    <div className="mt-1.5 flex items-center gap-2">
                      <Bar done={oc.concepts.done} total={oc.concepts.total} />
                      <span className="shrink-0 text-xs text-muted">
                        {oc.concepts.done}/{oc.concepts.total}
                      </span>
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-muted">Content coming</p>
                  )}
                </div>
                {oc.concepts.total > 0 && (
                  <button
                    type="button"
                    onClick={() => onPick({ kind: 'objective', objective: o.id })}
                    className="shrink-0 rounded-full bg-dc-soft px-3 py-1.5 text-sm font-bold text-dc-ink"
                    aria-label={`Study ${o.id} ${o.title}`}
                  >
                    Study this
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  const lastProgress = last && last.kind !== 'due' ? scopeConcepts(kb, last) : []
  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-5 overflow-y-auto px-4 py-6 md:px-8">
      <header className="flex items-start justify-between gap-3">
        <h1 className="text-3xl font-extrabold md:text-4xl">What do you want to study?</h1>
        <StreakBadge />
      </header>

      {suggested && (
        <button
          type="button"
          onClick={() => onPick({ kind: 'objective', objective: suggested.id })}
          className="-mt-2 self-start text-left text-sm text-muted hover:text-fg"
        >
          Suggested next: <span className="font-semibold text-fg">{suggested.id} {suggested.title}</span>
        </button>
      )}

      <div className="flex flex-wrap gap-2">
        {last && (last.kind !== 'due' || due > 0) && (
          <button type="button" onClick={() => onPick(last)} className={`${pillButton} bg-accent text-accent-fg`}>
            Continue {scopeLabel(last)}
            {lastProgress.length > 0 && ` · ${lastProgress.filter((c) => state.read.has(c.id)).length}/${lastProgress.length}`}
          </button>
        )}
        <button type="button" onClick={() => onPick({ kind: 'mix' })} className={`${pillButton} border border-line bg-surface`}>
          Mix everything
        </button>
        {due > 0 && (
          <button type="button" onClick={() => onPick({ kind: 'due' })} className={`${pillButton} border border-line bg-surface`}>
            Review {due} due flashcard{due === 1 ? '' : 's'}
          </button>
        )}
      </div>

      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Domains">
        {kb.outline.domains.map((d) => {
          const dc = cov.domains.get(d.number)!
          const empty = dc.concepts.total === 0
          return (
            <li key={d.id} className={`d-${d.number}`}>
              <button type="button" onClick={() => setDomainView(d.number)} className="tile flex h-full w-full flex-col gap-2 p-4 text-left">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-display text-3xl font-extrabold text-dc-ink">{d.number}</span>
                  <Ring value={pct(dc.concepts)} size={44} label={empty ? 'Content coming' : `${pct(dc.concepts)}% read`} />
                </div>
                <span className="text-sm font-bold leading-snug">{d.title}</span>
                <span className="mt-auto text-xs text-muted">{empty ? 'Content coming' : `${dc.concepts.done}/${dc.concepts.total} read · ${d.weight}% of exam`}</span>
              </button>
            </li>
          )
        })}
      </ul>

      {last && <p className="text-xs text-muted">Last studied: {scopeTitle(kb, last)}</p>}
    </div>
  )
}
