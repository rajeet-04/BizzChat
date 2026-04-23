# Quick Start: AWS Deployment (Copy-Paste Ready)

## Step 1: Deploy (5 minutes)
```bash
cd ~/BizzChat/backend && pm2 kill && pnpm install && pnpm run build && mkdir -p logs && pm2 start dist/index.js --name bizchat-backend --max-memory-restart 512M && pm2 save && sudo pm2 startup
```

## Step 2: Verify (1 minute)
```bash
pm2 status && pm2 logs --lines 20 && curl http://localhost:3000/api/health
```

## Expected Results:
- `pm2 status` → shows "online"
- Logs → "Server running on http://localhost:3000"
- Health → HTTP 200 with `{"status":"ok",...}`

## Step 3: Monitor (5 minutes)
```bash
pm2 logs
```
Watch for errors. None expected. Ctrl+C to stop.

## Step 4: Test Frontend
Open https://bizz-chat-frontend.vercel.app → no errors in browser console

---

## If Anything Goes Wrong:
```bash
pm2 logs --lines 100  # See what failed
pm2 kill              # Stop everything
cd ~/BizzChat/backend && pnpm run build  # Rebuild
pm2 start dist/index.js --name bizchat-backend --max-memory-restart 512M  # Restart
```

---

## What Changed:
✅ Health endpoint: lightweight, always returns 200  
✅ Imports: auto-fixed to include `.js` extensions  
✅ PM2: auto-restarts on crash/memory limit  
✅ Socket.IO: proxied through Vercel HTTPS  
✅ Error handling: graceful shutdown with auto-restart

---

**All code built and verified locally. Ready to deploy!**
