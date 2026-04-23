/**
 * Singleton Socket.IO instance shared across the entire app.
 *
 * Usage:
 *   initSocket(orgId)  — called once from useOrderNotifications (app shell)
 *   getSocket()        — returns the existing socket from any page/hook
 */
import { io, Socket } from "socket.io-client";
import { SOCKET_URL } from "./config";

let _socket: Socket | null = null;
let _orgId: string | null = null;

/** Initialize or return the existing socket for this orgId. */
export function initSocket(orgId: string): Socket {
  if (_socket && _orgId === orgId && _socket.connected) return _socket;

  // Disconnect stale socket (different orgId or disconnected)
  if (_socket) {
    _socket.disconnect();
    _socket = null;
  }

  const isProd = import.meta.env.PROD;
  
  _socket = io(SOCKET_URL, {
    query: { orgId, v: Date.now() }, // Cache-bust version
    // In production, force polling first because Vercel edge proxy doesn't support WSS upgrades.
    transports: isProd ? ["polling"] : ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
  });
  _orgId = orgId;
  return _socket;
}

/** Get the current socket (null if not yet initialized). */
export function getSocket(): Socket | null {
  return _socket;
}

/** Disconnect and clear — call on logout. */
export function disconnectSocket(): void {
  if (_socket) {
    _socket.disconnect();
    _socket = null;
    _orgId = null;
  }
}
