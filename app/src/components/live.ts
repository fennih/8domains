import { createContext, useContext } from 'react'

// True inside the card currently on screen; highlighter animations only play there.
export const LiveContext = createContext(false)

export const useLive = () => useContext(LiveContext)

// Animations follow both the in-app toggle (html[data-anim]) and the OS reduced-motion setting.
export function motionAllowed(): boolean {
  return document.documentElement.dataset.anim === 'on' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
