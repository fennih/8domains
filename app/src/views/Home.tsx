import { useMemo } from 'react'
import type { Kb } from '../kb/types'
import { btnDomain, btnPrimary, btnSecondary } from '../components/buttons'
import { Bar, Label } from '../components/Chips'
import { DomainIcon, DomainRing, DomainTile } from '../components/DomainTile'
import { computeCoverage, nextObjective, pct } from '../lib/coverage'
import { drillItems } from '../lib/feed'
import type { Plan } from '../lib/plan'
import { useProgress } from '../lib/progress'
import { DRILL_LABEL, scopeConcepts, scopeLabel, scopeTitle, type Drill, type Scope } from '../lib/scope'
import { dueCount, streak } from '../lib/stats'

export function StreakBadge() {
  const { state } = useProgress()
  const n = streak(state, new Date())
  return (
    <span className="shrink-0 whitespace-nowrap rounded-full border border-line px-2.5 py-1 text-xs font-bold text-muted" title="Days in a row with some study">
      {n > 0 ? `${n}-day streak` : 'No streak yet'}
    </span>
  )
}

// Where Home is: the domain grid, a domain, or one objective of it. Kept by the shell so closing the feed comes back here.
export type HomeView = { domain: number; objective?: string } | null

const DRILLS: Drill[] = ['flashcard', 'mnemonic', 'trap', 'quiz', 'table']

export function Home({ kb, plan, view, onView, onPick }: { kb: Kb; plan: Plan; view: HomeView; onView: (v: HomeView) => void; onPick: (s: Scope) => void }) {
  const { state } = useProgress()
  const cov = useMemo(() => computeCoverage(kb, state.read, state.cards), [kb, state.read, state.cards])
  const due = dueCount(state.cards, kb, new Date())
  const suggested = nextObjective(kb, cov, plan.focus[0])
  const last = state.settings.scope

  if (view?.objective) {
    const d = kb.outline.domains.find((x) => x.number === view.domain)!
    const o = d.objectives.find((x) => x.id === view.objective)!
    const oc = cov.objectives.get(o.id)!
    const drills = DRILLS.map((drill) => ({ drill, count: drillItems(kb, o.id, drill).length })).filter((x) => x.count > 0)
    return (
      <div className={`d-${d.number} mx-auto flex h-full max-w-5xl flex-col gap-4 overflow-y-auto px-4 py-6 md:px-8`}>
        <button type="button" onClick={() => onView({ domain: d.number })} className="min-h-11 self-start text-sm font-semibold text-muted hover:text-fg">
          &larr; Domain {d.number}
        </button>
        <header className="tile flex flex-col gap-3 p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-dc-ink">
            Domain {d.number} · {o.id}
          </p>
          <h1 className="text-3xl leading-tight md:text-4xl">{o.title}</h1>
          <div className="flex items-center gap-2">
            <Bar done={oc.concepts.done} total={oc.concepts.total} />
            <span className="shrink-0 text-xs text-muted">
              {oc.concepts.done}/{oc.concepts.total} concepts read
            </span>
          </div>
        </header>
        <button
          type="button"
          onClick={() => onPick({ kind: 'objective', objective: o.id })}
          className="tile flex flex-col gap-1 p-5 text-left md:flex-row md:items-center md:justify-between md:gap-6"
        >
          <span className="flex flex-col gap-1">
            <span className="font-display text-2xl font-medium md:text-3xl">Notes</span>
            <span className="text-sm text-muted">Concepts in order, with flashcards, mnemonics, traps and scenarios along the way. Each shows up once.</span>
          </span>
          <span className="mt-2 shrink-0 text-sm font-bold text-dc-ink md:mt-0 md:text-base">
            {oc.concepts.done === 0 ? 'Start' : oc.concepts.done === oc.concepts.total ? 'Read again' : 'Continue'} &rarr;
          </span>
        </button>
        {drills.length > 0 && (
          <section aria-label="Review one kind" className="flex flex-col gap-2">
            <Label>All of one kind</Label>
            <ul className="grid list-none grid-cols-2 gap-2 p-0 md:grid-cols-5">
              {drills.map(({ drill, count }) => (
                <li key={drill}>
                  <button
                    type="button"
                    onClick={() => onPick({ kind: 'drill', drill, objective: o.id })}
                    aria-label={`All ${count} ${DRILL_LABEL[drill].toLowerCase()} of ${o.id}`}
                    className="tile flex min-h-24 w-full flex-col justify-between gap-2 p-4 text-left"
                  >
                    <span className="font-display text-3xl font-medium leading-none text-dc-ink">{count}</span>
                    <span className="text-sm font-bold">{DRILL_LABEL[drill]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    )
  }

  if (view) {
    const d = kb.outline.domains.find((x) => x.number === view.domain)!
    const dc = cov.domains.get(d.number)!
    return (
      <div className={`d-${d.number} mx-auto flex h-full max-w-5xl flex-col gap-4 overflow-y-auto px-4 py-6 md:px-8`}>
        <button type="button" onClick={() => onView(null)} className="min-h-11 self-start text-sm font-semibold text-muted hover:text-fg">
          &larr; All domains
        </button>
        <header className="tile flex items-center gap-4 p-5">
          <DomainRing domain={d.number} value={pct(dc.concepts)} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-dc-ink">Domain {d.number} · {d.weight}% of exam</p>
            <h1 className="text-3xl leading-tight md:text-4xl">{d.title}</h1>
            <p className="text-sm text-muted">{dc.concepts.total === 0 ? 'Content coming' : `${dc.concepts.done}/${dc.concepts.total} concepts read`}</p>
          </div>
          <DomainIcon domain={d.number} className="h-6 w-6 self-start" />
        </header>
        {dc.concepts.total > 0 && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onPick({ kind: 'domain', domain: d.number })} className={btnPrimary}>
              Study whole domain
            </button>
            <button type="button" onClick={() => onPick({ kind: 'domain-mix', domain: d.number })} className={btnSecondary}>
              Mix this domain
            </button>
          </div>
        )}
        <ul className="flex flex-col gap-2">
          {d.objectives.map((o) => {
            const oc = cov.objectives.get(o.id)!
            return (
              <li key={o.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 md:p-4">
                <span className="w-10 shrink-0 text-sm font-bold tabular-nums text-dc-ink md:text-base">{o.id}</span>
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
                    onClick={() => onView({ domain: d.number, objective: o.id })}
                    className={`${btnDomain} shrink-0`}
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
    <div className="home mx-auto flex h-full w-full flex-col gap-3 overflow-y-auto px-4 pb-6 pt-[18px]">
      <div className="flex items-center justify-between gap-3 desk:hidden">
        <StreakBadge />
        <HomeLinks />
      </div>

      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="flex flex-col gap-1">
          <h1 className="home-title leading-[1.05] tracking-[-0.015em]">
            What do you want to <span className="text-accent">study</span>?
          </h1>
          {suggested && (
            <button
              type="button"
              onClick={() => onPick({ kind: 'objective', objective: suggested.id })}
              className="min-h-11 self-start text-left text-sm text-muted hover:text-fg md:text-base"
            >
              Suggested next: <span className="font-semibold text-fg">{suggested.id} {suggested.title}</span>
            </button>
          )}
        </div>
        <div className="hidden desk:flex">
          <HomeLinks />
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {last && (last.kind !== 'due' || due > 0) && (
          <button type="button" onClick={() => onPick(last)} className={`${btnPrimary} flex-1 md:flex-none`}>
            Continue {scopeLabel(last)}
            {lastProgress.length > 0 && ` · ${lastProgress.filter((c) => state.read.has(c.id)).length}/${lastProgress.length}`}
          </button>
        )}
        <button type="button" onClick={() => onPick({ kind: 'mix' })} className={btnSecondary}>
          Mix all
        </button>
        {due > 0 && (
          <button type="button" onClick={() => onPick({ kind: 'due' })} className={btnSecondary}>
            Review {due} due
          </button>
        )}
      </div>

      <ul className="domain-grid mt-1 grid list-none p-0" aria-label="Domains">
        {kb.outline.domains.map((d) => (
          <li key={d.id}>
            <DomainTile domain={d.number} title={d.title} value={pct(cov.domains.get(d.number)!.concepts)} onOpen={() => onView({ domain: d.number })} />
          </li>
        ))}
      </ul>

      {last && <p className="text-[13px] text-muted">Last studied: {scopeTitle(kb, last)}</p>}
    </div>
  )
}

// Coverage and Browse are routes reached from Home, not tabs.
function HomeLinks() {
  return (
    <span className="flex gap-4 text-[13px] font-semibold md:gap-5 md:text-[15px]">
      <a href="#coverage" className="inline-flex min-h-11 items-center text-muted hover:text-fg">
        Coverage
      </a>
      <a href="#browse" className="inline-flex min-h-11 items-center text-muted hover:text-fg">
        Browse
      </a>
    </span>
  )
}
