# ──────────────────────────────────────────────────────────────────────────────
# BizChat Backend — Railway Dockerfile
# Uses tsx to run TypeScript directly (avoids ESM module resolution issues)
# ──────────────────────────────────────────────────────────────────────────────
FROM node:20-slim

# Install Chromium for Puppeteer / whatsapp-web.js
RUN apt-get update && apt-get install -y \
    chromium \
    libglib2.0-0 \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

# Tell puppeteer / whatsapp-web.js to use the system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace manifests
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Install ALL deps (tsx is a devDependency)
RUN pnpm install

# Copy backend source
COPY backend/ ./backend/

WORKDIR /app/backend
# Build the app using standard TypeScript compiler (the Morning State way)
RUN pnpm run build

# ─── WhatsApp session persistence ─────────────────────────────────────────────
RUN mkdir -p /app/backend/.wwebjs_auth

# Port for Railway
EXPOSE 3000

# Start the server using the compiled JS
CMD ["node", "--max-old-space-size=256", "dist/index.js"]
