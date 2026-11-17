const categories = [
  { id: "shirts", name: "Shirts" },
  { id: "pants", name: "Pants" },
  { id: "track-pants", name: "Track pants" },
  { id: "track-shirts", name: "Track shirts" },
];

const loginView = document.querySelector("#login-view");
const views = {
  dashboard: document.querySelector("#dashboard-view"),
  categories: document.querySelector("#category-view"),
  scanner: document.querySelector("#scanner-view"),
  stock: document.querySelector("#stock-view"),
};
const cameraButton = document.querySelector("#camera-button");
const video = document.querySelector("#camera-video");
const cameraPlaceholder = document.querySelector("#camera-placeholder");
const scanMessage = document.querySelector("#scan-message");
const categoryGrid = document.querySelector("#category-grid");
const stockTableBody = document.querySelector("#stock-table-body");
const stockMessage = document.querySelector("#stock-message");
const inventoryStorageKey = "ak-faction-inventory-v1";
const signOutButton = document.querySelector("#sign-out-button");
let activeMode = "stock-in";
let activeCategory;
let cameraStream;
let cameraControls;
let barcodeDetector;
let cameraAnimationFrame;
let scannerBusy = false;
let lastScanAt = 0;
let inventory = createEmptyInventory();
let storageError;

function createEmptyInventory() {
  return Object.fromEntries(categories.map(({ id }) => [id, { received: 0, sold: 0 }]));
}

function showView(name) {
  if (loginView) {
    loginView.classList.toggle("hidden", name !== "login");
  }
  for (const [viewName, element] of Object.entries(views)) {
    element.classList.toggle("hidden", viewName !== name);
  }
}

function setMessage(element, text, isError = false) {
  element.textContent = text;
  element.classList.toggle("error", isError);
}

function renderCategories() {
  categoryGrid.replaceChildren(...categories.map((category, index) => {
    const button = document.createElement("button");
    button.className = "category-card";
    button.type = "button";
    button.dataset.category = category.id;
    button.addEventListener("click", () => openScanner(category));
    button.innerHTML = `<span class="category-index">0${index + 1} / CATEGORY</span><span class="category-name"></span><span class="category-arrow" aria-hidden="true">↗</span>`;
    button.querySelector(".category-name").textContent = category.name;
    return button;
  }));
}

function renderStock() {
  stockTableBody.replaceChildren(...categories.map((category) => {
    const stock = inventory[category.id];
    const row = document.createElement("tr");
    const values = [
      category.name,
      stock.received,
      stock.sold,
      stock.received - stock.sold,
    ];
    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = String(value);
      row.append(cell);
    }
    return row;
  }));
  setMessage(
    stockMessage,
    storageError ?? "Changes are saved in this browser on this device.",
    Boolean(storageError),
  );
}

function loadInventory() {
  try {
    const savedInventory = localStorage.getItem(inventoryStorageKey);
    if (!savedInventory) return;

    const parsedInventory = JSON.parse(savedInventory);
    const loadedInventory = createEmptyInventory();
    for (const { id } of categories) {
      const stock = parsedInventory[id];
      if (!stock || !Number.isSafeInteger(stock.received) || !Number.isSafeInteger(stock.sold)
        || stock.received < 0 || stock.sold < 0 || stock.sold > stock.received) {
        throw new Error(`Saved inventory data for ${id} is invalid.`);
      }
      loadedInventory[id] = { received: stock.received, sold: stock.sold };
    }
    inventory = loadedInventory;
  } catch (error) {
    console.error("Could not load local inventory:", error);
    storageError = "Saved inventory could not be read. Clear this site's browser data to start fresh.";
  }
}

function stopCamera() {
  if (cameraAnimationFrame !== undefined) {
    cancelAnimationFrame(cameraAnimationFrame);
    cameraAnimationFrame = undefined;
  }
  barcodeDetector = undefined;
  cameraControls?.stop();
  cameraControls = undefined;
  if (cameraStream) {
    for (const track of cameraStream.getTracks()) track.stop();
    cameraStream = undefined;
  }
  video.pause();
  video.srcObject = null;
  video.classList.add("hidden");
  cameraPlaceholder.classList.remove("hidden");
  cameraButton.disabled = false;
  cameraButton.textContent = "Open camera";
}

function openScanner(category) {
  activeCategory = category;
  document.querySelector("#scanner-mode-label").textContent = activeMode === "stock-in" ? "STOCK IN" : "SALE";
  document.querySelector("#scanner-title").textContent = activeMode === "stock-in" ? "Scan stock in" : "Record a sale";
  document.querySelector("#scanner-category").textContent = category.name;
  setMessage(scanMessage, "");
  stopCamera();
  showView("scanner");
}

function openAction(action) {
  if (action === "stock-view") {
    showView("stock");
    return;
  }
  activeMode = action;
  document.querySelector("#category-mode-label").textContent = action === "stock-in" ? "STOCK IN" : "SALE";
  showView("categories");
}

function goBack(view) {
  stopCamera();
  showView(view);
}

function recordScan() {
  if (storageError) throw new Error("LOCAL_STORAGE_UNAVAILABLE");
  const field = activeMode === "stock-in" ? "received" : "sold";
  const stock = inventory[activeCategory.id];
  if (field === "sold" && stock.received - stock.sold < 1) {
    throw new Error("NO_STOCK_AVAILABLE");
  }
  const updatedStock = {
    ...stock,
    [field]: stock[field] + 1,
  };
  const updatedInventory = { ...inventory, [activeCategory.id]: updatedStock };
  localStorage.setItem(inventoryStorageKey, JSON.stringify(updatedInventory));
  inventory = updatedInventory;
  renderStock();
}

async function onBarcodeDetected() {
  if (scannerBusy) return;
  scannerBusy = true;
  stopCamera();
  setMessage(scanMessage, activeMode === "stock-in" ? "Adding item to stock…" : "Recording sale…");
  try {
    recordScan();
    setMessage(scanMessage, activeMode === "stock-in" ? "Added to stock." : "Sale recorded.");
  } catch (error) {
    if (error.message === "NO_STOCK_AVAILABLE") {
      setMessage(scanMessage, "No items of this category are in stock to sell.", true);
    } else {
      console.error("Could not save barcode scan:", error);
      setMessage(
        scanMessage,
        error.message === "LOCAL_STORAGE_UNAVAILABLE"
          ? storageError
          : "The scan could not be saved in this browser.",
        true,
      );
    }
  } finally {
    scannerBusy = false;
  }
}

async function startCamera() {
  if (!activeCategory || scannerBusy) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    setMessage(scanMessage, "Camera access requires a supported browser and a secure HTTPS page.", true);
    return;
  }
  cameraButton.disabled = true;
  cameraButton.textContent = "Opening camera…";
  setMessage(scanMessage, "");

  try {
    let formats = [];
    if (typeof window.BarcodeDetector === "function"
      && typeof window.BarcodeDetector.getSupportedFormats === "function") {
      try {
        const supportedFormats = await window.BarcodeDetector.getSupportedFormats();
        formats = supportedFormats.filter((format) => [
          "code_39", "code_128", "ean_8", "ean_13", "itf", "upc_a", "upc_e",
        ].includes(format));
      } catch (error) {
        console.warn("Native barcode detection is unavailable; using the ZXing fallback:", error);
      }
    }
    if (formats.length > 0) {
      barcodeDetector = new window.BarcodeDetector({ formats });
      cameraStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      });
      video.srcObject = cameraStream;
      await video.play();
      void scanVideoFrame();
    } else {
      const BrowserMultiFormatReader = window.ZXingBrowser?.BrowserMultiFormatReader;
      if (!BrowserMultiFormatReader) {
        throw new Error("SCANNER_LIBRARY_UNAVAILABLE");
      }
      const reader = new BrowserMultiFormatReader();
      cameraControls = await reader.decodeFromVideoDevice(undefined, video, (result) => {
        if (!result || scannerBusy) return;
        const now = Date.now();
        if (now - lastScanAt < 1200) return;
        lastScanAt = now;
        void onBarcodeDetected();
      });
    }
    video.classList.remove("hidden");
    cameraPlaceholder.classList.add("hidden");
    cameraButton.textContent = "Camera is on";
  } catch (error) {
    stopCamera();
    console.error("Could not start barcode scanner:", error);
    const message = error.message === "SCANNER_LIBRARY_UNAVAILABLE"
      ? "The barcode scanner library could not be loaded. Reinstall dependencies with npm install, then reload the app."
      : error.name === "NotAllowedError"
        ? "Camera permission was denied. Allow camera access in your browser and try again."
        : error.name === "NotFoundError"
          ? "No camera was found on this device."
          : "Camera or barcode scanner could not start. Open the app on localhost or over HTTPS and try again.";
    setMessage(scanMessage, message, true);
  }
}

async function scanVideoFrame() {
  if (!cameraStream || !barcodeDetector) return;
  try {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !scannerBusy) {
      const results = await barcodeDetector.detect(video);
      if (results.length > 0) {
        const now = Date.now();
        if (now - lastScanAt >= 1200) {
          lastScanAt = now;
          void onBarcodeDetected();
        }
      }
    }
  } catch (error) {
    console.error("Could not scan camera frame:", error);
    stopCamera();
    setMessage(scanMessage, "Could not read the camera image. Close and reopen the camera to try again.", true);
    return;
  }
  if (cameraStream && barcodeDetector) {
    cameraAnimationFrame = requestAnimationFrame(() => void scanVideoFrame());
  }
}

const accountStorageKey = "ar-factions-local-accounts";
const sessionStorageKey = "ar-factions-session";
const iterations = 120000;
const loginForm = document.querySelector("#login-form");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const submitButton = document.querySelector("#login-submit");
const switchButton = document.querySelector("#login-switch");
const loginMessage = document.querySelector("#login-message");
let creatingAccount = false;

function hasSession() {
  try {
    return Boolean(sessionStorage.getItem(sessionStorageKey));
  } catch (error) {
    return false;
  }
}

function setLoginMessage(text, isError = false) {
  if (!loginMessage) return;
  loginMessage.textContent = text;
  loginMessage.classList.toggle("error", isError);
}

function renderLoginMode() {
  const eyebrow = document.querySelector("#login-eyebrow");
  const title = document.querySelector("#login-title");
  const description = document.querySelector("#login-description");
  const switchPrompt = document.querySelector("#login-switch-prompt");
  if (!eyebrow || !title || !description || !switchPrompt || !switchButton || !submitButton || !passwordInput) return;

  eyebrow.textContent = creatingAccount ? "CREATE ACCOUNT" : "YOUR ACCOUNT";
  title.textContent = creatingAccount ? "Create account" : "Sign in";
  description.textContent = creatingAccount
    ? "Create a local account for this browser."
    : "Enter your email and password to continue.";
  switchPrompt.textContent = creatingAccount ? "Already registered?" : "New here?";
  switchButton.textContent = creatingAccount ? "Sign in" : "Create a local account";
  submitButton.textContent = creatingAccount ? "Create account" : "Sign in";
  passwordInput.autocomplete = creatingAccount ? "new-password" : "current-password";
  setLoginMessage("");
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

function syncAuthView() {
  const loggedIn = hasSession();
  signOutButton.classList.toggle("hidden", !loggedIn);
  showView(loggedIn ? "dashboard" : "login");
}

if (switchButton) {
  switchButton.addEventListener("click", () => {
    creatingAccount = !creatingAccount;
    renderLoginMode();
  });
}

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    submitButton.disabled = true;
    setLoginMessage(creatingAccount ? "Creating local account…" : "Signing in…");

    try {
      if (!crypto.subtle) {
        throw new Error("Secure password hashing is unavailable. Use localhost or HTTPS.");
      }
      const accounts = readAccounts();
      const account = accounts.find((entry) => entry.email === email);

      if (creatingAccount) {
        if (account) {
          setLoginMessage("An account already exists for this email. Please sign in.", true);
          return;
        }
        const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
        const passwordHash = await hashPassword(password, salt);
        accounts.push({ email, salt, passwordHash, iterations });
        localStorage.setItem(accountStorageKey, JSON.stringify(accounts));
      } else {
        if (!account) {
          setLoginMessage("No local account was found. Create an account on this device first.", true);
          return;
        }
        const passwordHash = await hashPassword(password, account.salt);
        if (passwordHash !== account.passwordHash) {
          setLoginMessage("Email or password is incorrect.", true);
          return;
        }
      }

      sessionStorage.setItem(sessionStorageKey, email);
      syncAuthView();
    } catch (error) {
      console.error("Could not complete local sign-in:", error);
      setLoginMessage(
        error.name === "QuotaExceededError"
          ? "Browser storage is full. Free up space and try again."
          : error.message || "Sign-in could not be completed.",
        true,
      );
    } finally {
      submitButton.disabled = false;
    }
  });
}

cameraButton.addEventListener("click", () => void startCamera());
signOutButton.addEventListener("click", () => {
  try {
    sessionStorage.removeItem(sessionStorageKey);
    syncAuthView();
  } catch (error) {
    console.error("Could not sign out:", error);
    alert("Could not sign out. Close this tab and reopen the app.");
  }
});

renderCategories();
loadInventory();
renderStock();
renderLoginMode();
syncAuthView();
