"""Narration audio for concept stories, generated locally: Kokoro for English, OmniVoice for Italian.

  lexicon    report tokens the narrator cannot say on purpose yet (fails if any)
  audition   render a local HTML page with one clip per lexicon entry and engine-guessed word
  synth      synthesize stories into build/audio/out and write the manifests in <content>/audio
  check      transcribe synthesized steps with Whisper and flag the ones that drift from the text
  push       upload new audio files to the R2 bucket

Run `make audio-segments` first: it writes build/audio/segments.json from the compiled KB.

--lang it narrates the translations in <content>/narration/it/*.yaml: one entry per concept with the
English `source` hash it was translated from and exactly one Italian text per story step, written to be
read aloud as is. OmniVoice reads plain text (numbers, acronyms and English terms included) in the voice
cloned from <content>/narration/it/voice.wav (transcript in voice.txt); English terms are marked with
{braces} for the writer, and <content>/narration/it/lexicon.yaml respells the words the voice gets wrong.
It runs in the audio/mlx uv project.
"""

import argparse
import collections
import hashlib
import html
import json
import os
import re
import subprocess
import sys
from pathlib import Path

# `python -I` drops the script directory from sys.path.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from speech import Lexicon, Normalizer, is_phonemes, load_lexicon  # noqa: E402

import numpy as np  # noqa: E402
import yaml  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CONTENT = Path(os.environ.get("AUDIO_CONTENT") or ROOT / "content").resolve()
BUILD = ROOT / "build" / "audio"
SEGMENTS = BUILD / "segments.json"
CACHE = BUILD / "cache"
OUT = BUILD / "out"
PUSHED = BUILD / "pushed.txt"
LEXICON = CONTENT / "lexicon.yaml"
MANIFESTS = CONTENT / "audio"
TRANSLATIONS = CONTENT / "narration"

REPO_ID = "hexgrad/Kokoro-82M"
OMNIVOICE_ID = "mlx-community/OmniVoice-bfloat16"
# Unmasking steps: 16 is the documented speed/quality balance (32 is the model default).
OMNIVOICE_STEPS = 16
MODELS = {"en": REPO_ID, "it": f"{OMNIVOICE_ID}@{OMNIVOICE_STEPS}"}
LANGS = ("en", "it")
# Set once from --lang in main(): every command works on one narration language.
LANG = "en"
VOICE = os.environ.get("AUDIO_VOICE", "af_heart")
BRACED = re.compile(r"\{([^{}]*)\}")
# Italian narration is read as written: any other symbol would leave the voice guessing.
SPOKEN_PUNCT = set(".,;:!?'’\"«»()%-–—")
SPEED = 1.0
RATE = 24000
LINE_GAP = 0.25
STEP_GAP = 0.45
BITRATE = "48k"
BUCKET = "8domains-audio"
FRONTMATTER = re.compile(r"\A---\n(.*?)\n---\n", re.S)
FILE_NAME = re.compile(r"^[a-z0-9-]+\.[0-9a-f]{12}\.m4a$")


class Engine:
    """misaki G2P (with and without the espeak fallback) plus the Kokoro model, loaded lazily."""

    def __init__(self, synth: bool):
        from misaki import en, espeak

        self.g2p = en.G2P(trf=False, british=False, fallback=espeak.EspeakFallback(british=False), unk="❓")
        self.strict = en.G2P(trf=False, british=False, fallback=None, unk="❓")
        self.vocab = kokoro_vocab()
        self.pipeline = None
        if synth:
            from kokoro import KPipeline

            self.pipeline = KPipeline(lang_code="a", repo_id=REPO_ID)

    def spell(self, tok: str) -> str:
        ps, _ = self.g2p.lexicon.get_NNP(tok)
        if ps is None:
            raise ValueError(f"cannot spell {tok!r}")
        return ps

    def phonemize(self, line: str):
        return self.g2p(line)

    def guessed(self, line: str) -> list[str]:
        # Words only the espeak fallback could pronounce: fine for prose, but worth one listen.
        _, tokens = self.strict(line)
        return [t.text for t in tokens if t.phonemes is None or "❓" in (t.phonemes or "")]

    def synth(self, tokens) -> np.ndarray:
        parts = [r.audio.numpy() for r in self.pipeline.generate_from_tokens(tokens, voice=VOICE, speed=SPEED) if r.audio is not None]
        return np.concatenate(parts) if parts else np.zeros(0, dtype=np.float32)


def italian_voice() -> tuple[Path, str]:
    wav, txt = TRANSLATIONS / "it" / "voice.wav", TRANSLATIONS / "it" / "voice.txt"
    if not wav.exists() or not txt.exists():
        sys.exit(f"Italian narration clones {wav} (transcript in {txt.name}): both are missing")
    return wav, txt.read_text(encoding="utf-8").strip()


def italian_voice_id() -> str:
    # The reference clip is the voice: a new clip or transcript re-synthesizes everything.
    wav, text = italian_voice()
    return "clone:" + hashlib.sha256(wav.read_bytes() + text.encode()).hexdigest()[:16]


class OmniVoiceEngine:
    """OmniVoice on MLX for Italian, cloning the reference voice; it reads plain text, numbers included."""

    def __init__(self, synth: bool):
        self.model = None
        if synth:
            from mlx_audio.tts.models.omnivoice.utils import create_voice_clone_prompt
            from mlx_audio.tts.utils import load_model

            self.model = load_model(OMNIVOICE_ID)
            wav, self.ref_text = italian_voice()
            # Encoded once: the encoder runs on CPU and costs about half the clip length per call.
            self.ref_tokens = create_voice_clone_prompt(str(wav), tokenizer=self.model.audio_tokenizer, ref_text=self.ref_text)

    def synth(self, text: str) -> np.ndarray:
        parts = []
        for r in self.model.generate(text=text, language="it", ref_tokens=self.ref_tokens, ref_text=self.ref_text, num_steps=OMNIVOICE_STEPS):
            if r.sample_rate != RATE:
                sys.exit(f"{OMNIVOICE_ID} outputs {r.sample_rate} Hz, the pipeline expects {RATE}")
            parts.append(np.asarray(r.audio, dtype=np.float32).reshape(-1))
        return level(trim(np.concatenate(parts))) if parts else np.zeros(0, dtype=np.float32)


def trim(audio: np.ndarray, floor: float = 0.01, pad: float = 0.05) -> np.ndarray:
    # A generated clip can open or close on silence; the step gaps already space the narration.
    loud = np.flatnonzero(np.abs(audio) > floor)
    if not len(loud):
        return audio[:0]
    p = int(pad * RATE)
    return audio[max(loud[0] - p, 0) : loud[-1] + p + 1]


def level(audio: np.ndarray, target: float = 0.1) -> np.ndarray:
    # Same loudness for every line, without clipping.
    if not len(audio):
        return audio
    rms = float(np.sqrt(np.mean(audio**2)))
    return audio * min(target / rms, 0.98 / float(np.abs(audio).max())) if rms else audio


def make_engine(synth: bool):
    return OmniVoiceEngine(synth) if LANG == "it" else Engine(synth)


def kokoro_vocab() -> set[str]:
    from huggingface_hub import hf_hub_download

    return set(json.loads(Path(hf_hub_download(REPO_ID, "config.json")).read_text())["vocab"])


class ItalianText:
    """Italian narration as OmniVoice will read it, with the problems that block a line."""

    def __init__(self):
        path = TRANSLATIONS / "it" / "lexicon.yaml"
        self.say = {str(k): str(v) for k, v in (yaml.safe_load(path.read_text(encoding="utf-8")) or {}).items()} if path.exists() else {}
        words = "|".join(re.escape(w) for w in sorted(self.say, key=len, reverse=True))
        self.pattern = re.compile(rf"(?<!\w)({words})(?!\w)") if self.say else None

    def __call__(self, line: str) -> tuple[str, list[str]]:
        problems = []
        if line.count("{") != line.count("}"):
            problems.append(f"unbalanced braces in {line[:60]!r}")
        text = BRACED.sub(r"\1", line)
        if self.pattern:
            text = self.pattern.sub(lambda m: self.say[m[1]], text)
        text = re.sub(r"\s+", " ", text).strip()
        if bad := sorted({ch for ch in text if not (ch.isalnum() or ch.isspace() or ch in SPOKEN_PUNCT)}):
            problems.append(f"write out {' '.join(bad)} in {line[:60]!r}")
        return text, problems


def phoneme_errors(lexicon: Lexicon, overrides: dict[str, dict[str, str]]) -> list[str]:
    # Hand-written phonemes must use Kokoro's symbol set: a plain "g" or "r" would be dropped silently.
    vocab = kokoro_vocab()
    entries = [("lexicon", t, v) for t, v in lexicon.phonemes().items()]
    entries += [(cid, t, v[1:-1]) for cid, o in overrides.items() for t, v in o.items() if is_phonemes(v)]
    return [f"{where}: {tok} /{ps}/ uses {sorted(set(ps) - vocab)}" for where, tok, ps in entries if set(ps) - vocab]


def load_segments() -> dict:
    if not SEGMENTS.exists():
        sys.exit(f"{SEGMENTS.relative_to(ROOT)} missing: run `make audio-segments` first")
    segments = json.loads(SEGMENTS.read_text(encoding="utf-8"))
    return segments if LANG == "en" else translated(segments)


def translated(segments: dict) -> dict:
    """English segments with their steps replaced by the translation; stale or misaligned ones are left out."""
    out, seen = {}, {}
    for path in sorted((TRANSLATIONS / LANG).glob("*.yaml")):
        if path.name == "lexicon.yaml":
            continue
        for cid, t in (yaml.safe_load(path.read_text(encoding="utf-8")) or {}).items():
            en = segments.get(cid)
            steps = t.get("steps") or []
            if cid in seen:
                print(f"{path.name}: {cid} already translated in {seen[cid]}, skipped", file=sys.stderr)
                continue
            seen[cid] = path.name
            if en is None:
                print(f"{path.name}: {cid} no longer exists", file=sys.stderr)
            elif t.get("source") != en["source"]:
                print(f"{path.name}: {cid} translated from older text, retranslate it", file=sys.stderr)
            elif len(steps) != len(en["steps"]) or not all(isinstance(s, str) and s.strip() for s in steps):
                print(f"{path.name}: {cid} has {len(steps)} steps, the story has {len(en['steps'])}", file=sys.stderr)
            else:
                out[cid] = {**en, "steps": [s.strip() for s in steps]}
    return out


def manifest_dir() -> Path:
    return MANIFESTS if LANG == "en" else MANIFESTS / LANG


def load_overrides() -> dict[str, dict[str, str]]:
    out = {}
    for path in sorted(CONTENT.glob("d[1-8]/*.md")):
        m = FRONTMATTER.match(path.read_text(encoding="utf-8"))
        fm = yaml.safe_load(m[1]) if m else None
        if isinstance(fm, dict) and fm.get("pronounce"):
            out[fm["id"]] = {str(k): str(v) for k, v in fm["pronounce"].items()}
    return out


def select(segments: dict, only: str | None, concept: str | None) -> dict:
    def keep(cid: str, c: dict) -> bool:
        if concept:
            return cid == concept
        if not only:
            return True
        if re.fullmatch(r"d[1-8]", only):
            return c["domain"] == int(only[1])
        return c["objective"] == only or c["objective"].startswith(only + ".")

    return {cid: c for cid, c in segments.items() if keep(cid, c)}


class Prepared:
    """Every step of every concept, normalized and phonemized, with gate errors and guessed words."""

    def __init__(self, engine: Engine, lexicon: Lexicon, segments: dict, overrides: dict, guesses: bool = False):
        self.steps: dict[str, list[list[tuple[str, list]]]] = {}
        self.errors: dict[str, list[str]] = collections.defaultdict(list)
        self.unresolved: collections.Counter = collections.Counter()
        self.unknown: collections.Counter = collections.Counter()
        self.guessed: collections.Counter = collections.Counter()
        self.example: dict[str, tuple[str, str]] = {}
        italian = ItalianText() if LANG == "it" else None
        norm = None if italian else Normalizer(lexicon, engine.spell)
        for cid, c in segments.items():
            steps = []
            for raw in c["steps"]:
                if italian:
                    lines = []
                    for line in raw.split("\n"):
                        text, problems = italian(line)
                        for p in problems:
                            self.unknown[p] += 1
                            self.example.setdefault(p, (cid, line))
                        self.errors[cid] += problems
                        lines.append((text, text))
                    steps.append(lines)
                    continue
                norm.unresolved = []
                text = norm.run(raw, overrides.get(cid))
                for tok in norm.unresolved:
                    self.unresolved[tok] += 1
                    self.example.setdefault(tok, (cid, text))
                    self.errors[cid].append(f"unresolved acronym {tok}")
                lines = []
                for line in text.split("\n"):
                    ps, tokens = engine.phonemize(line)
                    if "❓" in ps:
                        bad = [t.text for t in tokens if "❓" in (t.phonemes or "❓")]
                        for tok in bad:
                            self.unknown[tok] += 1
                            self.example.setdefault(tok, (cid, line))
                        self.errors[cid].append(f"unpronounceable {bad}")
                    if guesses:
                        for tok in engine.guessed(line):
                            self.guessed[tok] += 1
                            self.example.setdefault(tok, (cid, line))
                    lines.append((ps, tokens))
                steps.append(lines)
            self.steps[cid] = steps


def cmd_lexicon(args) -> int:
    if LANG == "it":
        segments = select(load_segments(), args.only, args.concept)
        prep = Prepared(make_engine(False), None, segments, {})
        for problem, n in prep.unknown.most_common():
            print(f"  {n:4}  {prep.example[problem][0]}: {problem}")
        print(f"{len(segments)} concepts, {sum(len(c['steps']) for c in segments.values())} steps: {len(prep.unknown)} problem(s)")
        return 1 if prep.unknown else 0
    lexicon = load_lexicon(LEXICON)
    overrides = load_overrides()
    bad_phonemes = phoneme_errors(lexicon, overrides)
    for e in bad_phonemes:
        print(f"bad phonemes: {e}")
    engine = Engine(synth=False)
    segments = select(load_segments(), args.only, args.concept)
    prep = Prepared(engine, lexicon, segments, overrides, guesses=True)

    for title, counter in (("unresolved acronyms", prep.unresolved), ("unpronounceable tokens", prep.unknown)):
        if counter:
            print(f"\n{title} ({len(counter)}):")
            for tok, n in counter.most_common():
                cid, ctx = prep.example[tok]
                print(f"  {tok:18} {n:4}  {cid}: {ctx[:90]!r}")
    if args.guesses and prep.guessed:
        print(f"\nwords read by the espeak fallback ({len(prep.guessed)}), listen with `make audio-audition`:")
        print("  " + " ".join(f"{t}({n})" for t, n in prep.guessed.most_common()))

    if args.suggest:
        # Default: spell; flag tokens the engine would read as a word, so a human picks spell, keep or say.
        suggestions = {}
        for tok in sorted(prep.unresolved):
            ps, _ = engine.strict(tok)
            spelled = engine.spell(tok) if tok.isalpha() else None
            suggestions[tok] = {"count": prep.unresolved[tok], "engine": ps.strip(), "spelled": spelled, "context": prep.example[tok][1][:120]}
        Path(args.suggest).write_text(yaml.safe_dump(suggestions, allow_unicode=True, sort_keys=False), encoding="utf-8")
        print(f"\nsuggestions -> {args.suggest}")

    n = len(prep.unresolved) + len(prep.unknown) + len(bad_phonemes)
    print(f"\n{len(segments)} concepts, {sum(len(c['steps']) for c in segments.values())} steps: {n} problem token(s)")
    return 1 if n else 0


def step_key(lines: list[tuple[str, list]]) -> str:
    h = hashlib.sha256(f"{MODELS[LANG]}|{VOICE}|{SPEED}".encode())
    for ps, _ in lines:
        h.update(b"\n" + ps.encode())
    return h.hexdigest()


def cache_path(lines: list[tuple[str, list]]) -> Path:
    return CACHE / f"{step_key(lines)}.flac"


def read_cached(path: Path) -> np.ndarray:
    import soundfile as sf

    return sf.read(path, dtype="float32")[0]


def step_audio(engine: Engine, lines: list[tuple[str, list]]) -> np.ndarray:
    import soundfile as sf

    path = cache_path(lines)
    if path.exists():
        return read_cached(path)
    gap = np.zeros(int(LINE_GAP * RATE), dtype=np.float32)
    parts = []
    for i, (_, tokens) in enumerate(lines):
        if i:
            parts.append(gap)
        parts.append(engine.synth(tokens).astype(np.float32))
    audio = np.concatenate(parts)
    CACHE.mkdir(parents=True, exist_ok=True)
    # 16-bit FLAC keeps the cache around a fifth of raw float32; the result is re-read so timings match it.
    sf.write(path, np.clip(audio, -1, 1), RATE, subtype="PCM_16")
    return read_cached(path)


def encode(audio: np.ndarray, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["ffmpeg", "-loglevel", "error", "-y", "-f", "f32le", "-ar", str(RATE), "-ac", "1", "-i", "pipe:0",
           "-c:a", "aac", "-b:a", BITRATE, "-movflags", "+faststart", str(dest)]
    subprocess.run(cmd, input=audio.astype("<f4").tobytes(), check=True)


def read_manifest(domain: int, folder: Path | None = None) -> dict:
    path = (folder or manifest_dir()) / f"d{domain}.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def write_manifest(domain: int, entries: dict) -> None:
    folder = manifest_dir()
    folder.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(dict(sorted(entries.items())), indent=1, ensure_ascii=False)
    tmp = folder / f".d{domain}.json.tmp"
    tmp.write_text(payload + "\n", encoding="utf-8")
    tmp.replace(folder / f"d{domain}.json")


def cmd_synth(args) -> int:
    lexicon = load_lexicon(LEXICON)
    overrides = load_overrides()
    if LANG == "en" and (errors := phoneme_errors(lexicon, overrides)):
        sys.exit("\n".join(errors))
    all_segments = json.loads(SEGMENTS.read_text(encoding="utf-8")) if SEGMENTS.exists() else {}
    segments = select(load_segments(), args.only, args.concept)
    engine = make_engine(synth=True)
    prep = Prepared(engine, lexicon, segments, overrides)
    blocked = {cid for cid, errs in prep.errors.items() if errs}
    for cid in sorted(blocked):
        print(f"skip {cid}: {'; '.join(sorted(set(prep.errors[cid])))}", file=sys.stderr)

    manifests = {d: read_manifest(d) for d in range(1, 9)}
    gap = np.zeros(int(STEP_GAP * RATE), dtype=np.float32)
    done = 0
    for cid, c in segments.items():
        if cid in blocked:
            continue
        steps = prep.steps[cid]
        key = hashlib.sha256("".join(step_key(s) for s in steps).encode()).hexdigest()[:12]
        name = f"{cid}.{key}.m4a"
        ends, parts, total = [], [], 0
        for lines in steps:
            audio = step_audio(engine, lines)
            parts += [audio, gap]
            total += len(audio) + len(gap)
            ends.append(round(total * 1000 / RATE))
        if not (OUT / name).exists():
            encode(np.concatenate(parts), OUT / name)
        manifests[c["domain"]][cid] = {"file": name, "source": c["source"], "steps": ends}
        done += 1
        print(f"{done}/{len(segments) - len(blocked)} {name} {ends[-1] / 1000:.0f}s", flush=True)
        # Saved as it goes, so an interrupted run keeps what it finished.
        if done % 10 == 0:
            write_manifest(c["domain"], manifests[c["domain"]])

    # Drop entries for concepts that no longer exist; stale text is caught by build_kb.py.
    for d, entries in manifests.items():
        live = {cid: e for cid, e in entries.items() if cid in all_segments}
        if live or (manifest_dir() / f"d{d}.json").exists():
            write_manifest(d, live)
    print(f"synthesized {done} concept(s), skipped {len(blocked)}")
    return 1 if blocked else 0


def cmd_audition(args) -> int:
    if LANG != "en":
        sys.exit("audition covers the English lexicon; Italian is checked by listening and `make audio-check AUDIO_LANG=it`")
    lexicon = load_lexicon(LEXICON)
    segments = load_segments()
    overrides = load_overrides()
    engine = Engine(synth=True)
    norm = Normalizer(lexicon, engine.spell)
    prep = Prepared(engine, lexicon, segments, overrides, guesses=True)

    # One real sentence per entry, so the token is heard in context.
    contexts: dict[str, tuple[str, str]] = {}
    pattern = re.compile(r"[A-Za-z0-9][A-Za-z0-9'./-]*[A-Za-z0-9]|[A-Za-z0-9]")
    for cid, c in segments.items():
        for raw in c["steps"]:
            for line in raw.split("\n"):
                for tok in set(pattern.findall(line)):
                    contexts.setdefault(tok, (cid, line))

    entries = [("say", t, v) for t, v in sorted(lexicon.say.items())] + [("keep", t, t) for t in sorted(lexicon.keep)]
    entries += [(f"override {cid}", t, v) for cid, o in overrides.items() for t, v in o.items()]
    entries += [("guessed", t, f"{n}x") for t, n in prep.guessed.most_common(args.limit)]
    if args.spell:
        entries += [("spell", t, "") for t in sorted(lexicon.spell)]

    dest = BUILD / "audition"
    rows = []
    for cls, tok, value in entries:
        if tok not in contexts:
            continue
        cid, raw = contexts[tok]
        text = norm.run(raw, overrides.get(cid))
        lines = [engine.phonemize(l) for l in text.split("\n")]
        audio = step_audio(engine, lines)
        clip = f"{hashlib.sha256((cls + tok + step_key(lines)).encode()).hexdigest()[:16]}.m4a"
        if not (dest / clip).exists():
            encode(audio, dest / clip)
        rows.append(
            f"<tr><td><b>{html.escape(tok)}</b></td><td>{html.escape(cls)}</td><td><code>{html.escape(value)}</code></td>"
            f"<td><audio controls preload=none src='{clip}'></audio></td><td>{html.escape(raw[:160])}</td></tr>"
        )
    page = (
        "<!doctype html><meta charset=utf-8><title>Narration audition</title>"
        "<style>body{font:14px system-ui;margin:16px;background:#0c0a10;color:#eee}td{padding:4px 8px;border-bottom:1px solid #333;vertical-align:top}"
        "code{color:#b28cff}audio{height:28px}</style><table>" + "".join(rows) + "</table>"
    )
    (dest / "index.html").write_text(page, encoding="utf-8")
    print(f"{len(rows)} clips -> {dest / 'index.html'}")
    return 0


def words(text: str) -> list[str]:
    text = re.sub(r"\[([^\]]+)\]\(/[^)]*/\)", r"\1", text)
    return re.findall(r"[^\W_]+", text.lower().replace("'", " "))


def cmd_check(args) -> int:
    import difflib

    import mlx_whisper

    lexicon = load_lexicon(LEXICON)
    segments = select(load_segments(), args.only, args.concept)
    engine = make_engine(synth=False)
    norm = Normalizer(lexicon, engine.spell) if LANG == "en" else None
    overrides = load_overrides()
    prep = Prepared(engine, lexicon, segments, overrides)
    flagged = 0
    for cid, c in segments.items():
        for i, (raw, lines) in enumerate(zip(c["steps"], prep.steps[cid])):
            path = cache_path(lines)
            if not path.exists():
                continue
            heard = mlx_whisper.transcribe(read_cached(path), path_or_hf_repo=args.model, language=LANG)["text"]
            expected = words(norm.run(raw, overrides.get(cid)) if norm else " ".join(t for t, _ in lines))
            # Acronyms come back as "TLS" or "T L S": compare with letters run together.
            a, b = "".join(expected), "".join(words(heard))
            ratio = difflib.SequenceMatcher(None, a, b, autojunk=False).ratio()
            if ratio < args.threshold:
                flagged += 1
                print(f"{cid} step {i + 1}: {ratio:.2f}\n  text:  {' '.join(expected)}\n  heard: {heard.strip()}")
                if args.redo:
                    path.unlink()
    print(f"{flagged} step(s) below {args.threshold}")
    if args.redo and flagged:
        print("their audio was dropped from the cache: run `make audio` again to resynthesize them")
    return 1 if flagged else 0


def cmd_push(args) -> int:
    pushed = set(PUSHED.read_text().split()) if PUSHED.exists() else set()
    folders = [MANIFESTS] + sorted(p for p in MANIFESTS.glob("*") if p.is_dir())
    referenced = {e["file"] for folder in folders for d in range(1, 9) for e in read_manifest(d, folder).values()}
    todo = sorted(f for f in referenced if f not in pushed)
    missing = [f for f in todo if not (OUT / f).exists()]
    if missing:
        sys.exit(f"{len(missing)} file(s) in the manifests are not in {OUT}: run `make audio` first")
    for i, f in enumerate(todo, 1):
        if not FILE_NAME.fullmatch(f):
            sys.exit(f"refusing unexpected file name {f!r}")
        cmd = ["bunx", "wrangler", "r2", "object", "put", f"{BUCKET}/{f}", "--file", str(OUT / f),
               "--content-type", "audio/mp4", "--remote"]
        subprocess.run(cmd, cwd=ROOT / "worker", check=True, stdout=subprocess.DEVNULL)
        with PUSHED.open("a") as fh:
            fh.write(f + "\n")
        print(f"{i}/{len(todo)} {f}", flush=True)
    print(f"uploaded {len(todo)} file(s)")
    return 0


def main() -> int:
    global LANG, VOICE
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--lang", choices=LANGS, default="en", help="narration language")
    sub = parser.add_subparsers(dest="cmd", required=True)
    for name in ("lexicon", "synth", "check"):
        p = sub.add_parser(name)
        p.add_argument("--only", help="domain (d3) or objective (3.1)")
        p.add_argument("--concept", help="a single concept id")
    sub.choices["lexicon"].add_argument("--guesses", action="store_true", help="also list words read by the espeak fallback")
    sub.choices["lexicon"].add_argument("--suggest", help="write YAML suggestions for unresolved tokens to this file")
    sub.choices["check"].add_argument("--threshold", type=float, default=0.85)
    sub.choices["check"].add_argument("--model", default="mlx-community/whisper-large-v3-turbo")
    sub.choices["check"].add_argument("--redo", action="store_true", help="drop flagged steps from the cache so synth redoes them")
    p = sub.add_parser("audition")
    p.add_argument("--limit", type=int, default=150, help="most frequent fallback words to include")
    p.add_argument("--spell", action="store_true", help="also include every spelled acronym")
    sub.add_parser("push")
    args = parser.parse_args()
    LANG = args.lang
    if LANG == "it":
        VOICE = italian_voice_id()
    return {"lexicon": cmd_lexicon, "synth": cmd_synth, "audition": cmd_audition, "check": cmd_check, "push": cmd_push}[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
