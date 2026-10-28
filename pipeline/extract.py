"""Extract local study books into per-chapter markdown under sources/extracted/ (gitignored)."""

import hashlib
import json
import re
import subprocess
import sys
import warnings
from pathlib import Path

from bs4 import BeautifulSoup
from ebooklib import epub

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parent.parent
RESOURCES = ROOT / "resources"
OUT = ROOT / "sources" / "extracted"
MIN_WORDS = 300
SKIP_NAMES = re.compile(r"(cover|title|copy|toc|navigation|index|eula|ack|b0[2-5])", re.I)


def book_id(path: Path) -> str | None:
    if path.suffix not in (".epub", ".pdf"):
        return None
    # Local-only id; the hash keeps similarly named files apart.
    return f"{slug(path.stem)[:40]}-{hashlib.sha256(path.name.encode()).hexdigest()[:6]}"


def html_to_md(html: bytes) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "img", "figure"]):
        tag.decompose()
    lines: list[str] = []
    for el in soup.find_all(["h1", "h2", "h3", "h4", "p", "li", "tr", "pre"]):
        if el.find_parent(["li", "tr"]) and el.name in ("p", "li"):
            continue
        text = el.get_text(" ", strip=True)
        if not text:
            continue
        if el.name.startswith("h"):
            lines.append(f"\n{'#' * int(el.name[1])} {text}\n")
        elif el.name == "li":
            lines.append(f"- {text}")
        elif el.name == "tr":
            cells = [c.get_text(" ", strip=True) for c in el.find_all(["td", "th"])]
            lines.append("| " + " | ".join(cells) + " |")
        else:
            lines.append(text + "\n")
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip() + "\n"


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:60] or "untitled"


def extract_epub(path: Path, bid: str) -> list[dict]:
    book = epub.read_epub(str(path), {"ignore_ncx": False})
    chapters = []
    for idref, _ in book.spine:
        item = book.get_item_with_id(idref)
        if item is None or SKIP_NAMES.search(Path(item.get_name()).stem):
            continue
        md = html_to_md(item.get_content())
        words = len(md.split())
        if words < MIN_WORDS:
            continue
        heading = next((l.lstrip("# ").strip() for l in md.splitlines() if l.startswith("#")), Path(item.get_name()).stem)
        chapters.append({"source": item.get_name(), "title": heading, "words": words, "text": md})
    return chapters


def extract_pdf(path: Path) -> list[dict]:
    text = subprocess.run(["pdftotext", "-layout", str(path), "-"], capture_output=True, text=True, check=True).stdout
    return [{"source": path.name, "title": path.stem, "words": len(text.split()), "text": text}]


def main() -> int:
    manifest = {}
    for path in sorted(RESOURCES.iterdir()):
        bid = book_id(path)
        if bid is None:
            print(f"skip (not epub/pdf): {path.name}", file=sys.stderr)
            continue
        chapters = extract_pdf(path) if path.suffix == ".pdf" else extract_epub(path, bid)
        outdir = OUT / bid
        outdir.mkdir(parents=True, exist_ok=True)
        entries = []
        for i, ch in enumerate(chapters, 1):
            fname = f"{i:02d}-{slug(ch['title'])}.md"
            (outdir / fname).write_text(ch["text"], encoding="utf-8")
            entries.append({"file": f"{bid}/{fname}", "title": ch["title"], "words": ch["words"], "source": ch["source"]})
        manifest[bid] = entries
        print(f"{bid}: {len(entries)} chapters, {sum(e['words'] for e in entries)} words")
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
