import { useEffect, useMemo, useState } from 'react'
import { ConceptSheetProvider } from './components/ConceptSheet'
import { MiniPlayer } from './components/MiniPlayer'
import { HighlightTip } from './components/HighlightTip'
import { Nav, ROUTES, type Tab } from './components/Nav'
import { loadKb } from './kb/load'
import type { Kb } from './kb/types'
import { parseIsoDate } from './lib/dates'
import { onNarrationEnd, registerNarration, usePlayer } from './lib/audio'
import { buildPlan } from './lib/plan'
import { ProgressProvider, useProgress } from './lib/progress'
import { scopeKey, type Scope } from './lib/scope'
import { SyncProvider } from './lib/sync'
import { dueCount } from './lib/stats'
import { applyAnimations, applyTheme } from './lib/theme'
import { Browse } from './views/Browse'
import { Coverage } from './views/Coverage'
import { Feed } from './views/Feed'
import { Home, type HomeView } from './views/Home'
import { Me } from './views/Me'
import { btnPrimary } from './components/buttons'

// The app always opens on Home (never straight into content); other tabs survive a reload.
function tabFromHash(): Tab {
  const h = window.location.hash.slice(1)
  return ROUTES.includes(h as Tab) && h !== 'feed' ? (h as Tab) : 'home'
}

function Shell({ kb }: { kb: Kb }) {
  const { state, updateSettings, markRead } = useProgress()
  const player = usePlayer()
  const [tab, setTab] = useState<Tab>(tabFromHash)
  const [homeView, setHomeView] = useState<HomeView>(null)
  // A drill is a quick look at one kind of item: it is not saved as the scope to continue from.
  const [drill, setDrill] = useState<Scope | null>(null)
  const { firstLaunch, examDate, theme, animations, scope } = state.settings
  const today = new Date().toDateString()

  const plan = useMemo(
    () => buildPlan(kb.outline, parseIsoDate(firstLaunch), parseIsoDate(examDate), new Date()),
    // `today` re-evaluates the plan when the app stays open across midnight.
    [kb, firstLaunch, examDate, today],
  )
  const due = dueCount(state.cards, kb, new Date())

  useEffect(() => applyTheme(theme), [theme])

  useEffect(() => {
    registerNarration(kb.narration, (id) => {
      const c = kb.conceptById.get(id)
      const o = c ? kb.outline.domains.find((d) => d.number === c.domain)?.objectives.find((x) => x.id === c.objective) : undefined
      return { title: c?.title ?? '', album: o ? `${o.id} ${o.title}` : 'CISSP' }
    })
  }, [kb])
  // A narration heard to the end counts as reading the concept, also with the screen off.
  useEffect(() => onNarrationEnd(markRead), [markRead])
  useEffect(() => applyAnimations(animations), [animations])

  // Home remembers its page only across a study session; other tabs bring it back to the grid.
  useEffect(() => {
    if (tab !== 'home' && tab !== 'feed') setHomeView(null)
  }, [tab])

  useEffect(() => {
    const onHash = () => setTab(tabFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const changeTab = (t: Tab) => {
    if (t === tab) {
      if (t === 'home') setHomeView(null)
      return
    }
    window.history.replaceState(null, '', t === 'home' ? window.location.pathname : `#${t}`)
    setTab(t)
  }

  const pick = (s: Scope) => {
    if (s.kind === 'drill') setDrill(s)
    else {
      setDrill(null)
      void updateSettings({ scope: s })
    }
    changeTab('feed')
  }

  const closeFeed = () => {
    setDrill(null)
    changeTab('home')
  }

  const feedScope = drill ?? scope
  // Studying is full screen: the nav steps aside until the feed is closed.
  const studying = tab === 'feed' && feedScope !== null

  return (
    <ConceptSheetProvider kb={kb}>
      <div className={`flex h-full flex-col desk:flex-row-reverse ${player.mode === 'queue' ? 'has-player' : ''}`}>
        <main className={`${studying ? 'app-main-full' : 'app-main'} mx-auto w-full desk:min-w-0 desk:flex-1`} id="main">
          <div hidden={tab !== 'feed'} className="h-full">
            <Feed key={feedScope ? scopeKey(feedScope) : 'none'} kb={kb} scope={feedScope} visible={tab === 'feed'} onPick={pick} onHome={closeFeed} />
          </div>
          {tab === 'home' && <Home kb={kb} plan={plan} view={homeView} onView={setHomeView} onPick={pick} />}
          {tab === 'coverage' && <Coverage kb={kb} plan={plan} onPick={pick} />}
          {tab === 'browse' && <Browse kb={kb} />}
          {tab === 'me' && <Me kb={kb} />}
        </main>
        {!studying && <Nav tab={tab} onChange={changeTab} due={due} />}
        <MiniPlayer kb={kb} full={studying} />
        <HighlightTip />
      </div>
    </ConceptSheetProvider>
  )
}

function Splash({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-muted" role="status">
      {text}
    </div>
  )
}

export function App() {
  const [kb, setKb] = useState<Kb | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setError(null)
    loadKb().then(setKb, (e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }
  useEffect(load, [])

  if (error)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <p>Could not load study content.</p>
        <p className="text-sm text-muted">{error}</p>
        <button type="button" onClick={load} className={btnPrimary}>
          Retry
        </button>
      </div>
    )
  if (!kb) return <Splash text="Loading..." />
  return (
    <ProgressProvider fallback={<Splash text="Opening your progress..." />}>
      <SyncProvider>
        <Shell kb={kb} />
      </SyncProvider>
    </ProgressProvider>
  )
}
