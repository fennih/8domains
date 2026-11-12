import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { itemSubs, itemText, type Concept, type Kb } from '../../kb/types'
import { narrationFor, nextRate, pause, playStory, seekStep, setRate, toggle, usePlayer } from '../../lib/audio'
import { conceptStory, type Screen } from '../../lib/beats'
import { useActiveKeys } from '../../lib/keys'
import { highlightColors, type HighlightColor } from '../../lib/markup'
import { useProgress } from '../../lib/progress'
import { Bullets } from '../Bullets'
import { CardContext } from '../Chips'
import { HighlightLegend } from '../HighlightLegend'
import { Inline } from '../Inline'
import { useOpenConcept } from '../openConcept'
import { LangChip } from '../LangChip'
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

// Text visible on a screen at a given reveal step, used to find which highlight colors are showing.
function screenText(screen: Screen, reveal: number): string {
  if ('items' in screen)
    return screen.items
      .slice(0, reveal)
      .flatMap((li) => [itemText(li), ...itemSubs(li)])
      .join(' ')
  return screen.text
}

const arrowBase = 'inline-flex items-center justify-center font-bold disabled:opacity-40'
const pill = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-bold'

function PlayIcon({ playing }: { playing: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      {playing ? <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /> : <path d="M8 5.5v13l10.5-6.5z" />}
    </svg>
  )
}

export function StoryCard({ concept, kb, active, onDone }: { concept: Concept; kb: Kb; active: boolean; onDone: () => void }) {
  const { state, markSeen, markRead, updateSettings } = useProgress()
  const openConcept = useOpenConcept()
  const { screens, steps } = useMemo(() => conceptStory(concept), [concept])
  const [index, setIndex] = useState(0)
  const [dir, setDir] = useState<'next' | 'prev'>('next')
  const press = useRef<{ x: number; y: number } | null>(null)
  const swiped = useRef(false)
  const last = steps.length - 1
  const step = steps[index]!

  // Narration is only offered when the audio was made from exactly these steps.
  const narration = narrationFor(concept.id)
  const hasAudio = narration !== undefined && narration.steps.length === steps.length
  const player = usePlayer()
  const narrating = player.mode === 'story' && player.conceptId === concept.id

  useEffect(() => {
    if (active) markSeen(concept.id)
  }, [active, concept.id, markSeen])

  useEffect(() => {
    if (index === last) markRead(concept.id)
  }, [index, last, concept.id, markRead])

  // First time a highlight color shows anywhere, its legend appears under this screen, then never again.
  const legendAt = useRef(new Map<HighlightColor, number>())
  const seenLegends = state.settings.legendsSeen
  const visibleColors = useMemo(() => highlightColors(screenText(screens[step.screen]!, step.reveal)), [screens, step.screen, step.reveal])
  useEffect(() => {
    if (!active) return
    const fresh = visibleColors.filter((c) => !seenLegends.includes(c) && !legendAt.current.has(c))
    if (fresh.length === 0) return
    for (const c of fresh) legendAt.current.set(c, step.screen)
    void updateSettings({ legendsSeen: [...seenLegends, ...fresh] })
  }, [active, visibleColors, seenLegends, step.screen, updateSettings])
  const legend = [...legendAt.current].filter(([, s]) => s === step.screen).map(([c]) => c)

  // Moving within a list screen reveals or hides one bullet; the screen itself stays mounted.
  const show = (to: number) => {
    if (steps[to]!.screen !== step.screen) setDir(to > index ? 'next' : 'prev')
    setIndex(to)
  }
  // A tap or swipe while narrating moves the voice to the same step.
  const go = (to: number) => {
    show(to)
    if (narrating) seekStep(to)
  }

  // The voice drives the beats.
  useEffect(() => {
    if (narrating && player.step !== index && player.step <= last) show(player.step)
  }, [narrating, player.step])

  // End of the narration moves the feed on, like the last tap would.
  const endedSeq = player.ended?.conceptId === concept.id ? player.ended.seq : 0
  useEffect(() => {
    if (endedSeq && active && player.mode === 'story') onDone()
  }, [endedSeq])

  // Listening carries on through the feed: the next story starts by itself, other cards stay silent.
  useEffect(() => {
    if (!hasAudio || player.mode !== 'story' || !player.autoplay) return
    if (active && !(narrating && player.playing)) playStory(concept.id, narrating ? index : 0)
    if (!active && narrating && player.playing) pause()
  }, [active, hasAudio, player.mode, player.autoplay])

  const listen = () => {
    if (narrating) toggle()
    else playStory(concept.id, index === last ? 0 : index)
  }
  const listening = narrating && player.playing
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

      <header className="mt-1.5 flex items-center justify-between gap-4 md:mt-2.5 desk:mt-4">
        <button
          type="button"
          onClick={() => openConcept(concept.id)}
          className="flex min-h-11 min-w-0 items-center hover:opacity-80"
          title={`Open the full concept: ${concept.title}`}
        >
          <CardContext kb={kb} domain={concept.domain} objective={concept.objective} />
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {hasAudio && <LangChip conceptId={concept.id} className={`${pill} min-w-11 border border-line text-muted hover:text-fg`} />}
          {hasAudio && narrating && (
            <button
              type="button"
              onClick={() => setRate(nextRate(player.rate))}
              aria-label={`Narration speed ${player.rate}x, change`}
              className={`${pill} min-w-11 border border-line text-muted tabular-nums hover:text-fg`}
            >
              {player.rate}&times;
            </button>
          )}
          {hasAudio && (
            <button
              type="button"
              onClick={listen}
              aria-pressed={listening}
              aria-label={listening ? 'Pause narration' : 'Listen to this story'}
              className={`${pill} ${listening ? 'bg-accent text-accent-fg' : 'border border-dc-edge text-dc-ink hover:border-dc'}`}
            >
              <PlayIcon playing={listening} />
              <span>{narrating && player.failed ? 'Retry' : listening ? 'Pause' : 'Listen'}</span>
            </button>
          )}
          <span className="hidden text-sm text-muted desk:inline" aria-hidden="true">
            {index + 1} / {steps.length}
          </span>
        </div>
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
            <HighlightLegend colors={legend} />
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
