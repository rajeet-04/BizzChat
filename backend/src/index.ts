import http from "http";
import app from "./app";
import { log } from "./middlewares/logger";
import { env } from "./config/env";
import { initSocketServer } from "./services/socketService";
// routes v2 – settings endpoint added


import { autoReconnectSessions } from "./services/whatsappService";

const PORT = env.PORT;

const server = http.createServer(app);
initSocketServer(server);

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
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
