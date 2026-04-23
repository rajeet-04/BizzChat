import { Server as SocketServer } from "socket.io";
import type { Server as HttpServer } from "http";
import { log } from "../middlewares/logger";

let io: SocketServer;

export function getIO(): SocketServer {
  if (!io) throw new Error("Socket.io not initialised — call initSocketServer first");
  return io;
}

export function initSocketServer(httpServer: HttpServer) {
  const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "https://bizz-chat-frontend.vercel.app",
    ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
  ];

  io = new SocketServer(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"],
      credentials: true,
    },
    // Short ping interval so polling requests last ≤8s — safe for Vercel edge proxy
    // (default 25s would exceed proxy timeout, causing ERR_NAME_NOT_RESOLVED loops)
    pingInterval: 8000,
    pingTimeout: 5000,
    transports: ["polling", "websocket"],
  });

  io.on("connection", (socket) => {
    const orgId = socket.handshake.query.orgId as string | undefined;
    if (orgId) {
      socket.join(orgId);
      log(`Socket ${socket.id} joined room ${orgId}`, "info");
    }

    socket.on("disconnect", () => {
      log(`Socket ${socket.id} disconnected`, "info");
    });
  });

  log("Socket.io server initialised", "info");
}
