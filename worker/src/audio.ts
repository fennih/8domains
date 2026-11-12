import { respond } from './http'

// Narration files are content-addressed (<concept id>.<hash>.m4a), so a name never changes meaning.
export const AUDIO_PATH = /^\/app\/audio\/([a-z0-9-]{1,120}\.[0-9a-f]{12}\.m4a)$/

const SINGLE_RANGE = /^bytes=(\d*)-(\d*)$/

// One byte range, clamped to the object; null when unsatisfiable. Multi-range requests get the whole file.
function parseRange(header: string | null, size: number): { start: number; end: number } | 'all' | null {
  if (!header) return 'all'
  const m = SINGLE_RANGE.exec(header.trim())
  if (!m) return 'all'
  const [, a = '', b = ''] = m
  if (a === '' && b === '') return null
  if (a === '') {
    const suffix = Number(b)
    if (suffix === 0) return null
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }
  const start = Number(a)
  const end = b === '' ? size - 1 : Math.min(Number(b), size - 1)
  if (start >= size || end < start) return null
  return { start, end }
}

export async function serveAudio(request: Request, bucket: R2Bucket | undefined, key: string): Promise<Response> {
  if (!bucket) return respond('Not found', 404)
  if (request.method !== 'GET' && request.method !== 'HEAD') return respond('Method not allowed', 405, { Allow: 'GET, HEAD' })

  const head = await bucket.head(key)
  if (!head) return respond('Not found', 404, { 'Cache-Control': 'no-store' })

  const headers: Record<string, string> = {
    'Content-Type': 'audio/mp4',
    'Accept-Ranges': 'bytes',
    ETag: head.httpEtag,
    // Gated content: browser cache only, never a shared one.
    'Cache-Control': 'private, max-age=31536000, immutable',
  }
  const range = parseRange(request.headers.get('Range'), head.size)
  if (range === null) return respond(null, 416, { ...headers, 'Content-Range': `bytes */${head.size}` })

  if (range === 'all') {
    headers['Content-Length'] = String(head.size)
    if (request.method === 'HEAD') return respond(null, 200, headers)
    const obj = await bucket.get(key)
    return obj ? respond(obj.body, 200, headers) : respond('Not found', 404, { 'Cache-Control': 'no-store' })
  }

  const length = range.end - range.start + 1
  headers['Content-Range'] = `bytes ${range.start}-${range.end}/${head.size}`
  headers['Content-Length'] = String(length)
  if (request.method === 'HEAD') return respond(null, 206, headers)
  const obj = await bucket.get(key, { range: { offset: range.start, length } })
  return obj ? respond(obj.body, 206, headers) : respond('Not found', 404, { 'Cache-Control': 'no-store' })
}
