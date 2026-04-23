import http from "http";
import app from "./app.js";
import { log, logger } from "./middlewares/logger.js";
import { env } from "./config/env.js";
import { initSocketServer } from "./services/socketService.js";
import { autoReconnectSessions } from "./services/whatsappService.js";

const PORT = env.PORT;

const server = http.createServer(app);
initSocketServer(server);

// Track unhandled errors to restart if needed
let errorCount = 0;
const MAX_ERRORS_BEFORE_RESTART = 10;

process.on("uncaughtException", (err) => {
  logger.error({ err }, "FATAL: Uncaught exception");
  errorCount++;
  if (errorCount >= MAX_ERRORS_BEFORE_RESTART) {
    log("Too many errors, exiting for restart by PM2", "error");
    process.exit(1);
  }
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled rejection");
  errorCount++;
});

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
  server.close(() => {
    log("Server closed", "info");
    process.exit(0);
  });
  // Force exit after 10 seconds
  setTimeout(() => {
    log("Forced exit after timeout", "warn");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
