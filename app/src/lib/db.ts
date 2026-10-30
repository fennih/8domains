import { Dexie, type EntityTable } from 'dexie'
import type { Card, Grade } from 'ts-fsrs'
import type { HighlightColor } from './markup'
import type { Scope } from './scope'

export interface CardRow extends Card {
  id: string
}

export interface ReviewRow {
  id?: number
  cardId: string
  rating: Grade
  at: Date
}

export interface AttemptRow {
  id?: number
  questionId: string
  domain: number
  chosen: number
  correct: boolean
  at: Date
}

export interface SeenRow {
  conceptId: string
  at: Date
}

export type Theme = 'system' | 'dark' | 'light'


export interface Settings {
  firstLaunch: string
  examDate: string
  theme: Theme
  animations: boolean
  scope: Scope | null
  // Colors whose first-time legend was already shown.
  legendsSeen: HighlightColor[]
}

export interface SettingRow {
  key: 'settings'
  value: Settings
}

// One row of the sync log shared with the Worker; `at` decides which version of a key wins.
export type ChangeKind = 'card' | 'review' | 'attempt' | 'seen' | 'read' | 'settings'

export interface Change {
  kind: ChangeKind
  key: string
  payload: string
  at: number
}

export interface OutboxRow extends Change {
  id?: number
}

export interface SyncMeta {
  key: 'sync'
  // Account the local data belongs to; null until the first sync.
  userId: string | null
  cursor: number
  // When the synced settings fields last changed on this device (0: never set explicitly).
  settingsAt: number
  lastSyncAt: string | null
}

// Database, theme key and backup tag keep the pre-rename id so existing progress and backups stay valid.
export const db = new Dexie('cissp-feed') as Dexie & {
  cards: EntityTable<CardRow, 'id'>
  reviews: EntityTable<ReviewRow, 'id'>
  attempts: EntityTable<AttemptRow, 'id'>
  seen: EntityTable<SeenRow, 'conceptId'>
  read: EntityTable<SeenRow, 'conceptId'>
  settings: EntityTable<SettingRow, 'key'>
  outbox: EntityTable<OutboxRow, 'id'>
  meta: EntityTable<SyncMeta, 'key'>
}

db.version(1).stores({
  cards: 'id, due',
  reviews: '++id, cardId, at',
  attempts: '++id, questionId, at',
  seen: 'conceptId, at',
  settings: 'key',
})

db.version(2).stores({
  read: 'conceptId, at',
})

// Compound indexes let pulled reviews and attempts be matched to local rows by their sync key.
db.version(3).stores({
  reviews: '++id, cardId, at, [cardId+at]',
  attempts: '++id, questionId, at, [questionId+at]',
  outbox: '++id',
  meta: 'key',
})
