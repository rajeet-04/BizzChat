import http from "http";
import app from "./app.js";
import { log, logger } from "./middlewares/logger.js";
import { env } from "./config/env.js";
import { closeSocketServer, initSocketServer } from "./services/socketService.js";
import { autoReconnectSessions } from "./services/whatsappService.js";

const PORT = env.PORT;

type RuntimeState = typeof globalThis & {
  __bizchatServer?: http.Server;
  __bizchatErrorCount?: number;
  __bizchatProcessHandlersBound?: boolean;
};

const runtime = globalThis as RuntimeState;

async function closePreviousRuntime(): Promise<void> {
  if (!runtime.__bizchatServer) return;

  try {
    await closeSocketServer();
  } catch (_) {
    // Ignore socket teardown errors during hot-reload.
  }

  await new Promise<void>((resolve) => {
    try {
      runtime.__bizchatServer?.close(() => resolve());
    } catch (_) {
      resolve();
    }
  });
}

await closePreviousRuntime();

const server = http.createServer(app);
initSocketServer(server);
runtime.__bizchatServer = server;

// Track unhandled errors to restart if needed
const MAX_ERRORS_BEFORE_RESTART = 10;
runtime.__bizchatErrorCount ??= 0;

if (!runtime.__bizchatProcessHandlersBound) {
  process.on("uncaughtException", (err) => {
    logger.error({ err }, "FATAL: Uncaught exception");
    runtime.__bizchatErrorCount = (runtime.__bizchatErrorCount ?? 0) + 1;
    if ((runtime.__bizchatErrorCount ?? 0) >= MAX_ERRORS_BEFORE_RESTART) {
      log("Too many errors, exiting for restart by PM2", "error");
      process.exit(1);
    }
  });

  process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "Unhandled rejection");
    runtime.__bizchatErrorCount = (runtime.__bizchatErrorCount ?? 0) + 1;
  });
}

server.listen(PORT, async () => {
  log(`Server running on http://localhost:${PORT}`, "info");
  log(`Environment: ${env.NODE_ENV}`, "info");
  log("Firestore connected — no Redis/BullMQ workers needed", "info");

  // Auto-reconnect saved WhatsApp sessions on startup
  try {
    await autoReconnectSessions();
  } catch (err) {
    log("Startup: WhatsApp auto-reconnect failed (non-fatal)", "info");
  }
});

const shutdown = (signal: string) => {
  log(`${signal} received. Shutting down API...`, "info");
  runtime.__bizchatServer?.close(() => {
    log("Server closed", "info");
    process.exit(0);
  });
  // Force exit after 10 seconds
  setTimeout(() => {
    log("Forced exit after timeout", "warn");
    process.exit(1);
  }, 10000);
};

if (!runtime.__bizchatProcessHandlersBound) {
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  runtime.__bizchatProcessHandlersBound = true;
}
