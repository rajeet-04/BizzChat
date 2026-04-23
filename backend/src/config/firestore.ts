import { initializeApp, cert, getApps, ServiceAccount } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ── Credential resolution (two modes) ────────────────────────────────────────
// 1. Production / Railway → set FIREBASE_SERVICE_ACCOUNT_JSON env var to the
//    raw contents of the service-account JSON file (no file upload needed).
// 2. Local dev → place the JSON file at backend/firebase-service-account.json
let serviceAccount: ServiceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON) as ServiceAccount;
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is set but is not valid JSON");
  }
} else {
  // Fallback: load from file (local dev)
  const filePath = path.resolve(__dirname, "../../firebase-service-account.json");
  serviceAccount = require(filePath) as ServiceAccount;
}

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}

export const firestoreDb = getFirestore();

// settings() can only be called once — guard against vite-node hot-reload re-runs
try {
  firestoreDb.settings({ ignoreUndefinedProperties: true });
} catch {
  // Already initialized — safe to ignore on hot-reload
}
