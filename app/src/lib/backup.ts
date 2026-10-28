import type { AttemptRow, CardRow, ReviewRow, SeenRow, Settings } from './db'

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024

export interface BackupData {
  settings: Settings
  cards: CardRow[]
  reviews: ReviewRow[]
  attempts: AttemptRow[]
  seen: SeenRow[]
  read: SeenRow[]
}

export function serializeBackup(data: BackupData): string {
  const payload = {
    app: 'cissp-feed',
    version: 2,
    exportedAt: new Date(),
    settings: data.settings,
    cards: data.cards,
    reviews: data.reviews.map(({ cardId, rating, at }) => ({ cardId, rating, at })),
    attempts: data.attempts.map(({ questionId, domain, chosen, correct, at }) => ({ questionId, domain, chosen, correct, at })),
    seen: data.seen,
    read: data.read,
  }
  return JSON.stringify(payload)
}
