// Worker process — no longer needed (Firestore replaces Redis/BullMQ).
// File kept to avoid breaking any existing npm scripts that reference it.
import "./config/env";
import { log } from "./middlewares/logger";
log("Worker process is deprecated. All extraction is handled inline via Firestore.", "worker");
