export type Priority = 'core' | 'important' | 'nice'

// A bullet: plain text, or text with sub-bullets.
export type ListItem = string | { text: string; items: string[] }

export const itemText = (li: ListItem) => (typeof li === 'string' ? li : li.text)
export const itemSubs = (li: ListItem) => (typeof li === 'string' ? [] : li.items)

export interface Concept {
  id: string
  domain: number
  objective: string
  topic?: string
  title: string
  hook: string
  summary: string
  keyPoints: ListItem[]
  priority: Priority
  mnemonic?: string
  managerView?: string
  traps?: ListItem[]
  related?: string[]
}

export interface Flashcard {
  id: string
  conceptId: string
  type: 'qa' | 'cloze' | 'compare'
  front: string
  back: string
}

export interface Question {
  id: string
  domain: number
  objective: string
  conceptIds: string[]
  stem: string
  options: string[]
  answer: number
  explanation: string
  style: 'manager' | 'technical'
  difficulty: number
}

export interface KbTable {
  id: string
  domain?: number
  objective?: string
  title: string
  description?: string
  columns: string[]
  rows: string[][]
  priority: Priority
}

export interface DomainFile {
  domain: number
  concepts: Concept[]
  flashcards: Flashcard[]
  questions: Question[]
  tables: KbTable[]
}

export interface Topic {
  id: string
  title: string
}

export interface Objective {
  id: string
  title: string
  topics: Topic[]
}

export interface OutlineDomain {
  id: string
  number: number
  title: string
  weight: number
  objectives: Objective[]
}

export interface Outline {
  exam: string
  outlineVersion: string
  domains: OutlineDomain[]
}

export interface Kb {
  version: string
  outline: Outline
  concepts: Concept[]
  flashcards: Flashcard[]
  questions: Question[]
  tables: KbTable[]
  conceptById: Map<string, Concept>
  flashcardById: Map<string, Flashcard>
  questionById: Map<string, Question>
  tableById: Map<string, KbTable>
  flashcardsByConcept: Map<string, Flashcard[]>
  objectiveOrder: Map<string, number>
}

export function flashcardDomain(fc: Flashcard): number {
  return Number(fc.conceptId.slice(1, fc.conceptId.indexOf('-')))
}
