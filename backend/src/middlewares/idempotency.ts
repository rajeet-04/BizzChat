import { Request, Response, NextFunction } from "express";
import { log } from "./logger";

const IDEMPOTENCY_TTL_MS = 60 * 60 * 24 * 1000; // 24 hours
const PROCESSING_TTL_MS = 60 * 5 * 1000;         // 5-minute lock while in-flight

interface CachedEntry {
  value: string;
  expiresAt: number;
}

interface CachedResponse {
  status: number;
  body: unknown;
}

// In-memory idempotency store (replaces Redis — sufficient for single-process server)
const store = new Map<string, CachedEntry>();

// Periodically clean up expired entries
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.expiresAt <= now) store.delete(key);
  }
}, 5 * 60 * 1000);

function storeGet(key: string): string | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) { store.delete(key); return null; }
  return entry.value;
}

function storeSet(key: string, value: string, ttlMs: number) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function storeDel(key: string) {
  store.delete(key);
}

/**
 * Idempotency middleware for write endpoints.
 *
 * Clients pass an `Idempotency-Key` header (UUID or any opaque string).
 * The key is scoped per organisation so cross-tenant collisions are impossible.
 *
 * Lifecycle
 * ─────────
 * 1. No key         → pass through (idempotency is opt-in).
 * 2. Key seen (done)→ replay cached response with `X-Idempotent-Replayed: true`.
 * 3. Key in-flight  → return 409 so the client knows to wait and retry.
 * 4. Key unseen     → set a short "processing" lock, run the handler,
 *                     then store the response for 24 h.
 * 5. Handler error  → delete the lock so the client can retry safely.
 */
export const idempotency = async (req: Request, res: Response, next: NextFunction) => {
  const rawKey = req.headers["idempotency-key"] as string | undefined;

  // Idempotency is opt-in; skip if no key is present
  if (!rawKey) return next();

  // Scope key to the authenticated organisation
  const orgId = req.orgId ?? "anon";
  const storeKey = `idempotency:${orgId}:${Buffer.from(rawKey).toString("base64")}`;

  try {
    const existing = storeGet(storeKey);

    if (existing === "processing") {
      return res.status(409).json({
        error: "A request with this Idempotency-Key is already being processed. Retry after it completes.",
        idempotencyKey: rawKey,
      });
    }

    if (existing) {
      const cached: CachedResponse = JSON.parse(existing);
      log(`Replaying idempotent response for key ${rawKey}`, "idempotency");
      res.setHeader("X-Idempotent-Replayed", "true");
      return res.status(cached.status).json(cached.body);
    }

    // First time — lock while processing
    storeSet(storeKey, "processing", PROCESSING_TTL_MS);

    // Intercept res.json to capture and cache the response
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      const statusCode = res.statusCode;
      if (statusCode < 400) {
        const value: CachedResponse = { status: statusCode, body };
        storeSet(storeKey, JSON.stringify(value), IDEMPOTENCY_TTL_MS);
      } else {
        storeDel(storeKey);
      }
      return originalJson(body);
    };

    next();
  } catch (err) {
    log("Idempotency check failed — proceeding without idempotency guarantee", "warn");
    next();
  }
};
