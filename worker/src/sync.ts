import { json, respond } from './http'

const KINDS = new Set(['card', 'review', 'attempt', 'seen', 'read', 'settings'])
const KEY = /^[a-z0-9-]{1,160}$/
const MAX_BODY_BYTES = 1024 * 1024
const MAX_CHANGES = 500
const MAX_PAYLOAD = 4096
const PAGE = 1000
// Far above a full study plan (the backup format caps each table at 200k rows).
const MAX_ROWS_PER_USER = 300_000

interface Change {
  kind: string
  key: string
  payload: string
  at: number
}

function parseChanges(raw: unknown): Change[] | null {
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as { changes?: unknown }).changes)) return null
  const list = (raw as { changes: unknown[] }).changes
  if (list.length > MAX_CHANGES) return null
  const out: Change[] = []
  for (const c of list) {
    if (typeof c !== 'object' || c === null) return null
    const { kind, key, payload, at } = c as Record<string, unknown>
    if (typeof kind !== 'string' || !KINDS.has(kind)) return null
    if (typeof key !== 'string' || !KEY.test(key)) return null
    if (typeof payload !== 'string' || payload.length > MAX_PAYLOAD) return null
    if (typeof at !== 'number' || !Number.isSafeInteger(at) || at < 0) return null
    out.push({ kind, key, payload, at })
  }
  return out
}

// The same key can be queued more than once (a card graded twice offline); only the newest is stored.
function newestPerKey(changes: Change[]): Change[] {
  const byKey = new Map<string, Change>()
  for (const c of changes) {
    const id = `${c.kind}\n${c.key}`
    const prev = byKey.get(id)
    if (!prev || c.at >= prev.at) byKey.set(id, c)
  }
  return [...byKey.values()]
}

async function push(request: Request, db: D1Database, userId: string): Promise<Response> {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return respond('Unsupported media type', 415)
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY_BYTES) return respond('Payload too large', 413)
  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) return respond('Payload too large', 413)
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return respond('Invalid JSON', 400)
  }
  const parsed = parseChanges(raw)
  if (!parsed) return respond('Invalid changes', 400)
  const changes = newestPerKey(parsed)
  if (changes.length === 0) return json({ ok: true })

  const count = await db.prepare('SELECT count(*) AS n FROM changes WHERE user_id = ?').bind(userId).first<number>('n')
  if ((count ?? 0) + changes.length > MAX_ROWS_PER_USER) return respond('Storage quota exceeded', 413)

  // Two statements for the whole batch: drop stored rows the batch supersedes, then insert what is new.
  // A stored row that is as new or newer survives the delete, and INSERT OR IGNORE keeps it.
  // Replaced rows get a fresh seq, so other devices pull them.
  const rows = JSON.stringify(changes)
  await db.batch([
    db
      .prepare(
        `DELETE FROM changes WHERE user_id = ?1 AND EXISTS (
           SELECT 1 FROM json_each(?2) AS j
           WHERE j.value ->> '$.kind' = changes.kind AND j.value ->> '$.key' = changes.key AND j.value ->> '$.at' > changes.at)`,
      )
      .bind(userId, rows),
    db
      .prepare(
        `INSERT OR IGNORE INTO changes (user_id, kind, key, payload, at)
         SELECT ?1, j.value ->> '$.kind', j.value ->> '$.key', j.value ->> '$.payload', j.value ->> '$.at' FROM json_each(?2) AS j`,
      )
      .bind(userId, rows),
  ])
  return json({ ok: true })
}

async function pull(url: URL, db: D1Database, userId: string): Promise<Response> {
  const since = Number(url.searchParams.get('since') ?? '0')
  if (!Number.isSafeInteger(since) || since < 0) return respond('Invalid cursor', 400)
  const { results } = await db
    .prepare('SELECT seq, kind, key, payload, at FROM changes WHERE user_id = ? AND seq > ? ORDER BY seq LIMIT ?')
    .bind(userId, since, PAGE + 1)
    .all<{ seq: number; kind: string; key: string; payload: string; at: number }>()
  const rows = results.slice(0, PAGE)
  return json({ rows, next: results.length > PAGE ? rows.at(-1)!.seq : null })
}

// Wipes the account's data and leaves one marker row, so devices that pull it wipe their local copy too.
async function reset(db: D1Database, userId: string): Promise<Response> {
  const [, inserted] = await db.batch<{ seq: number }>([
    db.prepare('DELETE FROM changes WHERE user_id = ?').bind(userId),
    db
      .prepare(`INSERT INTO changes (user_id, kind, key, payload, at) VALUES (?, 'reset', 'reset', '{}', ?) RETURNING seq`)
      .bind(userId, Date.now()),
  ])
  return json({ seq: inserted!.results[0]!.seq })
}

export function handleSync(request: Request, db: D1Database, userId: string): Promise<Response> {
  switch (request.method) {
    case 'GET':
      return pull(new URL(request.url), db, userId)
    case 'POST':
      return push(request, db, userId)
    case 'DELETE':
      return reset(db, userId)
    default:
      return Promise.resolve(respond('Method not allowed', 405, { Allow: 'GET, POST, DELETE' }))
  }
}

export async function deleteUser(db: D1Database, userId: string): Promise<void> {
  await db.prepare('DELETE FROM changes WHERE user_id = ?').bind(userId).run()
}
