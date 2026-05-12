// Shared UI helpers: help overlay, toasts, keyboard shortcut binding.

export function bindHelpPanel() {
  const toggle = document.getElementById("help-toggle");
  const panel = document.getElementById("help-panel");
  if (!toggle || !panel) return;
  toggle.addEventListener("click", e => {
    e.stopPropagation();
    panel.classList.toggle("open");
  });
  document.addEventListener("click", e => {
    if (panel.classList.contains("open")
        && !panel.contains(e.target)
        && e.target !== toggle) {
      panel.classList.remove("open");
    }
  });
  document.addEventListener("keydown", e => {
    // "?" or Shift+/ toggles
    if (e.key === "?" && !inEditableField(e.target)) {
      e.preventDefault();
      panel.classList.toggle("open");
    } else if (e.key === "Escape" && panel.classList.contains("open")) {
      panel.classList.remove("open");
    }
  });
}

export function toast(message, opts = {}) {
  const host = document.getElementById("toast-host");
  if (!host) return;
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = message;
  if (opts.tone === "warn")  t.style.borderLeftColor = "var(--warn)";
  if (opts.tone === "ok")    t.style.borderLeftColor = "var(--ok)";
  if (opts.tone === "error") t.style.borderLeftColor = "var(--shu)";
  host.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

export function inEditableField(target) {
  if (!target) return false;
  const tag = (target.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || target.isContentEditable;
}

// Generic keyboard router. `handlers` is { keyName: fn }
export function bindKeys(handlers) {
  document.addEventListener("keydown", e => {
    if (inEditableField(e.target)) return;
    const key = normalizeKey(e);
    const fn = handlers[key];
    if (fn) {
      e.preventDefault();
      fn(e);
    }
  });
}

function normalizeKey(e) {
  const k = e.key;
  if (k === "ArrowLeft")  return "Left";
  if (k === "ArrowRight") return "Right";
  if (k === "ArrowUp")    return "Up";
  if (k === "ArrowDown")  return "Down";
  if (k === " ")          return "Space";
  if (k === "Enter")      return "Enter";
  if (k === "Escape")     return "Escape";
  if (k.length === 1)     return k.toLowerCase();
  return k;
}
