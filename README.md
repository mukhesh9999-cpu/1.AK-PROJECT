# AR FACTIONS inventory

A mobile-friendly inventory app for shirts, pants, track pants, and track shirts. It runs locally in your browser and saves stock totals in that browser's local storage. A local sign-in page gates the inventory on the current browser.

## Run locally

Install dependencies and start the development server:

```powershell
npm install
npm run dev
```

Open the local URL printed by Vite (typically `http://127.0.0.1:5173`). The app opens at `login.html`; use **Create a local account** the first time, then sign in. The dashboard, category selection, and stock overview also work from the local server. Camera scanning requires a supported browser and a secure context, so use the local server for camera access.

## Inventory and privacy

This version does not use Firebase, a server, or cloud storage. Local accounts and inventory stay in browser storage on this device and are not shared across browsers or devices. Passwords are salted and hashed in the browser, but this is only a convenience gate—not secure authentication: someone with access to the device or browser developer tools can bypass it. Clearing browser site data erases the accounts and inventory. Do not use this login to protect sensitive or business-critical data.

Stock-in and sales use the browser's native barcode detection API when available, with the locally installed ZXing library as a fallback for browsers without it. The library is included in the production build and is not fetched from a CDN. Camera access requires browser camera support and a secure context: use `localhost` during development or HTTPS when deployed. This applies to mobile browsers too; opening the HTML as a `file://` URL cannot grant camera access.
