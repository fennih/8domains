import { useEffect, useRef, useState } from 'react'
import type { HighlightColor } from '../lib/markup'
import { HIGHLIGHT_MEANING } from './HighlightLegend'

const HOVER_MS = 500
const HOLD_MS = 450
const HOLD_SLOP_PX = 10
const TOUCH_SHOW_MS = 2500

interface Tip {
  color: HighlightColor
  x: number
  y: number
}

function markOf(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>('mark[data-hl]') : null
}

function place(mark: HTMLElement): Tip {
  const r = mark.getClientRects()[0] ?? mark.getBoundingClientRect()
  return { color: mark.dataset.hl as HighlightColor, x: Math.min(Math.max(r.left + r.width / 2, 120), window.innerWidth - 120), y: r.top }
}

// One tooltip for every highlight, wired by event delegation: hover (500ms) or focus on desktop, long-press on touch.
// The static descriptions are what each <mark aria-describedby> points to, so screen readers get the meaning too.
export function HighlightTip() {
  const [tip, setTip] = useState<Tip | null>(null)
  const open = useRef(false)
  open.current = tip !== null
  const timer = useRef(0)
  const hold = useRef<{ x: number; y: number } | null>(null)
  const swallowClick = useRef(false)

  useEffect(() => {
    const clear = () => window.clearTimeout(timer.current)
    const hide = () => {
      clear()
      setTip(null)
    }

    const onOver = (e: PointerEvent) => {
      const mark = markOf(e.target)
      if (!mark || e.pointerType !== 'mouse') return
      clear()
      timer.current = window.setTimeout(() => setTip(place(mark)), HOVER_MS)
    }
    const onOut = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && markOf(e.target) && !markOf(e.relatedTarget)) hide()
    }
    const onDown = (e: PointerEvent) => {
      swallowClick.current = false
      const mark = markOf(e.target)
      if (!mark || e.pointerType === 'mouse') return hide()
      hold.current = { x: e.clientX, y: e.clientY }
      clear()
      timer.current = window.setTimeout(() => {
        swallowClick.current = true
        setTip(place(mark))
        timer.current = window.setTimeout(() => setTip(null), TOUCH_SHOW_MS)
      }, HOLD_MS)
    }
    const onMove = (e: PointerEvent) => {
      const h = hold.current
      if (h && Math.hypot(e.clientX - h.x, e.clientY - h.y) > HOLD_SLOP_PX) {
        hold.current = null
        if (!swallowClick.current) clear()
      }
    }
    const onUp = () => {
      hold.current = null
      if (!swallowClick.current) clear()
    }
    // A long-press shows the meaning; the click that follows must not also advance the story.
    const onClick = (e: MouseEvent) => {
      if (!swallowClick.current) return
      swallowClick.current = false
      e.stopPropagation()
      e.preventDefault()
    }
    const onFocus = (e: FocusEvent) => {
      const mark = markOf(e.target)
      if (mark?.matches(':focus-visible')) setTip(place(mark))
    }
    const onBlur = (e: FocusEvent) => {
      if (markOf(e.target)) hide()
    }
    const onKey = (e: KeyboardEvent) => {
      // Escape closes the tooltip first; only a second Escape reaches the feed (which closes the story).
      if (e.key !== 'Escape' || !open.current) return
      e.stopImmediatePropagation()
      hide()
    }

    document.addEventListener('pointerover', onOver)
    document.addEventListener('pointerout', onOut)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
    document.addEventListener('click', onClick, true)
    document.addEventListener('focusin', onFocus)
    document.addEventListener('focusout', onBlur)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', hide, true)
    return () => {
      clear()
      document.removeEventListener('pointerover', onOver)
      document.removeEventListener('pointerout', onOut)
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('focusout', onBlur)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', hide, true)
    }
  }, [])

  return (
    <>
      {(Object.keys(HIGHLIGHT_MEANING) as HighlightColor[]).map((c) => (
        <span key={c} id={`hl-desc-${c}`} hidden>
          Highlight: {HIGHLIGHT_MEANING[c]}
        </span>
      ))}
      {tip && (
        <div role="tooltip" className={`hl-tip hl-legend-${tip.color}`} style={{ left: tip.x, top: tip.y }}>
          <span aria-hidden="true" className="hl-legend-dot" />
          {HIGHLIGHT_MEANING[tip.color]}
        </div>
      )}
    </>
  )
}
