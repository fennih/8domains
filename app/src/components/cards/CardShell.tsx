import type { ReactNode } from 'react'

// `live` marks the card on screen: highlighter sweeps only play inside a live card.
export function CardShell({ domain, label, live, children }: { domain: number; label: string; live: boolean; children: ReactNode }) {
  return (
    <div className="mx-auto h-full w-full max-w-7xl px-3 pb-3 pt-1 md:px-8 md:pb-6 md:pt-2">
      <article
        aria-label={label}
        className={`d-${domain} card ${live ? 'live' : ''} flex h-full flex-col overflow-y-auto px-5 py-5 md:px-12 md:py-9`}
      >
        {children}
      </article>
    </div>
  )
}
