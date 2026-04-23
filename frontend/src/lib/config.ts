/**
 * Central place for all runtime configuration.
 *
 * Production (Vercel):
 *   - API_BASE_URL = "" → relative paths, Vercel proxy → /api/* → Railway
 *   - SOCKET_URL = window.location.origin (bizchatv2.vercel.app)
 *       → Vercel edge proxies /socket.io/* to Railway with 8s ping intervals
 *       → Browser NEVER needs to resolve bizchat-backend-production.up.railway.app DNS
/**
 * Central place for all runtime configuration.
 *
 * Production (Vercel):
 *   - API_BASE_URL = "" → relative paths, Vercel proxy → /api/* → Railway
 *   - SOCKET_URL = window.location.origin (bizchatv2.vercel.app)
 *       → Vercel edge proxies /socket.io/* to Railway with 8s ping intervals
 *       → Browser NEVER needs to resolve bizchat-backend-production.up.railway.app DNS
 *
 * Local dev:
 *   - Both use Vite proxy which forwards requests to localhost:3000
 *   - Requires both `pnpm dev:frontend` and `pnpm dev:backend` to run.
 */

// HTTP API calls: proxy handles /api/* routing directly in both dev and prod
export const API_BASE_URL: string = "";

// Socket.IO: Point DIRECTLY to Railway to bypass Vercel's proxy which blocks WebSockets.
// This resolves the 'wss://... failed' error seen in the browser console.
export const SOCKET_URL: string = window.location.hostname === "localhost" 
  ? "http://52.66.154.194:3000" 
  : "https://bizchat-backend-production.up.railway.app";
