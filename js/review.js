import { loadPaper, el } from "./app.js";
import { Storage } from "./storage.js";
import { SECTIONS } from "./scoring.js";
import { speak, stop as stopTTS, isSupported as ttsSupported, hasJapaneseVoice, cleanForTTS } from "./tts.js";
import { bindHelpPanel, bindKeys, toast } from "./ui.js";

const refs = {
  progress: document.getElementById("progress"),
  qarea: document.getElementById("question-area"),
  feedback: document.getElementById("feedback-area"),
  prevBtn: document.getElementById("prev-btn"),
  nextBtn: document.getElementById("next-btn"),
  clearBtn: document.getElementById("clear-btn"),
};

const state = {
  queue: [],
  idx: 0,
  papers: {},
  revealed: {},
  answered: {},
};

async function init() {
  bindHelpPanel();
  const wrong = Storage.getWrongAnswers();
  if (wrong.length === 0) {
    refs.qarea.innerHTML = `
      <div class="question-card">
        <div class="q-header">
          <div class="q-number mono">— —</div>
          <div class="section-chip script-vocab">EMPTY · queue</div>
        </div>
        <p class="muted">Your wrong-answer queue is empty. Take an exam or do some section drills first.</p>
        <p><a class="btn" href="index.html">← Back to start</a></p>
      </div>`;
    refs.prevBtn.disabled = true;
    refs.nextBtn.disabled = true;
    return;
  }

  const paperIds = Array.from(new Set(wrong.map(w => w.paperId)));
  await Promise.all(paperIds.map(async id => {
    state.papers[id] = await loadPaper(id);
  }));

  state.queue = wrong
    .map(w => {
      const p = state.papers[w.paperId];
      const q = p?.questions.find(qq => qq.id === w.qId);
      return q ? { paperId: w.paperId, qId: w.qId, q } : null;
    })
    .filter(Boolean);

  show(0);
  refs.prevBtn.addEventListener("click", () => show(state.idx - 1));
  refs.nextBtn.addEventListener("click", () => show(state.idx + 1));
  refs.clearBtn.addEventListener("click", () => {
    if (confirm("Clear the entire wrong-answer queue? This cannot be undone.")) {
      Storage.clearWrongAnswers();
      location.reload();
    }
  });

  bindKeys({
    "Left":  () => show(state.idx - 1),
    "Right": () => show(state.idx + 1),
    "1": () => pickByIndex(0),
    "2": () => pickByIndex(1),
    "3": () => pickByIndex(2),
    "4": () => pickByIndex(3),
    "r": () => {
      const { q } = state.queue[state.idx];
      if (q.section === "listening" && q.context) speak(q.context);
    },
  });
}

function pickByIndex(i) {
  const { q } = state.queue[state.idx];
  if (state.revealed[q.id]) return;
  const opt = q.options[i];
  if (opt) pickAnswer(q, opt.label);
}

function show(idx) {
  if (idx < 0 || idx >= state.queue.length) return;
  state.idx = idx;
  stopTTS();
  const { q, paperId } = state.queue[idx];
  const sec = SECTIONS.find(s => s.id === q.section);
  const sectionIdx = SECTIONS.findIndex(s => s.id === q.section);

  refs.progress.textContent = `${idx + 1} / ${state.queue.length}`;
  refs.qarea.innerHTML = "";
  refs.feedback.innerHTML = "";

  const card = el("div", { class: "question-card stagger" });
  card.appendChild(el("div", { class: "q-header" },
    el("div", { class: "q-number mono" },
      String(qNum(q)).padStart(2, "0"),
      el("span", { class: "total" }, ` · ${state.papers[paperId].title.replace("JFT-Basic Model ", "")}`),
    ),
    el("div", { class: `section-chip ${q.section}` },
      `0${sectionIdx + 1} · ${sec.label}`,
      el("span", { class: "ja-label" }, sec.labelJa),
    ),
  ));

  if (q.section === "listening") {
    card.appendChild(buildAudio(q));
  } else if (q.context) {
    card.appendChild(el("div", { class: "context-block" }, q.context));
  }

  card.appendChild(el("div", { class: "prompt" }, q.prompt));
  card.appendChild(buildOptions(q));
  refs.qarea.appendChild(card);

  refs.prevBtn.disabled = idx === 0;
  refs.nextBtn.disabled = idx === state.queue.length - 1;

  if (state.revealed[q.id]) renderFeedback(q);
}

function qNum(q) { return Number(q.id.split("-q")[1]); }

function buildOptions(q) {
  const wrap = el("div", { class: "options" });
  const chosen = state.answered[q.id];
  q.options.forEach((opt, i) => {
    const optEl = el("label", { class: "option" },
      el("span", { class: "letter" }, opt.label),
      el("span", { class: "num-hint kbd-chip" }, String(i + 1)),
      el("span", {}, opt.text),
    );
    if (state.revealed[q.id]) {
      if (opt.label === q.answer) optEl.classList.add("correct");
      else if (opt.label === chosen) optEl.classList.add("incorrect");
    } else if (chosen === opt.label) {
      optEl.classList.add("selected");
    }
    optEl.addEventListener("click", () => {
      if (state.revealed[q.id]) return;
      pickAnswer(q, opt.label);
    });
    wrap.appendChild(optEl);
  });
  return wrap;
}

function pickAnswer(q, label) {
  state.answered[q.id] = label;
  state.revealed[q.id] = true;
  if (label === q.answer) {
    Storage.removeWrongAnswer(state.queue[state.idx].paperId, q.id);
    toast("Removed from review queue ✓", { tone: "ok" });
  } else {
    toast("Still incorrect — kept in queue", { tone: "warn" });
  }
  show(state.idx);
}

function renderFeedback(q) {
  const chosen = state.answered[q.id];
  const correct = chosen === q.answer;
  const correctOpt = q.options.find(o => o.label === q.answer);
  refs.feedback.appendChild(el("div", { class: `feedback-block ${correct ? "correct" : "incorrect"}` },
    el("div", { class: "label" }, correct
      ? "✓ Correct · removed from review"
      : `✗ Incorrect — answer is ${q.answer}: ${correctOpt?.text || ""}`),
    el("div", { class: "explanation" }, q.explanation.en || ""),
    el("div", { class: "ja-explanation" }, q.explanation.ja || ""),
  ));
}

function buildAudio(q) {
  const wrap = el("div", { class: "audio-controls" });
  wrap.style.flexDirection = "column";
  wrap.style.alignItems = "stretch";
  const row = el("div", { class: "row" });
  const label = el("div", { class: "audio-label" }, "ちょうかい · unlimited replays in review");
  const btn = el("button", { class: "btn secondary", onClick: () => speak(q.context) }, "▶ Play");
  if (!ttsSupported()) { btn.disabled = true; label.textContent = "TTS unsupported."; }
  row.appendChild(label);
  row.appendChild(btn);
  wrap.appendChild(row);
  hasJapaneseVoice().then(ok => {
    if (ok) return;
    label.innerHTML = "⚠ <strong>No Japanese voice installed</strong> — transcript shown below.";
    label.style.color = "var(--shu)";
    btn.disabled = true;
    const tr = el("div", { class: "transcript context-block" }, cleanForTTS(q.context));
    tr.style.marginTop = "12px";
    wrap.appendChild(tr);
  });
  return wrap;
}

init();
