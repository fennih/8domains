"""Turn story text into narration text for Kokoro/misaki, with every technical token pronounced on purpose.

Acronyms never reach the G2P engine as-is: they are either spelled with explicit phonemes, given a fixed
pronunciation from the lexicon, or listed as verified engine defaults. Anything else that looks like an
acronym is reported as unresolved, so the build can fail instead of letting the engine guess.

Output uses misaki's inline syntax "[text](/phonemes/)" for every token whose phonemes are fixed here.
"""

import re
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

import yaml

CLASSES = ("spell", "keep", "lower", "say")

# Inline markup from content/AUTHORING.md; "**Term**:" becomes "Term:".
MARKUP = re.compile(r"==[gb]:|==|\+\+|\*\*")
CODE = re.compile(r"`([^`]+)`")

ROMAN = {"I": "one", "II": "two", "III": "three", "IV": "four", "V": "five", "VI": "six", "VII": "seven", "VIII": "eight", "IX": "nine", "X": "ten"}
ROMAN_AFTER = re.compile(r"\b(Types?|Canons?|Schrems|Tier|Level|Phase|Class|Stage|Category|Title|Part|Article|Chapter)\s+(VIII|VII|VI|IV|IX|III|II|I|V|X)\b")

# Formulas the symbol rules below would garble ("/" is "or" in prose).
FORMULAS = [
    (re.compile(r"\bn\s?\(n\s?[-−]\s?1\)\s?/\s?2"), "n times n minus 1, over 2"),
    (re.compile(r"\(p\s?[-−]\s?1\)\s?\(q\s?[-−]\s?1\)"), "p minus 1, times q minus 1"),
    (re.compile(r"\^"), " to the power of "),
]

# Document series read as "800 dash 53"; other number-hyphen-number pairs are ranges.
SERIES = re.compile(r"\b(800|140|180|186|197|199|200|201|202)-(\d{1,3})\b")
RANGE = re.compile(r"(\d)\s?[-–]\s?(\d)")

ISO = re.compile(r"\b(ISO(?:/IEC)?(?:/IEEE)?)\s(\d{5})\b")
IEEE_802 = re.compile(r"\b802\.(\d+)([A-Za-z]{0,2})\b")
IPV4 = re.compile(r"\b(\d{1,3}(?:\.\d{1,3}){3})(?:/(\d{1,2}))?\b")
IPV6 = re.compile(r"(?<![\w:])[0-9A-Fa-f]{0,4}(?::[0-9A-Fa-f]{0,4}){1,7}(?:/\d{1,3})?(?![\w:])")
EXTENSION = re.compile(r"(?<![\w])\.([a-z]{2,4})\b")
BRACKETS = re.compile(r"[\[\]{}]")

TEXT_SYMBOLS = [
    (re.compile(r"\bATT&CK\b"), "attack"),
    (re.compile(r"(?<![\w.])\.NET\b"), "dot net"),
    (re.compile(r"\b([CF])#"), r"\1 sharp"),
    (re.compile(r"\s?°F\b"), " degrees Fahrenheit"),
    (re.compile(r"\s?°C\b"), " degrees Celsius"),
    (re.compile(r"(\d)\s?m\b"), r"\1 meters"),
    (re.compile(r"(\d)\s?ms\b"), r"\1 milliseconds"),
    (re.compile(r"\be\.g\.,?"), "for example,"),
    (re.compile(r"\bi\.e\.,?"), "that is,"),
    (re.compile(r"\bvs\.?(?=\s)"), "versus"),
    (re.compile(r"\betc\."), "and so on."),
    (re.compile(r"\bU\.S\.(?=\s|$)"), "US"),
    (re.compile(r"\s*×\s*"), " times "),
    (re.compile(r"\s*≈\s*"), " roughly "),
    (re.compile(r"\s*→\s*"), " to "),
    (re.compile(r"\s*≤\s*"), " at most "),
    (re.compile(r"\s*≥\s*"), " at least "),
    (re.compile(r"\s*≠\s*"), " is not "),
    (re.compile(r"\s*≡\s*"), " is congruent to "),
    (re.compile(r"\s*⊕\s*"), " XOR "),
    (re.compile(r"\s+<\s+"), " less than "),
    (re.compile(r"\s+>\s+"), " greater than "),
    (re.compile(r"\s+=\s+"), " equals "),
    (re.compile(r"\s*−\s*"), " minus "),
    (re.compile(r"(?<![*\w])\*(?![*\w])"), "star"),
    (re.compile(r"®"), " registered trademark"),
    (re.compile(r"™"), " trademark"),
    (re.compile(r"(\w)\|(\w)"), r"\1 or \2"),
    (re.compile(r"\s+/\s+"), " or "),
    (re.compile(r"\s*—\s*"), ", "),
    (re.compile(r"\s+[-–]\s+"), ", "),
]

# Inside `code`, punctuation is spoken; ports and plain numbers stay numbers.
CODE_SYMBOLS = {
    "/": " slash ", ".": " dot ", "*": " star ", "_": " ", "=": " equals ", "&": " ampersand ", ";": " semicolon ",
    "|": " pipe ", "<": " less than ", ">": " greater than ", ":": " colon ", "-": " dash ", "+": " plus ",
    "'": " quote ", '"': " quote ", "\\": " backslash ", "$": " dollar ", "#": " hash ", "?": " question mark ",
    "^": " caret ", "%": " percent ", "@": " at ", "~": " tilde ", "!": " bang ",
    "(": " open paren ", ")": " close paren ", "[": " open bracket ", "]": " close bracket ",
    "{": " open brace ", "}": " close brace ",
}

# A word token, keeping internal "./-'" so "TCP/IP", "X.509", "EAP-AKA" and "CISO's" arrive whole.
TOKEN = re.compile(r"[^\W_](?:[^\W_]|['’]|[./-](?=[^\W_]))*'?")
# Already-resolved spans "[text](/phonemes/)" must not be tokenized again.
RESOLVED = re.compile(r"\[[^\]]+\]\(/[^)]*/\)")


def acronym_like(tok: str) -> bool:
    upper = sum(c.isupper() for c in tok)
    return upper >= 2 or (upper >= 1 and any(c.isdigit() for c in tok))


def is_phonemes(value: str) -> bool:
    return len(value) > 2 and value.startswith("/") and value.endswith("/")


@dataclass
class Lexicon:
    spell: set[str] = field(default_factory=set)
    keep: set[str] = field(default_factory=set)
    lower: set[str] = field(default_factory=set)
    say: dict[str, str] = field(default_factory=dict)

    def entry(self, tok: str) -> tuple[str, str] | None:
        if tok in self.say:
            return "say", self.say[tok]
        for cls in ("spell", "keep", "lower"):
            if tok in getattr(self, cls):
                return cls, tok
        return None

    def phonemes(self) -> dict[str, str]:
        return {t: v[1:-1] for t, v in self.say.items() if is_phonemes(v)}


def load_lexicon(path: Path) -> Lexicon:
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    unknown = set(raw) - set(CLASSES)
    if unknown:
        raise ValueError(f"{path}: unknown sections {sorted(unknown)}")
    lex = Lexicon(
        spell=set(raw.get("spell") or []),
        keep=set(raw.get("keep") or []),
        lower=set(raw.get("lower") or []),
        say={str(k): str(v) for k, v in (raw.get("say") or {}).items()},
    )
    seen: dict[str, str] = {}
    for cls in CLASSES:
        for tok in getattr(lex, cls):
            if tok in seen:
                raise ValueError(f"{path}: {tok} is in both {seen[tok]} and {cls}")
            seen[tok] = cls
    for tok, value in lex.say.items():
        if not value.strip():
            raise ValueError(f"{path}: empty pronunciation for {tok}")
        if not is_phonemes(value) and any(acronym_like(t) for t in TOKEN.findall(value)):
            raise ValueError(f"{path}: respelling for {tok} contains an acronym: {value}")
    return lex


def iso_number(n: str) -> str:
    # ISO 27001 is said "27 oh oh 1", ISO 31000 "31 thousand".
    head, tail = n[:2], n[2:]
    if tail == "000":
        return f"{head} thousand"
    return f"{head} " + " ".join("oh" if d == "0" else d for d in tail)


@dataclass
class Normalizer:
    lexicon: Lexicon
    # Letter-by-letter phonemes for a token (misaki's own spelling in production).
    spell_fn: Callable[[str], str]
    unresolved: list[str] = field(default_factory=list)
    overrides: dict[str, str] = field(default_factory=dict)

    def run(self, text: str, overrides: dict[str, str] | None = None) -> str:
        self.overrides = overrides or {}
        text = MARKUP.sub("", text)
        # Code spans are spoken symbol by symbol; prose brackets would clash with misaki's "[text](/ps/)".
        parts = CODE.split(text)
        text = "".join(self.code(p) if i % 2 else BRACKETS.sub(" ", p) for i, p in enumerate(parts))
        text = self.rules(text)
        lines = [self.tokens(line) for line in text.split("\n")]
        return "\n".join(re.sub(r"\s{2,}", " ", l).strip() for l in lines if l.strip())

    def phon(self, display: str, phonemes: str) -> str:
        return f"[{display}](/{phonemes}/)"

    def spelled(self, tok: str, suffix: str = "") -> str:
        return self.phon(tok + suffix, self.spell_fn(tok) + ("z" if suffix else ""))

    def code(self, body: str) -> str:
        if re.fullmatch(r"\d+", body):
            return body
        out = EXTENSION.sub(lambda m: f" {self.extension(m)} ", body)
        out = "".join(self.code_symbols(p) if i % 2 == 0 else p for i, p in enumerate(split_keep(RESOLVED, out)))
        return f" {out} "

    def code_symbols(self, text: str) -> str:
        for sym, word in CODE_SYMBOLS.items():
            text = text.replace(sym, word)
        # Lone letters in code ("AV:N", "C:H") are letters, never the article "A".
        return re.sub(r"(?<![A-Za-z0-9])[A-Z](?![A-Za-z0-9])", lambda m: self.spelled(m[0]), text)

    def rules(self, text: str) -> str:
        for pattern, repl in FORMULAS:
            text = pattern.sub(repl, text)
        text = ROMAN_AFTER.sub(lambda m: f"{m[1]} {ROMAN[m[2]]}", text)
        text = IEEE_802.sub(self.ieee_802, text)
        text = ISO.sub(lambda m: f"{m[1]} {iso_number(m[2])}", text)
        text = IPV4.sub(lambda m: " dot ".join(m[1].split(".")) + (f" slash {m[2]}" if m[2] else ""), text)
        text = IPV6.sub(self.ipv6, text)
        text = EXTENSION.sub(self.extension, text)
        text = re.sub(r"\bPOA&M(s?)\b", lambda m: self.phon(f"POA&M{m[1]}", "pˈOˌæm" + ("z" if m[1] else "")), text)
        text = SERIES.sub(r"\1 dash \2", text)
        text = RANGE.sub(r"\1 to \2", text)
        for pattern, repl in TEXT_SYMBOLS:
            text = pattern.sub(repl, text)
        return text

    def extension(self, m: re.Match) -> str:
        return "dot com" if m[1] == "com" else f"dot {self.spelled(m[1])}"

    def ieee_802(self, m: re.Match) -> str:
        suffix = f" {self.spelled(m[2])}" if m[2] else ""
        return f"eight oh two dot {m[1]}{suffix}"

    def ipv6(self, m: re.Match) -> str:
        addr, _, prefix = m[0].partition("/")
        # Only real IPv6: "::" somewhere, or 3+ groups. "Stage 1:" and "10:30" stay as they are.
        if "::" not in addr and addr.count(":") < 2:
            return m[0]
        said = []
        for part in re.split(r"(::|:)", addr):
            if part == "::":
                said.append("double colon")
            elif part == ":":
                said.append("colon")
            elif part.isdigit():
                said.append(part)
            elif part:
                said.append(" ".join(c if c.isdigit() else self.spelled(c.upper()) for c in part))
        out = " ".join(said)
        return f" {out}{f' slash {prefix}' if prefix else ''} "

    def tokens(self, line: str) -> str:
        out, last = [], 0
        resolved = [(r.start(), r.end()) for r in RESOLVED.finditer(line)]
        for m in TOKEN.finditer(line):
            if any(a <= m.start() < b for a, b in resolved):
                continue
            out.append(line[last : m.start()])
            out.append(self.token(m[0]))
            last = m.end()
        out.append(line[last:])
        return "".join(out)

    def lookup(self, tok: str) -> tuple[str, str] | None:
        if tok in self.overrides:
            value = self.overrides[tok]
            return (value, tok) if value in ("spell", "keep", "lower") else ("say", value)
        return self.lexicon.entry(tok)

    def render(self, tok: str, cls: str, value: str, suffix: str = "") -> str:
        if cls == "spell":
            return self.spelled(tok, suffix)
        if cls == "keep":
            return tok + suffix
        if cls == "lower":
            return tok.lower() + suffix
        if is_phonemes(value):
            return self.phon(tok + suffix, value[1:-1] + ("z" if suffix else ""))
        return value + ("s" if suffix else "")

    def token(self, tok: str) -> str:
        if hit := self.lookup(tok):
            return self.render(tok, *hit)
        if tok.endswith(("'", "’")) and (hit := self.lookup(tok[:-1])):
            return self.render(tok[:-1], *hit)

        # Plurals and possessives of a known base: "VPNs", "CISO's", "IdPs'".
        m = re.fullmatch(r"(.+?)(s|'s|’s|s'|s’)", tok)
        if m and (hit := self.lookup(m[1])):
            return self.render(m[1], *hit, suffix="s")

        for sep in ("/", "-"):
            if sep in tok:
                parts = tok.split(sep)
                technical = any(acronym_like(p) or p.isdigit() for p in parts)
                if sep == "-" and not technical:
                    # "non-repudiation" stays whole for the engine; "Goguen-Meseguer" needs the lexicon per part.
                    if not any(self.lookup(p) for p in parts):
                        return tok
                    return " ".join(self.token(p) for p in parts if p)
                said = [self.token(p) if p else "" for p in parts]
                return (" " if technical else " or ").join(s for s in said if s)

        if "." in tok:
            if re.fullmatch(r"\d+(\.\d+)+", tok):
                return tok
            return " dot ".join(self.token(p) for p in tok.split(".") if p)

        # "IPv6", "SNMPv3": acronym, then "vee", then the number.
        m = re.fullmatch(r"(.*[A-Z])v(\d+)", tok)
        if m and acronym_like(m[1]):
            return f"{self.token(m[1])} {self.phon('v', 'vˈi')} {m[2]}"

        # Letter/digit mixes: "5G", "WPA2", "SHA384", "ChaCha20".
        parts = re.findall(r"\d+|[A-Za-z]+", tok)
        if len(parts) > 1 and any(ch.isdigit() for ch in tok):
            return " ".join(p if p.isdigit() else self.single(p) for p in parts)

        if acronym_like(tok):
            self.unresolved.append(tok)
        return tok

    def single(self, part: str) -> str:
        # A lone capital produced by a split ("5G") is always a letter, never the article "A".
        if len(part) == 1 and part.isupper() and not self.lookup(part):
            return self.spelled(part)
        return self.token(part)


def split_keep(pattern: re.Pattern, text: str) -> list[str]:
    # Like re.split, but the matches are kept at odd indices.
    out, last = [], 0
    for m in pattern.finditer(text):
        out += [text[last : m.start()], m[0]]
        last = m.end()
    return out + [text[last:]]
