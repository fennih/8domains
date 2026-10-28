import { useEffect, useRef } from 'react'

export function isTypingTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  if (!t) return false
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)
}

// Global shortcuts are ignored while typing, with modifiers held, or while a modal dialog is open.
export function shouldIgnoreKey(e: KeyboardEvent): boolean {
  return e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTypingTarget(e) || document.querySelector('dialog[open]') !== null
}

export function useActiveKeys(active: boolean, handler: (e: KeyboardEvent) => void) {
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  })
  useEffect(() => {
    if (!active) return
    const listener = (e: KeyboardEvent) => {
      if (!shouldIgnoreKey(e)) ref.current(e)
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [active])
}
