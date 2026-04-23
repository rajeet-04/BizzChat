// whatsapp-web.js and puppeteer are CJS-only packages.
// In Node.js ESM, CJS modules must be imported as default then destructured.
import wwebjs from "whatsapp-web.js";
import type { Client as WWebClient } from "whatsapp-web.js";
const { Client, LocalAuth } = wwebjs;
import puppeteerPkg from "puppeteer";
const puppeteer = puppeteerPkg;
import { getIO } from "./socketService";
import { log, logError } from "../middlewares/logger";
import fs from "fs";
import path from "path";
import { execSync, exec } from "child_process";
import { promisify } from "util";
const execAsync = promisify(exec);
import * as ollamaService from "./ollamaService";
import { storage } from "./storageService";

interface WASession {
  client: WWebClient;
  status: "connecting" | "connected" | "disconnected";
  orgId: string; // mutable — updated by remapSession after QR auth
}

/**
 * Per-org, per-sender message buffer.
 * Key format: `orgId:senderId`
 *
 * Each entry collects all messages from one customer and fires the extraction
 * job after BUFFER_DELAY_MS of silence (debounce). This ensures the AI sees
 * the full conversation context — product name, quantity, price — rather than
 * extracting each message in isolation which would produce partial/wrong orders.
 */
const BUFFER_DELAY_MS = 3_000; // 3 seconds of silence → dispatch extraction job (was 5s)

interface MessageBuffer {
  senderName: string;
  messages: { sender: string; text: string }[];
  timer: ReturnType<typeof setTimeout>;
}

const messageBuffers = new Map<string, MessageBuffer>();

// Store active sessions in memory
export const sessions = new Map<string, WASession>();
// Attach to global for diagnostic routes
(global as any).waSessions = sessions;

/**
 * Delete ALL stale Chromium singleton lock files left behind by a crashed or
 * redeployed Railway container. Chromium stores these in the Chrome user-data
 * directory and refuses to launch if they exist from a different host/PID.
 *
 * We use `find -delete` so we catch locks in any subdirectory
 * (e.g. session-{orgId}/, session-{orgId}/Default/, etc.) rather than
 * hard-coding a single path that might be wrong.
 */
function clearChromiumLocks(orgId: string): void {
  const authDataPath = process.env.NODE_ENV === "production"
    ? "/app/backend/.wwebjs_auth"
    : ".wwebjs_auth";

  // ── Method 1: Shell `find` — catches ALL nesting depths & path variations ──
  try {
    if (fs.existsSync(authDataPath)) {
      execSync(`find "${authDataPath}" -name "Singleton*" -delete 2>/dev/null; true`, {
        timeout: 5000,
        stdio: "pipe",
      });
      log("Cleared stale Chromium singleton locks (find)", "info");
    }
  } catch (e) {
    logError(`clearChromiumLocks (find): ${e}`, "whatsapp");
  }

  // ── Method 2: Direct delete — belt-and-suspenders fallback ──
  const sessionDir = path.join(authDataPath, `session-${orgId}`);
  const lockFiles = ["SingletonLock", "SingletonCookie", "SingletonSocket"];
  for (const lockFile of lockFiles) {
    for (const dir of [sessionDir, path.join(sessionDir, "Default")]) {
      const filePath = path.join(dir, lockFile);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          log(`Removed stale lock: ${path.relative(authDataPath, filePath)}`, "info");
        }
      } catch (_) { /* non-fatal */ }
    }
  }
}

/**
 * Aggressively delete Chromium's disposable cache and temp files.
 * This runs every 30 minutes to ensure the Railway 500MB volume doesn't fill up.
 */
export async function cleanupChromiumCache(): Promise<void> {
  const authDataPath = process.env.NODE_ENV === "production" ? "/app/backend/.wwebjs_auth" : ".wwebjs_auth";

  try {
    // 1. NUCLEAR CLEANUP: If volume is 95% full, we need to delete EVERYTHING that isn't a session secret
    // We keep 'session-X' folders but delete their internal 'Cache', 'Media', etc.
    if (fs.existsSync(authDataPath)) {
      // Delete all top-level files and transient folders
      execSync(`find "${authDataPath}" -maxdepth 2 -type d \( -name "Cache" -o -name "Code Cache" -o -name "GPUCache" -o -name "Service Worker" -o -name "blob_storage" \) -exec rm -rf {} + 2>/dev/null`);
      
      // Delete old session folders that are no longer active
      const files = fs.readdirSync(authDataPath);
      for (const file of files) {
        if (file.startsWith("session-")) {
          const sOrgId = file.replace("session-", "");
          if (!sessions.has(sOrgId)) {
            // Check if it's been modified in the last 24h. If not, delete it.
            const stats = fs.statSync(path.join(authDataPath, file));
            const ageDays = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);
            if (ageDays > 1) {
              fs.rmSync(path.join(authDataPath, file), { recursive: true, force: true });
              log(`Purged abandoned session: ${file}`, "info");
            }
          }
        }
      }
    }

    // 2. Clear Puppeteer temp profiles
    execSync('rm -rf /tmp/puppeteer_dev_profile-* 2>/dev/null');
    execSync('rm -rf /tmp/chromium-cache-* 2>/dev/null');

    log("Agressive storage purge completed.", "info");
  } catch (err) {
    logError("Storage cleanup failed", err);
  }
}

// Automatically run cleanup every 30 minutes
setInterval(cleanupChromiumCache, 30 * 60 * 1000);
// Run once on startup
setTimeout(cleanupChromiumCache, 10000);

export function getStatus(orgId: string): string {
  return sessions.get(orgId)?.status ?? "disconnected";
}

export function getAllSessions(): { orgId: string; status: string }[] {
  return Array.from(sessions.entries()).map(([orgId, s]) => ({
    orgId,
    status: s.status,
  }));
}

/**
 * Move an active WhatsApp session from one orgId to another.
 * Also updates session.orgId so the message handler closure picks up the new value.
 */
export function remapSession(fromOrgId: string, toOrgId: string): boolean {
  if (fromOrgId === toOrgId) return true;
  const session = sessions.get(fromOrgId);
  if (!session) {
    log(`remapSession: no session found for ${fromOrgId}`, "info");
    return false;
  }
  session.orgId = toOrgId; // ← message handler reads this dynamically
  sessions.set(toOrgId, session);
  sessions.delete(fromOrgId);
  log(`WhatsApp session remapped ${fromOrgId} → ${toOrgId}`, "info");
  return true;
}


/**
 * Scans the .wwebjs_auth directory and automatically reconnects any saved sessions.
 * This ensures WhatsApp stays active after server restarts without re-scanning QR.
 */
export async function autoReconnectSessions(): Promise<void> {
  const authDataPath = process.env.NODE_ENV === "production"
    ? "/app/backend/.wwebjs_auth"
    : ".wwebjs_auth";

  if (!fs.existsSync(authDataPath)) return;

  try {
    const dirs = fs.readdirSync(authDataPath);
    const sessionIds = dirs
      .filter(d => d.startsWith("session-"))
      .map(d => d.replace("session-", ""));

    log(`Found ${sessionIds.length} saved WhatsApp sessions. Reconnecting...`, "info");
    
    // Connect them sequentially to avoid CPU spikes during startup
    for (const orgId of sessionIds) {
      try {
        connectWhatsApp(orgId);
        // Small delay between starts
        await new Promise(r => setTimeout(r, 2000));
      } catch (err) {
        logError(`Failed to auto-reconnect WhatsApp for ${orgId}`, err);
      }
    }
  } catch (err) {
    logError("Error during WhatsApp auto-reconnect scan", err);
  }
}

export function connectWhatsApp(orgId: string): void {
  const io = getIO();
  
  try {
    const existing = sessions.get(orgId);
    if (existing) {
      if (existing.status !== "disconnected") {
        log(`WhatsApp session for ${orgId} already ${existing.status}`, "info");
        return;
      }
      try { existing.client.destroy(); } catch (_) {}
      sessions.delete(orgId);
    }

    // Clean Chromium cache asynchronously so it doesn't block browser launch
    cleanupChromiumCache().catch(() => {});
    clearChromiumLocks(orgId);

    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath();
    log(`Using Chrome at: ${executablePath}`, "info");

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: orgId,
      dataPath: process.env.NODE_ENV === "production" ? "/app/backend/.wwebjs_auth" : ".wwebjs_auth",
    }),
    webVersionCache: {
      type: "local",
    },
    authTimeoutMs: 0, 
    puppeteer: {
      headless: "new",
      executablePath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    },
  });

  const session: WASession = { client, status: "connecting", orgId };
  sessions.set(orgId, session);

  log(`[WA] Initializing client for ${orgId}...`, "whatsapp");
  io.to(orgId).emit("wa:status", { message: "Launching browser engine..." });

  // Crash Recovery: If the browser dies, update status so the user can reconnect
  client.on("disconnected", (reason) => {
    logError(`[WA] Browser process died/disconnected: ${reason}`, "whatsapp");
    session.status = "disconnected";
    sessions.delete(orgId);
  });

  // All event handlers READ session.orgId (not the closure `orgId`)
  // so that remapSession() instantly redirects messages to the correct org.
  client.on("qr", (qr: string) => {
    log(`[WA] QR generated for org ${session.orgId}`, "whatsapp");
    io.to(session.orgId).emit("wa:qr", qr);
  });

  client.on("authenticated", () => {
    log(`WhatsApp authenticated for org ${session.orgId}`, "info");
    io.to(session.orgId).emit("wa:authenticated");
  });

  client.on("ready", () => {
    session.status = "connected";
    log(`WhatsApp ready for org ${session.orgId}`, "info");

    const businessInfo = {
      name: client.info.pushname || "Business",
      phone: client.info.wid.user,
      connected: true,
      connectedAt: new Date().toISOString(),
    };

    log(`Business info extracted for ${session.orgId}: ${businessInfo.name} (${businessInfo.phone})`, "info");
    io.to(session.orgId).emit("wa:ready", businessInfo);
  });

  // --- Zero-Drop Message Listening ---
  // We use both 'message' and 'message_create' for maximum compatibility.
  const processedMessageIds = new Set<string>();

  const handleRawMessage = async (msg: any) => {
    if (processedMessageIds.has(msg.id.id)) return;
    processedMessageIds.add(msg.id.id);
    if (processedMessageIds.size > 1000) processedMessageIds.delete(processedMessageIds.values().next().value!);

    const currentOrgId = session.orgId;
    try {
      // 1. Fast Pattern Filtering
      const isSelf = msg.from === msg.to;
      if (msg.fromMe && !isSelf) return;

      const allowedTypes = ["chat", "image", "video", "document"];
      if (!allowedTypes.includes(msg.type)) return;
      if (msg.from.endsWith("@g.us")) return;

      // 2. Identity Resolution
      let senderName = msg.from.split("@")[0]; 
      try {
        const contact = await msg.getContact();
        senderName = contact.pushname || contact.name || senderName;
      } catch (_) {}
      
      log(`[WA] New message detected from ${senderName} (Type: ${msg.type})`, "whatsapp");
      io.to(currentOrgId).emit("wa:message_received", { senderName });

      // 3. Extraction Pipeline
      const bufferKey = `${currentOrgId}:${msg.from}`;
      const newMessage = { sender: senderName, text: (msg.body || "").trim() };

      const flushBuffer = async (bKey: string) => {
        const buffered = messageBuffers.get(bKey);
        if (!buffered) return;
        messageBuffers.delete(bKey);
        const fOrgId = session.orgId;
        try {
          const catalog = await storage.getCatalog(fOrgId);
          io.to(fOrgId).emit("wa:extraction_started", { senderName: buffered.senderName });
          
          log(`[WA] Sending ${buffered.messages.length} messages to AI for ${buffered.senderName}...`, "whatsapp");
          const order = await ollamaService.extractOrderFromChat(buffered.messages, catalog);
          
          order.customer_phone = bKey.split(":").slice(1).join(":").split("@")[0];
          if (!order.customer_name || order.customer_name === "Customer") {
            order.customer_name = buffered.senderName;
          }

          const saved = await storage.addChatOrder(fOrgId, order);
          log(`[WA] Order successfully saved for ${buffered.senderName}`, "whatsapp");

          io.to(fOrgId).emit("order:new", {
            id: saved.id,
            customerName: buffered.senderName,
            itemCount: saved.items?.length ?? 0,
            items: (saved.items ?? []).slice(0, 2).map((i: any) => i.product_name || i.name),
            total: saved.total ?? null,
            createdAt: new Date().toISOString(),
          });
        } catch (err: any) {
          logError(`[WA] Extraction pipeline failed for ${buffered.senderName}: ${err}`, "whatsapp");
          io.to(fOrgId).emit("wa:extraction_failed", { 
            senderName: buffered.senderName, 
            error: String(err.message || err) 
          });
        }
      };

      const existing = messageBuffers.get(bufferKey);
      if (existing) {
        clearTimeout(existing.timer);
        existing.messages.push(newMessage);
        existing.timer = setTimeout(() => flushBuffer(bufferKey), BUFFER_DELAY_MS);
      } else {
        messageBuffers.set(bufferKey, {
          senderName,
          messages: [newMessage],
          timer: setTimeout(() => flushBuffer(bufferKey), BUFFER_DELAY_MS)
        });
      }
    } catch (err) {
      logError(`[WA] Raw message handler error: ${err}`, "whatsapp");
    }
  };

  client.on("message", handleRawMessage);
  client.on("message_create", handleRawMessage);

  // --- Socket Heartbeat ---
  const heartbeatId = setInterval(() => {
    if (session.status === "connected") {
      io.to(session.orgId).emit("wa:heartbeat", { t: Date.now() });
    }
  }, 20000);

  client.on("auth_failure", (msg: string) => {
    clearInterval(heartbeatId);
    session.status = "disconnected";
    logError(`WhatsApp auth failure for org ${session.orgId}: ${msg}`, "whatsapp");
    io.to(session.orgId).emit("wa:auth_failure", msg);
  });

  client.on("disconnected", (reason: string) => {
    clearInterval(heartbeatId);
    session.status = "disconnected";
    sessions.delete(session.orgId);
    log(`WhatsApp disconnected for org ${session.orgId}: ${reason}`, "whatsapp");
    io.to(session.orgId).emit("wa:disconnected", reason);
  });

  // Clear stale Chromium lock files before launch.
  // Railway redeploys kill the old container without Chromium cleanup,
  // leaving SingletonLock on the persistent volume. This blocks all future launches.
  clearChromiumLocks(orgId);

  client.initialize().catch((err) => {
    session.status = "disconnected";
    sessions.delete(orgId);
    logError(`WhatsApp init failed for org ${orgId}: ${err}`, "whatsapp");
    io.to(orgId).emit("wa:error", { message: "Failed to initialize WhatsApp browser." });
  });

  } catch (err) {
    logError(`Critical error in connectWhatsApp for ${orgId}`, err);
    io.to(orgId).emit("wa:error", { message: String(err) });
  }
}

export async function disconnectWhatsApp(orgId: string): Promise<void> {
  const session = sessions.get(orgId);
  sessions.delete(orgId);

  if (!session) return;

  // Step 1: Logout from WhatsApp servers — removes this device from phone's Linked Devices
  try {
    await session.client.logout();
    log(`WhatsApp logged out for org ${orgId}`, "info");
  } catch (err) {
    logError(`Error logging out WA client for ${orgId}: ${err}`, "whatsapp");
  }

  // Step 2: Destroy the browser process
  try {
    await session.client.destroy();
  } catch (err) {
    logError(`Error destroying WA client for ${orgId}: ${err}`, "whatsapp");
  }

  // Step 3: Delete saved session files so next connect generates a fresh QR
  const dataPath = process.env.NODE_ENV === "production"
    ? "/app/backend/.wwebjs_auth"
    : ".wwebjs_auth";
  const sessionDir = path.join(dataPath, `session-${orgId}`);
  try {
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      log(`Session files deleted for org ${orgId}`, "info");
    }
  } catch (err) {
    logError(`Error deleting session files for ${orgId}: ${err}`, "whatsapp");
  }
}
