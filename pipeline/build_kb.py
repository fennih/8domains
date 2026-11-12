"""Compile the content directory (Markdown + YAML) into validated JSON for the app under app/public/kb/."""

import hashlib
import json
import os
import re
import sys
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parent.parent
CONTENT = Path(os.environ.get("KB_CONTENT") or ROOT / "content").resolve()
SCHEMA = ROOT / "pipeline" / "kb.schema.json"
OUT = ROOT / "app" / "public" / "kb"

FRONTMATTER = re.compile(r"\A---\n(.*?)\n---\n(.*)\Z", re.S)
SECTIONS = {
    "summary": ("summary", "text"),
    "key points": ("keyPoints", "list"),
    "mnemonic": ("mnemonic", "text"),
    "manager view": ("managerView", "text"),
    "traps": ("traps", "list"),
}
# `pronounce` only feeds the narration pipeline (audio/); it is not part of the compiled KB.
CONCEPT_FM = {"id", "title", "hook", "objective", "topic", "priority", "related", "flashcards", "pronounce"}
AUDIO_FILE = re.compile(r"^[a-z0-9-]+\.[0-9a-f]{12}\.m4a$")
# English manifests sit in <content>/audio, other narration languages in <content>/audio/<lang>.
AUDIO_LANGS = ("en", "it")
LETTERS = "ABCD"
MARKUP_TOKEN = re.compile(r"\*\*[^*]+?\*\*|`[^`]+`|==(?:[gb]:)?(?:[^=]|=(?!=))+?==|\+\+[^+]+?\+\+")
MARKUP_CHARS = re.compile(r"\*\*|==|\+\+")
NO_MARKUP_FIELDS = {"stem", "options", "front"}
HIGHLIGHT = re.compile(r"==(?:[gb]:)?(?:[^=]|=(?!=))+?==")
UNDERLINE = re.compile(r"\+\+[^+]+?\+\+")
KINDS = ("concepts", "flashcards", "questions", "tables")


class BuildError(Exception):
    pass


def split_frontmatter(path: Path) -> tuple[dict, str]:
    m = FRONTMATTER.match(path.read_text(encoding="utf-8"))
    if not m:
        raise BuildError(f"{path}: missing YAML frontmatter")
    fm = yaml.safe_load(m[1]) or {}
    if not isinstance(fm, dict):
        raise BuildError(f"{path}: frontmatter must be a mapping")
    return fm, m[2]


def parse_list(path: Path, text: str) -> list:
    # Top-level "- " bullets; "  - " (indented) bullets become sub-items of the previous one.
    items: list = []
    for line in text.splitlines():
        sub = re.match(r"^\s{2,}- (.*)$", line)
        top = re.match(r"^- (.*)$", line)
        if top:
            items.append({"text": top[1].strip(), "items": []})
        elif sub:
            if not items:
                raise BuildError(f"{path}: sub-bullet without a parent")
            items[-1]["items"].append(sub[1].strip())
        elif line.strip() and items:
            target = items[-1]["items"] if items[-1]["items"] else None
            if target is not None:
                target[-1] = f"{target[-1]} {line.strip()}"
            else:
                items[-1]["text"] = f"{items[-1]['text']} {line.strip()}"
    return [i["text"] if not i["items"] else i for i in items if i["text"]]


def parse_sections(path: Path, body: str) -> dict:
    out: dict = {}
    for block in re.split(r"^## ", body, flags=re.M)[1:]:
        heading, _, text = block.partition("\n")
        key = heading.strip().lower()
        if key not in SECTIONS:
            raise BuildError(f"{path}: unknown section '## {heading.strip()}'")
        field, kind = SECTIONS[key]
        text = text.strip()
        if kind == "list":
            out[field] = parse_list(path, text)
        else:
            out[field] = re.sub(r"\s*\n\s*", " ", text)
    return out


def scalar_text(value):
    # YAML turns answers like `13` or `3.5` into numbers; keep them as text. Other types fail schema validation.
    return str(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else value


def card_back(value):
    # A list answer is shown as a numbered list, one element per item.
    return [scalar_text(v) for v in value] if isinstance(value, list) else scalar_text(value)


def build_concept(path: Path, domain: int) -> tuple[dict, list[dict]]:
    fm, body = split_frontmatter(path)
    unknown = set(fm) - CONCEPT_FM
    if unknown:
        raise BuildError(f"{path}: unknown frontmatter keys {sorted(unknown)}")
    concept = {
        "id": fm.get("id"),
        "domain": domain,
        "objective": str(fm.get("objective")),
        "title": fm.get("title"),
        "hook": fm.get("hook"),
        "priority": fm.get("priority"),
    }
    for key in ("topic", "related"):
        if key in fm:
            concept[key] = str(fm[key]) if key == "topic" else fm[key]
    concept.update(parse_sections(path, body))
    cards = [
        {
            "id": f"{concept['id']}-fc{i}",
            "conceptId": concept["id"],
            "type": card.get("type", "qa"),
            "front": scalar_text(card.get("q")),
            "back": card_back(card.get("a")),
        }
        for i, card in enumerate(fm.get("flashcards") or [], 1)
    ]
    return concept, cards


def build_questions(path: Path, domain: int) -> list[dict]:
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or []
    questions = []
    for q in raw:
        answer = str(q.get("answer", "")).upper()
        if answer not in LETTERS:
            raise BuildError(f"{path}: {q.get('id')} answer must be one of A-D")
        questions.append({
            "id": q.get("id"),
            "domain": domain,
            "objective": str(q.get("objective")),
            "conceptIds": q.get("concepts") or [],
            "stem": q.get("stem"),
            "options": q.get("options"),
            "answer": LETTERS.index(answer),
            "explanation": q.get("explanation"),
            "style": q.get("style"),
            "difficulty": q.get("difficulty"),
        })
    return questions


def build_table(path: Path) -> dict:
    fm, body = split_frontmatter(path)
    rows = [l.strip() for l in body.splitlines() if l.strip().startswith("|")]
    if len(rows) < 3:
        raise BuildError(f"{path}: expected a markdown table")
    cells = [[c.strip() for c in r.strip("|").split("|")] for r in rows if not re.fullmatch(r"\|[\s:|-]+\|", r)]
    desc = " ".join(l.strip() for l in body.splitlines() if l.strip() and not l.strip().startswith("|"))
    table = {"id": fm.get("id"), "title": fm.get("title"), "priority": fm.get("priority"), "columns": cells[0], "rows": cells[1:]}
    if desc:
        table["description"] = desc
    for key in ("domain", "objective"):
        if key in fm:
            table[key] = str(fm[key]) if key == "objective" else fm[key]
    if any(len(r) != len(table["columns"]) for r in table["rows"]):
        raise BuildError(f"{path}: row/column count mismatch")
    return table


def markup_errors(item_id: str, obj, field: str = "") -> list[str]:
    if isinstance(obj, dict):
        return [e for k, v in obj.items() for e in markup_errors(item_id, v, k)]
    if isinstance(obj, list):
        return [e for v in obj for e in markup_errors(item_id, v, field)]
    if not isinstance(obj, str):
        return []
    if field in NO_MARKUP_FIELDS and MARKUP_CHARS.search(obj.replace("**", "")):
        return [f"{item_id}: highlight markup not allowed in {field}"]
    for token in MARKUP_TOKEN.findall(obj):
        if MARKUP_CHARS.search(token[2:-2]):
            return [f"{item_id}: nested markup in {field}: {token}"]
    if MARKUP_CHARS.search(MARKUP_TOKEN.sub("", obj)):
        return [f"{item_id}: unbalanced markup in {field}"]
    return []


def density_warnings(item_id: str, obj, field: str = "") -> list[str]:
    # One highlight and one underline per field keeps the live highlight on the single thing that matters.
    if isinstance(obj, dict):
        return [w for k, v in obj.items() for w in density_warnings(item_id, v, k)]
    if isinstance(obj, list):
        return [w for v in obj for w in density_warnings(item_id, v, field)]
    if isinstance(obj, str) and (len(HIGHLIGHT.findall(obj)) > 1 or len(UNDERLINE.findall(obj)) > 1):
        return [f"{item_id}: more than one highlight or underline in {field}"]
    return []


def cross_check(files: dict[str, dict], outline: dict) -> list[str]:
    errors = []
    objectives = {o["id"]: d["number"] for d in outline["domains"] for o in d["objectives"]}
    topics = {t["id"] for d in outline["domains"] for o in d["objectives"] for t in o["topics"]}
    concepts = {c["id"] for f in files.values() for c in f["concepts"]}
    seen: set[str] = set()
    for name, f in files.items():
        for kind in ("concepts", "flashcards", "questions", "tables"):
            for item in f[kind]:
                errors += markup_errors(item["id"], item)
                if item["id"] in seen:
                    errors.append(f"{name}: duplicate id {item['id']}")
                seen.add(item["id"])
        for c in f["concepts"]:
            if not c["id"].startswith(f"d{c['domain']}-"):
                errors.append(f"{name}: {c['id']} id prefix does not match domain {c['domain']}")
            if objectives.get(c["objective"]) != c["domain"]:
                errors.append(f"{name}: {c['id']} objective {c['objective']} not in domain {c['domain']}")
            if "topic" in c and (c["topic"] not in topics or not c["topic"].startswith(c["objective"] + ".")):
                errors.append(f"{name}: {c['id']} bad topic {c['topic']}")
            errors += [f"{name}: {c['id']} related -> unknown {r}" for r in c.get("related", []) if r not in concepts]
        for q in f["questions"]:
            if objectives.get(q["objective"]) != q["domain"]:
                errors.append(f"{name}: {q['id']} objective {q['objective']} not in domain {q['domain']}")
            errors += [f"{name}: {q['id']} -> unknown concept {cid}" for cid in q["conceptIds"] if cid not in concepts]
            if len(set(q["options"])) != 4:
                errors.append(f"{name}: {q['id']} options must be 4 distinct strings")
    return errors


def source_hash(c: dict) -> str:
    # Must match sourceHash() in app/scripts/story-segments.ts: it ties an audio file to the text it narrates.
    fields = [c["title"], c["hook"], c["summary"], c["keyPoints"], c.get("traps"), c.get("managerView"), c.get("mnemonic")]
    return hashlib.sha256(json.dumps(fields, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()[:12]


def build_audio(files: dict[str, dict]) -> tuple[dict[str, dict[str, dict]], list[str]]:
    """Narration manifests per language, minus entries whose concept text changed since synthesis."""
    out: dict[str, dict[str, dict]] = {}
    warnings: list[str] = []
    for lang in AUDIO_LANGS:
        adir = CONTENT / "audio" / ("" if lang == "en" else lang)
        if adir.exists():
            entries, w = build_audio_lang(files, adir, lang)
            if entries:
                out[lang] = entries
            warnings += w
    return out, warnings


def build_audio_lang(files: dict[str, dict], adir: Path, lang: str) -> tuple[dict[str, dict], list[str]]:
    out: dict[str, dict] = {}
    warnings: list[str] = []
    for d in range(1, 9):
        path = adir / f"d{d}.json"
        if not path.exists():
            continue
        concepts = {c["id"]: c for c in files[f"d{d}.json"]["concepts"]}
        entries = {}
        for cid, e in json.loads(path.read_text(encoding="utf-8")).items():
            c = concepts.get(cid)
            if c is None:
                warnings.append(f"audio {lang}: {cid} no longer exists")
            elif e.get("source") != source_hash(c):
                warnings.append(f"audio {lang}: {cid} text changed since synthesis, narration dropped until `make audio`")
            elif not AUDIO_FILE.fullmatch(str(e.get("file"))) or not e.get("steps"):
                warnings.append(f"audio {lang}: {cid} has a malformed entry")
            else:
                entries[cid] = {"file": e["file"], "steps": e["steps"]}
        if entries:
            out[f"d{d}.json"] = entries
    return out, warnings


def main() -> int:
    outline = json.loads((CONTENT / "outline.json").read_text(encoding="utf-8"))
    validator = Draft202012Validator(json.loads(SCHEMA.read_text()))
    files: dict[str, dict] = {}
    errors: list[str] = []
    try:
        for d in range(1, 9):
            ddir = CONTENT / f"d{d}"
            doc = {"domain": d, "concepts": [], "flashcards": [], "questions": [], "tables": []}
            if ddir.exists():
                for path in sorted(ddir.glob("*.md")):
                    concept, cards = build_concept(path, d)
                    doc["concepts"].append(concept)
                    doc["flashcards"] += cards
                for qpath in sorted(ddir.glob("questions*.yaml")):
                    doc["questions"] += build_questions(qpath, d)
            files[f"d{d}.json"] = doc
        files["tables.json"] = {
            "domain": 0, "concepts": [], "flashcards": [], "questions": [],
            "tables": [build_table(p) for p in sorted((CONTENT / "tables").glob("*.md"))] if (CONTENT / "tables").exists() else [],
        }
    except (BuildError, yaml.YAMLError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 1

    for name, doc in files.items():
        errors += [f"{name}: /{'/'.join(map(str, e.absolute_path))}: {e.message}" for e in validator.iter_errors(doc)]
    if not errors:
        errors += cross_check(files, outline)
    warnings = [w for doc in files.values() for kind in KINDS for item in doc[kind] for w in density_warnings(item["id"], item)]
    audio, audio_warnings = build_audio(files) if not errors else ({}, [])
    warnings += audio_warnings
    if warnings:
        print("\n".join(f"warning: {w}" for w in warnings), file=sys.stderr)
        print(f"{len(warnings)} density warning(s)", file=sys.stderr)
    if errors:
        print("\n".join(errors), file=sys.stderr)
        print(f"{len(errors)} error(s)", file=sys.stderr)
        return 1

    OUT.mkdir(parents=True, exist_ok=True)
    files["outline.json"] = outline
    digest = hashlib.sha256()
    for name, doc in files.items():
        payload = json.dumps(doc, ensure_ascii=False, separators=(",", ":"))
        digest.update(payload.encode())
        (OUT / name).write_text(payload, encoding="utf-8")
    # Stale manifests must not survive a rebuild: the app would point at audio for old text.
    adir = OUT / "audio"
    if adir.exists():
        for old in adir.glob("**/*.json"):
            old.unlink()
    for lang, per_file in audio.items():
        for name, entries in per_file.items():
            (adir / lang).mkdir(parents=True, exist_ok=True)
            payload = json.dumps(entries, ensure_ascii=False, separators=(",", ":"))
            digest.update(f"{lang}/{name}".encode() + payload.encode())
            (adir / lang / name).write_text(payload, encoding="utf-8")
    counts = {
        n: {k: len(doc[k]) for k in ("concepts", "flashcards", "questions", "tables")}
        for n, doc in files.items() if n != "outline.json"
    }
    index = {"version": digest.hexdigest()[:12], "files": counts, "audio": {lang: sorted(f) for lang, f in audio.items()}}
    (OUT / "index.json").write_text(json.dumps(index, indent=2), encoding="utf-8")
    for n, c in counts.items():
        print(f"{n:12} {c}")
    for lang, per_file in audio.items():
        print(f"audio {lang}     {sum(len(e) for e in per_file.values())} narrated concepts")
    print(f"built kb {digest.hexdigest()[:12]} -> {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
