const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
}

export function withSecurityHeaders(res: Response): Response {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v)
  return res
}

export function respond(body: BodyInit | null, status: number, headers: HeadersInit = {}): Response {
  return withSecurityHeaders(new Response(body, { status, headers }))
}

export function json(data: unknown, status = 200): Response {
  return respond(JSON.stringify(data), status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
}
