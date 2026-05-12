import { checkCredentials, setAuthenticated, isAuthenticated } from "./auth.js";

const form = document.getElementById("login-form");
const userInput = document.getElementById("username");
const passInput = document.getElementById("password");
const errorBox = document.getElementById("login-error");
const submit = document.getElementById("login-submit");

// Already signed in? Skip the form.
if (isAuthenticated()) {
  const next = new URLSearchParams(location.search).get("next") || "index.html";
  location.replace(next);
}

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.remove("hidden");
}
function clearError() {
  errorBox.classList.add("hidden");
  errorBox.textContent = "";
}

form.addEventListener("submit", async e => {
  e.preventDefault();
  clearError();
  const username = userInput.value.trim();
  const password = passInput.value;
  if (!username || !password) {
    showError("Both fields are required.");
    return;
  }
  submit.disabled = true;
  submit.firstChild.nodeValue = "Checking… ";
  const ok = await checkCredentials(username, password);
  if (!ok) {
    submit.disabled = false;
    submit.firstChild.nodeValue = "Sign in ";
    showError("Incorrect username or password.");
    passInput.value = "";
    passInput.focus();
    return;
  }
  setAuthenticated();
  const next = new URLSearchParams(location.search).get("next") || "index.html";
  location.replace(next);
});
