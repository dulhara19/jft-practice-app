// Raw-correct → scaled JFT-Basic score (10..250).
// Linear approximation: real JFT uses IRT.
//   scaled = round( (correct / total) * 240 + 10 )

export const PASS_MARK = 200;

export const SECTIONS = [
  { id: "script-vocab", label: "Script & Vocabulary", labelJa: "もじ・ごい" },
  { id: "convo-expr",   label: "Conversation & Expression", labelJa: "かいわ・ひょうげん" },
  { id: "listening",    label: "Listening", labelJa: "ちょうかい" },
  { id: "reading",      label: "Reading", labelJa: "どっかい" },
];

export function scaleScore(correct, total) {
  if (!total) return 10;
  const raw = (correct / total) * 240 + 10;
  return Math.max(10, Math.min(250, Math.round(raw)));
}

export function scoreAttempt(paper, answers) {
  // answers: { qId: 'A' | 'B' | ... }
  const bySection = Object.fromEntries(SECTIONS.map(s => [s.id, { correct: 0, total: 0 }]));
  const wrong = [];
  let correct = 0;

  for (const q of paper.questions) {
    const bucket = bySection[q.section];
    bucket.total += 1;
    const given = answers[q.id];
    if (given && given === q.answer) {
      correct += 1;
      bucket.correct += 1;
    } else {
      wrong.push({ qId: q.id, given: given || null, correct: q.answer });
    }
  }

  const scaled = scaleScore(correct, paper.questions.length);
  const passed = scaled >= PASS_MARK;

  return {
    correct,
    total: paper.questions.length,
    scaled,
    passed,
    sections: SECTIONS.map(s => ({
      id: s.id,
      label: s.label,
      labelJa: s.labelJa,
      correct: bySection[s.id].correct,
      total: bySection[s.id].total,
      percent: bySection[s.id].total
        ? Math.round((bySection[s.id].correct / bySection[s.id].total) * 100)
        : 0,
    })),
    wrong,
  };
}
