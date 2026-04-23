# AWS Deployment - One-Page Checklist

## Pre-Deployment (Local - Already Done ✅)
- [x] Code compiled successfully
- [x] All 19 files auto-fixed with .js extensions  
- [x] Syntax validated
- [x] Smoke tested
- [x] Documentation created

## Deployment (5 minutes - Run on AWS)
```bash
cd ~/BizzChat/backend
pm2 kill && pnpm install && pnpm run build && mkdir -p logs
pm2 start dist/index.js --name bizchat-backend --max-memory-restart 512M
pm2 save && sudo pm2 startup
```

## Verify (1 minute - Run on AWS)
```bash
pm2 status
pm2 logs --lines 20
curl http://localhost:3000/api/health
```

## Expected Output
```
pm2 status:        status "online" (green)
pm2 logs:          "Server running on http://localhost:3000"
curl response:     HTTP 200 + JSON with "status": "ok"
```

## Monitor (5+ minutes - Run on AWS)
```bash
pm2 logs
# Watch for no errors, no crashes
# Ctrl+C to stop
```

## Test Frontend (2 minutes)
1. Open https://bizz-chat-frontend.vercel.app
2. Press F12 → Console tab
3. Expected: No errors
4. Landing page should load

## If Anything Fails
```bash
pm2 logs --lines 100  # See error details
pm2 kill              # Stop everything
pnpm run build        # Rebuild
pm2 start dist/index.js --name bizchat-backend --max-memory-restart 512M
```

---

**Timeline:** ~15 minutes total (5 min build + 5 min verify + 5 min monitor)  
**All code ready:** ✅  
**Ready to deploy:** ✅
