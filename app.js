import { firebaseConfig } from "./firebase-config.js";

const categories = [
  { id: "shirts", name: "Shirts" },
  { id: "pants", name: "Pants" },
  { id: "track-pants", name: "Track pants" },
  { id: "track-shirts", name: "Track shirts" },
];

const views = {
  auth: document.querySelector("#auth-view"),
  dashboard: document.querySelector("#dashboard-view"),
  categories: document.querySelector("#category-view"),
  scanner: document.querySelector("#scanner-view"),
  stock: document.querySelector("#stock-view"),
};
const authForm = document.querySelector("#auth-form");
const authMessage = document.querySelector("#auth-message");
const authSwitch = document.querySelector("#auth-switch");
const authSubmit = document.querySelector("#auth-submit");
const passwordInput = document.querySelector("#password");
const cameraButton = document.querySelector("#camera-button");
const video = document.querySelector("#camera-video");
const cameraPlaceholder = document.querySelector("#camera-placeholder");
const scanMessage = document.querySelector("#scan-message");
const categoryGrid = document.querySelector("#category-grid");
const stockTableBody = document.querySelector("#stock-table-body");
const stockMessage = document.querySelector("#stock-message");
const signOutButton = document.querySelector("#sign-out-button");

let auth;
let db;
let firebaseAuth;
let firestore;
let registering = false;
let activeMode = "stock-in";
let activeCategory;
let cameraControls;
let cameraStream;
let stockUnsubscribe;
let scannerBusy = false;
let lastScanAt = 0;

function showView(name) {
  for (const [viewName, element] of Object.entries(views)) {
    element.classList.toggle("hidden", viewName !== name);
  }
}

function setMessage(element, text, isError = false) {
  element.textContent = text;
  element.classList.toggle("error", isError);
}

function friendlyAuthError(error) {
  const messages = {
    "auth/email-already-in-use": "An account already exists for this email. Please sign in.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/weak-password": "Choose a password with at least 6 characters.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
    "auth/network-request-failed": "Network error. Check your connection and try again.",
  };
  return messages[error.code] ?? "Sign-in could not be completed. Please try again.";
}

function renderAuthMode() {
  document.querySelector("#auth-eyebrow").textContent = registering ? "CREATE YOUR ACCOUNT" : "WELCOME BACK";
  document.querySelector("#auth-title").textContent = registering ? "Create account" : "Sign in";
  document.querySelector("#auth-description").textContent = registering
    ? "Register with your email to access the store inventory."
    : "Sign in to manage your store inventory.";
  document.querySelector("#auth-switch-prompt").textContent = registering ? "Already registered?" : "New to your store?";
  authSwitch.textContent = registering ? "Sign in" : "Create an account";
  authSubmit.textContent = registering ? "Create account" : "Sign in";
  passwordInput.autocomplete = registering ? "new-password" : "current-password";
  setMessage(authMessage, "");
}

function renderCategories() {
  categoryGrid.replaceChildren(...categories.map((category, index) => {
    const button = document.createElement("button");
    button.className = "category-card";
    button.type = "button";
    button.dataset.category = category.id;
    button.innerHTML = `<span class="category-index">0${index + 1} / CATEGORY</span><span class="category-name"></span><span class="category-arrow" aria-hidden="true">↗</span>`;
    button.querySelector(".category-name").textContent = category.name;
    return button;
  }));
}

function startStockListener() {
  stockUnsubscribe?.();
  stockUnsubscribe = firestore.onSnapshot(firestore.collection(db, "inventory"), (snapshot) => {
    const stockById = new Map(snapshot.docs.map((entry) => [entry.id, entry.data()]));
    stockTableBody.replaceChildren(...categories.map((category) => {
      const stock = stockById.get(category.id) ?? { received: 0, sold: 0 };
      const row = document.createElement("tr");
      const values = [
        category.name,
        Number(stock.received ?? 0),
        Number(stock.sold ?? 0),
        Number(stock.received ?? 0) - Number(stock.sold ?? 0),
      ];
      for (const value of values) {
        const cell = document.createElement("td");
        cell.textContent = String(value);
        row.append(cell);
      }
      return row;
    }));
    setMessage(stockMessage, "");
  }, (error) => {
    console.error("Could not load inventory:", error);
    setMessage(stockMessage, "Inventory could not be loaded. Check your connection or database setup.", true);
  });
}

function stopCamera() {
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

async function recordScan(barcode) {
  const categoryRef = firestore.doc(db, "inventory", activeCategory.id);
  const movementRef = firestore.doc(firestore.collection(db, "movements"));
  const field = activeMode === "stock-in" ? "received" : "sold";

  await firestore.runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(categoryRef);
    const stock = snapshot.exists() ? snapshot.data() : { received: 0, sold: 0 };
    const received = Number(stock.received ?? 0);
    const sold = Number(stock.sold ?? 0);

    if (field === "sold" && received - sold < 1) {
      throw new Error("NO_STOCK_AVAILABLE");
    }

    transaction.set(categoryRef, {
      received: field === "received" ? received + 1 : received,
      sold: field === "sold" ? sold + 1 : sold,
      updatedAt: firestore.serverTimestamp(),
    });
    transaction.set(movementRef, {
      category: activeCategory.id,
      type: field,
      barcode,
      createdAt: firestore.serverTimestamp(),
    });
  });
}

async function onBarcodeDetected(barcode) {
  if (scannerBusy) return;
  scannerBusy = true;
  stopCamera();
  setMessage(scanMessage, activeMode === "stock-in" ? "Adding item to stock…" : "Recording sale…");
  try {
    await recordScan(barcode);
    setMessage(scanMessage, activeMode === "stock-in" ? "Added to stock." : "Sale recorded.");
  } catch (error) {
    if (error.message === "NO_STOCK_AVAILABLE") {
      setMessage(scanMessage, "No items of this category are in stock to sell.", true);
    } else {
      console.error("Could not save barcode scan:", error);
      setMessage(scanMessage, "The scan could not be saved. Check your connection and try again.", true);
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
    const { BrowserMultiFormatReader } = await import("https://esm.sh/@zxing/browser@0.1.5");
    const reader = new BrowserMultiFormatReader();
    cameraControls = await reader.decodeFromVideoDevice(undefined, video, (result) => {
      if (!result) return;
      const now = Date.now();
      if (now - lastScanAt < 1200) return;
      lastScanAt = now;
      void onBarcodeDetected(result.getText());
    });
    video.classList.remove("hidden");
    cameraPlaceholder.classList.add("hidden");
    cameraButton.textContent = "Camera is on";
  } catch (error) {
    stopCamera();
    console.error("Could not start barcode scanner:", error);
    const message = error.name === "NotAllowedError"
      ? "Camera permission was denied. Allow camera access in your browser and try again."
      : error.name === "NotFoundError"
        ? "No camera was found on this device."
        : "Camera or barcode scanner could not start. Open the hosted app over HTTPS and try again.";
    setMessage(scanMessage, message, true);
  }
}

function firebaseIsConfigured() {
  return firebaseConfig.apiKey !== "YOUR_API_KEY"
    && firebaseConfig.projectId !== "YOUR_PROJECT_ID"
    && firebaseConfig.appId !== "YOUR_APP_ID";
}

authSwitch.addEventListener("click", () => {
  registering = !registering;
  renderAuthMode();
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!firebaseIsConfigured()) {
    setMessage(authMessage, "Firebase is not configured yet. Follow the setup steps in README.md.", true);
    return;
  }
  if (!auth) {
    setMessage(authMessage, "Firebase is still connecting. Please try again in a moment.", true);
    return;
  }
  const email = new FormData(authForm).get("email").toString().trim();
  const password = new FormData(authForm).get("password").toString();
  authSubmit.disabled = true;
  setMessage(authMessage, registering ? "Creating your account…" : "Signing in…");
  try {
    if (registering) {
      await firebaseAuth.createUserWithEmailAndPassword(auth, email, password);
    } else {
      await firebaseAuth.signInWithEmailAndPassword(auth, email, password);
    }
  } catch (error) {
    setMessage(authMessage, friendlyAuthError(error), true);
  } finally {
    authSubmit.disabled = false;
  }
});

signOutButton.addEventListener("click", async () => {
  try {
    stopCamera();
    await firebaseAuth.signOut(auth);
  } catch (error) {
    console.error("Could not sign out:", error);
    setMessage(authMessage, "Could not sign out. Please try again.", true);
  }
});

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.action === "stock-view") {
      showView("stock");
      return;
    }
    activeMode = button.dataset.action;
    document.querySelector("#category-mode-label").textContent = activeMode === "stock-in" ? "STOCK IN" : "SALE";
    showView("categories");
  });
});

categoryGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  const category = categories.find((entry) => entry.id === button?.dataset.category);
  if (category) openScanner(category);
});

cameraButton.addEventListener("click", () => void startCamera());

document.querySelectorAll("[data-back]").forEach((button) => {
  button.addEventListener("click", () => {
    stopCamera();
    showView(button.dataset.back);
  });
});

renderCategories();
renderAuthMode();

if (firebaseIsConfigured()) {
  setMessage(authMessage, "Connecting to Firebase…");
  Promise.all([
    import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js"),
  ]).then(([appSdk, authSdk, firestoreSdk]) => {
    firebaseAuth = authSdk;
    firestore = firestoreSdk;
    const firebaseApp = appSdk.initializeApp(firebaseConfig);
    auth = authSdk.getAuth(firebaseApp);
    db = firestoreSdk.getFirestore(firebaseApp);
    authSdk.onAuthStateChanged(auth, (user) => {
      if (user) {
        signOutButton.classList.remove("hidden");
        startStockListener();
        showView("dashboard");
      } else {
        stockUnsubscribe?.();
        stockUnsubscribe = undefined;
        signOutButton.classList.add("hidden");
        stopCamera();
        showView("auth");
      }
    });
  }).catch((error) => {
    console.error("Could not load Firebase:", error);
    setMessage(authMessage, "Firebase could not be loaded. Check your connection and try again.", true);
  });
} else {
  setMessage(authMessage, "Set up Firebase using README.md to enable sign-in and shared inventory.", true);
}
