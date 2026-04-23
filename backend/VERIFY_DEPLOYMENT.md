# AWS Lightsail Deployment Verification Checklist

Run these commands on your AWS Lightsail VM to verify the deployment succeeded:

## Step 1: Build & Deploy (5 minutes)
```bash
cd ~/BizzChat/backend
pm2 kill
pnpm install
pnpm run build
mkdir -p logs
pm2 start dist/index.js --name bizchat-backend --max-memory-restart 512M
pm2 save
sudo pm2 startup
```

**Expected output for `pnpm run build`:**
```
✓ Fixed: 19 files
✓ Done!
```

## Step 2: Verify Process Running (immediate)
```bash
pm2 status
```

**Expected: Status column shows `online` (green)**

## Step 3: Check Logs (immediate)
```bash
pm2 logs --lines 50
```

**Expected: Last lines show:**
```
Server running on http://localhost:3000
Environment: production
```

**NOT expected (would indicate failure):**
- `ERR_MODULE_NOT_FOUND`
- `Cannot find module`
- `FATAL:`

## Step 4: Test Health Endpoint (immediate)
```bash
curl http://localhost:3000/api/health
```

**Expected response (HTTP 200):**
```json
{
  "status": "ok",
  "timestamp": "2026-04-23T...",
  "services": {
    "database": "ok",
    "ollama": "unreachable"
  }
}
```

**NOT expected:**
- HTTP 503 error
- Connection refused
- Timeout (>5 seconds)

## Step 5: Monitor Stability (5+ minutes)
```bash
pm2 logs
```

Watch for 5+ minutes. Expected behavior:
- No error messages
- No crashes or restarts
- Consistent health checks from load balancer

## Step 6: Test Socket.IO from Frontend
1. Open https://bizz-chat-frontend.vercel.app in browser
2. Open Browser DevTools (F12) → Console tab
3. Expected: No "Mixed Content" or "WebSocket connection failed" errors
4. Landing page should load normally

---

## If Something Goes Wrong

### Problem: `ERR_MODULE_NOT_FOUND` error
**Solution:** Ensure build ran successfully - should show "✓ Fixed: 19 files"
```bash
cd ~/BizzChat/backend && pnpm run build
```

### Problem: Process shows `error` or `stopped`
**Solution:** Check logs and rebuild
```bash
pm2 logs --lines 100
pm2 kill
pnpm run build
pm2 start dist/index.js --name bizchat-backend --max-memory-restart 512M
```

### Problem: Health endpoint times out
**Solution:** This should not happen (it has 5s timeout built in). If it does, restart:
```bash
pm2 restart bizchat-backend
sleep 2
curl http://localhost:3000/api/health
```

---

**Once all 6 steps pass, your backend is production-ready!**
