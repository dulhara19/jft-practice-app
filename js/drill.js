import { requireAuth } from "./auth.js";
requireAuth();

import { el } from "./app.js";
import { Storage } from "./storage.js";
import { speak, isSupported as ttsSupported, hasJapaneseVoice } from "./tts.js";
import { bindHelpPanel, bindKeys, toast } from "./ui.js";

const SETUP   = document.getElementById("setup-view");
const DRILL   = document.getElementById("drill-view");
const SUMMARY = document.getElementById("summary-view");

const config = {
  deckId: null,
  level: null,
  size: 50,
};

const session = {
  cards: [],
  idx: 0,
  flipped: false,
  known: [],
  unknown: [],
  startedAt: 0,
};

let manifest = null;

async function init() {
  bindHelpPanel();
  const idxRes = await fetch("data/decks/index.json");
  manifest = await idxRes.json();

  const deckGrid = document.getElementById("deck-grid");
  manifest.decks.forEach((d, i) => {
    const card = el("button", {
      class: "mode-card",
      "data-deck": d.id,
      "data-kanji": deckKanji(d.id),
    },
      el("div", { class: "num" }, `0${i + 1} / DECK`),
      el("div", { class: "label" }, d.title),
      el("div", { class: "desc" }, `${d.totalCards.toLocaleString()} cards across 3 levels`),
    );
    card.addEventListener("click", () => selectDeck(d.id));
    deckGrid.appendChild(card);
  });

  document.getElementById("level-picker").addEventListener("click", e => {
    const b = e.target.closest("[data-level]");
    if (!b) return;
    config.level = b.dataset.level;
    document.querySelectorAll("#level-picker .paper-card").forEach(x => x.classList.remove("selected"));
    b.classList.add("selected");
    updateStartButton();
  });

  document.getElementById("size-picker").addEventListener("click", e => {
    const b = e.target.closest("[data-size]");
    if (!b) return;
    config.size = parseInt(b.dataset.size, 10);
    document.querySelectorAll("#size-picker .paper-card").forEach(x => x.classList.remove("selected"));
    b.classList.add("selected");
  });

  document.getElementById("start-drill-btn").addEventListener("click", startDrill);

  bindKeys({
    "Enter": () => {
      if (!SETUP.classList.contains("hidden")) {
        const btn = document.getElementById("start-drill-btn");
        if (!btn.disabled) startDrill();
      } else if (!DRILL.classList.contains("hidden")) {
        if (!session.flipped) flipCard();
        else markCard(true);
      }
    },
    "Space": () => { if (!DRILL.classList.contains("hidden")) flipCard(); },
    "k": () => { if (session.flipped) markCard(true); },
    "Right": () => { if (session.flipped) markCard(true); },
    "j": () => { if (session.flipped) markCard(false); },
    "r": () => {
      if (!DRILL.classList.contains("hidden")) playCurrentReading();
    },
    "Escape": () => {
      if (!DRILL.classList.contains("hidden")) {
        if (confirm("Exit this drill? Progress will be discarded.")) {
          location.reload();
        }
      }
    },
  });
}

function deckKanji(id) {
  return { vocabulary: "語", kanji: "漢", grammar: "文" }[id] || "習";
}

function selectDeck(id) {
  config.deckId = id;
  document.querySelectorAll("#deck-grid .mode-card").forEach(c => c.classList.remove("selected"));
  document.querySelector(`#deck-grid [data-deck="${id}"]`).classList.add("selected");
  updateStartButton();
}

function updateStartButton() {
  const ready = !!config.deckId && !!config.level;
  document.getElementById("start-drill-btn").disabled = !ready;
}

async function startDrill() {
  const res = await fetch(`data/decks/${config.deckId}.json`);
  const deck = await res.json();
  let pool = deck.cards;
  if (config.level !== "all") {
    pool = pool.filter(c => c.level === config.level);
  }
  // Shuffle + take N
  pool = shuffle(pool).slice(0, config.size);
  if (pool.length === 0) {
    toast("No cards for that level. Try another level.", { tone: "warn" });
    return;
  }

  session.cards = pool;
  session.idx = 0;
  session.flipped = false;
  session.known = [];
  session.unknown = [];
  session.startedAt = Date.now();
  session.deckKind = deck.kind;

  SETUP.classList.add("hidden");
  DRILL.classList.remove("hidden");
  renderCard();
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function renderCard() {
  DRILL.innerHTML = "";
  const card = session.cards[session.idx];
  const progress = `${session.idx + 1} / ${session.cards.length}`;

  const wrap = el("div", { class: "question-card stagger" });

  // Progress + meta header
  wrap.appendChild(el("div", { class: "q-header" },
    el("div", { class: "q-number mono" },
      String(session.idx + 1).padStart(2, "0"),
      el("span", { class: "total" }, ` / ${session.cards.length}`),
    ),
    el("div", { class: `section-chip ${deckChipClass(session.deckKind)}` },
      session.deckKind.toUpperCase(),
      el("span", { class: "ja-label" }, levelJa(card.level)),
    ),
  ));

  // The card front
  const front = el("div", { class: "drill-card", "data-side": session.flipped ? "back" : "front" });
  if (session.deckKind === "vocabulary") {
    if (!session.flipped) {
      front.appendChild(el("div", { class: "drill-front" }, card.word));
      if (card.word !== card.reading) {
        front.appendChild(el("div", { class: "drill-sub" }, "Tap or press space to reveal"));
      }
    } else {
      front.appendChild(el("div", { class: "drill-reading mono" }, card.reading));
      front.appendChild(el("div", { class: "drill-front" }, card.word));
      front.appendChild(el("div", { class: "drill-meaning" }, card.english));
      if (card.pos) front.appendChild(el("div", { class: "drill-pos" }, `[${card.pos}]`));
    }
  } else if (session.deckKind === "kanji") {
    if (!session.flipped) {
      front.appendChild(el("div", { class: "drill-front drill-kanji" }, card.kanji));
      front.appendChild(el("div", { class: "drill-sub" }, "Tap or press space to reveal"));
    } else {
      front.appendChild(el("div", { class: "drill-front drill-kanji" }, card.kanji));
      front.appendChild(el("div", { class: "drill-reading mono" }, card.reading));
      front.appendChild(el("div", { class: "drill-meaning" },
        el("span", { class: "kana" }, card.example),
        el("span", { class: "muted" }, ` · ${card.exampleReading}`),
      ));
    }
  } else if (session.deckKind === "grammar") {
    if (!session.flipped) {
      front.appendChild(el("div", { class: "drill-front drill-pattern" }, card.pattern));
      front.appendChild(el("div", { class: "drill-sub" }, "Tap or press space for an example"));
    } else {
      front.appendChild(el("div", { class: "drill-front drill-pattern" }, card.pattern));
      front.appendChild(el("div", { class: "drill-meaning kana" }, card.example));
      front.appendChild(el("div", { class: "drill-pos" }, card.lesson));
    }
  }
  wrap.appendChild(front);

  // Audio button for vocab + kanji
  if (session.deckKind !== "grammar" && ttsSupported()) {
    const audioRow = el("div", { class: "audio-controls" });
    audioRow.style.flexDirection = "column";
    audioRow.style.alignItems = "stretch";
    const row = el("div", { class: "row" });
    const label = el("div", { class: "audio-label" }, "Hear the reading · 発音");
    const btn = el("button", { class: "btn secondary", onClick: playCurrentReading }, "▶ Play");
    row.appendChild(label);
    row.appendChild(btn);
    audioRow.appendChild(row);
    hasJapaneseVoice().then(ok => {
      if (!ok) {
        label.innerHTML = "⚠ No Japanese voice installed — audio disabled.";
        label.style.color = "var(--shu)";
        btn.disabled = true;
      }
    });
    wrap.appendChild(audioRow);
  }

  // Action buttons
  if (!session.flipped) {
    wrap.appendChild(el("div", { class: "q-nav" },
      el("div", { class: "left" }, el("div", { class: "muted", style: "font-size:0.85rem;" }, progress)),
      el("div", { class: "right" },
        el("button", { class: "btn", onClick: flipCard }, "Reveal answer ", el("span", { class: "kbd" }, "Space")),
      ),
    ));
  } else {
    wrap.appendChild(el("div", { class: "q-nav" },
      el("div", { class: "left" },
        el("button", { class: "btn secondary", onClick: () => markCard(false) }, "✗ Didn't know ", el("span", { class: "kbd" }, "J")),
      ),
      el("div", { class: "right" },
        el("button", { class: "btn", onClick: () => markCard(true) }, "✓ Knew it ", el("span", { class: "kbd" }, "K")),
      ),
    ));
  }

  DRILL.appendChild(wrap);
}

function deckChipClass(kind) {
  return { vocabulary: "convo-expr", kanji: "script-vocab", grammar: "reading" }[kind] || "listening";
}

function levelJa(level) {
  return { starter: "入門", "elementary-1": "初級1", "elementary-2": "初級2" }[level] || "";
}

function flipCard() {
  if (session.flipped) return;
  session.flipped = true;
  renderCard();
  // Auto-play reading on flip for vocab/kanji
  if (session.deckKind !== "grammar") setTimeout(playCurrentReading, 150);
}

function playCurrentReading() {
  const c = session.cards[session.idx];
  if (!c) return;
  let text = "";
  if (session.deckKind === "vocabulary") text = c.reading;
  else if (session.deckKind === "kanji") text = c.exampleReading;
  if (text) speak(text);
}

function markCard(known) {
  const card = session.cards[session.idx];
  if (known) session.known.push(card.id);
  else session.unknown.push(card.id);

  // Lite spaced repetition: unknown cards get reinserted later in the deck
  if (!known) {
    const insertAt = Math.min(session.idx + 5, session.cards.length);
    session.cards.splice(insertAt, 0, card);
  }

  session.idx += 1;
  session.flipped = false;

  if (session.idx >= session.cards.length) {
    finishDrill();
    return;
  }
  renderCard();
}

function finishDrill() {
  DRILL.classList.add("hidden");
  SUMMARY.classList.remove("hidden");

  const total = session.known.length + session.unknown.length;
  const accuracy = total ? Math.round((session.known.length / total) * 100) : 0;
  const dur = Math.round((Date.now() - session.startedAt) / 1000);
  const mm = Math.floor(dur / 60), ss = dur % 60;

  SUMMARY.innerHTML = "";
  SUMMARY.appendChild(el("div", { class: `score-card ${accuracy >= 80 ? "pass" : "fail"}`, "data-kanji": accuracy >= 80 ? "達" : "再" },
    el("div", { class: "score-meta" },
      el("div", { class: "kicker" }, "Drill complete · ドリル終了"),
      el("div", { class: "verdict" }, accuracy >= 80 ? "Strong session" : "Keep going"),
      el("div", { class: "score-meta-line" }, `${session.known.length} known · ${session.unknown.length} missed · ${mm}m ${ss}s`),
    ),
    el("div", { class: "score-block" },
      el("div", { class: "score-number mono" }, `${accuracy}`),
      el("div", { class: "score-out-of" }, "% accurate"),
    ),
  ));

  SUMMARY.appendChild(el("div", { class: "action-bar" },
    el("a", { class: "btn secondary", href: "drill.html" }, "Another deck"),
    el("a", { class: "btn secondary", href: "index.html" }, "Back to start"),
    el("button", { class: "btn", onClick: () => location.reload() }, "Repeat this configuration"),
  ));
}

init();
