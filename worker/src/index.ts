import { createClerkClient } from '@clerk/backend'
import { respond, withSecurityHeaders } from './http'
import { handleSync } from './sync'
import { handleClerkWebhook } from './webhook'

interface Env {
  ASSETS: Fetcher
  APP_ORIGIN: string
  SIGN_IN_URL: string
  CLERK_PUBLISHABLE_KEY: string
  CLERK_SECRET_KEY?: string
  CLERK_JWT_KEY?: string
  CLERK_WEBHOOK_SIGNING_SECRET?: string
  // Progress sync; without the binding the app keeps progress in the browser only.
  DB?: D1Database
  // Only for forks that run without accounts; must be set explicitly.
  AUTH_DISABLED?: string
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

async function serveApp(request: Request, env: Env, csp: string, authHeaders?: Headers): Promise<Response> {
  const asset = await env.ASSETS.fetch(request)
  const res = withSecurityHeaders(new Response(asset.body, asset))
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
    if (pathname === '/api/clerk/webhook') return handleClerkWebhook(request, env.DB, env.CLERK_WEBHOOK_SIGNING_SECRET)
    if (pathname !== '/app' && !pathname.startsWith('/app/')) return respond('Not found', 404)

    const isApi = pathname.startsWith('/app/api/')
    if (env.AUTH_DISABLED === 'true') return isApi ? respond('Not found', 404) : serveApp(request, env, appCsp(null))
    // The API accepts only a bearer token, never the session cookie, so a cross-site request cannot use it.
    if (isApi && !request.headers.get('Authorization')?.startsWith('Bearer ')) {
      return respond('Unauthorized', 401, { 'Cache-Control': 'no-store' })
    }
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

    if (isApi) {
      if (!state.isAuthenticated) return respond('Unauthorized', 401, { 'Cache-Control': 'no-store' })
      if (pathname !== '/app/api/sync' || !env.DB) return respond('Not found', 404)
      return handleSync(request, env.DB, state.toAuth().userId)
    }

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
