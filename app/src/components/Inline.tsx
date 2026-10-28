import type { CSSProperties, ReactNode } from 'react'
import { TOKEN } from '../lib/markup'
import { CountUp } from './CountUp'

const QUALIFIER = /\b(NOT|BEST|FIRST|MOST|LEAST|PRIMARY|PRIMARILY|MAIN|EXCEPT|LAST|GREATEST)\b/g
const HIGHLIGHT = { y: 'hl-y', g: 'hl-g', b: 'hl-b' } as const

// --hl-i staggers the highlighter sweep between marks of the same field.
const order = (i: number) => ({ '--hl-i': i }) as CSSProperties

function underlineQualifiers(text: string, keyBase: string): ReactNode[] {
  return text.split(QUALIFIER).map((part, i) =>
    i % 2 === 1 ? (
      <u key={`${keyBase}-${i}`} className="ul-mark">
        {part}
      </u>
    ) : (
      part
    ),
  )
}

// Renders the inline markup allowed in content (see content/AUTHORING.md). Everything else stays plain text.
export function Inline({ text, qualifiers = false }: { text: string; qualifiers?: boolean }) {
  let marks = 0
  const parts: ReactNode[] = text.split(TOKEN).map((part, i) => {
    if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>
    if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.length > 4 && part.startsWith('++') && part.endsWith('++'))
      return (
        <u key={i} className="ul-mark" style={order(marks++)}>
          {part.slice(2, -2)}
        </u>
      )
    if (part.length > 4 && part.startsWith('==') && part.endsWith('==')) {
      const body = part.slice(2, -2)
      const color = body[1] === ':' && (body[0] === 'g' || body[0] === 'b') ? body[0] : 'y'
      const inner = color === 'y' ? body : body.slice(2)
      // Focusable so the meaning tooltip (HighlightTip) is reachable by keyboard; described by a static text.
      return (
        <mark key={i} className={`hl ${HIGHLIGHT[color]}`} style={order(marks++)} data-hl={color} tabIndex={0} aria-describedby={`hl-desc-${color}`}>
          {color === 'b' ? <CountUp text={inner} /> : inner}
        </mark>
      )
    }
    return qualifiers ? underlineQualifiers(part, String(i)) : part
  })
  return <>{parts}</>
}

