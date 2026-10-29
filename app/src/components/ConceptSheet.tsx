import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Kb } from '../kb/types'
import { ConceptBody } from './ConceptBody'
import { DomainChip, Label, PriorityBadge } from './Chips'
import { Inline } from './Inline'
import { OpenConceptContext } from './openConcept'

export function ConceptSheetProvider({ kb, children }: { kb: Kb; children: ReactNode }) {
  const [conceptId, setConceptId] = useState<string | null>(null)
  const ref = useRef<HTMLDialogElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const open = useCallback((id: string) => setConceptId(id), [])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (conceptId && !dialog.open) dialog.showModal()
    if (!conceptId && dialog.open) dialog.close()
    scrollRef.current?.scrollTo(0, 0)
  }, [conceptId])

  const concept = conceptId ? kb.conceptById.get(conceptId) : undefined
  const cards = concept ? (kb.flashcardsByConcept.get(concept.id) ?? []) : []

  return (
    <OpenConceptContext.Provider value={open}>
      {children}
      <dialog
        ref={ref}
        onClose={() => setConceptId(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setConceptId(null)
        }}
        aria-labelledby="concept-sheet-title"
        className="m-0 mt-auto h-[88dvh] max-h-none w-full max-w-none rounded-t-2xl border border-line bg-surface p-0 text-fg md:m-auto md:h-[80dvh] md:max-w-xl md:rounded-2xl"
      >
        {concept && (
          <div ref={scrollRef} className="flex h-full flex-col overflow-y-auto px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <DomainChip domain={concept.domain} />
                <span className="text-xs font-bold tabular-nums text-muted">{concept.objective}</span>
                <PriorityBadge priority={concept.priority} />
              </div>
              <button
                type="button"
                onClick={() => setConceptId(null)}
                className="min-h-11 rounded-[10px] border border-line px-4 text-sm font-bold hover:border-muted"
                aria-label="Close concept"
              >
                Close
              </button>
            </div>
            <h2 id="concept-sheet-title" className="mb-3 text-xl font-medium">
              {concept.title}
            </h2>
            <ConceptBody concept={concept} kb={kb} expanded />
            {cards.length > 0 && (
              <div className="mt-5 flex flex-col gap-2">
                <Label>Flashcards</Label>
                {cards.map((fc) => (
                  <div key={fc.id} className="rounded-xl border border-line bg-surface-2/60 p-3 text-sm">
                    <p className="font-medium">
                      <Inline text={fc.front} />
                    </p>
                    <p className="mt-1 text-muted">
                      <Inline text={fc.back} />
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </dialog>
    </OpenConceptContext.Provider>
  )
}
