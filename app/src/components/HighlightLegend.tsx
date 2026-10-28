import type { HighlightColor } from '../lib/markup'

export const HIGHLIGHT_MEANING: Record<HighlightColor, string> = {
  y: 'Key fact',
  g: 'Exam action: what the exam rewards',
  b: 'Number to remember',
}

// Shown under a screen the first time each color appears, then never again (settings.legendsSeen).
export function HighlightLegend({ colors }: { colors: HighlightColor[] }) {
  if (colors.length === 0) return null
  return (
    <ul className="flex list-none flex-wrap gap-2 p-0" aria-label="Highlight colors">
      {colors.map((c) => (
        <li key={c} className={`hl-legend hl-legend-${c} reveal`}>
          <span aria-hidden="true" className="hl-legend-dot" />
          {HIGHLIGHT_MEANING[c]}
        </li>
      ))}
    </ul>
  )
}
