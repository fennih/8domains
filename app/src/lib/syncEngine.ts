import { z } from 'zod'
import { db, type AttemptRow, type CardRow, type ReviewRow, type Settings, type SyncMeta } from './db'
import { attempt, card, isoDay, reviewRow, seen } from './importBackup'
import { attemptChange, cardChange, emptySyncMeta, enqueue, reviewChange, seenChange, settingsChange, type SyncedSettings } from './outbox'
import { defaultSettings } from './progress'

const API = `${import.meta.env.BASE_URL}api/sync`
const PUSH_BATCH = 500

const syncedSettings = z.object({
  firstLaunch: isoDay,
  examDate: isoDay,
  theme: z.enum(['system', 'dark', 'light']),
  animations: z.boolean(),
  legendsSeen: z.array(z.enum(['y', 'g', 'b'])).max(3),
})

const pulledRow = z.object({
  seq: z.number().int().positive(),
  kind: z.enum(['card', 'review', 'attempt', 'seen', 'read', 'settings', 'reset']),
  key: z.string().max(160),
  payload: z.string().max(4096),
  at: z.number().int(),
})
type PulledRow = z.infer<typeof pulledRow>

const pullResponse = z.object({ rows: z.array(pulledRow).max(1000), next: z.number().int().nullable() })
const resetResponse = z.object({ seq: z.number().int().positive() })

export type GetToken = () => Promise<string | null>

export class SyncAuthError extends Error {}

async function call(getToken: GetToken, method: 'GET' | 'POST' | 'DELETE', query = '', body?: unknown): Promise<unknown> {
  const token = await getToken()
  if (!token) throw new SyncAuthError('Not signed in')
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  // The bearer token is the only credential: cookies are left out so the API cannot be driven cross-site.
  const res = await fetch(API + query, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'omit',
    cache: 'no-store',
  })
  if (res.status === 401) throw new SyncAuthError('Session expired')
  if (!res.ok) throw new Error(`Sync failed (${res.status})`)
  return res.json()
}

const progressTables = () => [db.cards, db.reviews, db.attempts, db.seen, db.read, db.settings, db.outbox, db.meta]

async function readMeta(): Promise<SyncMeta> {
  return (await db.meta.get('sync')) ?? emptySyncMeta()
}

// Drops all study data on this device; the device-only scope survives so the open feed is not lost.
async function wipeLocal() {
  const scope = (await db.settings.get('settings'))?.value.scope ?? null
  await Promise.all([db.cards.clear(), db.reviews.clear(), db.attempts.clear(), db.seen.clear(), db.read.clear(), db.outbox.clear()])
  await db.settings.put({ key: 'settings', value: { ...defaultSettings(), scope } })
  await db.meta.update('sync', { settingsAt: 0 })
}

// Queues every local row, so a device that never synced (or just imported a backup) merges into the account.
async function enqueueAll(settingsAt: number) {
  const [cards, reviews, attempts, seenRows, readRows, settings] = await Promise.all([
    db.cards.toArray(),
    db.reviews.toArray(),
    db.attempts.toArray(),
    db.seen.toArray(),
    db.read.toArray(),
    db.settings.get('settings'),
  ])
  await enqueue([
    ...cards.map(cardChange),
    ...reviews.map(reviewChange),
    ...attempts.map(attemptChange),
    ...seenRows.map((s) => seenChange('seen', s)),
    ...readRows.map((s) => seenChange('read', s)),
    ...(settings ? [settingsChange(settings.value, settingsAt)] : []),
  ])
}

function parsePayload<T>(schema: z.ZodType<T>, payload: string): T | null {
  try {
    const result = schema.safeParse(JSON.parse(payload))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

const sameSettings = (a: SyncedSettings, b: SyncedSettings) =>
  a.firstLaunch === b.firstLaunch &&
  a.examDate === b.examDate &&
  a.theme === b.theme &&
  a.animations === b.animations &&
  a.legendsSeen.length === b.legendsSeen.length &&
  a.legendsSeen.every((c) => b.legendsSeen.includes(c))

// Settings merge per field: the newer write wins, except the earliest first launch and the union of seen legends.
async function applySettings(row: PulledRow, remote: SyncedSettings, meta: SyncMeta): Promise<boolean> {
  const local: Settings = (await db.settings.get('settings'))?.value ?? defaultSettings()
  const firstLaunch = local.firstLaunch < remote.firstLaunch ? local.firstLaunch : remote.firstLaunch
  const legendsSeen = [...new Set([...local.legendsSeen, ...remote.legendsSeen])]
  const remoteWins = row.at >= meta.settingsAt
  const next: Settings = remoteWins
    ? { ...local, ...remote, firstLaunch, legendsSeen }
    : { ...local, firstLaunch, legendsSeen }
  let settingsAt = remoteWins ? row.at : meta.settingsAt
  // This device knows something the account does not: push the merge back with a newer stamp.
  if (!sameSettings(next, remote)) {
    settingsAt = Math.max(settingsAt, row.at) + 1
    await enqueue([settingsChange(next, settingsAt)])
  }
  meta.settingsAt = settingsAt
  await db.meta.update('sync', { settingsAt })
  if (sameSettings(next, local)) return false
  await db.settings.put({ key: 'settings', value: next })
  return true
}

async function applyRow(row: PulledRow, meta: SyncMeta, firstPull: boolean): Promise<boolean> {
  switch (row.kind) {
    case 'reset':
      // A device that just pushed everything from cursor 0 already holds the post-reset state.
      if (firstPull) return false
      await wipeLocal()
      meta.settingsAt = 0
      return true
    case 'card': {
      const c = parsePayload(card, row.payload) as CardRow | null
      if (!c || c.id !== row.key) return false
      const local = await db.cards.get(c.id)
      if (local && (local.last_review?.getTime() ?? 0) >= (c.last_review?.getTime() ?? 0)) return false
      await db.cards.put(c)
      return true
    }
    case 'review': {
      const r = parsePayload(reviewRow, row.payload) as ReviewRow | null
      if (!r || (await db.reviews.where('[cardId+at]').equals([r.cardId, r.at]).count())) return false
      await db.reviews.add(r)
      return true
    }
    case 'attempt': {
      const a = parsePayload(attempt, row.payload) as AttemptRow | null
      if (!a || (await db.attempts.where('[questionId+at]').equals([a.questionId, a.at]).count())) return false
      await db.attempts.add(a)
      return true
    }
    case 'seen':
    case 'read': {
      const s = parsePayload(seen, row.payload)
      const table = row.kind === 'seen' ? db.seen : db.read
      if (!s || (await table.get(s.conceptId))) return false
      await table.put(s)
      return true
    }
    case 'settings': {
      const s = parsePayload(syncedSettings, row.payload)
      return s ? applySettings(row, s, meta) : false
    }
  }
}

// Pushes the outbox, then pulls everything newer than the cursor. Returns true when local data changed.
export async function runSync(userId: string, getToken: GetToken): Promise<boolean> {
  let changed = false
  let meta = await readMeta()

  if (meta.userId !== userId) {
    const otherAccount = meta.userId !== null
    await db.transaction('rw', progressTables(), async () => {
      // Data left by a different account must not be merged into this one.
      if (otherAccount) await wipeLocal()
      meta = { ...emptySyncMeta(), userId, settingsAt: otherAccount ? 0 : meta.settingsAt }
      await db.meta.put(meta)
      await enqueueAll(meta.settingsAt)
    })
    changed = otherAccount
  }

  let firstPull = meta.cursor === 0
  // A pull can queue a merged settings row; one more round sends it, and its echo then changes nothing.
  for (let round = 0; round < 3; round++) {
    for (;;) {
      const batch = await db.outbox.limit(PUSH_BATCH).toArray()
      if (batch.length === 0) break
      await call(getToken, 'POST', '', { changes: batch.map(({ kind, key, payload, at }) => ({ kind, key, payload, at })) })
      await db.outbox.bulkDelete(batch.map((b) => b.id!))
    }

    for (;;) {
      const page = pullResponse.parse(await call(getToken, 'GET', `?since=${meta.cursor}`))
      if (page.rows.length > 0) {
        await db.transaction('rw', progressTables(), async () => {
          meta = await readMeta()
          for (const row of page.rows) if (await applyRow(row, meta, firstPull)) changed = true
          meta.cursor = page.rows.at(-1)!.seq
          await db.meta.update('sync', { cursor: meta.cursor })
        })
      }
      if (page.next === null) break
    }
    firstPull = false

    if ((await db.outbox.count()) === 0) break
  }

  return changed
}

// After a backup import replaced local data: push it all and pull the account again, so the two merge.
export async function resync(): Promise<void> {
  await db.transaction('rw', progressTables(), async () => {
    const meta = await readMeta()
    await db.meta.put({ ...meta, cursor: 0 })
    await enqueueAll(meta.settingsAt)
  })
}

// Deletes the account's synced data. The marker row the Worker leaves tells other devices to wipe;
// this device skips past it, since it resets locally right after.
export async function resetRemote(getToken: GetToken): Promise<void> {
  const { seq } = resetResponse.parse(await call(getToken, 'DELETE'))
  await db.meta.put({ ...(await readMeta()), cursor: seq, settingsAt: 0 })
}
