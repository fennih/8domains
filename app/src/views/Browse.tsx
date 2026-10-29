import { useMemo, useState } from 'react'
import { buildSearch, type SearchDoc } from '../kb/search'
import type { Kb, KbTable } from '../kb/types'
import { DomainChip, Label, PriorityBadge } from '../components/Chips'
import { DataTable } from '../components/cards/TableCard'
import { Inline } from '../components/Inline'
import { useOpenConcept } from '../components/openConcept'
import { useProgress } from '../lib/progress'

type View = { level: 'home' } | { level: 'domain'; domain: number } | { level: 'objective'; domain: number; objective: string } | { level: 'table'; id: string }

const KIND_LABEL = { concept: 'Concept', flashcard: 'Flashcard', table: 'Table' } as const

function Row({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-left hover:border-accent"
      >
        {children}
        <span aria-hidden="true" className="ml-auto text-muted">
          &rsaquo;
        </span>
      </button>
    </li>
  )
}

function TableView({ table }: { table: KbTable }) {
  return (
    <div className={`d-${table.domain ?? 0} flex flex-col gap-3`}>
      <div className="flex flex-wrap items-center gap-2">
        <DomainChip domain={table.domain ?? 0} />
        <PriorityBadge priority={table.priority} />
      </div>
      <h2 className="text-xl font-medium">{table.title}</h2>
      {table.description && (
        <p className="text-sm text-muted">
          <Inline text={table.description} />
        </p>
      )}
      <DataTable table={table} />
    </div>
  )
}

export function Browse({ kb }: { kb: Kb }) {
  const { state } = useProgress()
  const openConcept = useOpenConcept()
  const [view, setView] = useState<View>({ level: 'home' })
  const [query, setQuery] = useState('')
  const search = useMemo(() => buildSearch(kb), [kb])
  const results = useMemo(() => (query.trim().length >= 2 ? search.search(query.trim()).slice(0, 40) : []), [search, query])

  const back = () => {
    if (view.level === 'objective') setView({ level: 'domain', domain: view.domain })
    else setView({ level: 'home' })
  }

  const openResult = (kind: SearchDoc['kind'], refId: string) => {
    if (kind !== 'table') return openConcept(refId)
    setQuery('')
    setView({ level: 'table', id: refId })
  }

  const countFor = (pred: (c: { domain: number; objective: string }) => boolean) => kb.concepts.filter(pred).length

  let body: React.ReactNode
  if (query.trim().length >= 2) {
    body = (
      <section aria-label="Search results" className="flex flex-col gap-2">
        <Label>{`${results.length} result${results.length === 1 ? '' : 's'}`}</Label>
        <ul className="flex flex-col gap-2">
          {results.map((r) => (
            <Row
              key={r.id}
              onClick={() => openResult(r.kind as SearchDoc['kind'], r.refId)}
            >
              <span className="flex flex-col gap-1">
                <span className="flex items-center gap-2">
                  <DomainChip domain={r.domain} label={r.domain > 0 ? `D${r.domain}` : 'All'} />
                  <span className="text-xs text-muted">{KIND_LABEL[r.kind as SearchDoc['kind']]}</span>
                </span>
                <span className="font-medium">{r.title}</span>
              </span>
            </Row>
          ))}
        </ul>
        {results.length === 0 && <p className="text-sm text-muted">Nothing matches. Try a shorter or different term.</p>}
      </section>
    )
  } else if (view.level === 'home') {
    body = (
      <>
        <section aria-label="Domains" className="flex flex-col gap-2">
          <Label>Domains</Label>
          <ul className="flex flex-col gap-2">
            {kb.outline.domains.map((d) => {
              const total = countFor((c) => c.domain === d.number)
              const read = kb.concepts.filter((c) => c.domain === d.number && state.read.has(c.id)).length
              return (
                <Row key={d.id} onClick={() => setView({ level: 'domain', domain: d.number })}>
                  <span className={`d-${d.number} bar-domain h-10 w-1 shrink-0 rounded-full`} aria-hidden="true" />
                  <span className="flex flex-col">
                    <span className="font-medium">
                      {d.number}. {d.title}
                    </span>
                    <span className="text-xs text-muted">
                      {d.weight}% of exam · {total === 0 ? 'no content yet' : `${read}/${total} concepts read`}
                    </span>
                  </span>
                </Row>
              )
            })}
          </ul>
        </section>
        <section aria-label="Cheat sheet" className="flex flex-col gap-2">
          <Label>Cheat sheet</Label>
          {kb.tables.length === 0 ? (
            <p className="text-sm text-muted">No tables yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {kb.tables.map((t) => (
                <Row key={t.id} onClick={() => setView({ level: 'table', id: t.id })}>
                  <DomainChip domain={t.domain ?? 0} label={t.domain ? `D${t.domain}` : 'All'} />
                  <span className="font-medium">{t.title}</span>
                </Row>
              ))}
            </ul>
          )}
        </section>
      </>
    )
  } else if (view.level === 'domain') {
    const d = kb.outline.domains.find((x) => x.number === view.domain)
    body = d && (
      <section aria-label={d.title} className="flex flex-col gap-2">
        <DomainChip domain={d.number} />
        <h2 className="text-xl font-medium">{d.title}</h2>
        <ul className="flex flex-col gap-2">
          {d.objectives.map((o) => {
            const n = countFor((c) => c.objective === o.id)
            return (
              <Row key={o.id} onClick={() => setView({ level: 'objective', domain: d.number, objective: o.id })}>
                <span className="w-8 shrink-0 text-xs font-bold tabular-nums text-muted">{o.id}</span>
                <span className="flex flex-col">
                  <span className="text-sm font-medium">{o.title}</span>
                  <span className="text-xs text-muted">{n === 0 ? 'no concepts yet' : `${n} concept${n === 1 ? '' : 's'}`}</span>
                </span>
              </Row>
            )
          })}
        </ul>
      </section>
    )
  } else if (view.level === 'objective') {
    const d = kb.outline.domains.find((x) => x.number === view.domain)
    const o = d?.objectives.find((x) => x.id === view.objective)
    const concepts = kb.concepts.filter((c) => c.objective === view.objective)
    body = o && (
      <section aria-label={o.title} className="flex flex-col gap-2">
        <span className="text-xs font-bold tabular-nums text-muted">{o.id}</span>
        <h2 className="text-lg font-medium">{o.title}</h2>
        {o.topics.length > 0 && (
          <ul className="mb-2 list-disc pl-5 text-xs text-muted">
            {o.topics.map((t) => (
              <li key={t.id}>{t.title}</li>
            ))}
          </ul>
        )}
        {concepts.length === 0 ? (
          <p className="text-sm text-muted">No concepts for this objective yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {concepts.map((c) => (
              <Row key={c.id} onClick={() => openConcept(c.id)}>
                <span className="flex flex-col gap-1">
                  <span className="font-medium">{c.title}</span>
                  <span className="flex items-center gap-2">
                    <PriorityBadge priority={c.priority} />
                    {state.read.has(c.id) && <span className="text-xs font-semibold text-success">read</span>}
                  </span>
                </span>
              </Row>
            ))}
          </ul>
        )}
      </section>
    )
  } else {
    const t = kb.tableById.get(view.id)
    body = t && <TableView table={t} />
  }

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col md:max-w-4xl md:px-8 xl:max-w-6xl gap-4 overflow-y-auto px-4 py-6">
      <a href="#home" className="-mb-2 inline-flex min-h-11 items-center self-start text-sm font-semibold text-muted hover:text-fg">
        &larr; Home
      </a>
      <h1 className="text-2xl">Browse</h1>
      <div>
        <label htmlFor="browse-search" className="sr-only">
          Search concepts, flashcards and tables
        </label>
        <input
          id="browse-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value.slice(0, 100))}
          placeholder="Search concepts, flashcards, tables"
          autoComplete="off"
          className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-fg placeholder:text-muted"
        />
      </div>
      {view.level !== 'home' && query.trim().length < 2 && (
        <button type="button" onClick={back} className="min-h-11 self-start text-sm font-semibold text-muted hover:text-fg">
          &larr; Back
        </button>
      )}
      {body}
    </div>
  )
}
