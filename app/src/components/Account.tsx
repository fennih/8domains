import { useClerk, useUser } from '@clerk/react'
import { Label } from './Chips'

export function Account() {
  const { user } = useUser()
  const clerk = useClerk()
  return (
    <section aria-label="Account" className="flex flex-col gap-3">
      <Label>Account</Label>
      {user && <p className="text-sm text-muted">Signed in as {user.primaryEmailAddress?.emailAddress ?? user.id}</p>}
      <div className="flex flex-wrap gap-2">
        <a href={clerk.buildUserProfileUrl()} className="rounded-full border border-line px-4 py-2 text-sm font-semibold">
          Manage account
        </a>
        <button type="button" onClick={() => void clerk.signOut({ redirectUrl: '/' })} className="rounded-full border border-line px-4 py-2 text-sm font-semibold">
          Sign out
        </button>
      </div>
    </section>
  )
}
