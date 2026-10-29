import type { Kb, Objective, OutlineDomain } from '../kb/types'
import type { CardRow } from './db'
import { addDays, startOfDay } from './dates'
import { isLearned } from './srs'

export type CellState = 'empty' | 'not-started' | 'reading' | 'read' | 'mastered'

export interface Count {
  done: number
  total: number
}

export interface ObjectiveCoverage {
  id: string
  domain: number
  concepts: Count
  cards: Count
  state: CellState
}

export interface Coverage {
  objectives: Map<string, ObjectiveCoverage>
  domains: Map<number, { concepts: Count; cards: Count; objectivesRead: Count }>
  concepts: Count
  cards: Count
  outline: Count // objectives fully read, out of all official objectives
}

const MASTERED_SHARE = 0.8

export const pct = (c: Count) => (c.total > 0 ? Math.round((c.done / c.total) * 100) : 0)

export function computeCoverage(kb: Kb, read: Map<string, Date>, cards: Map<string, CardRow>): Coverage {
  const objectives = new Map<string, ObjectiveCoverage>()
  for (const d of kb.outline.domains)
    for (const o of d.objectives)
      objectives.set(o.id, { id: o.id, domain: d.number, concepts: { done: 0, total: 0 }, cards: { done: 0, total: 0 }, state: 'empty' })

  for (const c of kb.concepts) {
    const o = objectives.get(c.objective)
    if (!o) continue
    o.concepts.total++
    if (read.has(c.id)) o.concepts.done++
    for (const fc of kb.flashcardsByConcept.get(c.id) ?? []) {
      o.cards.total++
      if (isLearned(cards.get(fc.id))) o.cards.done++
    }
  }

  const domains = new Map<number, { concepts: Count; cards: Count; objectivesRead: Count }>()
  const outline: Count = { done: 0, total: objectives.size }
  for (const d of kb.outline.domains) domains.set(d.number, { concepts: { done: 0, total: 0 }, cards: { done: 0, total: 0 }, objectivesRead: { done: 0, total: d.objectives.length } })

  for (const o of objectives.values()) {
    if (o.concepts.total === 0) o.state = 'empty'
    else if (o.concepts.done === 0) o.state = 'not-started'
    else if (o.concepts.done < o.concepts.total) o.state = 'reading'
    else if (o.cards.total === 0 || o.cards.done / o.cards.total >= MASTERED_SHARE) o.state = 'mastered'
    else o.state = 'read'
    const d = domains.get(o.domain)!
    d.concepts.done += o.concepts.done
    d.concepts.total += o.concepts.total
    d.cards.done += o.cards.done
    d.cards.total += o.cards.total
    if (o.state === 'read' || o.state === 'mastered') {
      d.objectivesRead.done++
      outline.done++
    }
  }

  const sum = (pick: (x: { concepts: Count; cards: Count }) => Count): Count => {
    const r = { done: 0, total: 0 }
    for (const d of domains.values()) {
      r.done += pick(d).done
      r.total += pick(d).total
    }
    return r
  }
  return { objectives, domains, concepts: sum((d) => d.concepts), cards: sum((d) => d.cards), outline }
}

export type TopicState = 'covered' | 'partial' | 'open' | 'by-objective'

export function topicState(kb: Kb, topicId: string, read: Map<string, Date>): { state: TopicState; count: Count } {
  const tagged = kb.concepts.filter((c) => c.topic === topicId)
  if (tagged.length === 0) return { state: 'by-objective', count: { done: 0, total: 0 } }
  const done = tagged.filter((c) => read.has(c.id)).length
  return { state: done === tagged.length ? 'covered' : done > 0 ? 'partial' : 'open', count: { done, total: tagged.length } }
}

function allObjectives(kb: Kb): { domain: OutlineDomain; objective: Objective }[] {
  return kb.outline.domains.flatMap((domain) => domain.objectives.map((objective) => ({ domain, objective })))
}

// First objective (in outline order, starting at `from`) that has content not fully read yet.
export function nextObjective(kb: Kb, cov: Coverage, from?: string, skipFrom = false): Objective | undefined {
  const list = allObjectives(kb)
  const start = Math.max(0, list.findIndex((x) => x.objective.id === from))
  for (let i = 0; i < list.length; i++) {
    if (skipFrom && i === 0 && from) continue
    const { objective } = list[(start + i) % list.length]!
    const c = cov.objectives.get(objective.id)
    if (c && (c.state === 'not-started' || c.state === 'reading')) return objective
  }
  return undefined
}

export interface Challenge {
  id: string
  label: string
  count: Count
}

// The objective to read next: the focus if it is already in progress, otherwise the first
// objective with unread content in outline order, so falling behind the plan never skips material.
function readingTarget(cov: Coverage, focusObjective?: string): ObjectiveCoverage | undefined {
  const focus = focusObjective ? cov.objectives.get(focusObjective) : undefined
  if (focus?.state === 'reading') return focus
  return [...cov.objectives.values()].find((o) => o.state === 'not-started' || o.state === 'reading')
}

// Challenges are derived from the data only: the next objective to read, its flashcards,
// one breadth goal and the whole outline. Completed objectives are listed as quiet checks.
export function challenges(cov: Coverage, focusObjective?: string): { open: Challenge[]; done: Challenge[] } {
  const open: Challenge[] = []
  const done: Challenge[] = []
  const focus = readingTarget(cov, focusObjective)

  if (focus && focus.concepts.total > 0 && focus.concepts.done < focus.concepts.total)
    open.push({ id: `read-${focus.id}`, label: `Read all of ${focus.id}`, count: focus.concepts })

  const cardsTarget = [...cov.objectives.values()]
    .filter((o) => o.concepts.done > 0 && o.cards.total > 0 && o.cards.done < o.cards.total)
    .sort((a, b) => b.concepts.done / b.concepts.total - a.concepts.done / a.concepts.total)[0]
  if (cardsTarget) open.push({ id: `cards-${cardsTarget.id}`, label: `Learn all flashcards of ${cardsTarget.id}`, count: cardsTarget.cards })

  // Breadth: touch every domain first, then finish the domain you are furthest into.
  const withContent = [...cov.domains].filter(([, d]) => d.concepts.total > 0)
  const touched = { done: withContent.filter(([, d]) => d.concepts.done > 0).length, total: withContent.length }
  if (touched.done < touched.total) {
    open.push({ id: 'breadth', label: 'Read something in every domain', count: touched })
  } else {
    const best = withContent
      .filter(([, d]) => d.concepts.done < d.concepts.total)
      .sort(([, a], [, b]) => b.concepts.done / b.concepts.total - a.concepts.done / a.concepts.total)[0]
    if (best) open.push({ id: `domain-${best[0]}`, label: `Full coverage: Domain ${best[0]}`, count: best[1].concepts })
  }
  open.push({ id: 'outline', label: 'Full outline coverage', count: cov.outline })

  for (const o of cov.objectives.values())
    if (o.state === 'read' || o.state === 'mastered') done.push({ id: `read-${o.id}`, label: `Read all of ${o.id}`, count: o.concepts })
  if (touched.total > 0 && touched.done === touched.total) done.push({ id: 'breadth', label: 'Read something in every domain', count: touched })
  for (const [n, dc] of cov.domains)
    if (dc.concepts.total > 0 && dc.concepts.done === dc.concepts.total)
      done.push({ id: `domain-${n}`, label: `Full coverage: Domain ${n}`, count: dc.concepts })
  if (cov.outline.done === cov.outline.total) done.push({ id: 'outline', label: 'Full outline coverage', count: cov.outline })

  return { open: open.filter((c) => !done.some((x) => x.id === c.id)), done }
}

// Projects when every available concept will be read, from the reading rate of the last 7 days.
export function projectFullCoverage(read: Map<string, Date>, remaining: number, now: Date): Date | null {
  if (remaining <= 0) return startOfDay(now)
  const since = addDays(startOfDay(now), -6).getTime()
  let recent = 0
  for (const at of read.values()) if (at.getTime() >= since) recent++
  if (recent === 0) return null
  return addDays(startOfDay(now), Math.ceil(remaining / (recent / 7)))
}

