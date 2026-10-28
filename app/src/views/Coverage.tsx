import { useMemo, useState } from 'react'
import type { Kb } from '../kb/types'
import { Bar, Label, Ring } from '../components/Chips'
import { challenges, computeCoverage, pct, projectFullCoverage, topicState, type CellState } from '../lib/coverage'
import { daysBetween, startOfDay } from '../lib/dates'
import type { Plan } from '../lib/plan'
import { useProgress } from '../lib/progress'
import type { Scope } from '../lib/scope'

type View = { level: 'map' } | { level: 'domain'; domain: number } | { level: 'objective'; objective: string }

const STATE_LABEL: Record<CellState, string> = {
  empty: 'content coming',
  'not-started': 'not started',
  reading: 'reading',
  read: 'read',
  mastered: 'mastered',
}

const longDate = (d: Date) => d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

function Legend() {
  return (
    <ul className="d-1 flex flex-wrap gap-3 text-xs text-muted" aria-label="Legend">
      {(['not-started', 'reading', 'read', 'mastered', 'empty'] as CellState[]).map((s) => (
        <li key={s} className="flex items-center gap-1.5">
          <span className={`cell cell-${s} inline-block h-3.5 w-5`} aria-hidden="true" />
          {STATE_LABEL[s]}
        </li>
      ))}
    </ul>
  )
}

function StudyButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="shrink-0 rounded-full bg-dc-soft px-3 py-1.5 text-sm font-bold text-dc-ink">
      Study this
    </button>
  )
}

export function Coverage({ kb, plan, onPick }: { kb: Kb; plan: Plan; onPick: (s: Scope) => void }) {
  const { state } = useProgress()
  const [view, setView] = useState<View>({ level: 'map' })
  const cov = useMemo(() => computeCoverage(kb, state.read, state.cards), [kb, state.read, state.cards])
  const now = new Date()
  const focus = state.settings.scope?.kind === 'objective' ? state.settings.scope.objective : plan.focus[0]
  const ch = useMemo(() => challenges(cov, focus), [cov, focus])
  const projection = projectFullCoverage(state.read, cov.concepts.total - cov.concepts.done, now)
  const daysLeft = daysBetween(startOfDay(now), plan.exam)
  const back = (
    <button
      type="button"
      onClick={() => setView(view.level === 'objective' ? { level: 'domain', domain: Number(view.objective.split('.')[0]) } : { level: 'map' })}
      className="self-start rounded-full border border-line bg-surface px-3 py-1 text-sm font-semibold"
    >
      &larr; Back
    </button>
  )

  if (view.level === 'domain') {
    const d = kb.outline.domains.find((x) => x.number === view.domain)!
    return (
      <div className={`d-${d.number} mx-auto flex h-full max-w-5xl flex-col gap-4 overflow-y-auto px-4 py-6 md:px-8`}>
        {back}
        <h1 className="text-2xl font-bold md:text-3xl">
          {d.number}. {d.title}
        </h1>
        <ul className="flex flex-col gap-2">
          {d.objectives.map((o) => {
            const oc = cov.objectives.get(o.id)!
            return (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => setView({ level: 'objective', objective: o.id })}
                  className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left"
                >
                  <span className={`cell cell-${oc.state} flex h-9 w-12 shrink-0 items-center justify-center text-xs font-bold`}>{o.id}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold leading-snug">{o.title}</span>
                    <span className="text-xs text-muted">
                      {STATE_LABEL[oc.state]}
                      {oc.concepts.total > 0 && ` · ${oc.concepts.done}/${oc.concepts.total} read · ${oc.cards.done}/${oc.cards.total} cards learned`}
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-muted">
                    &rsaquo;
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  if (view.level === 'objective') {
    const d = kb.outline.domains.find((x) => x.objectives.some((o) => o.id === view.objective))!
    const o = d.objectives.find((x) => x.id === view.objective)!
    const oc = cov.objectives.get(o.id)!
    return (
      <div className={`d-${d.number} mx-auto flex h-full max-w-5xl flex-col gap-4 overflow-y-auto px-4 py-6 md:px-8`}>
        {back}
        <div className="flex items-start gap-3">
          <span className={`cell cell-${oc.state} flex h-10 w-14 shrink-0 items-center justify-center text-sm font-bold`}>{o.id}</span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold leading-snug md:text-2xl">{o.title}</h1>
            <p className="text-sm text-muted">
              {STATE_LABEL[oc.state]}
              {oc.concepts.total > 0 && ` · ${oc.concepts.done}/${oc.concepts.total} concepts read · ${oc.cards.done}/${oc.cards.total} flashcards learned`}
            </p>
          </div>
        </div>
        {oc.concepts.total > 0 && (
          <button type="button" onClick={() => onPick({ kind: 'objective', objective: o.id })} className="self-start rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-accent-fg">
            Study {o.id}
          </button>
        )}
        <Label>Official topics</Label>
        {o.topics.length === 0 && <p className="text-sm text-muted">This objective has no sub-topics in the outline.</p>}
        <ul className="flex flex-col gap-2">
          {o.topics.map((t) => {
            const ts = topicState(kb, t.id, state.read)
            return (
              <li key={t.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
                <span className="w-12 shrink-0 font-mono text-xs text-muted">{t.id}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm leading-snug">{t.title}</span>
                  <span className="text-xs text-muted">
                    {ts.state === 'by-objective'
                      ? 'covered by objective'
                      : `${ts.state === 'covered' ? 'covered' : ts.state === 'partial' ? 'in progress' : 'not started'} · ${ts.count.done}/${ts.count.total}`}
                  </span>
                </span>
                {ts.state === 'covered' && <span className="text-sm font-bold text-success" aria-label="covered">&#10003;</span>}
                {ts.state !== 'by-objective' && <StudyButton onClick={() => onPick({ kind: 'topic', topic: t.id })} label={`Study ${t.id} ${t.title}`} />}
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-6 overflow-y-auto px-4 py-6 md:px-8">
      <a href="#home" className="-mb-2 inline-flex min-h-11 items-center self-start text-sm font-semibold text-muted hover:text-fg">
        &larr; Home
      </a>
      <h1 className="text-3xl md:text-4xl">Coverage</h1>

      <section aria-label="Overall coverage" className="grid gap-3 md:grid-cols-2">
        <div className="d-1 tile flex items-center gap-4 p-4">
          <Ring value={pct(cov.concepts)} size={60} />
          <div className="min-w-0 flex-1">
            <p className="font-display text-2xl font-bold">
              {cov.concepts.done}/{cov.concepts.total}
            </p>
            <p className="text-sm text-muted">concepts read</p>
          </div>
        </div>
        <div className="d-2 tile flex items-center gap-4 p-4">
          <Ring value={pct(cov.cards)} size={60} />
          <div className="min-w-0 flex-1">
            <p className="font-display text-2xl font-bold">
              {cov.cards.done}/{cov.cards.total}
            </p>
            <p className="text-sm text-muted">flashcards learned</p>
          </div>
        </div>
      </section>

      <section aria-label="Exam date" className="rounded-2xl border border-line bg-surface p-4 text-sm">
        <p>
          Exam on <span className="font-bold">{longDate(plan.exam)}</span>
          {daysLeft >= 0 ? ` · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : ' · date passed'}
          <span className="text-muted"> (change it in Me)</span>
        </p>
        <p className="mt-1 text-muted">
          {cov.concepts.total === 0
            ? 'No content available yet.'
            : cov.concepts.done === cov.concepts.total
              ? 'Everything available is read.'
              : projection
                ? `At your current pace, full coverage by ${longDate(projection)}${projection > plan.exam ? ', after your exam date' : ''}.`
                : 'Read a few concepts this week to see a projection.'}
        </p>
      </section>

      <section aria-label="Outline map" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <Label>{`Outline map · ${cov.outline.done}/${cov.outline.total} objectives read`}</Label>
          <Legend />
        </div>
        <ul className="flex flex-col gap-3">
          {kb.outline.domains.map((d) => (
            <li key={d.id} className={`d-${d.number} flex flex-col gap-1.5 md:flex-row md:items-center md:gap-4`}>
              <button type="button" onClick={() => setView({ level: 'domain', domain: d.number })} className="shrink-0 text-left text-sm font-bold md:w-64">
                <span className="text-dc-ink">D{d.number}</span> {d.title}
              </button>
              <div className="flex flex-wrap gap-1.5">
                {d.objectives.map((o) => {
                  const oc = cov.objectives.get(o.id)!
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setView({ level: 'objective', objective: o.id })}
                      aria-label={`${o.id} ${o.title}: ${STATE_LABEL[oc.state]}`}
                      title={`${o.id} ${o.title}`}
                      className={`cell cell-${oc.state} flex h-9 w-12 items-center justify-center text-xs font-bold`}
                    >
                      {o.id}
                    </button>
                  )
                })}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Challenges" className="flex flex-col gap-2 pb-4">
        <Label>Challenges</Label>
        <ul className="flex flex-col gap-2">
          {ch.open.map((c) => (
            <li key={c.id} className="d-1 rounded-2xl border border-line bg-surface p-3">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-semibold">{c.label}</span>
                <span className="text-muted">
                  {c.count.done}/{c.count.total}
                </span>
              </div>
              <Bar done={c.count.done} total={c.count.total} className="mt-2" />
            </li>
          ))}
          {ch.done.map((c) => (
            <li key={`done-${c.id}`} className="flex items-center gap-2 px-3 text-sm text-muted">
              <span className="font-bold text-success" aria-hidden="true">
                &#10003;
              </span>
              <span>
                {c.label} ({c.count.done}/{c.count.total})
              </span>
              <span className="sr-only">completed</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
