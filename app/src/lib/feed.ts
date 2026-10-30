import type { Concept, Flashcard, Kb, Priority } from '../kb/types'
import { conceptInScope, questionInScope, tableInScope, type Scope } from './scope'
import { domainStats, weakness, type ProgressSnapshot } from './stats'

export type FeedKind = 'story' | 'flashcard' | 'quiz' | 'table' | 'mnemonic' | 'trap'

export interface FeedItem {
  key: string // `${kind}:${id}`, unique within a batch
  kind: FeedKind
  id: string // concept id for story/mnemonic/trap, otherwise the item id
}

export interface FeedInput {
  kb: Kb
  progress: ProgressSnapshot
  scope: Scope
  now: Date
  shown: Set<string> // keys already shown earlier in this session
  seed: number
  size?: number
}

export interface Batch {
  items: FeedItem[]
  // True when the scope has no unread concept left to introduce: the feed ends after this batch.
  exhausted: boolean
}

const BATCH_SIZE = 20
const DUE_SHARE = 0.4
const QUIZ_EVERY = 5
const EXTRA_EVERY = 7
const CARDS_AFTER_STORY = 2
const CARD_DELAY = 2
const SHOWN_PENALTY = 0.3

const PRIORITY_RANK: Record<Priority, number> = { core: 0, important: 1, nice: 2 }
const PRIORITY_WEIGHT: Record<Priority, number> = { core: 3, important: 2, nice: 1 }

export const itemKey = (kind: FeedKind, id: string) => `${kind}:${id}`
const item = (kind: FeedKind, id: string): FeedItem => ({ key: itemKey(kind, id), kind, id })

function rngFrom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pickWeighted<T>(items: T[], weight: (t: T) => number, rng: () => number): T | undefined {
  const weights = items.map((t) => Math.max(0, weight(t)))
  const total = weights.reduce((a, b) => a + b, 0)
  if (total <= 0) return undefined
  let r = rng() * total
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}

function objectiveWeakness(kb: Kb, progress: ProgressSnapshot): (objective: string) => number {
  const stats = new Map<string, { correct: number; attempts: number; lapses: number; reps: number }>()
  const get = (o: string) => {
    let s = stats.get(o)
    if (!s) stats.set(o, (s = { correct: 0, attempts: 0, lapses: 0, reps: 0 }))
    return s
  }
  for (const a of progress.attempts) {
    const q = kb.questionById.get(a.questionId)
    if (!q) continue
    const s = get(q.objective)
    s.attempts++
    if (a.correct) s.correct++
  }
  for (const [id, card] of progress.cards) {
    const fc = kb.flashcardById.get(id)
    const c = fc && kb.conceptById.get(fc.conceptId)
    if (!c) continue
    const s = get(c.objective)
    s.lapses += card.lapses
    s.reps += card.reps
  }
  return (o) => weakness(stats.get(o))
}

export function buildBatch(input: FeedInput): Batch {
  const { kb, progress, now, shown, scope } = input
  const size = input.size ?? BATCH_SIZE
  const rng = rngFrom(input.seed)
  const used = new Set<string>()
  const free = (key: string) => !used.has(key)
  const out: FeedItem[] = []
  const byDue = (a: Flashcard, b: Flashcard) => progress.cards.get(a.id)!.due.getTime() - progress.cards.get(b.id)!.due.getTime()
  const isDue = (fc: Flashcard) => {
    const card = progress.cards.get(fc.id)
    return card !== undefined && card.due <= now
  }

  // Review scope: every due card, most overdue first, and nothing else.
  if (scope.kind === 'due') {
    const due = kb.flashcards.filter((fc) => isDue(fc) && !shown.has(itemKey('flashcard', fc.id))).sort(byDue)
    const items = due.slice(0, size).map((fc) => item('flashcard', fc.id))
    return { items, exhausted: due.length <= size }
  }

  const stats = domainStats(kb, progress)
  const examWeight = new Map(kb.outline.domains.map((d) => [d.number, d.weight]))
  const domainWeight = (d: number) => (examWeight.get(d) ?? 1) * weakness(stats.get(d))
  const shownFactor = (key: string) => (shown.has(key) ? SHOWN_PENALTY : 1)
  const objOrder = (o: string) => kb.objectiveOrder.get(o) ?? 9999
  const scopeConceptIds = new Set(kb.concepts.filter((c) => conceptInScope(scope, c)).map((c) => c.id))
  const inScopeCard = (fc: Flashcard) => scope.kind === 'mix' || scopeConceptIds.has(fc.conceptId)

  // (a) Due flashcards of the scope, most overdue first, capped so reading stays the main thread.
  const due = kb.flashcards.filter((fc) => inScopeCard(fc) && isDue(fc)).sort(byDue)
  const dueCap = Math.floor(size * DUE_SHARE)

  // (b) Unread concepts of the scope, in outline order (core first within an objective).
  // "Mix everything" draws domains by exam weight x weakness instead.
  const unread = kb.concepts.filter(
    (c) => scopeConceptIds.has(c.id) && !progress.read.has(c.id) && !shown.has(itemKey('story', c.id)),
  )
  const outlineOrder = (a: Concept, b: Concept) =>
    objOrder(a.objective) - objOrder(b.objective) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  let stories: Concept[]
  if (scope.kind === 'domain-mix') {
    // Shuffle across objectives: core concepts and weak objectives come up more often.
    const objWeak = objectiveWeakness(kb, progress)
    const pool = [...unread]
    stories = []
    while (pool.length > 0) {
      const c = pickWeighted(pool, (c) => PRIORITY_WEIGHT[c.priority] * objWeak(c.objective), rng)!
      pool.splice(pool.indexOf(c), 1)
      stories.push(c)
    }
  } else if (scope.kind === 'mix') {
    const byDomain = new Map<number, Concept[]>()
    for (const c of [...unread].sort(outlineOrder)) {
      const list = byDomain.get(c.domain)
      if (list) list.push(c)
      else byDomain.set(c.domain, [c])
    }
    stories = []
    while (byDomain.size > 0) {
      const d = pickWeighted([...byDomain.keys()], domainWeight, rng)!
      const list = byDomain.get(d)!
      stories.push(list.shift()!)
      if (list.length === 0) byDomain.delete(d)
    }
  } else {
    stories = [...unread].sort(outlineOrder)
  }

  const known = (conceptId: string) => progress.read.has(conceptId) || used.has(itemKey('story', conceptId))
  const pending: { fc: Flashcard; readyAt: number }[] = []
  const pendingIds = new Set<string>()

  // (c) Quiz from the scope, only on concepts already read or shown earlier in the batch:
  // weak domains, wrong or unattempted questions weigh more.
  const lastAttempt = new Map<string, boolean>()
  for (const a of progress.attempts) lastAttempt.set(a.questionId, a.correct)
  const pickQuiz = (): FeedItem | undefined => {
    const q = pickWeighted(
      kb.questions.filter((q) => questionInScope(scope, q) && q.conceptIds.every(known) && free(itemKey('quiz', q.id))),
      (q) => {
        const last = lastAttempt.get(q.id)
        const status = last === undefined ? 1.5 : last ? 0.4 : 2
        return domainWeight(q.domain) * status * shownFactor(itemKey('quiz', q.id))
      },
      rng,
    )
    return q && item('quiz', q.id)
  }

  // (d) Extras alternate between scope tables and recall pills (mnemonic/trap) of concepts already read.
  let extraTurn = rng() < 0.5 ? 0 : 1
  const pickTable = (): FeedItem | undefined => {
    const t = pickWeighted(
      kb.tables.filter((t) => tableInScope(scope, t) && free(itemKey('table', t.id))),
      (t) => PRIORITY_WEIGHT[t.priority] * shownFactor(itemKey('table', t.id)),
      rng,
    )
    return t && item('table', t.id)
  }
  const pickRecall = (): FeedItem | undefined => {
    const options: FeedItem[] = []
    for (const c of kb.concepts) {
      if (!scopeConceptIds.has(c.id) || !progress.read.has(c.id)) continue
      if (c.mnemonic) options.push(item('mnemonic', c.id))
      if (c.traps?.length) options.push(item('trap', c.id))
    }
    return pickWeighted(
      options.filter((o) => free(o.key)),
      (o) => PRIORITY_WEIGHT[kb.conceptById.get(o.id)!.priority] * shownFactor(o.key),
      rng,
    )
  }
  const pickExtra = (): FeedItem | undefined => {
    extraTurn = 1 - extraTurn
    return extraTurn === 0 ? (pickTable() ?? pickRecall()) : (pickRecall() ?? pickTable())
  }

  // Filler: unreviewed cards of known concepts, then early practice of cards due soonest.
  const preferUnshown = (items: FeedItem[]) => [...items.filter((i) => !shown.has(i.key)), ...items.filter((i) => shown.has(i.key))]
  const pickFiller = (): FeedItem | undefined => {
    const unreviewed = kb.flashcards
      .filter((fc) => inScopeCard(fc) && !progress.cards.has(fc.id) && known(fc.conceptId) && !pendingIds.has(fc.id))
      .map((fc) => item('flashcard', fc.id))
    const ahead = kb.flashcards
      .filter((fc) => inScopeCard(fc) && progress.cards.has(fc.id))
      .sort(byDue)
      .map((fc) => item('flashcard', fc.id))
    for (const list of [unreviewed, ahead]) {
      const hit = preferUnshown(list).find((i) => free(i.key))
      if (hit) return hit
    }
    return undefined
  }

  let dueTaken = 0
  const nextDue = (): FeedItem | undefined => {
    while (due.length > 0 && dueTaken < dueCap) {
      const fc = due.shift()!
      if (free(itemKey('flashcard', fc.id))) {
        dueTaken++
        return item('flashcard', fc.id)
      }
    }
    return undefined
  }
  const nextStory = (): FeedItem | undefined => {
    const c = stories.shift()
    if (!c) return undefined
    const p = out.length
    ;(kb.flashcardsByConcept.get(c.id) ?? [])
      .filter((fc) => !progress.cards.has(fc.id))
      .slice(0, CARDS_AFTER_STORY)
      .forEach((fc, i) => {
        pending.push({ fc, readyAt: p + CARD_DELAY + i })
        pendingIds.add(fc.id)
      })
    return item('story', c.id)
  }
  const nextPending = (ignoreDelay: boolean): FeedItem | undefined => {
    const i = pending.findIndex((x) => ignoreDelay || x.readyAt <= out.length)
    if (i === -1) return undefined
    return item('flashcard', pending.splice(i, 1)[0]!.fc.id)
  }

  // Slot order: quiz every 5th, extra every 7th, a story's own cards once their short delay
  // has passed, due reviews on even slots, then the next story.
  // Once the stories run out the batch ends, so the feed can show its end-of-scope card.
  while (out.length < size) {
    const p = out.length
    const next =
      ((p + 1) % QUIZ_EVERY === 0 ? pickQuiz() : undefined) ??
      ((p + 1) % EXTRA_EVERY === 0 ? pickExtra() : undefined) ??
      nextPending(false) ??
      (p % 2 === 0 ? nextDue() : undefined) ??
      nextStory() ??
      nextPending(true) ??
      nextDue()
    if (!next || used.has(next.key)) break
    used.add(next.key)
    out.push(next)
  }

  const exhausted = stories.length === 0
  // A scope with nothing unread still offers practice before the end card.
  if (exhausted && out.length < 4) {
    for (const pick of [pickFiller, pickQuiz, pickExtra, pickFiller]) {
      const extra = pick()
      if (extra && free(extra.key)) {
        used.add(extra.key)
        out.push(extra)
      }
    }
  }
  return { items: out, exhausted }
}
