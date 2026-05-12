import { loadPaper, getQuery, el, formatTime, uid } from "./app.js";
import { Storage } from "./storage.js";
import { scoreAttempt, SECTIONS } from "./scoring.js";
import { speak, stop as stopTTS, isSupported as ttsSupported, hasJapaneseVoice, cleanForTTS } from "./tts.js";
import { bindHelpPanel, bindKeys, toast } from "./ui.js";

const MAX_TTS_PLAYS = 3;

const paperId = getQuery("paper");
if (!paperId) location.href = "index.html";

const state = {
  paper: null,
  exam: null,
  currentIdx: 0,
  timerHandle: null,
  ttsCounts: {},
  flashedFiveMin: false,
  flashedOneMin: false,
};

const refs = {
  title: document.getElementById("paper-title"),
  timer: document.getElementById("timer"),
  qpos: document.getElementById("qpos"),
  submitBtn: document.getElementById("submit-btn"),
  qgrid: document.getElementById("qgrid"),
  qarea: document.getElementById("question-area"),
  prevBtn: document.getElementById("prev-btn"),
  flagBtn: document.getElementById("flag-btn"),
  nextBtn: document.getElementById("next-btn"),
  modalRoot: document.getElementById("modal-root"),
};

async function init() {
  bindHelpPanel();
  state.paper = await loadPaper(paperId);
  refs.title.textContent = state.paper.title;

  const existing = Storage.getActiveExam();
  if (existing && existing.paperId === paperId && !existing.completed) {
    state.exam = existing;
    state.ttsCounts = existing.ttsCounts || {};
  } else {
    state.exam = {
      id: uid(),
      paperId,
      startedAt: Date.now(),
      durationMinutes: state.paper.durationMinutes,
      answers: {},
      flags: {},
      ttsCounts: {},
      completed: false,
    };
    Storage.setActiveExam(state.exam);
  }

  buildGrid();
  showQuestion(0);
  startTimer();

  refs.prevBtn.addEventListener("click", () => navigate(-1));
  refs.nextBtn.addEventListener("click", () => navigate(+1));
  refs.flagBtn.addEventListener("click", toggleFlag);
  refs.submitBtn.addEventListener("click", confirmSubmit);
  window.addEventListener("beforeunload", e => {
    if (!state.exam.completed) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  bindKeys({
    "Left":  () => navigate(-1),
    "Right": () => navigate(+1),
    "1": () => pickByIndex(0),
    "2": () => pickByIndex(1),
    "3": () => pickByIndex(2),
    "4": () => pickByIndex(3),
    "f": toggleFlag,
    "s": confirmSubmit,
    "r": () => {
      const q = state.paper.questions[state.currentIdx];
      if (q.section === "listening") playListening(q);
    },
  });
}

function buildGrid() {
  refs.qgrid.innerHTML = "";
  state.paper.questions.forEach((q, idx) => {
    const b = document.createElement("button");
    b.textContent = idx + 1;
    b.addEventListener("click", () => showQuestion(idx));
    refs.qgrid.appendChild(b);
  });
  syncGrid();
}

function syncGrid() {
  Array.from(refs.qgrid.children).forEach((btn, idx) => {
    const q = state.paper.questions[idx];
    btn.classList.toggle("answered", !!state.exam.answers[q.id]);
    btn.classList.toggle("flagged", !!state.exam.flags[q.id]);
    btn.classList.toggle("current", idx === state.currentIdx);
  });
  refs.qpos.textContent = `${state.currentIdx + 1} / ${state.paper.questions.length}`;
}

function navigate(delta) {
  const next = state.currentIdx + delta;
  if (next < 0 || next >= state.paper.questions.length) return;
  showQuestion(next);
}

function pickByIndex(i) {
  const q = state.paper.questions[state.currentIdx];
  const opt = q.options[i];
  if (opt) selectAnswer(q.id, opt.label);
}

function showQuestion(idx) {
  state.currentIdx = idx;
  stopTTS();
  const q = state.paper.questions[idx];
  const sec = SECTIONS.find(s => s.id === q.section);
  const sectionIdx = SECTIONS.findIndex(s => s.id === q.section);

  refs.qarea.innerHTML = "";

  const card = el("div", { class: "question-card stagger" });

  const header = el("div", { class: "q-header" },
    el("div", { class: "q-number mono" },
      String(idx + 1).padStart(2, "0"),
      el("span", { class: "total" }, ` / ${state.paper.questions.length}`),
    ),
    el("div", { class: `section-chip ${q.section}` },
      `0${sectionIdx + 1} · ${sec.label}`,
      el("span", { class: "ja-label" }, sec.labelJa),
    ),
  );
  card.appendChild(header);

  if (q.section === "listening") {
    card.appendChild(buildAudioControls(q));
  } else if (q.context) {
    card.appendChild(el("div", { class: "context-block" }, q.context));
  }

  card.appendChild(el("div", { class: "prompt" }, q.prompt));
  card.appendChild(buildOptions(q));
  refs.qarea.appendChild(card);

  refs.prevBtn.disabled = idx === 0;
  refs.nextBtn.disabled = idx === state.paper.questions.length - 1;
  refs.flagBtn.firstChild.nodeValue = state.exam.flags[q.id] ? "⚑ Unflag " : "⚑ Flag ";
  syncGrid();

  if (q.section === "listening" && ttsSupported()) {
    const count = state.ttsCounts[q.id] || 0;
    if (count === 0) playListening(q);
  }
}

function buildAudioControls(q) {
  const wrap = el("div", { class: "audio-controls" });
  wrap.style.flexDirection = "column";
  wrap.style.alignItems = "stretch";
  const row = el("div", { class: "row" });
  const label = el("div", { class: "audio-label" }, "ちょうかい · audio plays automatically · max 2 replays");
  const playsLeft = MAX_TTS_PLAYS - (state.ttsCounts[q.id] || 0);
  const btn = el("button", { class: "btn secondary", onClick: () => playListening(q) }, playsLabel(playsLeft));
  if (!ttsSupported()) {
    btn.disabled = true;
    label.textContent = "Browser does not support Japanese speech.";
  } else if (playsLeft <= 0) {
    btn.disabled = true;
  }
  row.appendChild(label);
  row.appendChild(btn);
  wrap.appendChild(row);
  wrap.dataset.qid = q.id;

  hasJapaneseVoice().then(ok => {
    if (ok) return;
    label.innerHTML =
      "⚠ <strong>No Japanese voice installed.</strong> Install Microsoft Haruka via Settings → Time &amp; Language → Add Japanese, or reveal the transcript below.";
    label.style.color = "var(--shu)";
    btn.firstChild.nodeValue = "Reveal transcript";
    btn.onclick = () => {
      if (wrap.querySelector(".transcript")) return;
      const cleaned = cleanForTTS(q.context);
      const tr = el("div", { class: "transcript context-block" }, cleaned);
      tr.style.marginTop = "12px";
      wrap.appendChild(tr);
      btn.disabled = true;
    };
  });
  return wrap;
}

function playsLabel(left) {
  if (left <= 0) return "No replays left";
  if (left === MAX_TTS_PLAYS) return "▶ Play audio";
  return `▶ Replay (${left} left)`;
}

async function playListening(q) {
  if (!q.context) return;
  const count = state.ttsCounts[q.id] || 0;
  if (count >= MAX_TTS_PLAYS) return;
  state.ttsCounts[q.id] = count + 1;
  state.exam.ttsCounts = state.ttsCounts;
  persist();
  refreshAudio(q);
  await speak(q.context);
}

function refreshAudio(q) {
  const wrap = refs.qarea.querySelector(`.audio-controls[data-qid="${q.id}"]`);
  if (!wrap) return;
  const btn = wrap.querySelector("button");
  const left = MAX_TTS_PLAYS - (state.ttsCounts[q.id] || 0);
  btn.firstChild.nodeValue = playsLabel(left);
  btn.disabled = left <= 0;
}

function buildOptions(q) {
  const wrap = el("div", { class: "options" });
  const chosen = state.exam.answers[q.id];
  q.options.forEach((opt, i) => {
    const isSel = chosen === opt.label;
    const optEl = el("label",
      { class: `option${isSel ? " selected" : ""}` },
      el("span", { class: "letter" }, opt.label),
      el("span", { class: "num-hint kbd-chip" }, String(i + 1)),
      el("span", {}, opt.text),
    );
    const input = document.createElement("input");
    input.type = "radio";
    input.name = `q-${q.id}`;
    input.value = opt.label;
    input.checked = isSel;
    input.addEventListener("change", () => selectAnswer(q.id, opt.label));
    optEl.prepend(input);
    optEl.addEventListener("click", () => selectAnswer(q.id, opt.label));
    wrap.appendChild(optEl);
  });
  return wrap;
}

function selectAnswer(qId, label) {
  state.exam.answers[qId] = label;
  persist();
  refs.qarea.querySelectorAll(".option").forEach(o => o.classList.remove("selected"));
  const target = Array.from(refs.qarea.querySelectorAll(".option .letter"))
    .find(l => l.textContent === label);
  if (target) target.closest(".option").classList.add("selected");
  syncGrid();
}

function toggleFlag() {
  const q = state.paper.questions[state.currentIdx];
  state.exam.flags[q.id] = !state.exam.flags[q.id];
  if (!state.exam.flags[q.id]) delete state.exam.flags[q.id];
  refs.flagBtn.firstChild.nodeValue = state.exam.flags[q.id] ? "⚑ Unflag " : "⚑ Flag ";
  persist();
  syncGrid();
}

function persist() {
  Storage.setActiveExam(state.exam);
}

function startTimer() {
  const tick = () => {
    const elapsed = Math.floor((Date.now() - state.exam.startedAt) / 1000);
    const remaining = state.exam.durationMinutes * 60 - elapsed;
    if (remaining <= 0) {
      refs.timer.textContent = "00:00";
      refs.timer.classList.add("danger");
      toast("Time's up — auto-submitting", { tone: "error" });
      submitExam(true);
      return;
    }
    refs.timer.textContent = formatTime(remaining);
    refs.timer.classList.toggle("warning", remaining <= 300 && remaining > 60);
    refs.timer.classList.toggle("danger", remaining <= 60);
    if (remaining <= 300 && !state.flashedFiveMin) {
      state.flashedFiveMin = true;
      toast("5 minutes remaining", { tone: "warn" });
    }
    if (remaining <= 60 && !state.flashedOneMin) {
      state.flashedOneMin = true;
      toast("1 minute remaining", { tone: "error" });
    }
  };
  tick();
  state.timerHandle = setInterval(tick, 1000);
}

function confirmSubmit() {
  const unanswered = state.paper.questions.filter(q => !state.exam.answers[q.id]).length;
  showModal({
    title: "Submit exam?",
    body: unanswered === 0
      ? "All 60 questions answered. Submit?"
      : `${unanswered} question${unanswered === 1 ? "" : "s"} left unanswered. Submit anyway?`,
    confirmLabel: "Submit",
    onConfirm: () => submitExam(false),
  });
}

function submitExam(timedOut) {
  if (state.timerHandle) clearInterval(state.timerHandle);
  stopTTS();
  state.exam.completed = true;
  state.exam.submittedAt = Date.now();
  state.exam.timedOut = timedOut;

  const result = scoreAttempt(state.paper, state.exam.answers);
  const attempt = {
    id: state.exam.id,
    paperId: state.exam.paperId,
    paperTitle: state.paper.title,
    startedAt: state.exam.startedAt,
    submittedAt: state.exam.submittedAt,
    timedOut,
    answers: state.exam.answers,
    flags: state.exam.flags,
    result,
  };
  Storage.addAttempt(attempt);
  Storage.addWrongAnswers(result.wrong.map(w => ({ paperId: state.exam.paperId, qId: w.qId })));
  Storage.clearActiveExam();
  location.href = `results.html?attempt=${attempt.id}`;
}

function showModal({ title, body, confirmLabel = "OK", onConfirm }) {
  refs.modalRoot.innerHTML = "";
  const backdrop = el("div", { class: "backdrop" });
  const close = () => backdrop.remove();
  backdrop.addEventListener("click", e => { if (e.target === backdrop) close(); });
  const modal = el("div", { class: "modal" },
    el("h3", {}, title),
    el("p", {}, body),
    el("div", { class: "actions" },
      el("button", { class: "btn secondary", onClick: close }, "Cancel"),
      el("button", { class: "btn danger", onClick: () => { close(); onConfirm(); } }, confirmLabel),
    ),
  );
  backdrop.appendChild(modal);
  refs.modalRoot.appendChild(backdrop);
}

init();
