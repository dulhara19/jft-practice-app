"""
Parse the three Irodori reference files into JSON decks for the drill mode.

Sources (one level up from the app directory):
  ../JFT-IRODORI-WORDLIST-3635.txt   — TSV: word \\t reading \\t english \\t [POS]
  ../JFT-IRODORI-KANJI-429.txt       — " 1. 名 (な) → 名前 (なまえ) [L3]"
  ../JFT-IRODORI-GRAMMAR-348.txt     — " 1. [第3課 よ] Nです …\\n     例: …"

Both files use the headers below to group items by JFT level:
  --- 入門 ---     → "starter"  (A1)
  --- 初級1 ---    → "elementary-1"  (A2)
  --- 初級2 ---    → "elementary-2"  (A2)
  === 入門 ===     → (grammar uses === instead of ---)

Outputs:
  data/decks/vocabulary.json
  data/decks/kanji.json
  data/decks/grammar.json
  data/decks/index.json   — manifest of decks
"""

import json
import re
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
APP_DIR = SCRIPT_DIR.parent
SOURCE_DIR = APP_DIR.parent
OUT_DIR = APP_DIR / "data" / "decks"

LEVEL_MAP = {
    "入門":   "starter",
    "初級1":  "elementary-1",
    "初級2":  "elementary-2",
}
LEVEL_LABEL = {
    "starter":       {"ja": "入門", "en": "Starter (A1)"},
    "elementary-1":  {"ja": "初級1", "en": "Elementary 1 (A2)"},
    "elementary-2":  {"ja": "初級2", "en": "Elementary 2 (A2)"},
}


SECTION_HEADER = re.compile(r"^[-=]{3}\s+(入門|初級1|初級2)\s+[-=]{3}\s*$")


def split_by_level(lines: list[str]) -> list[tuple[str, list[str]]]:
    """Return [(level_id, [lines]) ...]"""
    sections: list[tuple[str, list[str]]] = []
    current_level: str | None = None
    current_body: list[str] = []
    for raw in lines:
        m = SECTION_HEADER.match(raw)
        if m:
            if current_level is not None:
                sections.append((current_level, current_body))
            current_level = LEVEL_MAP[m.group(1)]
            current_body = []
        elif current_level is not None:
            current_body.append(raw)
    if current_level is not None:
        sections.append((current_level, current_body))
    return sections


# ---------- VOCAB ----------

def parse_vocab() -> dict:
    text = (SOURCE_DIR / "JFT-IRODORI-WORDLIST-3635.txt").read_text(encoding="utf-8")
    sections = split_by_level(text.splitlines())
    cards: list[dict] = []
    seen: set[tuple[str, str, str]] = set()
    for level, body in sections:
        for ln in body:
            if not ln.strip():
                continue
            parts = ln.split("\t")
            if len(parts) < 3:
                continue
            word = parts[0].strip()
            reading = parts[1].strip()
            english = parts[2].strip()
            pos = parts[3].strip().strip("[]") if len(parts) >= 4 else ""
            if not word or not english:
                continue
            key = (word, reading, english)
            if key in seen:
                continue
            seen.add(key)
            cards.append({
                "id": f"v{len(cards) + 1}",
                "word": word,
                "reading": reading,
                "english": english,
                "pos": pos,
                "level": level,
            })
    return {
        "id": "vocabulary",
        "title": "Vocabulary · ことば",
        "kind": "vocabulary",
        "totalCards": len(cards),
        "cards": cards,
    }


# ---------- KANJI ----------

# Line examples:
#   "  1. 名 (な) → 名前 (なまえ) [L3]"
#   " 11. 食 (た（べる）) → 食べます (たべます) [L5]"
KANJI_LINE = re.compile(
    r"^\s*\d+\.\s+(\S+)\s+\(([^)]+)\)\s+→\s+(\S+)\s+\(([^)]+)\)\s+\[L(\d+)\]\s*$"
)


def parse_kanji() -> dict:
    text = (SOURCE_DIR / "JFT-IRODORI-KANJI-429.txt").read_text(encoding="utf-8")
    sections = split_by_level(text.splitlines())
    cards: list[dict] = []
    seen: set[tuple[str, str, str]] = set()
    for level, body in sections:
        for ln in body:
            m = KANJI_LINE.match(ln)
            if not m:
                continue
            kanji, reading, example, ex_reading, lesson = m.groups()
            key = (kanji, reading, example)
            if key in seen:
                continue
            seen.add(key)
            cards.append({
                "id": f"k{len(cards) + 1}",
                "kanji": kanji,
                "reading": reading,
                "example": example,
                "exampleReading": ex_reading,
                "lesson": int(lesson),
                "level": level,
            })
    return {
        "id": "kanji",
        "title": "Kanji · かんじ",
        "kind": "kanji",
        "totalCards": len(cards),
        "cards": cards,
    }


# ---------- GRAMMAR ----------

# Patterns look like:
#   "  1. [第3課\n\nよ] Nです N1はN2です\n     例: …"
# The [...] tag spans lines so we collapse it before regexing.
GRAMMAR_START = re.compile(r"^\s*(\d+)\.\s+\[([^\]]+)\]\s*(.*)$", re.DOTALL)
EXAMPLE_PREFIX = re.compile(r"^\s*例\s*[:：]\s*(.*)$")

# Grammar file uses === instead of ---
GRAMMAR_HEADER = re.compile(r"^={3,}\s+(入門|初級1|初級2)\s+={3,}\s*$")


def split_grammar_by_level(lines: list[str]) -> list[tuple[str, list[str]]]:
    sections: list[tuple[str, list[str]]] = []
    current_level: str | None = None
    current_body: list[str] = []
    for raw in lines:
        m = GRAMMAR_HEADER.match(raw)
        if m:
            if current_level is not None:
                sections.append((current_level, current_body))
            current_level = LEVEL_MAP[m.group(1)]
            current_body = []
        elif current_level is not None:
            current_body.append(raw)
    if current_level is not None:
        sections.append((current_level, current_body))
    return sections


def parse_grammar() -> dict:
    text = (SOURCE_DIR / "JFT-IRODORI-GRAMMAR-348.txt").read_text(encoding="utf-8")
    sections = split_grammar_by_level(text.splitlines())
    cards: list[dict] = []
    for level, body in sections:
        # Walk through, accumulate one record per numbered entry
        items = collect_grammar_items(body)
        for num, lesson, pattern, example in items:
            cards.append({
                "id": f"g{len(cards) + 1}",
                "pattern": pattern.strip(),
                "lesson": lesson.strip(),
                "example": example.strip(),
                "level": level,
            })
    return {
        "id": "grammar",
        "title": "Grammar · ぶんぽう",
        "kind": "grammar",
        "totalCards": len(cards),
        "cards": cards,
    }


NUMBERED_START = re.compile(r"^\s{0,4}\d+\.\s+\[")


def collect_grammar_items(body_lines: list[str]) -> list[tuple[str, str, str, str]]:
    """Return list of (num, lesson_tag, pattern, example)."""
    # Group consecutive lines belonging to one numbered item.
    groups: list[list[str]] = []
    current: list[str] = []
    for ln in body_lines:
        if NUMBERED_START.match(ln):
            if current:
                groups.append(current)
            current = [ln]
        elif current:
            current.append(ln)
    if current:
        groups.append(current)

    items: list[tuple[str, str, str, str]] = []
    for group in groups:
        chunk = "\n".join(group).strip()
        m = re.match(r"^\s*(\d+)\.\s+\[(.*?)\]\s*(.*)$", chunk, re.DOTALL)
        if not m:
            continue
        num = m.group(1)
        lesson = re.sub(r"\s+", " ", m.group(2)).strip()
        rest = m.group(3)
        ex_match = re.search(r"例\s*[:：]\s*(.*)$", rest, re.DOTALL)
        if ex_match:
            pattern = rest[:ex_match.start()].strip()
            example = ex_match.group(1).strip()
        else:
            pattern = rest.strip()
            example = ""
        pattern = re.sub(r"\s+", " ", pattern)
        example = re.sub(r"\s+", " ", example)
        items.append((num, lesson, pattern, example))
    return items


# ---------- MAIN ----------

def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    decks = [parse_vocab(), parse_kanji(), parse_grammar()]
    manifest: list[dict] = []
    for deck in decks:
        out = OUT_DIR / f"{deck['id']}.json"
        out.write_text(json.dumps(deck, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Wrote {out.name}: {deck['totalCards']} cards")
        manifest.append({
            "id": deck["id"],
            "title": deck["title"],
            "kind": deck["kind"],
            "totalCards": deck["totalCards"],
            "levels": LEVEL_LABEL,
        })
    (OUT_DIR / "index.json").write_text(
        json.dumps({"decks": manifest}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Wrote {(OUT_DIR / 'index.json').name}")


if __name__ == "__main__":
    main()
