import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Kb } from '../kb/types'
import { FlashcardCard } from '../components/cards/FlashcardCard'
import { QuizCard } from '../components/cards/QuizCard'
import { RecallCard } from '../components/cards/RecallCard'
import { StoryCard } from '../components/cards/StoryCard'
import { Logo } from '../components/Nav'
import { TableCard } from '../components/cards/TableCard'
import { computeCoverage, nextObjective } from '../lib/coverage'
import { buildBatch, type FeedItem } from '../lib/feed'
import { useActiveKeys } from '../lib/keys'
import { useProgress } from '../lib/progress'
import { scopeConcepts, scopeLabel, type Scope } from '../lib/scope'
import { dueCount } from '../lib/stats'
import { btnPrimary, btnSecondary } from '../components/buttons'

interface Slot {
  uid: string
  item: FeedItem
}

const PREFETCH_AHEAD = 5

function FeedCard({ item, kb, active, onDone }: { item: FeedItem; kb: Kb; active: boolean; onDone: () => void }) {
  switch (item.kind) {
    case 'story': {
      const c = kb.conceptById.get(item.id)
      return c ? <StoryCard concept={c} kb={kb} active={active} onDone={onDone} /> : null
    }
    case 'flashcard': {
      const fc = kb.flashcardById.get(item.id)
      return fc ? <FlashcardCard card={fc} kb={kb} active={active} onDone={onDone} /> : null
    }
    case 'quiz': {
      const q = kb.questionById.get(item.id)
      return q ? <QuizCard question={q} kb={kb} active={active} onDone={onDone} /> : null
    }
    case 'table': {
      const t = kb.tableById.get(item.id)
      return t ? <TableCard table={t} kb={kb} active={active} /> : null
    }
    case 'mnemonic':
    case 'trap': {
      const c = kb.conceptById.get(item.id)
      return c ? <RecallCard concept={c} kb={kb} kind={item.kind} active={active} /> : null
    }
  }
}

function EndCard({ kb, scope, onPick, onRestart }: { kb: Kb; scope: Scope; onPick: (s: Scope) => void; onRestart: () => void }) {
  const { state } = useProgress()
  const concepts = scopeConcepts(kb, scope)
  const unread = concepts.filter((c) => !state.read.has(c.id)).length
  const due = dueCount(state.cards, kb, new Date())
  const cov = useMemo(() => computeCoverage(kb, state.read, state.cards), [kb, state.read, state.cards])

  let from: string | undefined
  if (scope.kind === 'objective') from = scope.objective
  else if (scope.kind === 'topic') from = scope.topic.split('.').slice(0, 2).join('.')
  else if (scope.kind === 'domain' || scope.kind === 'domain-mix') from = kb.outline.domains.find((d) => d.number === scope.domain)?.objectives.at(-1)?.id
  const next = scope.kind === 'mix' || scope.kind === 'due' ? nextObjective(kb, cov) : nextObjective(kb, cov, from, scope.kind !== 'topic')

  const title =
    scope.kind === 'due'
      ? 'All reviews done.'
      : unread === 0
        ? `${scopeLabel(scope)} fully read.`
        : `You went through ${scopeLabel(scope)}.`

  return (
    <div className="mx-auto flex h-full w-full max-w-7xl px-3 pb-3 pt-1 md:px-8 md:pb-6">
      <div className="card d-0 flex w-full flex-col items-center justify-center gap-5 px-6 text-center">
        <h2 className="font-display text-3xl font-medium md:text-5xl">{title}</h2>
        {scope.kind !== 'due' && unread > 0 && (
          <p className="text-muted">
            {unread} concept{unread === 1 ? '' : 's'} not finished yet.
          </p>
        )}
        <div className="flex flex-col items-center gap-3">
          {scope.kind !== 'due' && unread > 0 && (
            <button type="button" onClick={onRestart} className={btnSecondary}>
              Go through the unfinished ones
            </button>
          )}
          {next && (
            <button type="button" onClick={() => onPick({ kind: 'objective', objective: next.id })} className={btnPrimary}>
              Next up: {next.id} {next.title.length > 48 ? `${next.title.slice(0, 46)}...` : next.title}
            </button>
          )}
          {scope.kind !== 'due' && due > 0 && (
            <button type="button" onClick={() => onPick({ kind: 'due' })} className={btnSecondary}>
              Review {due} due flashcard{due === 1 ? '' : 's'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ScopeChip({ kb, scope, onClick }: { kb: Kb; scope: Scope; onClick: () => void }) {
  const { state } = useProgress()
  let text: string
  let done = 0
  let total = 0
  if (scope.kind === 'due') {
    text = `Reviews · ${dueCount(state.cards, kb, new Date())} due`
  } else {
    const concepts = scopeConcepts(kb, scope)
    total = concepts.length
    done = concepts.filter((c) => state.read.has(c.id)).length
    text = `${scopeLabel(scope)} · ${done}/${total} read`
  }
  let domain = 0
  if (scope.kind === 'domain' || scope.kind === 'domain-mix') domain = scope.domain
  else if (scope.kind === 'objective') domain = Number(scope.objective.split('.')[0])
  else if (scope.kind === 'topic') domain = Number(scope.topic.split('.')[0])
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${text}. Change what to study`}
      className={`d-${domain} chip-domain flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold`}
    >
      <span aria-hidden="true">&larr;</span>
      <span data-testid="scope-chip">{text}</span>
      {total > 0 && (
        <span className="h-1.5 w-12 overflow-hidden rounded-full bg-[var(--dc-track)]" aria-hidden="true">
          <span className="bar-domain block h-full rounded-full" style={{ width: `${Math.round((done / total) * 100)}%` }} />
        </span>
      )}
    </button>
  )
}

export function Feed({ kb, scope, visible, onPick, onHome }: { kb: Kb; scope: Scope | null; visible: boolean; onPick: (s: Scope) => void; onHome: () => void }) {
  const { state } = useProgress()
  const [slots, setSlots] = useState<Slot[]>([])
  const [active, setActive] = useState(0)
  const [exhausted, setExhausted] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const batchNo = useRef(0)
  const latest = useRef(state)
  latest.current = state
  const slotsRef = useRef(slots)
  slotsRef.current = slots

  const appendBatch = useCallback(() => {
    if (!scope) return
    const prev = slotsRef.current
    const batch = buildBatch({
      kb,
      progress: latest.current,
      scope,
      now: new Date(),
      shown: new Set(prev.map((x) => x.item.key)),
      seed: (Date.now() ^ Math.imul(batchNo.current + 1, 2654435761)) >>> 0,
    })
    const n = batchNo.current++
    if (batch.exhausted) setExhausted(true)
    if (batch.items.length === 0) return
    slotsRef.current = [...prev, ...batch.items.map((item) => ({ uid: `${n}-${item.key}`, item }))]
    setSlots(slotsRef.current)
  }, [kb, scope])

  useEffect(() => {
    if (slots.length === 0 && !exhausted) appendBatch()
  }, [slots.length, exhausted, appendBatch])

  useEffect(() => {
    if (slots.length > 0 && !exhausted && active >= slots.length - PREFETCH_AHEAD) appendBatch()
  }, [active, slots.length, exhausted, appendBatch])

  useEffect(() => {
    const root = scrollRef.current
    if (!root) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.index))
      },
      { root, threshold: 0.6 },
    )
    root.querySelectorAll('[data-index]').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [slots.length, exhausted])

  const goTo = (i: number) => {
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-index="${i}"]`)
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches || !state.settings.animations
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }

  useActiveKeys(visible, (e) => {
    if (e.key === 'Escape') {
      // An open dialog (concept sheet) handles its own Escape.
      if (document.querySelector('dialog[open]')) return
      e.preventDefault()
      onHome()
    } else if (e.key === 'ArrowDown' || e.key === 'j') {
      e.preventDefault()
      goTo(Math.min(active + 1, slots.length))
    } else if (e.key === 'ArrowUp' || e.key === 'k') {
      e.preventDefault()
      goTo(Math.max(active - 1, 0))
    }
  })

  const restart = () => {
    slotsRef.current = []
    setSlots([])
    setActive(0)
    setExhausted(false)
    scrollRef.current?.scrollTo(0, 0)
  }

  if (!scope)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
        <h1 className="font-display text-3xl font-medium">Pick what to study</h1>
        <p className="max-w-sm text-muted">Choose a domain, an objective or a mix on Home. The feed follows your choice.</p>
        <button type="button" onClick={onHome} className={btnPrimary}>
          Go to Home
        </button>
      </div>
    )

  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto flex w-full max-w-7xl shrink-0 items-center gap-3 px-3 py-1.5 md:px-8 desk:px-10 desk:pt-4">
        <Logo className="hidden text-xl desk:block" />
        <ScopeChip kb={kb} scope={scope} onClick={onHome} />
        <button
          type="button"
          onClick={onHome}
          aria-label="Close story"
          className="ml-auto inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-[10px] text-sm font-bold text-muted hover:text-fg desk:border desk:border-line desk:px-3.5"
        >
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
          <span className="hidden desk:inline">Close</span>
        </button>
      </div>
      <div ref={scrollRef} className="feed min-h-0 flex-1" aria-label="Study feed" role="feed" aria-busy={slots.length === 0 && !exhausted}>
        {slots.map((s, i) => (
          <section key={s.uid} data-index={i} className="feed-item" aria-setsize={-1} aria-posinset={i + 1}>
            <FeedCard item={s.item} kb={kb} active={visible && i === active} onDone={() => goTo(i + 1)} />
          </section>
        ))}
        {exhausted && (
          <section data-index={slots.length} className="feed-item">
            <EndCard kb={kb} scope={scope} onPick={onPick} onRestart={restart} />
          </section>
        )}
      </div>
    </div>
  )
}
