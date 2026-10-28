import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import type { Concept } from '../../kb/types'
import { conceptStory, type Screen } from '../../lib/beats'
import { useActiveKeys } from '../../lib/keys'
import { useProgress } from '../../lib/progress'
import { Bullets } from '../Bullets'
import { Inline } from '../Inline'
import { useOpenConcept } from '../openConcept'
import { CardShell } from './CardShell'

const SWIPE_MIN = 40
const SWIPE_RATIO = 1.5

const SCREEN_LABEL = { summary: 'In short', points: 'Key points', traps: 'Exam traps', manager: 'Manager view', mnemonic: 'Mnemonic' } as const

// Every screen after the hook opens with the concept title in Spectral and a small muted label.
function ScreenHead({ title, label }: { title: string; label: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 desk:gap-x-3.5">
      <span className="story-head font-display font-medium">{title}</span>
      <span className={`text-xs font-bold uppercase tracking-[0.08em] desk:text-[13px] ${label === 'Exam traps' ? 'text-danger' : 'text-muted'}`}>{label}</span>
    </div>
  )
}

function ScreenBody({ screen, reveal, title }: { screen: Screen; reveal: number; title: string }) {
  switch (screen.kind) {
    case 'hook':
      return (
        <>
          <p className="story-kicker font-bold uppercase tracking-[0.08em] text-dc-ink">{title}</p>
          <p className="story-hook font-display">
            <Inline text={screen.text} />
          </p>
        </>
      )
    case 'summary':
      return (
        <>
          <ScreenHead title={title} label={SCREEN_LABEL.summary} />
          <p className={`story-text ${screen.text.length > 220 ? 'story-text-long' : ''}`}>
            <Inline text={screen.text} />
          </p>
        </>
      )
    case 'points':
    case 'traps':
      return (
        <>
          <ScreenHead
            title={title}
            label={screen.kind === 'traps' ? SCREEN_LABEL.traps : screen.parts > 1 ? `Key points ${screen.part}/${screen.parts}` : SCREEN_LABEL.points}
          />
          <Bullets items={screen.items.slice(0, reveal)} className="story-points" subClassName="story-sub" />
        </>
      )
    case 'manager':
    case 'mnemonic':
      return (
        <>
          <ScreenHead title={title} label={SCREEN_LABEL[screen.kind]} />
          <p className="story-text">
            <Inline text={screen.text} />
          </p>
        </>
      )
  }
}

const arrowBase = 'inline-flex items-center justify-center font-bold disabled:opacity-40'

export function StoryCard({ concept, active, onDone }: { concept: Concept; active: boolean; onDone: () => void }) {
  const { markSeen, markRead } = useProgress()
  const openConcept = useOpenConcept()
  const { screens, steps } = useMemo(() => conceptStory(concept), [concept])
  const [index, setIndex] = useState(0)
  const [dir, setDir] = useState<'next' | 'prev'>('next')
  const press = useRef<{ x: number; y: number } | null>(null)
  const swiped = useRef(false)
  const last = steps.length - 1
  const step = steps[index]!

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

  const isLast = index === last
  const prevLabel = 'Previous'
  const nextLabel = isLast ? 'Next card' : 'Next'

  return (
    <CardShell
      domain={concept.domain}
      label="Concept story"
      live={active}
      prev={
        <button type="button" onClick={prev} disabled={index === 0} aria-label={prevLabel} className={`${arrowBase} h-14 w-14 rounded-full border border-dc-edge text-xl text-fg`}>
          <span aria-hidden="true">&larr;</span>
        </button>
      }
      next={
        <button type="button" onClick={next} aria-label={nextLabel} className={`${arrowBase} h-14 w-14 rounded-full bg-accent text-xl text-accent-fg`}>
          <span aria-hidden="true">&rarr;</span>
        </button>
      }
      below={
        <p className="text-center text-[13px] text-muted">
          <kbd className="kbd">&larr;</kbd> <kbd className="kbd">&rarr;</kbd> or <kbd className="kbd">Space</kbd> to move · <kbd className="kbd">Esc</kbd> to close · hold a
          highlight for its meaning
        </p>
      }
    >
      <div className="story-segs grid" role="progressbar" aria-label="Story progress" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={index + 1}>
        {steps.map((_, i) => (
          <span key={i} className={`seg rounded-full ${i <= index ? 'seg-on' : ''}`} />
        ))}
      </div>

      <header className="mt-1.5 flex items-center justify-between md:mt-2.5 desk:mt-4">
        <button
          type="button"
          onClick={() => openConcept(concept.id)}
          className="inline-flex min-h-11 items-center text-[13px] font-bold text-dc-ink md:text-[15px] desk:text-sm"
          title={`Open the full concept: ${concept.title}`}
        >
          D{concept.domain} · {concept.objective}
        </button>
        <span className="hidden text-sm text-muted desk:inline" aria-hidden="true">
          {index + 1} / {steps.length}
        </span>
      </header>

      <div
        className="stage relative flex flex-1 cursor-pointer items-center py-4 desk:py-6"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          press.current = null
        }}
        onClick={onClick}
      >
        <div className="w-full" aria-live={active ? 'polite' : 'off'}>
          <div key={step.screen} className={`beat-${dir} story-body flex flex-col`}>
            <ScreenBody screen={screens[step.screen]!} reveal={step.reveal} title={concept.title} />
          </div>
        </div>
      </div>

      <footer className="flex items-center justify-between gap-3 desk:hidden">
        <button type="button" onClick={prev} disabled={index === 0} aria-label={prevLabel} className={`${arrowBase} min-h-11 min-w-12 rounded-[10px] border border-dc-edge text-fg md:min-h-[52px] md:min-w-14 md:text-lg`}>
          <span aria-hidden="true">&larr;</span>
        </button>
        <span className="text-xs text-muted md:text-sm" aria-hidden="true">
          {index + 1} / {steps.length}
        </span>
        <button type="button" onClick={next} aria-label={nextLabel} className={`${arrowBase} min-h-11 min-w-16 rounded-[10px] bg-accent px-3 text-accent-fg md:min-h-[52px] md:min-w-20 md:text-lg`}>
          {isLast ? 'Next card' : <span aria-hidden="true">&rarr;</span>}
        </button>
      </footer>
    </CardShell>
  )
}
