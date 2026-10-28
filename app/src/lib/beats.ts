import type { Concept, ListItem } from '../kb/types'
import { stripMarkup, TOKEN } from './markup'

// Same token set as Inline.tsx: markup spans are kept intact while splitting.
const MARKUP = new RegExp(TOKEN.source, 'g')
const ABBREVIATIONS = new Set(['e.g', 'i.e', 'etc', 'vs', 'cf', 'approx', 'incl', 'no', 'fig', 'dr', 'mr', 'ms', 'st', 'inc', 'ltd', 'u.s', 'u.k', 'e.u'])
const MIN_SENTENCE = 30
const MAX_BEAT = 180

export function splitSentences(text: string): string[] {
  const spans: string[] = []
  const masked = text.replace(MARKUP, (m) => `\u0000${spans.push(m) - 1}\u0000`)
  const out: string[] = []
  let start = 0
  const boundary = /([.!?])["')\]]?\s+(?=[A-Z0-9"'(\u0000])/g
  for (let m = boundary.exec(masked); m; m = boundary.exec(masked)) {
    const before = masked.slice(start, m.index)
    const lastWord = (before.split(/\s+/).pop() ?? '').toLowerCase()
    // Skip abbreviations ("e.g.", "vs.") and single-letter initials ("J. Smith").
    if (ABBREVIATIONS.has(lastWord) || /^[a-z]$/.test(lastWord)) continue
    const end = m.index + m[0].trimEnd().length
    out.push(masked.slice(start, end).trim())
    start = m.index + m[0].length
  }
  out.push(masked.slice(start).trim())

  // Very short sentences read as fragments on their own screen: merge them into the next one.
  const merged: string[] = []
  for (const s of out.filter(Boolean)) {
    const prev = merged[merged.length - 1]
    if (prev !== undefined && prev.length < MIN_SENTENCE) merged[merged.length - 1] = `${prev} ${s}`
    else merged.push(s)
  }
  return merged.map((s) => s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => spans[Number(i)] ?? ''))
}

const plain = (s: string) => stripMarkup(s).replace(/\s+/g, ' ').trim().toLowerCase()

const BULLETS_PER_SCREEN = 3

export type Screen =
  | { kind: 'hook' | 'summary' | 'manager' | 'mnemonic'; text: string }
  | { kind: 'points' | 'traps'; items: ListItem[]; part: number; parts: number }

// One step per tap: text screens take one step, list screens one step per revealed bullet.
export interface Step {
  screen: number
  reveal: number
}

export interface Story {
  screens: Screen[]
  steps: Step[]
}

export function conceptStory(c: Concept): Story {
  const screens: Screen[] = [{ kind: 'hook', text: c.hook }]
  if (plain(c.summary) !== plain(c.hook)) screens.push({ kind: 'summary', text: c.summary })

  const parts = Math.ceil(c.keyPoints.length / BULLETS_PER_SCREEN)
  for (let p = 0; p < parts; p++)
    screens.push({ kind: 'points', items: c.keyPoints.slice(p * BULLETS_PER_SCREEN, (p + 1) * BULLETS_PER_SCREEN), part: p + 1, parts })
  if (c.traps?.length) screens.push({ kind: 'traps', items: c.traps, part: 1, parts: 1 })

  // Long manager views and mnemonics are split into sentences so each screen stays short.
  for (const [kind, text] of [['manager', c.managerView], ['mnemonic', c.mnemonic]] as const) {
    if (!text) continue
    for (const s of text.length > MAX_BEAT ? splitSentences(text) : [text]) screens.push({ kind, text: s })
  }

  const steps: Step[] = []
  screens.forEach((s, i) => {
    if (s.kind === 'points' || s.kind === 'traps') for (let r = 1; r <= s.items.length; r++) steps.push({ screen: i, reveal: r })
    else steps.push({ screen: i, reveal: 0 })
  })
  return { screens, steps }
}
