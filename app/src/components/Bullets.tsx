import type { CSSProperties } from 'react'
import { itemSubs, itemText, type ListItem } from '../kb/types'
import { Inline } from './Inline'

const SUB_STAGGER_MS = 80

// --reveal-delay staggers sub-bullets (and their highlighter sweep) after their parent appears.
const delay = (ms: number) => ({ '--reveal-delay': `${ms}ms` }) as CSSProperties

export function Bullets({ items, className = '', subClassName = '' }: { items: ListItem[]; className?: string; subClassName?: string }) {
  return (
    <ul className={`bl ${className}`}>
      {items.map((li, i) => {
        const subs = itemSubs(li)
        return (
          <li key={i} className="reveal">
            <Inline text={itemText(li)} />
            {subs.length > 0 && (
              <ul className={`bl-sub ${subClassName}`}>
                {subs.map((s, j) => (
                  <li key={j} className="reveal" style={delay((j + 1) * SUB_STAGGER_MS)}>
                    <Inline text={s} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}
