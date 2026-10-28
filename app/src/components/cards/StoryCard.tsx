import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import type { Concept } from '../../kb/types'
import { conceptStory, type Screen } from '../../lib/beats'
import { useActiveKeys } from '../../lib/keys'
import { useProgress } from '../../lib/progress'
import { Bullets } from '../Bullets'
import { DomainChip, Pill } from '../Chips'
import { Inline } from '../Inline'
import { useOpenConcept } from '../openConcept'
import { CardShell } from './CardShell'

const SWIPE_MIN = 40
const SWIPE_RATIO = 1.5

function ScreenBody({ screen, reveal, title }: { screen: Screen; reveal: number; title: string }) {
  switch (screen.kind) {
    case 'hook':
      return (
        <>
          <p className="text-sm font-bold uppercase tracking-wider text-dc-ink">{title}</p>
          <p className="font-display text-[2rem] font-bold leading-[1.15] md:text-5xl">
            <Inline text={screen.text} />
          </p>
        </>
      )
    case 'summary':
      return (
        <p className={screen.text.length > 220 ? 'text-xl leading-snug md:text-3xl' : 'text-[1.45rem] leading-snug md:text-[2.1rem]'}>
          <Inline text={screen.text} />
        </p>
      )
    case 'points':
    case 'traps':
      return (
        <>
          <Pill kind={screen.kind === 'traps' ? 'trap' : 'point'}>
            {screen.kind === 'traps' ? 'Exam traps' : screen.parts > 1 ? `Key points ${screen.part}/${screen.parts}` : 'Key points'}
          </Pill>
          <Bullets
            items={screen.items.slice(0, reveal)}
            className="text-xl leading-snug md:text-[1.9rem] md:leading-snug"
            subClassName="text-base md:text-2xl"
          />
        </>
      )
    case 'manager':
    case 'mnemonic':
      return (
        <>
          <Pill kind={screen.kind}>{screen.kind === 'manager' ? 'Manager view' : 'Mnemonic'}</Pill>
          <p className="text-[1.4rem] leading-snug md:text-[2.1rem]">
            <Inline text={screen.text} />
          </p>
        </>
      )
  }
}

export function StoryCard({ concept, active, onDone }: { concept: Concept; active: boolean; onDone: () => void }) {
  const { state, markSeen, markRead } = useProgress()
  const openConcept = useOpenConcept()
  const { screens, steps } = useMemo(() => conceptStory(concept), [concept])
  const [index, setIndex] = useState(0)
  const [dir, setDir] = useState<'next' | 'prev'>('next')
  const press = useRef<{ x: number; y: number } | null>(null)
  const swiped = useRef(false)
  const last = steps.length - 1
  const step = steps[index]!
  const wasRead = state.read.has(concept.id)

  useEffect(() => {
    if (active) markSeen(concept.id)
  }, [active, concept.id, markSeen])

  useEffect(() => {
    if (index === last) markRead(concept.id)
  }, [index, last, concept.id, markRead])

  // Moving within a list screen reveals or hides one bullet; the screen itself stays mounted.
  const go = (to: number) => {
    if (steps[to]!.screen !== step.screen) setDir(to > index ? 'next' : 'prev')
    setIndex(to)
  }
  const next = () => {
    if (index === last) return onDone()
    go(index + 1)
  }
  const prev = () => {
    if (index > 0) go(index - 1)
  }

  useActiveKeys(active, (e) => {
    if (e.key === 'ArrowRight' || (e.key === ' ' && !(e.target as HTMLElement | null)?.closest('button'))) {
      e.preventDefault()
      next()
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      prev()
    }
  })

  const onPointerDown = (e: PointerEvent) => {
    swiped.current = false
    press.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerUp = (e: PointerEvent) => {
    const start = press.current
    press.current = null
    if (!start) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > SWIPE_RATIO * Math.abs(dy)) {
      swiped.current = true
      if (dx < 0) next()
      else prev()
    }
  }
  // Tap zones: left third goes back, the rest goes forward.
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (swiped.current) {
      swiped.current = false
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    if (e.clientX - rect.left < rect.width / 3) prev()
    else next()
  }

  return (
    <CardShell domain={concept.domain} label="Concept story" live={active}>
      <div className="flex gap-1" role="progressbar" aria-label="Story progress" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={index + 1}>
        {steps.map((_, i) => (
          <span key={i} className={`seg h-1 flex-1 rounded-full ${i <= index ? 'seg-on' : ''}`} />
        ))}
      </div>

      <header className="mt-3 flex items-center gap-2">
        <DomainChip domain={concept.domain} label={`D${concept.domain}`} />
        <span className="font-mono text-xs text-muted">{concept.objective}</span>
        <button
          type="button"
          onClick={() => openConcept(concept.id)}
          className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-muted hover:text-fg"
          title="Open the full concept"
        >
          {concept.title}
        </button>
        {wasRead && <span className="text-xs font-bold text-success">Read</span>}
      </header>

      <div
        className="stage relative flex flex-1 cursor-pointer items-center justify-center py-4"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          press.current = null
        }}
        onClick={onClick}
      >
        <div className="w-full max-w-3xl" aria-live={active ? 'polite' : 'off'}>
          <div key={step.screen} className={`beat-${dir} flex flex-col gap-4`}>
            <ScreenBody screen={screens[step.screen]!} reveal={step.reveal} title={concept.title} />
          </div>
        </div>
      </div>

      <footer className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={prev}
          disabled={index === 0}
          aria-label="Previous"
          className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-bold disabled:opacity-40"
        >
          &larr;
        </button>
        <span className="text-xs text-muted" aria-hidden="true">
          {index + 1} / {steps.length}
        </span>
        <button
          type="button"
          onClick={next}
          aria-label={index === last ? 'Next card' : 'Next'}
          className="rounded-full bg-accent px-5 py-2 text-sm font-bold text-accent-fg"
        >
          {index === last ? 'Next card' : <span aria-hidden="true">&rarr;</span>}
        </button>
      </footer>
    </CardShell>
  )
}
