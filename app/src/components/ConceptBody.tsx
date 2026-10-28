import type { Concept, Kb } from '../kb/types'
import { useMediaQuery, WIDE } from '../lib/media'
import { Bullets } from './Bullets'
import { Inline } from './Inline'
import { useOpenConcept } from './openConcept'

function Section({ title, children, open }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group rounded-xl border border-line bg-surface-2/60">
      <summary className="cursor-pointer list-none rounded-xl px-3 py-2 text-sm font-semibold lg:text-base">
        <span className="mr-2 inline-block transition-transform group-open:rotate-90" aria-hidden="true">
          &rsaquo;
        </span>
        {title}
      </summary>
      <div className="px-3 pb-3 text-sm leading-relaxed lg:text-base">{children}</div>
    </details>
  )
}

// `wide` puts the core content and the exam-angle sections side by side on large screens.
export function ConceptBody({ concept, kb, expanded = false, wide = false }: { concept: Concept; kb: Kb; expanded?: boolean; wide?: boolean }) {
  const openConcept = useOpenConcept()
  const isWide = useMediaQuery(WIDE) && wide
  const open = expanded || isWide
  const related = (concept.related ?? []).map((id) => kb.conceptById.get(id)).filter((c) => c !== undefined)
  const hasSide = Boolean(concept.managerView || concept.traps?.length || concept.mnemonic)

  const core = (
    <div className="flex flex-col gap-3 lg:gap-4">
      <p className={`leading-relaxed ${isWide ? 'text-lg' : 'text-[0.95rem]'}`}>
        <Inline text={concept.summary} />
      </p>
      <Bullets items={concept.keyPoints} className={`leading-relaxed ${isWide ? 'text-base' : 'text-sm'}`} />
    </div>
  )

  const side = (
    <div className="flex flex-col gap-3">
      {concept.managerView && (
        <Section title="Manager view" open={open}>
          <Inline text={concept.managerView} />
        </Section>
      )}
      {concept.traps && concept.traps.length > 0 && (
        <Section title="Traps" open={open}>
          <Bullets items={concept.traps} />
        </Section>
      )}
      {concept.mnemonic && (
        <Section title="Mnemonic" open={open}>
          <Inline text={concept.mnemonic} />
        </Section>
      )}
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      {isWide && hasSide ? (
        <div className="grid grid-cols-[3fr_2fr] gap-10">
          {core}
          {side}
        </div>
      ) : (
        <>
          {core}
          {hasSide && side}
        </>
      )}
      {related.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 lg:mt-2">
          <span className="text-xs text-muted">Related</span>
          {related.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => openConcept(r.id)}
              className="rounded-full border border-line bg-surface-2 px-3 py-1 text-xs font-medium hover:border-accent"
            >
              {r.title}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
