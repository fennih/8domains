import type { ReactNode } from 'react'

// `live` marks the card on screen: highlighter animations only play inside a live card.
// `prev`/`next` are the round side arrows and `below` the keyboard hint, shown from 1200px.
export function CardShell({
  domain,
  label,
  live,
  children,
  prev,
  next,
  below,
}: {
  domain: number
  label: string
  live: boolean
  children: ReactNode
  prev?: ReactNode
  next?: ReactNode
  below?: ReactNode
}) {
  return (
    <div className="mx-auto flex h-full w-full max-w-7xl flex-col px-2.5 pb-3.5 pt-1 md:px-5 md:pb-6 desk:px-10">
      <div className="flex min-h-0 flex-1 items-center justify-center gap-6">
        {prev && <div className="hidden desk:block">{prev}</div>}
        <article
          aria-label={label}
          className={`d-${domain} card ${live ? 'live' : ''} story-card flex h-full w-full flex-col overflow-y-auto desk:max-w-[880px]`}
        >
          {children}
        </article>
        {next && <div className="hidden desk:block">{next}</div>}
      </div>
      {below && <div className="hidden pt-4 desk:block">{below}</div>}
    </div>
  )
}
