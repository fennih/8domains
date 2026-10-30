import { AUTH_ENABLED } from './auth'
import { db, type AttemptRow, type Change, type CardRow, type ReviewRow, type SeenRow, type Settings, type SyncMeta } from './db'

// Fired after local writes so the sync runner can push them soon.
export const outboxEvents = new EventTarget()

// Fields shared across devices; scope (what is open in the feed) stays per device.
export type SyncedSettings = Pick<Settings, 'firstLaunch' | 'examDate' | 'theme' | 'animations' | 'legendsSeen'>

// Keys are derived from content, so the same review imported on two devices is one row.
export const reviewKey = (r: Pick<ReviewRow, 'cardId' | 'at'>) => `${r.cardId}-${r.at.getTime()}`
export const attemptKey = (a: Pick<AttemptRow, 'questionId' | 'at'>) => `${a.questionId}-${a.at.getTime()}`

export const cardChange = (c: CardRow): Change => ({ kind: 'card', key: c.id, payload: JSON.stringify(c), at: c.last_review?.getTime() ?? 0 })

export const reviewChange = (r: ReviewRow): Change => ({
  kind: 'review',
  key: reviewKey(r),
  payload: JSON.stringify({ cardId: r.cardId, rating: r.rating, at: r.at }),
  at: r.at.getTime(),
})

export const attemptChange = (a: AttemptRow): Change => ({
  kind: 'attempt',
  key: attemptKey(a),
  payload: JSON.stringify({ questionId: a.questionId, domain: a.domain, chosen: a.chosen, correct: a.correct, at: a.at }),
  at: a.at.getTime(),
})

export const seenChange = (kind: 'seen' | 'read', s: SeenRow): Change => ({
  kind,
  key: s.conceptId,
  payload: JSON.stringify(s),
  at: s.at.getTime(),
})

export function settingsChange(s: Settings, at: number): Change {
  const synced: SyncedSettings = {
    firstLaunch: s.firstLaunch,
    examDate: s.examDate,
    theme: s.theme,
    animations: s.animations,
    legendsSeen: s.legendsSeen,
  }
  return { kind: 'settings', key: 'settings', payload: JSON.stringify(synced), at }
}

export const touchesSyncedSettings = (patch: Partial<Settings>) => Object.keys(patch).some((k) => k !== 'scope')

// Call inside a transaction that includes db.outbox. Without accounts nothing is queued.
export async function enqueue(changes: Change[]): Promise<void> {
  if (!AUTH_ENABLED || changes.length === 0) return
  await db.outbox.bulkAdd(changes)
}

export function notifyOutbox() {
  if (AUTH_ENABLED) outboxEvents.dispatchEvent(new Event('change'))
}

export const emptySyncMeta = (): SyncMeta => ({ key: 'sync', userId: null, cursor: 0, settingsAt: 0 })
