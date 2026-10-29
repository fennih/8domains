import { createClerkClient } from '@clerk/backend'

interface Env {
  ASSETS: Fetcher
  APP_ORIGIN: string
  SIGN_IN_URL: string
  CLERK_PUBLISHABLE_KEY: string
  CLERK_SECRET_KEY?: string
  CLERK_JWT_KEY?: string
  // Only for forks that run without accounts; must be set explicitly.
  AUTH_DISABLED?: string
}

const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
}

// The publishable key is pk_(test|live)_<base64 of "<frontend api host>$">.
function frontendApi(publishableKey: string): string {
  const host = atob(publishableKey.split('_')[2] ?? '').replace(/\$$/, '')
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host)) throw new Error('invalid Clerk publishable key')
  return `https://${host}`
}

// fapi is null when accounts are disabled: no Clerk or Turnstile origins are allowed then.
function appCsp(fapi: string | null): string {
  const clerk = fapi ? ` ${fapi} https://challenges.cloudflare.com` : ''
  return [
    "default-src 'self'",
    `script-src 'self'${clerk}`,
    "style-src 'self'",
    `img-src 'self' data:${fapi ? ' https://img.clerk.com' : ''}`,
    `connect-src 'self'${fapi ? ` ${fapi}` : ''}`,
    `frame-src ${fapi ? 'https://challenges.cloudflare.com' : "'none'"}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ')
}

function isNavigation(request: Request): boolean {
  const dest = request.headers.get('Sec-Fetch-Dest')
  if (dest) return dest === 'document'
  return request.headers.get('Accept')?.includes('text/html') ?? false
}

function respond(body: BodyInit | null, status: number, headers: HeadersInit = {}): Response {
  const res = new Response(body, { status, headers })
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v)
  return res
}

async function serveApp(request: Request, env: Env, csp: string, authHeaders?: Headers): Promise<Response> {
  const asset = await env.ASSETS.fetch(request)
  const res = new Response(asset.body, asset)
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v)
  res.headers.set('Content-Security-Policy', csp)
  // Gated content must never land in a shared cache.
  res.headers.set('Cache-Control', 'private, max-age=0, must-revalidate')
  authHeaders?.forEach((v, k) => res.headers.append(k, v))
  return res
}

export default {
  async fetch(request, env): Promise<Response> {
    // Requests that match no public asset also reach the Worker; only /app is ours.
    const { pathname } = new URL(request.url)
    // Asset uploads skip dot-directories, so the RFC 9116 path is mapped here to /security.txt.
    if (pathname === '/.well-known/security.txt') {
      const asset = await env.ASSETS.fetch(new Request(new URL('/security.txt', request.url), request))
      return respond(asset.body, asset.status, { 'Content-Type': 'text/plain; charset=utf-8' })
    }
    if (pathname !== '/app' && !pathname.startsWith('/app/')) return respond('Not found', 404)

    if (env.AUTH_DISABLED === 'true') return serveApp(request, env, appCsp(null))
    if (!env.CLERK_SECRET_KEY || !env.CLERK_PUBLISHABLE_KEY) return respond('Sign-in is not configured.', 503)

    const fapi = frontendApi(env.CLERK_PUBLISHABLE_KEY)
    const clerk = createClerkClient({
      secretKey: env.CLERK_SECRET_KEY,
      publishableKey: env.CLERK_PUBLISHABLE_KEY,
      jwtKey: env.CLERK_JWT_KEY,
    })
    const state = await clerk.authenticateRequest(request, {
      authorizedParties: [env.APP_ORIGIN],
      jwtKey: env.CLERK_JWT_KEY,
      signInUrl: env.SIGN_IN_URL,
    })

    // Clerk refreshes an expired session by bouncing the browser through its Frontend API.
    if (state.status === 'handshake') return respond(null, 307, state.headers)

    if (!state.isAuthenticated) {
      if (!isNavigation(request)) return respond('Unauthorized', 401, { 'Cache-Control': 'no-store' })
      // Fixed return target: never echo the requested URL back into the redirect.
      const signIn = new URL(env.SIGN_IN_URL)
      signIn.searchParams.set('redirect_url', `${env.APP_ORIGIN}/app/`)
      return respond(null, 302, { Location: signIn.toString(), 'Cache-Control': 'no-store' })
    }

    return serveApp(request, env, appCsp(fapi), state.headers)
  },
} satisfies ExportedHandler<Env>
