import { useEffect, useState, type ReactNode } from 'react'
import { motionAllowed, useLive } from './live'

const DURATION_MS = 700
const DELAY_MS = 170
const MAX_VALUE = 100_000
const NUMBER = /(\d+(?:\.\d+)?)/

// Counting suits plain quantities only: no years, versions (4.0.1, 802.1X), thousands groups or names like SHA-256.
function countable(token: string, before: string, after: string): boolean {
  const value = Number(token)
  if (!Number.isFinite(value) || value > MAX_VALUE) return false
  if (/^(19|20)\d\d$/.test(token)) return false
  if (/[A-Za-z]-?$|[.,]$/.test(before)) return false
  if (/^[.,]\d|^[A-Za-z]/.test(after)) return false
  return true
}

function Count({ token }: { token: string }) {
  const live = useLive()
  const decimals = token.split('.')[1]?.length ?? 0
  const target = Number(token)
  const [shown, setShown] = useState<string | null>(null)

  useEffect(() => {
    if (!live || !motionAllowed()) return
    let frame = 0
    let start = 0
    const tick = (now: number) => {
      if (!start) start = now + DELAY_MS
      const t = Math.min(1, Math.max(0, (now - start) / DURATION_MS))
      const eased = 1 - (1 - t) ** 3
      setShown(t < 1 ? (target * eased).toFixed(decimals) : null)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      setShown(null)
    }
  }, [live, target, decimals])

  if (shown === null) return <>{token}</>
  // Screen readers get the final value once; the ticking digits are visual only.
  return (
    <>
      <span className="sr-only">{token}</span>
      <span aria-hidden="true" className="tabular-nums">
        {shown}
      </span>
    </>
  )
}

// Blue highlights mark numbers to remember: their plain numbers count up when the card comes on screen.
export function CountUp({ text }: { text: string }) {
  const parts: ReactNode[] = text.split(NUMBER).map((part, i, all) =>
    i % 2 === 1 && countable(part, all[i - 1] ?? '', all[i + 1] ?? '') ? <Count key={i} token={part} /> : part,
  )
  return <>{parts}</>
}
