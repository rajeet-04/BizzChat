/**
 * Central place for all runtime configuration.
 *
 * Production (Vercel):
 *   - API_BASE_URL = "" → relative paths, Vercel proxy → /api/* → Backend (52.66.154.194)
 *   - SOCKET_URL = http://52.66.154.194:3000 (direct backend connection)
 *       → Browser connects directly to the backend for WebSocket communication
 *
 * Local dev:
 *   - Both use Vite proxy which forwards requests to localhost:3000
 *   - Requires both `pnpm dev:frontend` and `pnpm dev:backend` to run.
 */

// HTTP API calls: proxy handles /api/* routing directly in both dev and prod
export const API_BASE_URL: string = "";

// Socket.IO: Point directly to the backend server
export const SOCKET_URL: string = window.location.hostname === "localhost" 
  ? "http://localhost:3000" 
  : "http://52.66.154.194:3000";
