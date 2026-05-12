"""
Convert Paper-N-Questions.txt + Paper-N-Answers.txt into paper-N.json.

Handles the three format variants present in 05-Mock-Tests/:
  - Papers 1, 4, 5: question marker = 【Qn】, options = "A) text"
  - Paper 2:        question marker = 【Qn】, options = "A. text"
  - Paper 3:        question marker = "Qn.",  options = "A) text"

Run from the project root:
    python tools/parse_paper.py

Outputs:
    data/papers/paper-{1..5}.json
    data/index.json
"""

import json
import re
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
APP_DIR = SCRIPT_DIR.parent
SOURCE_DIR = APP_DIR.parent / "05-Mock-Tests"
OUT_DIR = APP_DIR / "data" / "papers"
INDEX_OUT = APP_DIR / "data" / "index.json"

SECTIONS = [
    ("script-vocab", 1, 15),
    ("convo-expr", 16, 30),
    ("listening", 31, 45),
    ("reading", 46, 60),
]


def section_for(qnum: int) -> str:
    for name, lo, hi in SECTIONS:
        if lo <= qnum <= hi:
            return name
    raise ValueError(f"Question {qnum} is out of range")


# Question marker matches both 【Q12】 and Q12.  (Paper 3 uses the second form)
Q_MARKER = re.compile(r"^\s*(?:【Q(\d+)】|Q(\d+)\.)\s*(.*)$")

# Option line: A) text  OR  A. text   (with leading spaces)
OPTION_LINE = re.compile(r"^\s*([ABCD])[.\)]\s*(.+?)\s*$")

# Section header: matches both header styles
SECTION_HEADER = re.compile(
    r"^\s*SECTION\s+([1-4])\s*[:\s]",
    re.IGNORECASE,
)

# Lines that mark the end of a question block
END_OF_QUESTION_HINTS = (
    "================",
    "----------------",
)

# In sections 3 and 4 the actual question is preceded by one of these markers,
# OR (Paper 3 style) is just the last paragraph of the body.
QUESTION_MARKERS = ("しつもん", "Question:")


def split_into_section_blocks(text: str) -> dict[int, str]:
    """Split the full questions file into per-section text blocks (1..4)."""
    lines = text.splitlines()
    blocks: dict[int, list[str]] = {1: [], 2: [], 3: [], 4: []}
    current = None
    for ln in lines:
        m = SECTION_HEADER.match(ln)
        if m:
            current = int(m.group(1))
            continue
        if current is not None:
            blocks[current].append(ln)
    return {k: "\n".join(v) for k, v in blocks.items()}


def extract_question_blocks(section_text: str) -> list[tuple[int, list[str]]]:
    """Return list of (qnum, body_lines) for each question in a section."""
    lines = section_text.splitlines()
    out: list[tuple[int, list[str]]] = []
    current_q: int | None = None
    current_body: list[str] = []

    for ln in lines:
        m = Q_MARKER.match(ln)
        if m:
            if current_q is not None:
                out.append((current_q, current_body))
            qnum = int(m.group(1) or m.group(2))
            current_q = qnum
            tail = m.group(3).strip()
            current_body = [tail] if tail else []
        else:
            if current_q is not None:
                current_body.append(ln)

    if current_q is not None:
        out.append((current_q, current_body))
    return out


def parse_question_body(body_lines: list[str], section: str) -> dict:
    """Extract context, prompt, and 4 options from a question body."""
    # Find option lines first — everything before them is the header
    options: list[dict] = []
    header_end_idx = None
    for i, ln in enumerate(body_lines):
        m = OPTION_LINE.match(ln)
        if m:
            label = m.group(1)
            text = m.group(2).strip()
            # only record the first occurrence of each label
            if not any(o["label"] == label for o in options):
                options.append({"label": label, "text": text})
                if header_end_idx is None:
                    header_end_idx = i
        if len(options) == 4:
            break

    if len(options) != 4:
        raise ValueError(
            f"Expected 4 options, got {len(options)}: body starts with "
            f"{body_lines[:6]!r}"
        )

    # Header = everything before the first option
    header_lines = body_lines[: header_end_idx if header_end_idx is not None else 0]
    header_text = "\n".join(header_lines).strip()
    # Clean up passage separators (---- lines)
    header_text = clean_header(header_text)

    context, prompt = split_context_and_prompt(header_text, section)
    return {
        "context": context,
        "prompt": prompt,
        "options": options,
    }


def clean_header(text: str) -> str:
    """Remove dashed separator lines used as passage frames."""
    lines = [ln for ln in text.splitlines() if not re.match(r"^\s*-{5,}\s*$", ln)]
    # Collapse 3+ blank lines into 1
    out: list[str] = []
    blank = 0
    for ln in lines:
        if ln.strip() == "":
            blank += 1
            if blank <= 1:
                out.append("")
        else:
            blank = 0
            out.append(ln)
    return "\n".join(out).strip()


def split_context_and_prompt(header_text: str, section: str) -> tuple[str | None, str]:
    """For listening/reading, split context (audio/passage) from the question."""
    if section not in ("listening", "reading"):
        return (None, header_text)

    # 1. Try explicit markers (しつもん, Question:, or "--- しつもん ---")
    marker_idx = -1
    for marker in QUESTION_MARKERS:
        idx = header_text.rfind(marker)
        if idx > marker_idx:
            marker_idx = idx
    if marker_idx != -1:
        line_start = header_text.rfind("\n", 0, marker_idx) + 1
        prompt = clean_prompt(header_text[line_start:])
        context = header_text[:line_start].strip()
        return (clean_context(context), prompt)

    # 2. Fallback (Paper 3): treat the last non-empty paragraph as the question
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", header_text) if p.strip()]
    if len(paragraphs) >= 2:
        prompt = clean_prompt(paragraphs[-1])
        context = "\n\n".join(paragraphs[:-1])
        return (clean_context(context), prompt)

    return (None, clean_prompt(header_text))


def clean_context(text: str) -> str | None:
    """Strip audio-script markers and intro instructions from context."""
    if not text:
        return None
    # Remove explicit script header markers (various paper styles)
    for marker in ("【音声スクリプト】", "[Audio Script]"):
        text = text.replace(marker, "")
    # Strip dashed-marker lines like "--- スクリプト ---" or "--- しつもん ---"
    lines = [
        ln for ln in text.splitlines()
        if not re.match(r"^\s*-{2,}\s*(スクリプト|しつもん|Script|Question)\s*-{2,}\s*$", ln)
    ]
    # Drop leading "つぎの... よんでください" instruction lines
    while lines and re.search(r"(よんでください|読んで\s*ください)\s*。?\s*$", lines[0].strip()):
        lines.pop(0)
    cleaned = "\n".join(lines).strip()
    return cleaned if cleaned else None


def clean_prompt(text: str) -> str:
    """Remove residual dashed markers from prompt lines."""
    lines = [
        ln for ln in text.splitlines()
        if not re.match(r"^\s*-{2,}\s*(スクリプト|しつもん|Script|Question)\s*-{2,}\s*$", ln)
    ]
    return "\n".join(lines).strip()


# ---------- Answer file parsing ----------

ANSWER_GRID_LINE = re.compile(r"Q(\d+):\s*([ABCD])")
EXPLAIN_HEADER = re.compile(r"^---\s*Q(\d+):\s*Answer\s+([ABCD])\s*---\s*$")


def parse_answers(text: str) -> dict[int, dict]:
    """Return {qnum: {'answer': 'X', 'explanation': '...'}}."""
    answers: dict[int, dict] = {}

    # 1. Pull the answer grid (covers all 60 questions)
    for m in ANSWER_GRID_LINE.finditer(text):
        qnum = int(m.group(1))
        if qnum not in answers:
            answers[qnum] = {"answer": m.group(2), "explanation_en": ""}

    # 2. Pull explanation blocks
    lines = text.splitlines()
    current_q: int | None = None
    current_block: list[str] = []
    for ln in lines:
        m = EXPLAIN_HEADER.match(ln)
        if m:
            if current_q is not None:
                answers.setdefault(current_q, {"answer": "?", "explanation_en": ""})
                answers[current_q]["explanation_en"] = "\n".join(current_block).strip()
            current_q = int(m.group(1))
            current_block = []
        elif current_q is not None:
            # Stop if we hit a new section header inside the explanations
            if ln.startswith("===") or ln.startswith("---"):
                # double-dash section separators end the block
                # but only if it's not the next "--- Qn: Answer X ---"
                if not EXPLAIN_HEADER.match(ln):
                    # ignore — section dividers
                    continue
            current_block.append(ln)

    if current_q is not None:
        answers.setdefault(current_q, {"answer": "?", "explanation_en": ""})
        answers[current_q]["explanation_en"] = "\n".join(current_block).strip()

    return answers


def derive_japanese_explanation(prompt: str, correct_option: dict) -> str:
    """Lightweight Japanese explanation: 'こたえは X：text です。'"""
    return f"こたえは {correct_option['label']}：{correct_option['text']} です。"


# ---------- Main driver ----------


def build_paper(paper_num: int) -> dict:
    q_file = SOURCE_DIR / f"Paper-{paper_num}-Questions.txt"
    a_file = SOURCE_DIR / f"Paper-{paper_num}-Answers.txt"

    q_text = q_file.read_text(encoding="utf-8")
    a_text = a_file.read_text(encoding="utf-8")

    answers = parse_answers(a_text)
    sections = split_into_section_blocks(q_text)

    questions: list[dict] = []

    for sec_num in (1, 2, 3, 4):
        section_name = SECTIONS[sec_num - 1][0]
        block = sections.get(sec_num, "")
        q_blocks = extract_question_blocks(block)
        for qnum, body in q_blocks:
            try:
                parsed = parse_question_body(body, section_name)
            except ValueError as e:
                raise ValueError(f"Paper {paper_num}, Q{qnum}: {e}") from e

            ans_info = answers.get(qnum)
            if not ans_info:
                raise ValueError(f"Paper {paper_num}: no answer for Q{qnum}")

            correct_opt = next(
                (o for o in parsed["options"] if o["label"] == ans_info["answer"]),
                None,
            )
            if correct_opt is None:
                raise ValueError(
                    f"Paper {paper_num} Q{qnum}: answer {ans_info['answer']} "
                    f"not in options"
                )

            questions.append({
                "id": f"p{paper_num}-q{qnum}",
                "section": section_name,
                "prompt": parsed["prompt"],
                "context": parsed["context"],
                "options": parsed["options"],
                "answer": ans_info["answer"],
                "explanation": {
                    "en": ans_info["explanation_en"],
                    "ja": derive_japanese_explanation(parsed["prompt"], correct_opt),
                },
            })

    # Sort by question id numerically
    questions.sort(key=lambda q: int(q["id"].split("-q")[1]))

    # Sanity check: 60 questions, 15 per section
    if len(questions) != 60:
        raise ValueError(f"Paper {paper_num}: got {len(questions)} questions, expected 60")
    for name, lo, hi in SECTIONS:
        count = sum(1 for q in questions if q["section"] == name)
        if count != hi - lo + 1:
            raise ValueError(
                f"Paper {paper_num}: section {name} has {count} questions, "
                f"expected {hi - lo + 1}"
            )

    return {
        "paperId": f"paper-{paper_num}",
        "title": f"JFT-Basic Model Paper {paper_num}",
        "durationMinutes": 60,
        "totalQuestions": 60,
        "passMark": 200,
        "questions": questions,
    }


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    index: list[dict] = []
    for n in range(1, 6):
        paper = build_paper(n)
        out_path = OUT_DIR / f"paper-{n}.json"
        out_path.write_text(
            json.dumps(paper, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"Wrote {out_path} ({len(paper['questions'])} questions)")
        index.append({
            "id": paper["paperId"],
            "title": paper["title"],
            "totalQuestions": paper["totalQuestions"],
            "durationMinutes": paper["durationMinutes"],
            "passMark": paper["passMark"],
        })

    INDEX_OUT.write_text(
        json.dumps({"papers": index}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Wrote {INDEX_OUT}")


if __name__ == "__main__":
    main()
