/**
 * Central place for all runtime configuration.
 *
 * Production (Vercel):
 *   - API_BASE_URL = "" → relative paths, Vercel proxy → /api/* → Backend (52.66.154.194)
 *   - SOCKET_URL = window.location.origin (https://bizz-chat-frontend.vercel.app)
 *       → Vercel edge proxies /socket.io/* to Backend (52.66.154.194)
 *       → Everything is HTTPS from browser perspective, avoiding mixed-content errors
 *
 * Local dev:
 *   - Both use Vite proxy which forwards requests to localhost:3000
 *   - Requires both `pnpm dev:frontend` and `pnpm dev:backend` to run.
 */

// HTTP API calls: proxy handles /api/* routing directly in both dev and prod
export const API_BASE_URL: string = "";

// Socket.IO: Use Vercel proxy in production, direct connection in local dev
export const SOCKET_URL: string = window.location.hostname === "localhost" 
  ? "http://localhost:3000" 
  : window.location.origin;
