import type { Theme } from './db'

const STORAGE_KEY = 'cissp-feed-theme'
const lightQuery = '(prefers-color-scheme: light)'

function resolve(theme: Theme): 'dark' | 'light' {
  if (theme !== 'system') return theme
  return window.matchMedia(lightQuery).matches ? 'light' : 'dark'
}

function set(theme: Theme) {
  const resolved = resolve(theme)
  document.documentElement.dataset.theme = resolved
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'light' ? '#f5f6fa' : '#0c0a10')
}

// Applies the theme and keeps following the OS setting while on "system". Returns a cleanup.
export function applyTheme(theme: Theme): () => void {
  set(theme)
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // storage may be unavailable (private mode); the theme still applies for this session
  }
  if (theme !== 'system') return () => {}
  const mq = window.matchMedia(lightQuery)
  const onChange = () => set('system')
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

export function applyStoredTheme() {
  let stored: string | null = null
  try {
    stored = localStorage.getItem(STORAGE_KEY)
  } catch {
    stored = null
  }
  set(stored === 'light' || stored === 'system' ? stored : 'dark')
}

export function applyAnimations(on: boolean) {
  document.documentElement.dataset.anim = on ? 'on' : 'off'
}
