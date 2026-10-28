import { useState } from 'react'
import type { KbTable } from '../../kb/types'
import { useActiveKeys } from '../../lib/keys'
import { useMediaQuery } from '../../lib/media'
import { DomainChip, Label } from '../Chips'
import { Inline } from '../Inline'
import { CardShell } from './CardShell'

export function DataTable({ table, rows = table.rows.length }: { table: KbTable; rows?: number }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface" tabIndex={0} role="region" aria-label={`${table.title} table`}>
      <table className="min-w-full border-collapse text-sm md:text-base">
        <thead className="bg-dc-soft">
          <tr>
            {table.columns.map((c, i) => (
              <th key={i} scope="col" className="whitespace-nowrap px-3 py-2.5 text-left font-bold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.slice(0, rows).map((row, r) => (
            <tr key={r} className="reveal border-t border-line align-top">
              {row.map((cell, c) => (
                <td key={c} className={`min-w-32 px-3 py-2.5 leading-snug ${c === 0 ? 'font-bold' : ''}`}>
                  <Inline text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// On narrow screens each revealed row becomes a small card instead of a cramped wide table.
function RowCards({ table, rows }: { table: KbTable; rows: number }) {
  return (
    <ol className="flex flex-col gap-2" aria-label={`${table.title} rows`}>
      {table.rows.slice(0, rows).map((row, r) => (
        <li key={r} className="reveal rounded-2xl border border-line bg-surface p-3">
          <p className="font-display text-lg font-bold leading-snug">
            <Inline text={row[0] ?? ''} />
          </p>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm leading-snug">
            {row.slice(1).map((cell, c) => (
              <div key={c} className="contents">
                <dt className="font-semibold text-muted">{table.columns[c + 1]}</dt>
                <dd>
                  <Inline text={cell} />
                </dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ol>
  )
}

export function TableCard({ table, active }: { table: KbTable; active: boolean }) {
  const wide = useMediaQuery('(min-width: 768px)')
  const [shown, setShown] = useState(1)
  const total = table.rows.length
  const done = shown >= total
  const more = () => setShown((n) => Math.min(total, n + 1))

  useActiveKeys(active, (e) => {
    if ((e.key === ' ' || e.key === 'ArrowRight') && !done && !(e.target as HTMLElement | null)?.closest('button')) {
      e.preventDefault()
      more()
    }
  })

  return (
    <CardShell domain={table.domain ?? 0} label="Must-memorize table" live={active}>
      <div className="flex flex-wrap items-center gap-2">
        <DomainChip domain={table.domain ?? 0} label={table.domain ? `D${table.domain}` : 'All'} />
        <Label>Must memorize</Label>
      </div>
      <h2 className="mt-3 text-2xl font-bold leading-tight md:text-4xl">{table.title}</h2>
      {table.description && (
        <p className="mt-1 text-sm text-muted md:text-base">
          <Inline text={table.description} />
        </p>
      )}
      <div className="mt-4">
        {wide ? <DataTable table={table} rows={shown} /> : <RowCards table={table} rows={shown} />}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!done ? (
          <>
            <button type="button" onClick={more} className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-accent-fg">
              Next row ({shown}/{total})
            </button>
            <button type="button" onClick={() => setShown(total)} className="rounded-full border border-line px-4 py-2.5 text-sm font-semibold">
              Show all
            </button>
          </>
        ) : (
          <span className="text-sm text-muted">All {total} rows shown.</span>
        )}
      </div>
    </CardShell>
  )
}
