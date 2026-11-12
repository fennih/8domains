// Narration text for every story step, taken from the same beats the app shows (src/lib/beats.ts).
// Usage: bun scripts/story-segments.ts <kb dir> <out file>
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { conceptStory, type Screen } from '../src/lib/beats'
import { itemSubs, itemText, type Concept, type DomainFile } from '../src/kb/types'

// Spoken once, before the first step of a screen kind, so a listener knows where they are.
const LABEL: Partial<Record<Screen['kind'], string>> = { traps: 'Exam trap.', manager: 'Manager view.', mnemonic: 'Mnemonic.' }

// Must match source_hash() in pipeline/build_kb.py: it ties an audio file to the text it narrates.
export function sourceHash(c: Concept): string {
  const fields = [c.title, c.hook, c.summary, c.keyPoints, c.traps ?? null, c.managerView ?? null, c.mnemonic ?? null]
  return createHash('sha256').update(JSON.stringify(fields)).digest('hex').slice(0, 12)
}

function narrate(c: Concept): string[] {
  const { screens, steps } = conceptStory(c)
  const labelled = new Set<Screen['kind']>()
  return steps.map(({ screen, reveal }) => {
    const s = screens[screen]!
    let text: string
    if (s.kind === 'points' || s.kind === 'traps') {
      const li = s.items[reveal - 1]!
      text = [itemText(li), ...itemSubs(li)].join('\n')
    } else if (s.kind === 'hook') {
      text = `${c.title}.\n${s.text}`
    } else {
      text = s.text
    }
    const label = LABEL[s.kind]
    if (label && !labelled.has(s.kind)) {
      labelled.add(s.kind)
      text = `${label}\n${text}`
    }
    return text
  })
}

const [kbDir, outFile] = process.argv.slice(2)
if (!kbDir || !outFile) {
  console.error('usage: bun scripts/story-segments.ts <kb dir> <out file>')
  process.exit(2)
}

const out: Record<string, { domain: number; objective: string; title: string; source: string; steps: string[] }> = {}
for (const name of readdirSync(kbDir).filter((n) => /^d[1-8]\.json$/.test(n)).sort()) {
  const file = JSON.parse(readFileSync(join(kbDir, name), 'utf8')) as DomainFile
  for (const c of file.concepts)
    out[c.id] = { domain: c.domain, objective: c.objective, title: c.title, source: sourceHash(c), steps: narrate(c) }
}
mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, JSON.stringify(out, null, 1))
console.log(`${Object.keys(out).length} concepts -> ${outFile}`)
