import { useState } from 'react'
import type { Kb, Question } from '../../kb/types'
import { useActiveKeys } from '../../lib/keys'
import { useMediaQuery, WIDE } from '../../lib/media'
import { useProgress } from '../../lib/progress'
import { DomainChip, Label } from '../Chips'
import { Inline } from '../Inline'
import { useOpenConcept } from '../openConcept'
import { CardShell } from './CardShell'

const LETTERS = ['A', 'B', 'C', 'D']

export function QuizCard({ question, kb, active }: { question: Question; kb: Kb; active: boolean }) {
  const { recordAttempt } = useProgress()
  const openConcept = useOpenConcept()
  const [chosen, setChosen] = useState<number | null>(null)
  const locked = chosen !== null
  const correct = chosen === question.answer
  const isWide = useMediaQuery(WIDE)

  const choose = (i: number) => {
    if (locked) return
    setChosen(i)
    void recordAttempt(question, i)
  }

  useActiveKeys(active, (e) => {
    const n = Number(e.key)
    if (n >= 1 && n <= question.options.length) {
      e.preventDefault()
      choose(n - 1)
    }
  })

  const optionClass = (i: number) => {
    if (!locked) return 'border-line bg-surface hover:border-dc hover:bg-dc-soft'
    if (i === question.answer) return 'border-success/50 bg-ok-soft'
    if (i === chosen) return 'border-danger/50 bg-bad-soft'
    return 'border-line bg-surface opacity-55'
  }

  const feedback = (
    <div className="reveal mt-4 flex flex-col gap-2" role="status">
      <p className={`font-display text-lg font-bold ${correct ? 'text-success' : 'text-danger'} lg:text-2xl`}>
        {correct ? 'Correct.' : `Not quite. The answer is ${LETTERS[question.answer]}.`}
      </p>
      <p className="text-sm leading-relaxed lg:text-base">
        <Inline text={question.explanation} />
      </p>
      <div className="flex flex-wrap gap-2">
        {question.conceptIds
          .map((id) => kb.conceptById.get(id))
          .filter((c) => c !== undefined)
          .map((c) => (
            <button key={c.id} type="button" onClick={() => openConcept(c.id)} className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold hover:border-dc">
              {c.title}
            </button>
          ))}
      </div>
    </div>
  )

  return (
    <CardShell domain={question.domain} label="Scenario question" live={active}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <DomainChip domain={question.domain} label={`D${question.domain}`} />
        <span className="font-mono text-xs text-muted">{question.objective}</span>
        <Label>{question.style === 'manager' ? 'Think like a manager' : 'Scenario'}</Label>
      </div>
      <div className="flex flex-col lg:my-auto lg:grid lg:grid-cols-2 lg:gap-12">
        <div className="flex flex-col">
          <p className="mb-5 text-lg font-semibold leading-snug lg:text-2xl">
            <Inline text={question.stem} qualifiers />
          </p>
          {locked && isWide && feedback}
        </div>
        <div className="flex flex-col gap-2 lg:gap-3" role="group" aria-label="Answer options">
          {question.options.map((opt, i) => (
            <button
              key={i}
              type="button"
              onClick={() => choose(i)}
              aria-disabled={locked}
              aria-pressed={chosen === i}
              className={`flex gap-3 rounded-2xl border-2 px-4 py-3 text-left text-[0.98rem] leading-snug lg:px-5 lg:py-4 lg:text-lg ${optionClass(i)}`}
            >
              <span className="font-display font-bold text-muted">{LETTERS[i]}</span>
              <span>
                <Inline text={opt} />
              </span>
            </button>
          ))}
        </div>
      </div>
      {locked && !isWide && feedback}
      {!locked && <p className="mt-4 text-xs text-muted">Keys 1 to 4 pick an option.</p>}
    </CardShell>
  )
}
