import { NARRATION_LANGS, type Narration, type NarrationLang } from '../lib/audio'
import type { DomainFile, Kb, Outline } from './types'

interface IndexFile {
  version: string
  files: Record<string, unknown>
  audio?: unknown
}

const SAFE_FILE = /^(d[1-8]|tables)\.json$/
const SAFE_AUDIO_FILE = /^d[1-8]\.json$/
const NARRATION_FILE = /^[a-z0-9-]{1,120}\.[0-9a-f]{12}\.m4a$/

// Entries that do not look right are dropped: the story simply has no Listen button.
function validNarration(e: unknown): e is Narration {
  if (typeof e !== 'object' || e === null) return false
  const { file, steps } = e as Record<string, unknown>
  if (typeof file !== 'string' || !NARRATION_FILE.test(file) || !Array.isArray(steps) || steps.length === 0) return false
  return steps.every((ms, i) => typeof ms === 'number' && Number.isFinite(ms) && ms > (i ? (steps[i - 1] as number) : 0))
}

async function loadNarrationLang(lang: NarrationLang, names: unknown, v: string): Promise<Map<string, Narration>> {
  const safe = Array.isArray(names) ? names.filter((n): n is string => typeof n === 'string' && SAFE_AUDIO_FILE.test(n)) : []
  const out = new Map<string, Narration>()
  // Narration is optional: a failed manifest leaves the app fully usable without audio.
  const files = await Promise.all(safe.map((n) => getJson<Record<string, unknown>>(`kb/audio/${lang}/${n}?v=${v}`).catch(() => ({}))))
  for (const f of files) for (const [id, e] of Object.entries(f)) if (validNarration(e)) out.set(id, e)
  return out
}

async function loadNarration(index: IndexFile, v: string): Promise<Kb['narration']> {
  const listed = typeof index.audio === 'object' && index.audio !== null ? (index.audio as Record<string, unknown>) : {}
  const out: Kb['narration'] = {}
  await Promise.all(
    NARRATION_LANGS.map(async (lang) => {
      const map = await loadNarrationLang(lang, listed[lang], v)
      if (map.size > 0) out[lang] = map
    }),
  )
  return out
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(import.meta.env.BASE_URL + path, { credentials: 'same-origin' })
  if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`)
  return (await res.json()) as T
}

export async function loadKb(): Promise<Kb> {
  const index = await getJson<IndexFile>('kb/index.json?v=' + Date.now().toString(36))
  const v = encodeURIComponent(index.version)
  const names = Object.keys(index.files).filter((n) => SAFE_FILE.test(n))
  const [outline, audio, ...files] = await Promise.all([
    getJson<Outline>(`kb/outline.json?v=${v}`),
    loadNarration(index, v),
    ...names.map((n) => getJson<DomainFile>(`kb/${n}?v=${v}`)),
  ])

  const kb: Kb = {
    version: index.version,
    outline,
    concepts: [],
    flashcards: [],
    questions: [],
    tables: [],
    conceptById: new Map(),
    flashcardById: new Map(),
    questionById: new Map(),
    tableById: new Map(),
    flashcardsByConcept: new Map(),
    objectiveOrder: new Map(),
    narration: audio,
  }

  files.sort((a, b) => (a.domain || 99) - (b.domain || 99))
  for (const f of files) {
    kb.concepts.push(...(f.concepts ?? []))
    kb.flashcards.push(...(f.flashcards ?? []))
    kb.questions.push(...(f.questions ?? []))
    kb.tables.push(...(f.tables ?? []))
  }

  let i = 0
  for (const d of outline.domains) for (const o of d.objectives) kb.objectiveOrder.set(o.id, i++)
  for (const c of kb.concepts) {
    c.hook = c.hook?.trim() || c.title
    kb.conceptById.set(c.id, c)
  }
  for (const q of kb.questions) kb.questionById.set(q.id, q)
  for (const t of kb.tables) kb.tableById.set(t.id, t)
  for (const fc of kb.flashcards) {
    kb.flashcardById.set(fc.id, fc)
    const list = kb.flashcardsByConcept.get(fc.conceptId)
    if (list) list.push(fc)
    else kb.flashcardsByConcept.set(fc.conceptId, [fc])
  }
  return kb
}
