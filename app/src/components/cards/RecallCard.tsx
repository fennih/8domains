import { useState } from 'react'
import type { Concept, Kb } from '../../kb/types'
import { useActiveKeys } from '../../lib/keys'
import { Bullets } from '../Bullets'
import { CardContext, Pill } from '../Chips'
import { Inline } from '../Inline'
import { useOpenConcept } from '../openConcept'
import { CardShell } from './CardShell'
import { btnPrimary } from '../buttons'

// A short recall prompt for a concept already read: think first, then reveal.
export function RecallCard({ concept, kb, kind, active }: { concept: Concept; kb: Kb; kind: 'mnemonic' | 'trap'; active: boolean }) {
  const openConcept = useOpenConcept()
  const [open, setOpen] = useState(false)

  useActiveKeys(active, (e) => {
    if (e.key === ' ' && !open && !(e.target as HTMLElement | null)?.closest('button')) {
      e.preventDefault()
      setOpen(true)
    }
  })

  return (
    <CardShell domain={concept.domain} label={kind === 'mnemonic' ? 'Mnemonic recall' : 'Trap recall'} live={active}>
      <div className="flex items-start justify-between gap-4">
        <CardContext kb={kb} domain={concept.domain} objective={concept.objective} />
        <Pill kind="recall">Recall</Pill>
      </div>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6">
        <h2 className="font-display text-[1.7rem] font-medium leading-tight md:text-4xl">
          {kind === 'mnemonic' ? `Remember the mnemonic for ${concept.title}?` : `What is the exam trap in ${concept.title}?`}
        </h2>
        {open ? (
          kind === 'mnemonic' ? (
            <p className="reveal text-xl font-semibold leading-snug md:text-3xl">
              <Inline text={concept.mnemonic ?? ''} />
            </p>
          ) : (
            <Bullets items={concept.traps ?? []} className="text-xl leading-snug md:text-3xl" subClassName="text-lg md:text-2xl" />
          )
        ) : (
          <button type="button" onClick={() => setOpen(true)} className={`${btnPrimary} self-start`}>
            Reveal
          </button>
        )}
      </div>
      {open && (
        <button type="button" onClick={() => openConcept(concept.id)} className="self-start text-sm font-semibold text-muted underline-offset-4 hover:underline">
          Open the full concept
        </button>
      )}
    </CardShell>
  )
}
