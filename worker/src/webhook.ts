import { verifyWebhook } from '@clerk/backend/webhooks'
import { respond } from './http'
import { deleteUser } from './sync'

const MAX_BODY_BYTES = 64 * 1024

// Clerk calls this when an account is deleted, so the synced progress goes with it.
export async function handleClerkWebhook(request: Request, db: D1Database | undefined, signingSecret: string | undefined): Promise<Response> {
  if (!db || !signingSecret) return respond('Not found', 404)
  if (request.method !== 'POST') return respond('Method not allowed', 405, { Allow: 'POST' })
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY_BYTES) return respond('Payload too large', 413)

  let event: Awaited<ReturnType<typeof verifyWebhook>>
  try {
    event = await verifyWebhook(request, { signingSecret })
  } catch {
    return respond('Invalid signature', 400)
  }
  if (event.type === 'user.deleted' && event.data.id) await deleteUser(db, event.data.id)
  return respond(null, 204)
}
