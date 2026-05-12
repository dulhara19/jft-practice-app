// Shared loaders + small helpers used by every page.

export async function loadIndex() {
  const res = await fetch("data/index.json");
  if (!res.ok) throw new Error("Failed to load data/index.json");
  return res.json();
}

export async function loadPaper(paperId) {
  const res = await fetch(`data/papers/${paperId}.json`);
  if (!res.ok) throw new Error(`Failed to load paper ${paperId}`);
  return res.json();
}

export function getQuery(name) {
  return new URLSearchParams(location.search).get(name);
}

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v === true) {
      node.setAttribute(k, "");
    } else if (v !== false && v != null) {
      node.setAttribute(k, v);
    }
  }
  for (const c of children) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
