import type { Kb } from '../kb/types'
import { nextRate, setRate, skip, stop, toggle, usePlayer } from '../lib/audio'
import { LangChip } from './LangChip'

const ctrl = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-fg hover:bg-surface disabled:opacity-40'

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

const PLAY = 'M8 5.5v13l10.5-6.5z'
const PAUSE = 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z'
const PREV = 'M6 6h2v12H6zM9.5 12L18 6v12z'
const NEXT = 'M16 6h2v12h-2zM14.5 12L6 18V6z'

// Podcast mode: a queue of concept narrations, with controls that stay put while you browse.
export function MiniPlayer({ kb, full }: { kb: Kb; full: boolean }) {
  const p = usePlayer()
  if (p.mode !== 'queue' || !p.conceptId) return null
  const c = kb.conceptById.get(p.conceptId)

  return (
    <div className={`mini-player ${full ? 'mini-player-full' : ''} fixed z-20 flex items-center gap-2 border-t border-line bg-bg px-3 md:px-6`} role="region" aria-label="Narration player">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{c?.title ?? ''}</p>
        <p className="truncate text-xs text-muted">
          {p.failed ? (
            <span className="text-danger">Could not load the audio. Check your connection or sign in again.</span>
          ) : (
            <>
              <span className="tabular-nums">
                {p.queueIndex + 1} / {p.queue.length}
              </span>{' '}
              · {p.queueTitle}
            </>
          )}
        </p>
      </div>
      <button type="button" onClick={() => skip(-1)} disabled={p.queueIndex === 0} aria-label="Previous concept" className={ctrl}>
        <Icon d={PREV} />
      </button>
      <button type="button" onClick={toggle} aria-label={p.playing ? 'Pause narration' : 'Play narration'} className={`${ctrl} bg-accent text-accent-fg hover:bg-accent`}>
        <Icon d={p.playing ? PAUSE : PLAY} />
      </button>
      <button type="button" onClick={() => skip(1)} disabled={p.queueIndex >= p.queue.length - 1} aria-label="Next concept" className={ctrl}>
        <Icon d={NEXT} />
      </button>
      <LangChip conceptId={p.conceptId} className={`${ctrl} text-sm font-bold text-muted`} />
      <button type="button" onClick={() => setRate(nextRate(p.rate))} aria-label={`Narration speed ${p.rate}x, change`} className={`${ctrl} text-sm font-bold text-muted tabular-nums`}>
        {p.rate}&times;
      </button>
      <button type="button" onClick={stop} aria-label="Close player" className={`${ctrl} text-muted`}>
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  )
}
