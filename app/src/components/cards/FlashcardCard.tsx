import { useEffect, useRef, useState } from 'react'
import { Rating, type Grade } from 'ts-fsrs'
import type { Flashcard, Kb } from '../../kb/types'
import { flashcardDomain } from '../../kb/types'
import { formatInterval } from '../../lib/dates'
import { useActiveKeys } from '../../lib/keys'
import { useProgress } from '../../lib/progress'
import { CardBack } from '../CardBack'
import { CardContext, Label } from '../Chips'
import { Inline } from '../Inline'
import { useOpenConcept } from '../openConcept'
import { CardShell } from './CardShell'

const TYPE_LABEL = { qa: '', cloze: ' · Fill the gap', compare: ' · Compare' } as const
// Long enough to read "Back in 2d" before the feed moves on.
const ADVANCE_MS = 700

export function FlashcardCard({ card, kb, active, onDone }: { card: Flashcard; kb: Kb; active: boolean; onDone: () => void }) {
  const { state, grade } = useProgress()
  const openConcept = useOpenConcept()
  const [flipped, setFlipped] = useState(false)
  const [result, setResult] = useState<Date | null>(null)
  const [busy, setBusy] = useState(false)
  // Fixed at mount so grading does not flip the label from "New card" to "Review".
  const [isNew] = useState(() => !state.cards.has(card.id))
  const activeRef = useRef(active)
  activeRef.current = active
  const advance = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(advance.current), [])

  const next = () => {
    window.clearTimeout(advance.current)
    onDone()
  }
  const concept = kb.conceptById.get(card.conceptId)
  const domain = flashcardDomain(card)

  const onGrade = async (g: Grade) => {
    if (busy || result) return
    setBusy(true)
    try {
      setResult((await grade(card.id, g)).due)
      advance.current = window.setTimeout(() => {
        if (activeRef.current) onDone()
      }, ADVANCE_MS)
    } finally {
      setBusy(false)
    }
  }

  useActiveKeys(active, (e) => {
    if (e.key === ' ' && !(e.target as HTMLElement | null)?.closest('button')) {
      e.preventDefault()
      setFlipped((f) => !f)
    } else if (flipped && (e.key === '1' || e.key === '2')) {
      e.preventDefault()
      void onGrade(e.key === '1' ? Rating.Again : Rating.Good)
    } else if (e.key === 'Enter') {
      // Enter reveals the answer, then means "Got it". A focused grade button keeps its native Enter.
      const target = e.target as HTMLElement | null
      if (target?.closest('button') && !target.closest('[aria-expanded]')) return
      e.preventDefault()
      if (!flipped) setFlipped(true)
      else if (result) next()
      else void onGrade(Rating.Good)
    }
  })

  return (
    <CardShell domain={domain} label="Flashcard" live={active}>
      <div className="flex items-start justify-between gap-4">
        <CardContext kb={kb} domain={domain} objective={concept?.objective} />
        <span className="flex min-w-0 flex-col items-end gap-0.5">
          <Label>{`${isNew ? 'New card' : 'Review'}${TYPE_LABEL[card.type]}`}</Label>
          {concept && (
            <button type="button" onClick={() => openConcept(concept.id)} className="max-w-full truncate text-right text-[13px] text-muted hover:text-fg md:text-sm">
              {concept.title}
            </button>
          )}
        </span>
      </div>
      {/* The answer sits outside the flip button: a numbered list is not valid button content. */}
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6">
        <button
          type="button"
          onClick={() => setFlipped((f) => !f)}
          aria-expanded={flipped}
          className={`flex flex-col justify-center gap-6 rounded-2xl text-left ${flipped ? '' : 'flex-1'}`}
        >
          <span className="font-display text-[1.75rem] font-medium leading-tight md:text-5xl">
            <Inline text={card.front} />
          </span>
          {!flipped && <span className="text-sm text-muted">Tap to flip</span>}
        </button>
        {flipped && (
          <div className="reveal border-t-2 border-dashed border-line pt-6 text-xl leading-relaxed md:text-3xl">
            <CardBack back={card.back} />
          </div>
        )}
      </div>
      {flipped && (
        <div className="mx-auto w-full max-w-3xl">
          {result ? (
            <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm" role="status">
              Saved. Back in {formatInterval(new Date(), result)}.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3" role="group" aria-label="How did it go?">
              <button
                type="button"
                disabled={busy}
                onClick={() => void onGrade(Rating.Again)}
                className="rounded-2xl border-2 border-danger/40 bg-bad-soft py-3 text-base font-bold text-danger disabled:opacity-50"
              >
                Again
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onGrade(Rating.Good)}
                className="rounded-2xl border-2 border-success/40 bg-ok-soft py-3 text-base font-bold text-success disabled:opacity-50"
              >
                Got it
              </button>
            </div>
          )}
        </div>
      )}
    </CardShell>
  )
}
