import { narrationLang, narrationLangs, nextLang, setLang, usePlayer, type NarrationLang } from '../lib/audio'

const NAME: Record<NarrationLang, string> = { en: 'English', it: 'Italiano' }

// Narration language switch, shown only when a concept is narrated in more than one language.
export function LangChip({ conceptId, className }: { conceptId: string; className: string }) {
  usePlayer()
  if (narrationLangs(conceptId).length < 2) return null
  const lang = narrationLang(conceptId)
  const next = nextLang(conceptId, lang)
  return (
    <button type="button" onClick={() => setLang(next)} aria-label={`Narration in ${NAME[lang]}, switch to ${NAME[next]}`} className={className}>
      {lang.toUpperCase()}
    </button>
  )
}
