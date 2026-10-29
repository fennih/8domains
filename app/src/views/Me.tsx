import { useMemo, useRef, useState } from 'react'
import type { Kb } from '../kb/types'
import { Account } from '../components/Account'
import { btnDanger, btnPrimary, btnSecondary } from '../components/buttons'
import { Label } from '../components/Chips'
import { AUTH_ENABLED } from '../lib/auth'
import { DOMAIN_SHORT } from '../lib/domains'
import { MAX_IMPORT_BYTES, serializeBackup } from '../lib/backup'
import { addDays, startOfDay, toIsoDate } from '../lib/dates'
import type { Theme } from '../lib/db'
import { useProgress } from '../lib/progress'
import { accuracy, domainStats, dueCount, streak } from '../lib/stats'

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-4 md:p-5">
      <span className="font-display text-3xl tabular-nums leading-none md:text-4xl">{value}</span>
      <span className="text-[13px] text-muted">{label}</span>
    </div>
  )
}

const fieldClass = 'rounded-xl border border-line bg-surface-2 px-3 py-2 text-fg'

export function Me({ kb }: { kb: Kb }) {
  const { state, updateSettings, exportData, importData, reset } = useProgress()
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const now = new Date()
  const stats = useMemo(() => domainStats(kb, state), [kb, state])
  const endOfToday = addDays(startOfDay(now), 1)
  const todayStart = startOfDay(now).getTime()
  const reviewsToday = state.reviews.filter((r) => r.at.getTime() >= todayStart).length

  const onExport = () => {
    const blob = new Blob([serializeBackup(exportData())], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `8domains-progress-${toIsoDate(now)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setMessage({ kind: 'ok', text: 'Progress exported.' })
  }

  const onImport = async (file: File | undefined) => {
    if (!file) return
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error('File is larger than 5 MB.')
      const { parseBackup } = await import('../lib/importBackup')
      const data = await parseBackup(file)
      if (!window.confirm('Replace all current progress with the imported file?')) return
      await importData(data)
      setMessage({ kind: 'ok', text: `Imported ${data.cards.length} cards, ${data.attempts.length} quiz attempts.` })
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Import failed.' })
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const onReset = async () => {
    if (!window.confirm('Delete all progress, reviews and settings on this device? This cannot be undone.')) return
    await reset()
    setMessage({ kind: 'ok', text: 'Progress reset.' })
  }

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col md:max-w-4xl md:px-8 xl:max-w-6xl gap-6 overflow-y-auto px-4 py-6">
      <h1 className="text-3xl leading-tight md:text-4xl">Me</h1>

      <section aria-label="Stats" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Day streak" value={streak(state, now)} />
        <Stat label="Cards due today" value={dueCount(state.cards, kb, endOfToday)} />
        <Stat label="Reviews today" value={reviewsToday} />
        <Stat label="Concepts read" value={state.read.size} />
      </section>

      <section aria-label="Accuracy per domain" className="flex flex-col gap-2">
        <Label>Quiz accuracy per domain</Label>
        <ul className="flex flex-col gap-3">
          {kb.outline.domains.map((d) => {
            const s = stats.get(d.number)
            const acc = accuracy(s)
            return (
              <li key={d.id} className={`d-${d.number} flex flex-col gap-1.5`}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-bold tabular-nums text-dc-ink">{d.number}</span> {DOMAIN_SHORT[d.number] ?? d.title}
                  </span>
                  <span className="shrink-0 text-[13px] tabular-nums text-muted">
                    {acc === null ? 'No quizzes yet' : `${Math.round(acc * 100)}% of ${s?.attempts}`}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <div className="bar-domain h-full rounded-full" style={{ width: `${Math.round((acc ?? 0) * 100)}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <section aria-label="Settings" className="flex flex-col gap-3">
        <Label>Settings</Label>
        <label className="flex items-center justify-between gap-3 text-sm">
          Exam date
          <input
            type="date"
            className={fieldClass}
            value={state.settings.examDate}
            min={toIsoDate(addDays(now, 1))}
            onChange={(e) => {
              if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) void updateSettings({ examDate: e.target.value })
            }}
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          Theme
          <select
            className={fieldClass}
            value={state.settings.theme}
            onChange={(e) => void updateSettings({ theme: e.target.value as Theme })}
          >
            <option value="system">System</option>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span id="anim-label">Animations</span>
          <button
            type="button"
            role="switch"
            aria-checked={state.settings.animations}
            aria-labelledby="anim-label"
            onClick={() => void updateSettings({ animations: !state.settings.animations })}
            className={`relative h-7 w-12 rounded-full border border-line transition-colors ${state.settings.animations ? 'bg-accent' : 'bg-surface-2'}`}
          >
            <span className={`absolute top-0.5 h-5.5 w-5.5 rounded-full border border-line bg-surface transition-all ${state.settings.animations ? 'left-[1.4rem]' : 'left-0.5'}`} />
          </button>
        </div>
      </section>

      <section aria-label="Data" className="flex flex-col gap-3">
        <Label>Your data</Label>
        <p className="text-sm text-muted">
          {AUTH_ENABLED ? 'Your progress is saved in this browser, not in your account. ' : 'Your progress is saved in this browser. '}
          To continue on another device, export it here and import it there.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onExport} className={btnPrimary}>
            Export progress
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} className={btnSecondary}>
            Import progress
          </button>
          <button type="button" onClick={() => void onReset()} className={btnDanger}>
            Reset progress
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => void onImport(e.target.files?.[0])}
        />
        {message && (
          <p role="status" className={`text-sm ${message.kind === 'error' ? 'text-danger' : 'text-success'}`}>
            {message.text}
          </p>
        )}
      </section>

      {AUTH_ENABLED && <Account />}

      <footer className="mt-auto flex flex-col gap-1 pb-2 text-xs text-muted">
        <p>Content version {kb.version} · ISC2 outline {kb.outline.outlineVersion}</p>
        <p>
          <a href="https://github.com/fennih/8domains" className="underline underline-offset-2 hover:text-fg">
            Open source
          </a>
          . No ads, no tracking. CISSP® is a registered certification mark of ISC2, Inc.; 8Domains is not affiliated with or endorsed by ISC2.
        </p>
      </footer>
    </div>
  )
}
