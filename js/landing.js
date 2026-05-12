import { requireAuth, signOut } from "./auth.js";
requireAuth();

import { loadIndex } from "./app.js";
import { Storage } from "./storage.js";
import { bindHelpPanel, bindKeys, toast } from "./ui.js";

const state = {
  mode: null,
  paperId: null,
  section: null,
};

const refs = {
  modeGrid: document.getElementById("mode-grid"),
  paperStep: document.getElementById("paper-step"),
  paperPicker: document.getElementById("paper-picker"),
  sectionStep: document.getElementById("section-step"),
  sectionPicker: document.getElementById("section-picker"),
  startBtn: document.getElementById("start-btn"),
  resetBtn: document.getElementById("reset-btn"),
};

async function init() {
  bindHelpPanel();

  const idx = await loadIndex();
  idx.papers.forEach((p, i) => {
    const btn = document.createElement("button");
    btn.className = "paper-card";
    btn.dataset.paperId = p.id;
    btn.innerHTML = `
      <div class="num">PAPER 0${i + 1}</div>
      <div class="name">${p.title.replace("JFT-Basic Model ", "")}</div>
      <div class="meta">${p.totalQuestions} Q · ${p.durationMinutes} min · pass ${p.passMark}</div>
    `;
    btn.addEventListener("click", () => selectPaper(p.id, btn));
    refs.paperPicker.appendChild(btn);
  });

  refs.modeGrid.addEventListener("click", e => {
    const card = e.target.closest(".mode-card");
    if (card) selectMode(card.dataset.mode);
  });

  refs.sectionPicker.addEventListener("click", e => {
    const card = e.target.closest("[data-section]");
    if (!card) return;
    state.section = card.dataset.section;
    refs.sectionPicker.querySelectorAll(".paper-card").forEach(b => b.classList.remove("selected"));
    card.classList.add("selected");
    updateStartButton();
  });

  refs.startBtn.addEventListener("click", start);
  refs.resetBtn.addEventListener("click", () => location.reload());
  const signoutBtn = document.getElementById("signout-btn");
  if (signoutBtn) signoutBtn.addEventListener("click", () => {
    signOut();
    location.href = "login.html";
  });

  const wrong = Storage.getWrongAnswers();
  if (wrong.length > 0) {
    const reviewCard = refs.modeGrid.querySelector('[data-mode="review"] .desc');
    if (reviewCard) reviewCard.textContent += ` · ${wrong.length} queued`;
  }

  bindKeys({
    "1": () => selectMode("exam"),
    "2": () => selectMode("practice"),
    "3": () => selectMode("review"),
    "4": () => selectMode("irodori"),
    "Enter": () => { if (!refs.startBtn.disabled) start(); },
    "Escape": () => location.reload(),
  });
}

function selectMode(mode) {
  state.mode = mode;
  state.paperId = null;
  state.section = null;
  refs.modeGrid.querySelectorAll(".mode-card").forEach(c => c.classList.remove("selected"));
  const card = refs.modeGrid.querySelector(`[data-mode="${mode}"]`);
  if (card) card.classList.add("selected");
  refs.paperPicker.querySelectorAll(".paper-card").forEach(b => b.classList.remove("selected"));
  refs.sectionPicker.querySelectorAll(".paper-card").forEach(b => b.classList.remove("selected"));

  if (mode === "review" || mode === "irodori") {
    refs.paperStep.classList.add("hidden");
    refs.sectionStep.classList.add("hidden");
  } else if (mode === "practice") {
    refs.paperStep.classList.remove("hidden");
    refs.sectionStep.classList.remove("hidden");
  } else {
    refs.paperStep.classList.remove("hidden");
    refs.sectionStep.classList.add("hidden");
  }
  updateStartButton();
}

function selectPaper(id, btn) {
  state.paperId = id;
  refs.paperPicker.querySelectorAll(".paper-card").forEach(b => b.classList.remove("selected"));
  btn.classList.add("selected");
  updateStartButton();
}

function updateStartButton() {
  let ready = false;
  if (state.mode === "review") {
    ready = Storage.getWrongAnswers().length > 0;
    refs.startBtn.firstChild.nodeValue = ready ? "Start review " : "No wrong answers yet ";
  } else if (state.mode === "exam") {
    ready = !!state.paperId;
    refs.startBtn.firstChild.nodeValue = "Start mock exam ";
  } else if (state.mode === "practice") {
    ready = !!state.paperId && !!state.section;
    refs.startBtn.firstChild.nodeValue = "Start drill ";
  } else if (state.mode === "irodori") {
    ready = true;
    refs.startBtn.firstChild.nodeValue = "Open Irodori cards ";
  } else {
    refs.startBtn.firstChild.nodeValue = "Start ";
  }
  refs.startBtn.disabled = !ready;
}

function start() {
  if (state.mode === "exam") {
    const active = Storage.getActiveExam();
    if (active && active.paperId === state.paperId && !active.completed) {
      const elapsed = (Date.now() - active.startedAt) / 1000;
      const remaining = active.durationMinutes * 60 - elapsed;
      if (remaining > 0) {
        if (confirm("You have an unfinished exam for this paper. Resume?")) {
          location.href = `exam.html?paper=${state.paperId}`;
          return;
        }
      }
      Storage.clearActiveExam();
    }
    location.href = `exam.html?paper=${state.paperId}`;
  } else if (state.mode === "practice") {
    location.href = `practice.html?paper=${state.paperId}&section=${state.section}`;
  } else if (state.mode === "review") {
    location.href = "review.html";
  } else if (state.mode === "irodori") {
    location.href = "drill.html";
  }
}

init();
