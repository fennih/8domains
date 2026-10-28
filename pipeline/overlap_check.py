"""Quality check on generated content: flag wording that stays too close to the local study books.

Compares word 8-grams of every text field in the compiled KB (app/public/kb) against the
extracted chapters in sources/extracted. Mnemonics are short and memorable, so they are checked
with 4-grams instead; those matches are warnings to review by eye, since short common phrases
also match. Flagged 8-gram fields must be rewritten in original words.
Wording from the public exam outline and pipeline/overlap_allowlist.txt is allowlisted. Needs the local sources, so it is not run in CI.
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "sources" / "extracted"
KB = ROOT / "app" / "public" / "kb"
N = 8
N_MNEMONIC = 4
SKIP_KEYS = {"id", "conceptId", "conceptIds", "objective", "topic", "priority", "related", "type", "style", "title", "columns"}
WORD = re.compile(r"[a-z0-9]+")
MARKUP = re.compile(r"==[gb]:|==|\+\+|\*\*|`")


def ngrams(text: str, n: int = N) -> set[tuple[str, ...]]:
    words = WORD.findall(MARKUP.sub("", text).lower())
    return {tuple(words[i : i + n]) for i in range(len(words) - n + 1)}


def strings(obj):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k not in SKIP_KEYS:
                yield from strings(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from strings(v)
    elif isinstance(obj, str):
        yield obj


def load_allowlist() -> list[str]:
    phrases = list(strings(json.loads((KB / "outline.json").read_text())))
    for line in (ROOT / "pipeline" / "overlap_allowlist.txt").read_text(encoding="utf-8").splitlines():
        if line.strip() and not line.startswith("#"):
            phrases.append(line)
    return phrases


def main() -> int:
    if not SOURCES.exists() or not KB.exists():
        print("need sources/extracted (extract.py) and app/public/kb (build_kb.py)", file=sys.stderr)
        return 2
    allow = load_allowlist()
    texts = [f.read_text(encoding="utf-8") for f in SOURCES.rglob("*.md")]
    source = set().union(*(ngrams(t) for t in texts)) - set().union(*(ngrams(a) for a in allow))
    source_m = set().union(*(ngrams(t, N_MNEMONIC) for t in texts)) - set().union(*(ngrams(a, N_MNEMONIC) for a in allow))

    hits = warnings = 0
    for f in sorted(KB.glob("*.json")):
        if f.name in ("outline.json", "index.json"):
            continue
        doc = json.loads(f.read_text())
        for kind in ("concepts", "flashcards", "questions", "tables"):
            for item in doc[kind]:
                shared = set().union(*(ngrams(s) for s in strings(item))) & source
                if shared:
                    hits += 1
                    print(f"{item['id']}: {len(shared)} shared {N}-gram(s), e.g. \"{' '.join(sorted(shared)[0])}\"")
                shared_m = ngrams(item.get("mnemonic", ""), N_MNEMONIC) & source_m
                if shared_m:
                    warnings += 1
                    print(f"review {item['id']} mnemonic: {len(shared_m)} shared {N_MNEMONIC}-gram(s), e.g. \"{' '.join(sorted(shared_m)[0])}\"")
    if warnings:
        print(f"{warnings} mnemonic(s) to review: rewrite if derived from a source mnemonic")
    print("OK: no close overlap" if not hits else f"{hits} item(s) to rewrite")
    return 1 if hits else 0


if __name__ == "__main__":
    sys.exit(main())
