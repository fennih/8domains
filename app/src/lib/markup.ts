// Inline markup allowed in content (see content/AUTHORING.md).
// Highlight bodies may contain a single "=" (e.g. ==b:ALE = SLE x ARO==), never "==".
export const TOKEN = /(`[^`]+`|\*\*[^*]+?\*\*|==(?:[gb]:)?(?:[^=]|=(?!=))+?==|\+\+[^+]+?\+\+)/g

export function stripMarkup(text: string): string {
  return text.replace(/==[gb]:|==|\+\+|\*\*|`/g, '')
}
