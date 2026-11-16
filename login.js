const accountStorageKey = "ar-factions-local-accounts";
const sessionStorageKey = "ar-factions-session";
const iterations = 120000;
const loginForm = document.querySelector("#login-form");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const submitButton = document.querySelector("#login-submit");
const switchButton = document.querySelector("#login-switch");
const message = document.querySelector("#login-message");
let creatingAccount = false;

function setMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}

function renderLoginMode() {
  document.querySelector("#login-eyebrow").textContent = creatingAccount ? "CREATE ACCOUNT" : "YOUR ACCOUNT";
  document.querySelector("#login-title").textContent = creatingAccount ? "Create account" : "Sign in";
  document.querySelector("#login-description").textContent = creatingAccount
    ? "Create a local account for this browser."
    : "Enter your email and password to continue.";
  document.querySelector("#login-switch-prompt").textContent = creatingAccount ? "Already registered?" : "New here?";
  switchButton.textContent = creatingAccount ? "Sign in" : "Create a local account";
  submitButton.textContent = creatingAccount ? "Create account" : "Sign in";
  passwordInput.autocomplete = creatingAccount ? "new-password" : "current-password";
  setMessage("");
}

function readAccounts() {
  const saved = localStorage.getItem(accountStorageKey);
  if (!saved) return [];
  const accounts = JSON.parse(saved);
  if (!Array.isArray(accounts)) throw new Error("Stored accounts are invalid.");
  return accounts;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    salt: encoder.encode(salt),
    iterations,
    hash: "SHA-256",
  }, key, 256);
  return bytesToHex(new Uint8Array(bits));
}

switchButton.addEventListener("click", () => {
  creatingAccount = !creatingAccount;
  renderLoginMode();
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;
  submitButton.disabled = true;
  setMessage(creatingAccount ? "Creating local account…" : "Signing in…");

  try {
    if (!crypto.subtle) {
      throw new Error("Secure password hashing is unavailable. Use localhost or HTTPS.");
    }
    const accounts = readAccounts();
    const account = accounts.find((entry) => entry.email === email);

    if (creatingAccount) {
      if (account) {
        setMessage("An account already exists for this email. Please sign in.", true);
        return;
      }
      const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
      const passwordHash = await hashPassword(password, salt);
      accounts.push({ email, salt, passwordHash, iterations });
      localStorage.setItem(accountStorageKey, JSON.stringify(accounts));
    } else {
      if (!account) {
        setMessage("No local account was found. Create an account on this device first.", true);
        return;
      }
      const passwordHash = await hashPassword(password, account.salt);
      if (passwordHash !== account.passwordHash) {
        setMessage("Email or password is incorrect.", true);
        return;
      }
    }

    sessionStorage.setItem(sessionStorageKey, email);
    window.location.replace("./index.html");
  } catch (error) {
    console.error("Could not complete local sign-in:", error);
    setMessage(error.name === "QuotaExceededError"
      ? "Browser storage is full. Free up space and try again."
      : error.message || "Sign-in could not be completed.", true);
  } finally {
    submitButton.disabled = false;
  }
});

renderLoginMode();
