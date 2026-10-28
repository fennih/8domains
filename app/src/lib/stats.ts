import type { Kb } from '../kb/types'
import { flashcardDomain } from '../kb/types'
import type { AttemptRow, CardRow, ReviewRow } from './db'
import { addDays, toIsoDate, startOfDay } from './dates'
import { isLearned } from './srs'

export interface DomainStats {
  domain: number
  concepts: number
  read: number
  cards: number
  learned: number
  reps: number
  lapses: number
  attempts: number
  correct: number
}

export interface ProgressSnapshot {
  cards: Map<string, CardRow>
  seen: Map<string, Date>
  read: Map<string, Date>
  attempts: AttemptRow[]
  reviews: ReviewRow[]
}

export function domainStats(kb: Kb, p: ProgressSnapshot): Map<number, DomainStats> {
  const out = new Map<number, DomainStats>()
  for (const d of kb.outline.domains) {
    out.set(d.number, { domain: d.number, concepts: 0, read: 0, cards: 0, learned: 0, reps: 0, lapses: 0, attempts: 0, correct: 0 })
  }
  for (const c of kb.concepts) {
    const s = out.get(c.domain)
    if (!s) continue
    s.concepts++
    if (p.read.has(c.id)) s.read++
  }
  for (const fc of kb.flashcards) {
    const s = out.get(flashcardDomain(fc))
    if (!s) continue
    s.cards++
    const card = p.cards.get(fc.id)
    if (card) {
      s.reps += card.reps
      s.lapses += card.lapses
      if (isLearned(card)) s.learned++
    }
  }
  for (const a of p.attempts) {
    const s = out.get(a.domain)
    if (!s) continue
    s.attempts++
    if (a.correct) s.correct++
  }
  return out
}

// Neutral = 1. Weak domains (low quiz accuracy, many lapses) go up to 2, strong ones down to 0.5.
// Accuracy is smoothed toward 70% so a couple of answers do not swing the feed.
export function weakness(s: Pick<DomainStats, 'correct' | 'attempts' | 'lapses' | 'reps'> | undefined): number {
  if (!s) return 1
  const prior = 0.7
  const acc = (s.correct + prior * 3) / (s.attempts + 3)
  const lapseRate = s.lapses / (s.reps + 5)
  return Math.min(2, Math.max(0.5, 1 + (prior - acc) * 2 + lapseRate * 2))
}

export function accuracy(s: DomainStats | undefined): number | null {
  if (!s || s.attempts === 0) return null
  return s.correct / s.attempts
}

export function dueCount(cards: Map<string, CardRow>, kb: Kb, until: Date): number {
  let n = 0
  for (const c of cards.values()) if (c.due <= until && kb.flashcardById.has(c.id)) n++
  return n
}

export function activityDays(p: ProgressSnapshot): Set<string> {
  const days = new Set<string>()
  for (const r of p.reviews) days.add(toIsoDate(r.at))
  for (const a of p.attempts) days.add(toIsoDate(a.at))
  for (const at of p.seen.values()) days.add(toIsoDate(at))
  for (const at of p.read.values()) days.add(toIsoDate(at))
  return days
}

export function streak(p: ProgressSnapshot, now: Date): number {
  const days = activityDays(p)
  let d = startOfDay(now)
  if (!days.has(toIsoDate(d))) d = addDays(d, -1)
  let n = 0
  while (days.has(toIsoDate(d))) {
    n++
    d = addDays(d, -1)
  }
  return n
}

