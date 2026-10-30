import { useAuth } from '@clerk/react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AUTH_ENABLED } from './auth'
import { outboxEvents } from './outbox'
import { useProgress } from './progress'

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error'

interface SyncApi {
  status: SyncStatus
  lastSyncAt: Date | null
  // Merges freshly imported local data with the account.
  resync: () => Promise<void>
  // Deletes the account's progress everywhere; throws when the server cannot be reached.
  resetRemote: () => Promise<void>
}

const SyncContext = createContext<SyncApi | null>(null)

const PUSH_DELAY_MS = 2000
const INTERVAL_MS = 60_000

// The engine pulls in zod, so it loads after the first paint, like the backup importer.
const engine = () => import('./syncEngine')

function AccountSync({ children }: { children: ReactNode }) {
  const { userId, getToken } = useAuth()
  const { refresh } = useProgress()
  const [status, setStatus] = useState<SyncStatus>('idle')
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null)
  const running = useRef<Promise<void> | null>(null)
  const again = useRef(false)

  const syncNow = useCallback((): Promise<void> => {
    if (!userId) return Promise.resolve()
    if (running.current) {
      // A write landed mid-sync: run once more when the current pass ends.
      again.current = true
      return running.current
    }
    if (!navigator.onLine) {
      setStatus('offline')
      return Promise.resolve()
    }
    setStatus('syncing')
    running.current = (async () => {
      try {
        const { runSync } = await engine()
        do {
          again.current = false
          if (await runSync(userId, () => getToken())) await refresh()
        } while (again.current)
        setStatus('idle')
        setLastSyncAt(new Date())
      } catch {
        setStatus(navigator.onLine ? 'error' : 'offline')
      } finally {
        running.current = null
      }
    })()
    return running.current
  }, [userId, getToken, refresh])

  const syncRef = useRef(syncNow)
  syncRef.current = syncNow

  // Clerk may still be loading on mount; the first sync waits for the user id.
  useEffect(() => {
    if (userId) void syncRef.current()
  }, [userId])

  useEffect(() => {
    void engine()
      .then((e) => e.lastSyncAt())
      .then(setLastSyncAt)

    let timer: ReturnType<typeof setTimeout> | undefined
    const soon = () => {
      clearTimeout(timer)
      timer = setTimeout(() => void syncRef.current(), PUSH_DELAY_MS)
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncRef.current()
    }
    const onOnline = () => void syncRef.current()
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void syncRef.current()
    }, INTERVAL_MS)

    outboxEvents.addEventListener('change', soon)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    return () => {
      clearTimeout(timer)
      clearInterval(interval)
      outboxEvents.removeEventListener('change', soon)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [])

  const resync = useCallback(async () => {
    await running.current
    await (await engine()).resync()
    await syncNow()
  }, [syncNow])

  const resetRemote = useCallback(async () => {
    await running.current
    await (await engine()).resetRemote(() => getToken())
  }, [getToken])

  const api = useMemo(() => ({ status, lastSyncAt, resync, resetRemote }), [status, lastSyncAt, resync, resetRemote])
  return <SyncContext.Provider value={api}>{children}</SyncContext.Provider>
}

function NoSync({ children }: { children: ReactNode }) {
  return children
}

// Without accounts there is nothing to sync against; useSync() then returns null.
export const SyncProvider = AUTH_ENABLED ? AccountSync : NoSync

export function useSync(): SyncApi | null {
  return useContext(SyncContext)
}
