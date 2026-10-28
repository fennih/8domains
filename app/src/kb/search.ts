import MiniSearch from 'minisearch'
import { itemSubs, itemText, type Kb } from './types'

export interface SearchDoc {
  id: string
  kind: 'concept' | 'flashcard' | 'table'
  refId: string
  title: string
  text: string
  domain: number
}

const strip = (s: string) => s.replace(/==[gb]:|==|\+\+|\*\*|`/g, '')

export function buildSearch(kb: Kb): MiniSearch<SearchDoc> {
  const ms = new MiniSearch<SearchDoc>({
    fields: ['title', 'text'],
    storeFields: ['kind', 'refId', 'title', 'domain'],
    searchOptions: { boost: { title: 3 }, prefix: true, fuzzy: 0.2 },
  })
  const docs: SearchDoc[] = [
    ...kb.concepts.map((c) => ({
      id: `c:${c.id}`,
      kind: 'concept' as const,
      refId: c.id,
      title: c.title,
      text: strip([c.summary, ...[...c.keyPoints, ...(c.traps ?? [])].flatMap((k) => [itemText(k), ...itemSubs(k)])].join(' ')),
      domain: c.domain,
    })),
    ...kb.flashcards.map((f) => ({
      id: `f:${f.id}`,
      kind: 'flashcard' as const,
      refId: f.conceptId,
      title: strip(f.front),
      text: strip(f.back),
      domain: kb.conceptById.get(f.conceptId)?.domain ?? 0,
    })),
    ...kb.tables.map((t) => ({
      id: `t:${t.id}`,
      kind: 'table' as const,
      refId: t.id,
      title: t.title,
      text: strip([t.description ?? '', ...t.columns, ...t.rows.flat()].join(' ')),
      domain: t.domain ?? 0,
    })),
  ]
  ms.addAll(docs)
  return ms
}
