import { z } from 'zod'
import type { CardRow, ReviewRow } from './db'
import { MAX_IMPORT_BYTES, type BackupData } from './backup'

// Zod would otherwise probe `new Function`, which the strict CSP reports as a violation.
z.config({ jitless: true })

const MAX_ROWS = 200_000

const id = z.string().regex(/^[a-z0-9-]{1,120}$/)
const date = z
  .string()
  .max(40)
  .pipe(z.coerce.date())
  .refine((d) => !Number.isNaN(d.getTime()), 'invalid date')
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const num = z.number().finite()

const card = z.strictObject({
  id,
  due: date,
  stability: num,
  difficulty: num,
  elapsed_days: num,
  scheduled_days: num,
  learning_steps: z.number().int().min(0),
  reps: z.number().int().min(0),
  lapses: z.number().int().min(0),
  state: z.number().int().min(0).max(3),
  last_review: date.optional(),
})

const reviewRow = z.strictObject({
  cardId: id,
  rating: z.number().int().min(1).max(4),
  at: date,
})

const attempt = z.strictObject({
  questionId: id,
  domain: z.number().int().min(1).max(8),
  chosen: z.number().int().min(0).max(3),
  correct: z.boolean(),
  at: date,
})

const seen = z.strictObject({ conceptId: id, at: date })

const settingsV1 = z.strictObject({
  firstLaunch: isoDay,
  examDate: isoDay,
  newPerDay: z.number().int().min(1).max(100),
  theme: z.enum(['system', 'dark', 'light']),
})

const objectiveId = z.string().regex(/^[1-8]\.[0-9]{1,2}$/)
const scope = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('mix') }),
  z.strictObject({ kind: z.literal('due') }),
  z.strictObject({ kind: z.literal('domain'), domain: z.number().int().min(1).max(8) }),
  z.strictObject({ kind: z.literal('domain-mix'), domain: z.number().int().min(1).max(8) }),
  z.strictObject({ kind: z.literal('objective'), objective: objectiveId }),
  z.strictObject({ kind: z.literal('topic'), topic: z.string().regex(/^[1-8]\.[0-9]{1,2}\.[0-9]{1,2}$/) }),
])

const settingsV2 = z.strictObject({
  firstLaunch: isoDay,
  examDate: isoDay,
  theme: z.enum(['system', 'dark', 'light']),
  animations: z.boolean(),
  scope: scope.nullable(),
  // Added after version 2 shipped: optional so older backups still import.
  legendsSeen: z.array(z.enum(['y', 'g', 'b'])).max(3).optional(),
})

const rows = {
  exportedAt: date,
  cards: z.array(card).max(MAX_ROWS),
  reviews: z.array(reviewRow).max(MAX_ROWS),
  attempts: z.array(attempt).max(MAX_ROWS),
  seen: z.array(seen).max(MAX_ROWS),
}

const backupSchema = z.discriminatedUnion('version', [
  z.strictObject({ app: z.literal('cissp-feed'), version: z.literal(1), settings: settingsV1, ...rows }),
  z.strictObject({ app: z.literal('cissp-feed'), version: z.literal(2), settings: settingsV2, read: z.array(seen).max(MAX_ROWS), ...rows }),
])

export async function parseBackup(file: File): Promise<BackupData> {
  if (file.size > MAX_IMPORT_BYTES) throw new Error('File is larger than 5 MB.')
  const text = await file.text()
  if (text.length > MAX_IMPORT_BYTES) throw new Error('File is larger than 5 MB.')
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('File is not valid JSON.')
  }
  const result = backupSchema.safeParse(raw)
  if (!result.success) {
    const issue = result.error.issues[0]
    throw new Error(`Not a valid 8Domains backup${issue ? ` (${issue.path.join('.') || 'root'}: ${issue.message})` : ''}.`)
  }
  const d = result.data
  // Version 1 had a daily cap on new concepts and no read tracking.
  const settings =
    d.version === 1
      ? { firstLaunch: d.settings.firstLaunch, examDate: d.settings.examDate, theme: d.settings.theme, animations: true, scope: null, legendsSeen: [] }
      : { ...d.settings, legendsSeen: [...new Set(d.settings.legendsSeen ?? [])] }
  return {
    settings,
    cards: d.cards as CardRow[],
    reviews: d.reviews as ReviewRow[],
    attempts: d.attempts,
    seen: d.seen,
    read: d.version === 2 ? d.read : [],
  }
}
