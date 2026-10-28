import { useState } from 'react'
import { Rating, type Grade } from 'ts-fsrs'
import type { Flashcard, Kb } from '../../kb/types'
import { flashcardDomain } from '../../kb/types'
import { formatInterval } from '../../lib/dates'
import { useActiveKeys } from '../../lib/keys'
import { useProgress } from '../../lib/progress'
import { DomainChip, Label } from '../Chips'
import { Inline } from '../Inline'
import { useOpenConcept } from '../openConcept'
import { CardShell } from './CardShell'

const TYPE_LABEL = { qa: 'Flashcard', cloze: 'Fill the gap', compare: 'Compare' } as const

export function FlashcardCard({ card, kb, active }: { card: Flashcard; kb: Kb; active: boolean }) {
  const { grade } = useProgress()
  const openConcept = useOpenConcept()
  const [flipped, setFlipped] = useState(false)
  const [result, setResult] = useState<Date | null>(null)
  const [busy, setBusy] = useState(false)
  const concept = kb.conceptById.get(card.conceptId)
  const domain = flashcardDomain(card)

  const onGrade = async (g: Grade) => {
    if (busy || result) return
    setBusy(true)
    try {
      setResult((await grade(card.id, g)).due)
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
      else void onGrade(Rating.Good)
    }
  })

  return (
    <CardShell domain={domain} label="Flashcard" live={active}>
      <div className="flex flex-wrap items-center gap-2">
        <DomainChip domain={domain} label={`D${domain}`} />
        <Label>{TYPE_LABEL[card.type]}</Label>
        {concept && (
          <button type="button" onClick={() => openConcept(concept.id)} className="min-w-0 flex-1 truncate text-right text-sm text-muted hover:text-fg">
            {concept.title}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-expanded={flipped}
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 rounded-2xl text-left"
      >
        <span className="font-display text-[1.75rem] font-bold leading-tight md:text-5xl">
          <Inline text={card.front} />
        </span>
        {flipped ? (
          <span className="reveal border-t-2 border-dashed border-line pt-6 text-xl leading-relaxed md:text-3xl">
            <Inline text={card.back} />
          </span>
        ) : (
          <span className="text-sm text-muted">Tap to flip</span>
        )}
      </button>
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
