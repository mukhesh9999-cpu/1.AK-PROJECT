# Thread & Needle inventory

A mobile-friendly inventory app for four clothing categories. It uses Firebase Email/Password Authentication, Cloud Firestore, and Firebase Hosting. It can be embedded in a Google Site after deployment.

## Set up Firebase

1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com/).
2. In **Project settings**, add a Web app and copy its Firebase configuration into `firebase-config.js`. The web config is public; do not put service-account keys in this app.
3. In **Authentication → Sign-in method**, enable **Email/Password**.
4. In **Firestore Database**, create a database. Choose a location appropriate for your store.
5. Install the Firebase CLI, sign in, and select your project:

   ```powershell
   npm install -g firebase-tools
   firebase login
   firebase use --add
   ```

6. Publish the Firestore security rules and website:

   ```powershell
   firebase deploy --only firestore:rules,hosting
   ```

Firebase prints the public Hosting URL after deployment, usually `https://YOUR_PROJECT_ID.web.app`. Use that URL to open the app directly or embed it in Google Sites with **Insert → Embed → URL**.

## Google Sites and camera access

Camera scanning requires HTTPS and the browser's camera permission. Allow camera access when prompted. If the Google Sites embed does not grant camera permission to the embedded page, open the Firebase Hosting URL directly in the browser or use an embed code that permits camera access (`allow="camera"`).

The scanner uses the device camera and a barcode decoding library loaded from `esm.sh`. An internet connection is required. Each scan records one unit in the chosen category; scanning the same barcode again records another unit. A sale is rejected when that category has no stock remaining.

## Accounts and inventory access

The app includes open email/password registration as requested. **Every account that registers can access and change the shared inventory.** Only share the app with trusted staff. For a public customer-facing site, replace open registration with staff-only account provisioning before publishing. Firebase security rules prevent bulk counter changes and sales below zero, but they cannot prove that a scan came from a real product; use a trusted server/Cloud Function if stronger inventory auditing is required.

Stock totals are shared by all authenticated users: received, sold, and remaining (`received - sold`) for shirts, pants, track pants, and track shirts. Firestore transactions keep concurrent scans from overwriting one another.

## Local preview

The app uses browser ES modules, Firebase, and camera APIs, so serve it from a local HTTP server rather than opening `index.html` as a file. After configuring Firebase, a simple option is:

```powershell
npx serve .
```

Local camera use generally requires `localhost`; deployed use must use HTTPS.
