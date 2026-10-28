// Inline markup allowed in content (see content/AUTHORING.md).
// Highlight bodies may contain a single "=" (e.g. ==b:ALE = SLE x ARO==), never "==".
export const TOKEN = /(`[^`]+`|\*\*[^*]+?\*\*|==(?:[gb]:)?(?:[^=]|=(?!=))+?==|\+\+[^+]+?\+\+)/g

export function stripMarkup(text: string): string {
  return text.replace(/==[gb]:|==|\+\+|\*\*|`/g, '')
}

export type HighlightColor = 'y' | 'g' | 'b'

// Highlighter colors used in a piece of text, in order of first use.
export function highlightColors(text: string): HighlightColor[] {
  const found: HighlightColor[] = []
  for (const m of text.match(TOKEN) ?? []) {
    if (!m.startsWith('==')) continue
    const c: HighlightColor = m[3] === ':' && (m[2] === 'g' || m[2] === 'b') ? m[2] : 'y'
    if (!found.includes(c)) found.push(c)
  }
  return found
}
