import type { Concept, Kb, KbTable, Question } from '../kb/types'

export type Scope =
  | { kind: 'mix' }
  | { kind: 'due' }
  | { kind: 'domain'; domain: number }
  | { kind: 'domain-mix'; domain: number }
  | { kind: 'objective'; objective: string }
  | { kind: 'topic'; topic: string }
  | { kind: 'drill'; drill: Drill; objective: string }

// One kind of item of an objective, all of it, in reading order.
export type Drill = 'flashcard' | 'mnemonic' | 'trap' | 'quiz' | 'table'

export const DRILL_LABEL: Record<Drill, string> = {
  flashcard: 'Flashcards',
  mnemonic: 'Mnemonics',
  trap: 'Exam traps',
  quiz: 'Scenarios',
  table: 'Tables',
}

export function scopeKey(s: Scope): string {
  switch (s.kind) {
    case 'mix':
    case 'due':
      return s.kind
    case 'domain':
      return `d${s.domain}`
    case 'domain-mix':
      return `m${s.domain}`
    case 'objective':
      return `o${s.objective}`
    case 'topic':
      return `t${s.topic}`
    case 'drill':
      return `x${s.drill}${s.objective}`
  }
}

export function scopeLabel(s: Scope): string {
  switch (s.kind) {
    case 'mix':
      return 'Everything'
    case 'due':
      return 'Reviews'
    case 'domain':
      return `Domain ${s.domain}`
    case 'domain-mix':
      return `D${s.domain} · mix`
    case 'objective':
      return s.objective
    case 'topic':
      return s.topic
    case 'drill':
      return `${s.objective} · ${DRILL_LABEL[s.drill]}`
  }
}

const objectiveOfTopic = (topic: string) => topic.split('.').slice(0, 2).join('.')

export function conceptInScope(s: Scope, c: Concept): boolean {
  switch (s.kind) {
    case 'mix':
      return true
    case 'due':
      return false
    case 'domain':
    case 'domain-mix':
      return c.domain === s.domain
    case 'objective':
    case 'drill':
      return c.objective === s.objective
    case 'topic':
      return c.topic === s.topic
  }
}

export function questionInScope(s: Scope, q: Question): boolean {
  switch (s.kind) {
    case 'mix':
      return true
    case 'due':
      return false
    case 'domain':
    case 'domain-mix':
      return q.domain === s.domain
    case 'objective':
    case 'drill':
      return q.objective === s.objective
    case 'topic':
      return q.objective === objectiveOfTopic(s.topic)
  }
}

export function tableInScope(s: Scope, t: KbTable): boolean {
  switch (s.kind) {
    case 'mix':
      return true
    case 'due':
      return false
    case 'domain':
    case 'domain-mix':
      return t.domain === s.domain
    case 'objective':
    case 'drill':
      return t.objective === s.objective
    case 'topic':
      return t.objective === objectiveOfTopic(s.topic)
  }
}

export function scopeConcepts(kb: Kb, s: Scope): Concept[] {
  return kb.concepts.filter((c) => conceptInScope(s, c))
}

export function scopeTitle(kb: Kb, s: Scope): string {
  if (s.kind === 'domain' || s.kind === 'domain-mix') return kb.outline.domains.find((d) => d.number === s.domain)?.title ?? ''
  if (s.kind === 'objective' || s.kind === 'drill') {
    for (const d of kb.outline.domains) for (const o of d.objectives) if (o.id === s.objective) return o.title
  }
  if (s.kind === 'topic') {
    for (const d of kb.outline.domains) for (const o of d.objectives) for (const t of o.topics) if (t.id === s.topic) return t.title
  }
  return s.kind === 'mix' ? 'All domains' : 'Due flashcards'
}
