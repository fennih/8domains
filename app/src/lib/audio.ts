import { useSyncExternalStore } from 'react'

// One narration file per concept; `steps` holds the end of each story step in ms.
export interface Narration {
  file: string
  steps: number[]
}

export const NARRATION_LANGS = ['en', 'it'] as const
export type NarrationLang = (typeof NARRATION_LANGS)[number]

// story: the open story card drives playback and follows it step by step (the "video" feed).
// queue: a list of concepts plays back to back, also with the screen off (the podcast).
export type PlayerMode = 'story' | 'queue'

export interface PlayerState {
  mode: PlayerMode | null
  conceptId: string | null
  step: number
  playing: boolean
  // Story mode: the next story card that becomes active starts on its own.
  autoplay: boolean
  rate: number
  // Preferred narration language; a concept without it falls back to English.
  lang: NarrationLang
  queue: string[]
  queueIndex: number
  queueTitle: string
  failed: boolean
  // Bumped when a concept's narration reaches its end.
  ended: { conceptId: string; seq: number } | null
}

export interface NarrationMeta {
  title: string
  album: string
}

export const RATES = [1, 1.25, 1.5, 2] as const
const RATE_KEY = '8domains-narration-rate'
const LANG_KEY = '8domains-narration-lang'

function savedLang(): NarrationLang {
  try {
    const l = localStorage.getItem(LANG_KEY)
    return (NARRATION_LANGS as readonly string[]).includes(l ?? '') ? (l as NarrationLang) : 'en'
  } catch {
    return 'en'
  }
}

function savedRate(): number {
  try {
    const r = Number(localStorage.getItem(RATE_KEY))
    return (RATES as readonly number[]).includes(r) ? r : 1
  } catch {
    return 1
  }
}

let state: PlayerState = {
  mode: null,
  conceptId: null,
  step: 0,
  playing: false,
  autoplay: false,
  rate: savedRate(),
  lang: savedLang(),
  queue: [],
  queueIndex: 0,
  queueTitle: '',
  failed: false,
  ended: null,
}
const listeners = new Set<() => void>()
const endListeners = new Set<(conceptId: string) => void>()
let tracks: Partial<Record<NarrationLang, Map<string, Narration>>> = {}
let describe: (conceptId: string) => NarrationMeta = () => ({ title: '', album: '' })
let el: HTMLAudioElement | null = null
let frame = 0
let endSeq = 0

function set(patch: Partial<PlayerState>) {
  state = { ...state, ...patch }
  for (const l of listeners) l()
}

export function registerNarration(maps: Partial<Record<NarrationLang, Map<string, Narration>>>, meta: (conceptId: string) => NarrationMeta) {
  tracks = maps
  describe = meta
}

// The narration that would play for a concept in the preferred language, or the English fallback.
function trackFor(conceptId: string): Narration | undefined {
  return tracks[state.lang]?.get(conceptId) ?? tracks.en?.get(conceptId)
}

export function narrationFor(conceptId: string): Narration | undefined {
  return trackFor(conceptId)
}

export function narrationLangs(conceptId: string): NarrationLang[] {
  return NARRATION_LANGS.filter((l) => tracks[l]?.has(conceptId))
}

// The language a concept would actually be heard in.
export function narrationLang(conceptId: string): NarrationLang {
  return tracks[state.lang]?.has(conceptId) ? state.lang : 'en'
}

export function hasNarration(conceptId: string): boolean {
  return narrationLangs(conceptId).length > 0
}

function stepAt(ms: number, ends: number[]): number {
  let i = 0
  while (i < ends.length - 1 && ms >= ends[i]!) i++
  return i
}

function sync() {
  const t = state.conceptId ? trackFor(state.conceptId) : undefined
  if (!el || !t) return
  const step = stepAt(el.currentTime * 1000, t.steps)
  if (step !== state.step) set({ step })
}

// timeupdate fires about 4 times a second; a frame loop keeps beats in step while the page is visible.
function follow() {
  cancelAnimationFrame(frame)
  const loop = () => {
    sync()
    if (el && !el.paused) frame = requestAnimationFrame(loop)
  }
  frame = requestAnimationFrame(loop)
}

function onEnded() {
  const id = state.conceptId
  if (id) {
    for (const f of endListeners) f(id)
    set({ ended: { conceptId: id, seq: ++endSeq } })
  }
  if (state.mode === 'queue') {
    const next = state.queueIndex + 1
    if (next < state.queue.length) {
      set({ queueIndex: next })
      load(state.queue[next]!, 0)
    } else stop()
  }
}

// A single element for the whole session: once a tap has started it, iOS lets it play later tracks too.
function audio(): HTMLAudioElement {
  if (el) return el
  el = new Audio()
  el.preload = 'auto'
  el.addEventListener('play', () => {
    set({ playing: true, failed: false })
    follow()
  })
  el.addEventListener('pause', () => set({ playing: false }))
  el.addEventListener('timeupdate', sync)
  el.addEventListener('ended', onEnded)
  el.addEventListener('error', () => set({ playing: false, failed: true }))
  setupMediaSession()
  return el
}

function stepStart(t: Narration, step: number): number {
  return step > 0 ? (t.steps[step - 1] ?? 0) / 1000 : 0
}

function seekTo(a: HTMLAudioElement, seconds: number) {
  // Setting currentTime before metadata arrives is ignored by some browsers.
  if (a.readyState >= HTMLMediaElement.HAVE_METADATA) a.currentTime = seconds
  else a.addEventListener('loadedmetadata', () => (a.currentTime = seconds), { once: true })
}

function load(conceptId: string, fromStep: number): boolean {
  const t = trackFor(conceptId)
  if (!t) return false
  const a = audio()
  if (a.dataset.file !== t.file) {
    a.src = `${import.meta.env.BASE_URL}audio/${encodeURIComponent(t.file)}`
    a.dataset.file = t.file
  }
  a.defaultPlaybackRate = state.rate
  a.playbackRate = state.rate
  seekTo(a, stepStart(t, fromStep))
  set({ conceptId, step: fromStep, failed: false })
  updateMetadata(conceptId)
  a.play().catch(() => set({ playing: false }))
  return true
}

export function playStory(conceptId: string, fromStep: number) {
  set({ mode: 'story', autoplay: true, queue: [], queueIndex: 0, queueTitle: '' })
  load(conceptId, fromStep)
}

export function playQueue(conceptIds: string[], title: string, start = 0) {
  const queue = conceptIds.filter(hasNarration)
  if (queue.length === 0) return
  const i = Math.min(Math.max(start, 0), queue.length - 1)
  set({ mode: 'queue', autoplay: false, queue, queueIndex: i, queueTitle: title })
  load(queue[i]!, 0)
}

export function pause() {
  el?.pause()
}

// The listener's own pause also stops the feed from starting the next story by itself.
export function toggle() {
  if (!el || !state.conceptId) return
  if (el.paused) {
    if (state.mode === 'story') set({ autoplay: true })
    el.play().catch(() => set({ playing: false }))
  } else {
    if (state.mode === 'story') set({ autoplay: false })
    el.pause()
  }
}

export function seekStep(step: number) {
  const t = state.conceptId ? trackFor(state.conceptId) : undefined
  if (!el || !t) return
  seekTo(el, stepStart(t, step))
  set({ step })
}

export function skip(delta: 1 | -1) {
  if (state.mode !== 'queue') return
  const i = state.queueIndex + delta
  if (i < 0 || i >= state.queue.length) return
  set({ queueIndex: i })
  load(state.queue[i]!, 0)
}

export function stop() {
  cancelAnimationFrame(frame)
  if (el) {
    el.pause()
    el.removeAttribute('src')
    delete el.dataset.file
    el.load()
  }
  if ('mediaSession' in navigator) navigator.mediaSession.metadata = null
  set({ mode: null, conceptId: null, step: 0, playing: false, autoplay: false, queue: [], queueIndex: 0, queueTitle: '' })
}

export function setRate(rate: number) {
  if (!(RATES as readonly number[]).includes(rate)) return
  try {
    localStorage.setItem(RATE_KEY, String(rate))
  } catch {
    // Private mode or blocked storage: the rate still applies to this session.
  }
  if (el) {
    el.defaultPlaybackRate = rate
    el.playbackRate = rate
  }
  set({ rate })
}

// Steps line up across languages, so a switch mid-story picks up at the same step.
export function setLang(lang: NarrationLang) {
  try {
    localStorage.setItem(LANG_KEY, lang)
  } catch {
    // Blocked storage: the choice still applies to this session.
  }
  const wasPlaying = state.playing
  set({ lang })
  if (!el || !state.conceptId) return
  const t = trackFor(state.conceptId)
  if (!t || el.dataset.file === t.file) return
  const step = state.step
  el.src = `${import.meta.env.BASE_URL}audio/${encodeURIComponent(t.file)}`
  el.dataset.file = t.file
  el.defaultPlaybackRate = state.rate
  el.playbackRate = state.rate
  seekTo(el, stepStart(t, step))
  if (wasPlaying) el.play().catch(() => set({ playing: false }))
}

export function nextLang(conceptId: string, lang: NarrationLang): NarrationLang {
  const langs = narrationLangs(conceptId)
  const i = langs.indexOf(lang)
  return langs[(i + 1) % langs.length] ?? 'en'
}

export function nextRate(rate: number): number {
  const i = (RATES as readonly number[]).indexOf(rate)
  return RATES[(i + 1) % RATES.length]!
}

export function onNarrationEnd(fn: (conceptId: string) => void): () => void {
  endListeners.add(fn)
  return () => endListeners.delete(fn)
}

function updateMetadata(conceptId: string) {
  if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return
  const m = describe(conceptId)
  navigator.mediaSession.metadata = new MediaMetadata({ title: m.title, artist: '8Domains', album: m.album })
}

function setupMediaSession() {
  if (!('mediaSession' in navigator)) return
  const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
    ['play', () => el?.paused && toggle()],
    ['pause', () => el && !el.paused && toggle()],
    ['nexttrack', () => skip(1)],
    ['previoustrack', () => skip(-1)],
  ]
  for (const [action, handler] of handlers) {
    try {
      navigator.mediaSession.setActionHandler(action, handler)
    } catch {
      // Unsupported action on this browser.
    }
  }
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function usePlayer(): PlayerState {
  return useSyncExternalStore(subscribe, () => state)
}
