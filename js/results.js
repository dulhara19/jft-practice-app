import { loadPaper, getQuery, el } from "./app.js";
import { Storage } from "./storage.js";
import { PASS_MARK } from "./scoring.js";

const main = document.getElementById("main");

async function init() {
  const id = getQuery("attempt") || Storage.getLastAttemptId();
  if (!id) {
    main.innerHTML = `<p class="muted">No completed attempt found. <a href="index.html">Start a new exam.</a></p>`;
    return;
  }
  const attempt = Storage.getAttemptById(id);
  if (!attempt) {
    main.innerHTML = `<p class="muted">Attempt not found.</p>`;
    return;
  }
  const paper = await loadPaper(attempt.paperId);
  render(attempt, paper);
}

function render(attempt, paper) {
  main.innerHTML = "";
  const r = attempt.result;
  const dur = Math.round((attempt.submittedAt - attempt.startedAt) / 1000);
  const mm = Math.floor(dur / 60);
  const ss = dur % 60;

  const scoreCard = el("div", {
    class: `score-card ${r.passed ? "pass" : "fail"}`,
    "data-kanji": r.passed ? "合" : "再",
  },
    el("div", { class: "score-meta" },
      el("div", { class: "kicker" }, attempt.paperTitle),
      el("div", { class: "verdict" }, r.passed ? "合格 · Passed" : "不合格 · Did not pass"),
      el("div", { class: "score-meta-line" },
        `${r.correct} of ${r.total} correct · ${mm}m ${ss}s${attempt.timedOut ? " · time expired" : ""}`),
      el("div", { class: "score-meta-line muted", style: "margin-top:8px;" },
        `Pass mark: ${PASS_MARK} / 250`),
    ),
    el("div", { class: "score-block" },
      el("div", { class: "score-number mono" }, String(r.scaled)),
      el("div", { class: "score-out-of" }, "/ 250"),
    ),
  );
  main.appendChild(scoreCard);

  // Section breakdown
  main.appendChild(el("div", { class: "step-label" },
    el("span", { class: "num" }, "01"),
    el("span", { class: "text" }, "Section breakdown"),
  ));
  const bars = el("div", { class: "section-bars stagger" });
  for (const s of r.sections) {
    bars.appendChild(el("div", { class: "section-bar", "data-sec": s.id },
      el("div", { class: "label" },
        el("div", { class: "en" }, s.label),
        el("div", { class: "ja" }, `${s.labelJa.toUpperCase()} · ${s.correct}/${s.total}`),
      ),
      el("div", { class: "bar-track" },
        el("div", { class: "bar-fill", style: `width:${s.percent}%;` }),
      ),
      el("div", { class: "pct mono" }, `${s.percent}%`),
    ));
  }
  main.appendChild(bars);

  // Wrong-answer list
  if (r.wrong.length === 0) {
    main.appendChild(el("div", { class: "step-label" },
      el("span", { class: "num" }, "02"),
      el("span", { class: "text" }, "Wrong answers"),
    ));
    main.appendChild(el("p", { class: "muted" }, "Perfect score — no wrong answers to review."));
  } else {
    main.appendChild(el("div", { class: "step-label" },
      el("span", { class: "num" }, "02"),
      el("span", { class: "text" }, `Wrong answers · ${r.wrong.length}`),
    ));
    const list = el("div", { class: "wrong-list" });
    for (const w of r.wrong) {
      const q = paper.questions.find(qq => qq.id === w.qId);
      if (!q) continue;
      list.appendChild(renderWrong(q, w));
    }
    main.appendChild(list);
  }

  main.appendChild(el("div", { class: "action-bar" },
    el("a", { class: "btn secondary", href: "index.html" }, "← Back to start"),
    el("a", { class: "btn", href: `exam.html?paper=${attempt.paperId}` }, "Retry this paper"),
  ));
}

function renderWrong(q, w) {
  const qIndex = Number(q.id.split("-q")[1]);
  const givenOpt = q.options.find(o => o.label === w.given);
  const correctOpt = q.options.find(o => o.label === w.correct);

  return el("div", { class: "wrong-item" },
    el("div", { class: "qid" }, `Q${qIndex} · ${q.section.replace("-", " / ")}`),
    q.context ? el("div", { class: "context-block" }, q.context) : null,
    el("div", { class: "prompt" }, q.prompt),
    el("div", { class: "answers" },
      el("div", { class: "yours" }, `Your answer: ${w.given || "—"}${givenOpt ? ` · ${givenOpt.text}` : ""}`),
      el("div", { class: "correct" }, `Correct: ${w.correct} · ${correctOpt ? correctOpt.text : ""}`),
    ),
    el("div", { class: "explanation" }, q.explanation.en || "(no explanation available)"),
    el("div", { class: "ja-explanation" }, q.explanation.ja || ""),
  );
}

init();
