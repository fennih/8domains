import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Card, Grade } from 'ts-fsrs'
import type { Question } from '../kb/types'
import type { BackupData } from './backup'
import { addDays, toIsoDate } from './dates'
import { db, type AttemptRow, type CardRow, type ReviewRow, type Settings } from './db'
import { review } from './srs'
import type { ProgressSnapshot } from './stats'

export interface ProgressState extends ProgressSnapshot {
  settings: Settings
}

interface ProgressApi {
  state: ProgressState
  grade: (cardId: string, grade: Grade) => Promise<Card>
  recordAttempt: (q: Question, chosen: number) => Promise<void>
  markSeen: (conceptId: string) => void
  markRead: (conceptId: string) => void
  updateSettings: (patch: Partial<Settings>) => Promise<void>
  exportData: () => BackupData
  importData: (data: BackupData) => Promise<void>
  reset: () => Promise<void>
}

const ProgressContext = createContext<ProgressApi | null>(null)

export function defaultSettings(): Settings {
  const today = new Date()
  return { firstLaunch: toIsoDate(today), examDate: toIsoDate(addDays(today, 84)), theme: 'dark', animations: true, scope: null }
}

// Settings saved by older versions may lack newer fields or carry removed ones (newPerDay).
function normalizeSettings(raw: Partial<Settings> | undefined): Settings {
  const d = defaultSettings()
  if (!raw) return d
  return {
    firstLaunch: raw.firstLaunch ?? d.firstLaunch,
    examDate: raw.examDate ?? d.examDate,
    theme: raw.theme ?? d.theme,
    animations: raw.animations ?? d.animations,
    scope: raw.scope ?? null,
  }
}

async function loadState(): Promise<ProgressState> {
  const [cards, reviews, attempts, seen, read, settingsRow] = await Promise.all([
    db.cards.toArray(),
    db.reviews.orderBy('at').toArray(),
    db.attempts.orderBy('at').toArray(),
    db.seen.toArray(),
    db.read.toArray(),
    db.settings.get('settings'),
  ])
  const settings = normalizeSettings(settingsRow?.value)
  if (!settingsRow || JSON.stringify(settingsRow.value) !== JSON.stringify(settings)) {
    await db.settings.put({ key: 'settings', value: settings })
  }
  return {
    cards: new Map(cards.map((c) => [c.id, c])),
    reviews,
    attempts,
    seen: new Map(seen.map((s) => [s.conceptId, s.at])),
    read: new Map(read.map((s) => [s.conceptId, s.at])),
    settings,
  }
}

export function ProgressProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [state, setState] = useState<ProgressState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    loadState().then(setState, (e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  const grade = useCallback(async (cardId: string, g: Grade) => {
    const now = new Date()
    const prev = (await db.cards.get(cardId)) ?? undefined
    const next: CardRow = { ...review(prev, g, now), id: cardId }
    const row: ReviewRow = { cardId, rating: g, at: now }
    await db.transaction('rw', db.cards, db.reviews, async () => {
      await db.cards.put(next)
      row.id = await db.reviews.add(row)
    })
    setState((s) => s && { ...s, cards: new Map(s.cards).set(cardId, next), reviews: [...s.reviews, row] })
    return next
  }, [])

  const recordAttempt = useCallback(async (q: Question, chosen: number) => {
    const row: AttemptRow = { questionId: q.id, domain: q.domain, chosen, correct: chosen === q.answer, at: new Date() }
    row.id = await db.attempts.add(row)
    setState((s) => s && { ...s, attempts: [...s.attempts, row] })
  }, [])

  const markSeen = useCallback((conceptId: string) => {
    if (!stateRef.current || stateRef.current.seen.has(conceptId)) return
    const at = new Date()
    void db.seen.put({ conceptId, at })
    setState((s) => (s && !s.seen.has(conceptId) ? { ...s, seen: new Map(s.seen).set(conceptId, at) } : s))
  }, [])

  const markRead = useCallback((conceptId: string) => {
    if (!stateRef.current || stateRef.current.read.has(conceptId)) return
    const at = new Date()
    void db.read.put({ conceptId, at })
    setState((s) => (s && !s.read.has(conceptId) ? { ...s, read: new Map(s.read).set(conceptId, at) } : s))
  }, [])

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    const value = { ...normalizeSettings((await db.settings.get('settings'))?.value), ...patch }
    await db.settings.put({ key: 'settings', value })
    setState((s) => s && { ...s, settings: value })
  }, [])

  const exportData = useCallback((): BackupData => {
    if (!state) throw new Error('Progress not loaded')
    const rows = (m: Map<string, Date>) => [...m.entries()].map(([conceptId, at]) => ({ conceptId, at }))
    return {
      settings: state.settings,
      cards: [...state.cards.values()],
      reviews: state.reviews,
      attempts: state.attempts,
      seen: rows(state.seen),
      read: rows(state.read),
    }
  }, [state])

  const replaceAll = useCallback(async (data: BackupData) => {
    await db.transaction('rw', [db.cards, db.reviews, db.attempts, db.seen, db.read, db.settings], async () => {
      await Promise.all([db.cards.clear(), db.reviews.clear(), db.attempts.clear(), db.seen.clear(), db.read.clear(), db.settings.clear()])
      await db.cards.bulkAdd(data.cards)
      await db.reviews.bulkAdd(data.reviews)
      await db.attempts.bulkAdd(data.attempts)
      await db.seen.bulkAdd(data.seen)
      await db.read.bulkAdd(data.read)
      await db.settings.put({ key: 'settings', value: data.settings })
    })
    setState(await loadState())
  }, [])

  const reset = useCallback(
    () => replaceAll({ settings: defaultSettings(), cards: [], reviews: [], attempts: [], seen: [], read: [] }),
    [replaceAll],
  )

  const api = useMemo<ProgressApi | null>(
    () =>
      state && {
        state,
        grade,
        recordAttempt,
        markSeen,
        markRead,
        updateSettings,
        exportData,
        importData: replaceAll,
        reset,
      },
    [state, grade, recordAttempt, markSeen, markRead, updateSettings, exportData, replaceAll, reset],
  )

  if (error) return <p className="p-6 text-danger">Could not open local storage: {error}</p>
  if (!api) return fallback
  return <ProgressContext.Provider value={api}>{children}</ProgressContext.Provider>
}

export function useProgress(): ProgressApi {
  const ctx = useContext(ProgressContext)
  if (!ctx) throw new Error('useProgress outside ProgressProvider')
  return ctx
}
