import { requireAuth } from "./auth.js";
requireAuth();

import { loadPaper, getQuery, el } from "./app.js";
import { Storage } from "./storage.js";
import { SECTIONS } from "./scoring.js";
import { speak, stop as stopTTS, isSupported as ttsSupported, hasJapaneseVoice, cleanForTTS } from "./tts.js";
import { bindHelpPanel, bindKeys, toast } from "./ui.js";

const paperId = getQuery("paper");
const section = getQuery("section");
if (!paperId || !section) location.href = "index.html";

const refs = {
  title: document.getElementById("paper-title"),
  progress: document.getElementById("progress"),
  qarea: document.getElementById("question-area"),
  feedback: document.getElementById("feedback-area"),
  prevBtn: document.getElementById("prev-btn"),
  nextBtn: document.getElementById("next-btn"),
};

const state = {
  paper: null,
  questions: [],
  idx: 0,
  answered: {},
  revealed: {},
  ttsCounts: {},
};

async function init() {
  bindHelpPanel();
  state.paper = await loadPaper(paperId);
  const sec = SECTIONS.find(s => s.id === section);
  state.questions = state.paper.questions.filter(q => q.section === section);
  refs.title.textContent = `${state.paper.title} · ${sec.label}`;

  show(0);
  refs.prevBtn.addEventListener("click", () => show(state.idx - 1));
  refs.nextBtn.addEventListener("click", () => show(state.idx + 1));

  bindKeys({
    "Left":  () => show(state.idx - 1),
    "Right": () => { if (!refs.nextBtn.disabled) show(state.idx + 1); },
    "1": () => pickByIndex(0),
    "2": () => pickByIndex(1),
    "3": () => pickByIndex(2),
    "4": () => pickByIndex(3),
    "r": () => {
      const q = state.questions[state.idx];
      if (q.section === "listening") playAudio(q);
    },
  });
}

function pickByIndex(i) {
  const q = state.questions[state.idx];
  if (state.revealed[q.id]) return;
  const opt = q.options[i];
  if (opt) pickAnswer(q, opt.label);
}

function show(idx) {
  if (idx < 0 || idx >= state.questions.length) return;
  state.idx = idx;
  stopTTS();
  const q = state.questions[idx];
  const sec = SECTIONS.find(s => s.id === q.section);
  const sectionIdx = SECTIONS.findIndex(s => s.id === q.section);

  refs.progress.textContent = `${idx + 1} / ${state.questions.length}`;
  refs.qarea.innerHTML = "";
  refs.feedback.innerHTML = "";

  const card = el("div", { class: "question-card stagger" });

  card.appendChild(el("div", { class: "q-header" },
    el("div", { class: "q-number mono" },
      String(qNum(q)).padStart(2, "0"),
      el("span", { class: "total" }, ` / ${state.paper.totalQuestions}`),
    ),
    el("div", { class: `section-chip ${q.section}` },
      `0${sectionIdx + 1} · ${sec.label}`,
      el("span", { class: "ja-label" }, sec.labelJa),
    ),
  ));

  if (q.section === "listening") {
    card.appendChild(buildAudio(q));
    if (!(q.id in state.ttsCounts)) playAudio(q);
  } else if (q.context) {
    card.appendChild(el("div", { class: "context-block" }, q.context));
  }

  card.appendChild(el("div", { class: "prompt" }, q.prompt));
  card.appendChild(buildOptions(q));
  refs.qarea.appendChild(card);

  refs.prevBtn.disabled = idx === 0;
  refs.nextBtn.disabled = idx === state.questions.length - 1 || !state.revealed[q.id];

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
  const correct = label === q.answer;
  if (!correct) {
    Storage.addWrongAnswers([{ paperId: state.paper.paperId, qId: q.id }]);
    toast("Added to review queue", { tone: "warn" });
  } else {
    Storage.removeWrongAnswer(state.paper.paperId, q.id);
    toast("Correct ✓", { tone: "ok" });
  }
  show(state.idx);
}

function renderFeedback(q) {
  const chosen = state.answered[q.id];
  const correct = chosen === q.answer;
  const correctOpt = q.options.find(o => o.label === q.answer);
  refs.feedback.appendChild(el("div", { class: `feedback-block ${correct ? "correct" : "incorrect"}` },
    el("div", { class: "label" }, correct
      ? "✓ Correct · せいかい"
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
  const label = el("div", { class: "audio-label" }, "ちょうかい · unlimited replays in practice mode");
  const btn = el("button", { class: "btn secondary", onClick: () => playAudio(q) }, "▶ Replay");
  if (!ttsSupported()) { btn.disabled = true; label.textContent = "Browser does not support Japanese speech."; }
  row.appendChild(label);
  row.appendChild(btn);
  wrap.appendChild(row);
  hasJapaneseVoice().then(ok => {
    if (ok) return;
    label.innerHTML = "⚠ <strong>No Japanese voice installed</strong> — transcript shown below as fallback.";
    label.style.color = "var(--shu)";
    btn.disabled = true;
    const tr = el("div", { class: "transcript context-block" }, cleanForTTS(q.context));
    tr.style.marginTop = "12px";
    wrap.appendChild(tr);
  });
  return wrap;
}

async function playAudio(q) {
  if (!q.context) return;
  state.ttsCounts[q.id] = (state.ttsCounts[q.id] || 0) + 1;
  await speak(q.context);
}

init();
