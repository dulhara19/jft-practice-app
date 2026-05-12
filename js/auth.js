// Casual access gate. NOT real security.
// GitHub Pages can't run server-side auth — anyone with DevTools can bypass.
// This stops random discovery, nothing more.

const EXPECTED_HASH = "acc18acde9d2f0dda277afe027e16b0a1c47197e9bae9135edb76154f552da95";
const STORE_KEY = "jft.auth";

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function checkCredentials(username, password) {
  const hash = await sha256(`${username}:${password}`);
  return hash === EXPECTED_HASH;
}

export function isAuthenticated() {
  return localStorage.getItem(STORE_KEY) === EXPECTED_HASH;
}

export function setAuthenticated() {
  localStorage.setItem(STORE_KEY, EXPECTED_HASH);
}

export function signOut() {
  localStorage.removeItem(STORE_KEY);
}

// Call at the top of every page's entry module. If not authenticated, kicks
// to login.html with a `next=` param so we return to the same place on success.
export function requireAuth() {
  if (isAuthenticated()) return;
  const here = location.pathname + location.search + location.hash;
  // Skip login page itself
  if (location.pathname.endsWith("/login.html")) return;
  location.replace(`login.html?next=${encodeURIComponent(here)}`);
}
