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

// Database, theme key and backup tag keep the pre-rename id so existing progress and backups stay valid.
export const db = new Dexie('cissp-feed') as Dexie & {
  cards: EntityTable<CardRow, 'id'>
  reviews: EntityTable<ReviewRow, 'id'>
  attempts: EntityTable<AttemptRow, 'id'>
  seen: EntityTable<SeenRow, 'conceptId'>
  read: EntityTable<SeenRow, 'conceptId'>
  settings: EntityTable<SettingRow, 'key'>
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
