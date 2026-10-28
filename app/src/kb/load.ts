import type { DomainFile, Kb, Outline } from './types'

interface IndexFile {
  version: string
  files: Record<string, unknown>
}

const SAFE_FILE = /^(d[1-8]|tables)\.json$/

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(import.meta.env.BASE_URL + path, { credentials: 'same-origin' })
  if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`)
  return (await res.json()) as T
}

export async function loadKb(): Promise<Kb> {
  const index = await getJson<IndexFile>('kb/index.json?v=' + Date.now().toString(36))
  const v = encodeURIComponent(index.version)
  const names = Object.keys(index.files).filter((n) => SAFE_FILE.test(n))
  const [outline, ...files] = await Promise.all([
    getJson<Outline>(`kb/outline.json?v=${v}`),
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
