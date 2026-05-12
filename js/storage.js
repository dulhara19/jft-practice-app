// localStorage abstraction.
// Keys:
//   jft.activeExam       — current in-progress exam state (single slot)
//   jft.attempts         — array of completed attempts (most recent last)
//   jft.wrongAnswers     — set of qIds that user got wrong at least once
//   jft.lastResult       — most recently completed attempt id (for results.html)

const KEYS = {
  active: "jft.activeExam",
  attempts: "jft.attempts",
  wrong: "jft.wrongAnswers",
  lastResult: "jft.lastResult",
};

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn("storage.load failed for", key, e);
    return fallback;
  }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export const Storage = {
  getActiveExam() {
    return load(KEYS.active, null);
  },
  setActiveExam(exam) {
    save(KEYS.active, exam);
  },
  clearActiveExam() {
    localStorage.removeItem(KEYS.active);
  },

  getAttempts() {
    return load(KEYS.attempts, []);
  },
  addAttempt(attempt) {
    const list = load(KEYS.attempts, []);
    list.push(attempt);
    save(KEYS.attempts, list);
    save(KEYS.lastResult, attempt.id);
    return attempt.id;
  },
  getAttemptById(id) {
    return load(KEYS.attempts, []).find(a => a.id === id) || null;
  },
  getLastAttemptId() {
    return load(KEYS.lastResult, null);
  },

  // Wrong-answer queue: { paperId, qId }
  getWrongAnswers() {
    return load(KEYS.wrong, []);
  },
  addWrongAnswers(items) {
    const list = load(KEYS.wrong, []);
    const key = w => `${w.paperId}:${w.qId}`;
    const have = new Set(list.map(key));
    for (const w of items) {
      if (!have.has(key(w))) {
        list.push(w);
        have.add(key(w));
      }
    }
    save(KEYS.wrong, list);
  },
  removeWrongAnswer(paperId, qId) {
    const list = load(KEYS.wrong, []).filter(
      w => !(w.paperId === paperId && w.qId === qId)
    );
    save(KEYS.wrong, list);
  },
  clearWrongAnswers() {
    localStorage.removeItem(KEYS.wrong);
  },
};
