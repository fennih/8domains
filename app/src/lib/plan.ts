import type { Outline } from '../kb/types'
import { addDays, daysBetween, startOfDay } from './dates'

export interface ObjectiveSlot {
  id: string
  title: string
  start: Date
  end: Date
}

export interface Phase {
  kind: 'domain' | 'review'
  domain?: number
  title: string
  start: Date
  end: Date // exclusive
  objectives: ObjectiveSlot[]
}

export interface Plan {
  start: Date
  exam: Date
  totalDays: number
  phases: Phase[]
  current: number // index into phases, -1 if no phase is active
  focus: string[] // objective ids, current objective first
}

const MIN_REVIEW_DAYS = 7
const REVIEW_SHARE = 0.2

// Splits [start, start + days) into consecutive slots proportional to weights,
// using cumulative boundaries so rounding never drifts.
function split(start: Date, days: number, weights: number[]): [Date, Date][] {
  const total = weights.reduce((a, b) => a + b, 0) || 1
  const out: [Date, Date][] = []
  let acc = 0
  for (const w of weights) {
    const from = Math.round((acc / total) * days)
    acc += w
    const to = Math.round((acc / total) * days)
    out.push([addDays(start, from), addDays(start, to)])
  }
  return out
}

export function buildPlan(outline: Outline, startDate: Date, examDate: Date, now: Date): Plan {
  const start = startOfDay(startDate)
  const exam = startOfDay(examDate)
  const totalDays = Math.max(1, daysBetween(start, exam))
  const reviewDays = Math.min(totalDays, Math.max(MIN_REVIEW_DAYS, Math.round(totalDays * REVIEW_SHARE)))
  const studyDays = totalDays - reviewDays

  const domains = [...outline.domains].sort((a, b) => a.number - b.number)
  const phases: Phase[] = []
  if (studyDays > 0) {
    const domainSlots = split(start, studyDays, domains.map((d) => d.weight))
    domains.forEach((d, i) => {
      const [from, to] = domainSlots[i]!
      const span = daysBetween(from, to)
      // Larger objectives (more official sub-topics) get proportionally more days.
      const objSlots = split(from, span, d.objectives.map((o) => o.topics.length + 1))
      phases.push({
        kind: 'domain',
        domain: d.number,
        title: d.title,
        start: from,
        end: to,
        objectives: d.objectives.map((o, j) => ({ id: o.id, title: o.title, start: objSlots[j]![0], end: objSlots[j]![1] })),
      })
    })
  }
  phases.push({
    kind: 'review',
    title: 'Review and mock exams',
    start: addDays(start, studyDays),
    end: exam,
    objectives: [],
  })

  const today = startOfDay(now)
  let current = phases.findIndex((p) => p.start <= today && today < p.end && p.end > p.start)
  if (current === -1 && today >= exam) current = phases.length - 1

  let focus: string[] = []
  const phase = phases[current]
  if (phase?.kind === 'domain') {
    const objs = phase.objectives
    let idx = objs.findIndex((o) => o.start <= today && today < o.end)
    if (idx === -1) idx = 0
    focus = [...objs.slice(idx), ...objs.slice(0, idx)].map((o) => o.id)
  }

  return { start, exam, totalDays, phases, current, focus }
}

