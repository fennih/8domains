import { useEffect, useMemo, useState } from 'react'
import { ConceptSheetProvider } from './components/ConceptSheet'
import { Nav, TABS, type Tab } from './components/Nav'
import { loadKb } from './kb/load'
import type { Kb } from './kb/types'
import { parseIsoDate } from './lib/dates'
import { buildPlan } from './lib/plan'
import { ProgressProvider, useProgress } from './lib/progress'
import { scopeKey, type Scope } from './lib/scope'
import { dueCount } from './lib/stats'
import { applyAnimations, applyTheme } from './lib/theme'
import { Browse } from './views/Browse'
import { Coverage } from './views/Coverage'
import { Feed } from './views/Feed'
import { Home } from './views/Home'
import { Me } from './views/Me'

// The app always opens on Home (never straight into content); other tabs survive a reload.
function tabFromHash(): Tab {
  const h = window.location.hash.slice(1)
  return TABS.some((t) => t.id === h) && h !== 'feed' ? (h as Tab) : 'home'
}

function Shell({ kb }: { kb: Kb }) {
  const { state, updateSettings } = useProgress()
  const [tab, setTab] = useState<Tab>(tabFromHash)
  const { firstLaunch, examDate, theme, animations, scope } = state.settings
  const today = new Date().toDateString()

  const plan = useMemo(
    () => buildPlan(kb.outline, parseIsoDate(firstLaunch), parseIsoDate(examDate), new Date()),
    // `today` re-evaluates the plan when the app stays open across midnight.
    [kb, firstLaunch, examDate, today],
  )
  const due = dueCount(state.cards, kb, new Date())

  useEffect(() => applyTheme(theme), [theme])
  useEffect(() => applyAnimations(animations), [animations])

  useEffect(() => {
    const onHash = () => setTab(tabFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const changeTab = (t: Tab) => {
    if (t === tab) return
    window.history.replaceState(null, '', t === 'home' ? window.location.pathname : `#${t}`)
    setTab(t)
  }

  const pick = (s: Scope) => {
    void updateSettings({ scope: s })
    changeTab('feed')
  }

  return (
    <ConceptSheetProvider kb={kb}>
      <div className="flex h-full flex-col md:flex-row-reverse">
        <main className="app-main mx-auto w-full md:min-w-0 md:flex-1" id="main">
          <div hidden={tab !== 'feed'} className="h-full">
            <Feed key={scope ? scopeKey(scope) : 'none'} kb={kb} scope={scope} visible={tab === 'feed'} onPick={pick} onHome={() => changeTab('home')} />
          </div>
          {tab === 'home' && <Home kb={kb} plan={plan} onPick={pick} />}
          {tab === 'coverage' && <Coverage kb={kb} plan={plan} onPick={pick} />}
          {tab === 'browse' && <Browse kb={kb} />}
          {tab === 'me' && <Me kb={kb} />}
        </main>
        <Nav tab={tab} onChange={changeTab} due={due} />
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
        <button type="button" onClick={load} className="rounded-full bg-accent px-5 py-2 font-semibold text-accent-fg">
          Retry
        </button>
      </div>
    )
  if (!kb) return <Splash text="Loading..." />
  return (
    <ProgressProvider fallback={<Splash text="Opening your progress..." />}>
      <Shell kb={kb} />
    </ProgressProvider>
  )
}
