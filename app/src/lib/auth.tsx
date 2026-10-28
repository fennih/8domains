import { ClerkProvider, useAuth, useClerk } from '@clerk/react'
import { useEffect, type ReactNode } from 'react'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined

// The hosted build always sets the key; local dev and forks without one run with no accounts.
export const AUTH_ENABLED = Boolean(PUBLISHABLE_KEY)

function SessionGuard() {
  const { isLoaded, isSignedIn } = useAuth()
  const clerk = useClerk()
  useEffect(() => {
    // Offline, Clerk never loads, so the cached app keeps working until the next online check.
    // Sign-in is on Clerk's domain, so the service worker cannot serve a cached page instead of it.
    if (isLoaded && !isSignedIn && navigator.onLine) void clerk.redirectToSignIn()
  }, [isLoaded, isSignedIn, clerk])
  return null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  if (!PUBLISHABLE_KEY) return children
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
      <SessionGuard />
      {children}
    </ClerkProvider>
  )
}
