// Browser Japanese SpeechSynthesis wrapper.
// Strips English/meta content before speaking so the Japanese voice doesn't
// switch into English mid-utterance.

let cachedVoice = null;
let voicesReady = false;
let warnedNoVoice = false;

function pickVoice() {
  if (cachedVoice) return cachedVoice;
  const voices = speechSynthesis.getVoices() || [];
  const ja = voices.filter(v => /ja[-_]/i.test(v.lang) || v.lang === "ja");
  cachedVoice = ja.find(v => /female|woman|kyoko|haruka|otoya/i.test(v.name))
    || ja[0]
    || null;
  if (!cachedVoice && !warnedNoVoice) {
    warnedNoVoice = true;
    console.warn(
      "[TTS] No Japanese (ja-JP) voice installed. Available voices:",
      voices.map(v => `${v.name} (${v.lang})`).join(", ")
    );
  }
  return cachedVoice;
}

function ensureVoices() {
  if (voicesReady) return Promise.resolve();
  return new Promise(resolve => {
    const list = speechSynthesis.getVoices();
    if (list && list.length > 0) {
      voicesReady = true;
      resolve();
      return;
    }
    speechSynthesis.addEventListener("voiceschanged", () => {
      voicesReady = true;
      resolve();
    }, { once: true });
    setTimeout(() => { voicesReady = true; resolve(); }, 600);
  });
}

// Visible to other modules so they can show a UI warning instead of silently
// using the wrong voice.
export async function hasJapaneseVoice() {
  await ensureVoices();
  return pickVoice() !== null;
}

export async function getVoiceDiagnostic() {
  await ensureVoices();
  const voices = speechSynthesis.getVoices() || [];
  return {
    total: voices.length,
    ja: voices.filter(v => /ja[-_]/i.test(v.lang)).map(v => `${v.name} (${v.lang})`),
    all: voices.map(v => `${v.name} (${v.lang})`),
    picked: pickVoice()?.name || null,
  };
}

// Range checks for the Hiragana / Katakana / CJK Unified Ideographs blocks.
function isCJK(ch) {
  const code = ch.codePointAt(0);
  return (
    (code >= 0x3040 && code <= 0x309F) || // Hiragana
    (code >= 0x30A0 && code <= 0x30FF) || // Katakana
    (code >= 0x4E00 && code <= 0x9FFF) || // CJK Unified Ideographs
    (code >= 0xFF66 && code <= 0xFF9F)    // Half-width Katakana
  );
}

function isMostlyLatin(text) {
  if (!text) return true;
  let latin = 0;
  let cjk = 0;
  for (const ch of text) {
    if (/[A-Za-z]/.test(ch)) latin++;
    else if (isCJK(ch)) cjk++;
  }
  return cjk === 0 || latin > cjk * 2;
}

// Pre-processes the audio-script text for TTS:
//   1. Removes [English stage directions] like "[Two friends on the phone]"
//   2. Removes meta-instruction lines like "つぎの... 読んでください"
//   3. Removes any line that is entirely Latin script (English directions)
//   4. Collapses speaker labels with full-width colon so the voice doesn't
//      pause oddly between label and content
export function cleanForTTS(text) {
  if (!text) return "";
  // 1. Strip bracketed directions whose content is mostly English
  text = text.replace(/[\[【［][^\[\]【】［］]*[\]】］]/g, (match) => {
    return isMostlyLatin(match.slice(1, -1)) ? "" : match;
  });
  // 2. Drop lines that are pure Latin / English directions
  const lines = text.split(/\r?\n/).filter(ln => {
    const trimmed = ln.trim();
    if (!trimmed) return false;
    // Drop "つぎの... 読んでください" instruction lines
    if (/(よんでください|読んで\s*ください|聞いて\s*ください|きいて\s*ください)/.test(trimmed)) {
      return false;
    }
    // Drop lines without any Japanese characters
    if (!Array.from(trimmed).some(isCJK)) return false;
    return true;
  });
  return lines.join("\n").trim();
}

export async function speak(text, { rate = 0.9, pitch = 1.0 } = {}) {
  if (!("speechSynthesis" in window)) {
    console.warn("speechSynthesis not supported");
    return;
  }
  const cleaned = cleanForTTS(text);
  if (!cleaned) {
    console.warn("[TTS] Nothing to speak after cleaning. Original:", text);
    return;
  }
  await ensureVoices();
  speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(cleaned);
  const v = pickVoice();
  if (v) {
    utter.voice = v;
  }
  utter.lang = "ja-JP";
  utter.rate = rate;
  utter.pitch = pitch;
  speechSynthesis.speak(utter);
  return new Promise(resolve => {
    utter.onend = resolve;
    utter.onerror = resolve;
  });
}

export function stop() {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

export function isSupported() {
  return "speechSynthesis" in window;
}
