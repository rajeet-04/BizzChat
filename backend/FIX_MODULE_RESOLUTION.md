# 🔧 FIX: ERR_MODULE_NOT_FOUND on AWS Deployment

**Problem**: Deployment failed with `ERR_MODULE_NOT_FOUND` for `./app`
**Root Cause**: TypeScript was stripping `.js` extensions from compiled output
**Solution**: Enable `preserveModuleExtensions` in tsconfig.json + Fixed regex in fix-imports.js

## Changes Made

### 1. tsconfig.json - Added preserveModuleExtensions
```json
{
  "compilerOptions": {
    ...
    "preserveModuleExtensions": true
  }
}
```

**Why**: TypeScript 5.2+ can preserve module extensions when compiling ES modules. This ensures `import app from "./app.js"` stays as `./app.js` in the compiled output instead of being stripped to `./app`.

### 2. fix-imports.js - Fixed regex pattern
```javascript
// OLD (BUGGY): Hardcoded double quotes
/from\s+['"](\.[^'"]*?)(['"])/g
// Result: from "path".js"  ← WRONG!

// NEW (FIXED): Uses backreference to preserve quote type
/from\s+(['"])(\.[^'"]*?)\1/g
// Result: from "path.js" or from 'path.js'  ← CORRECT!
```

**Why**: The regex must capture the quote type used in the original import and preserve it in the replacement.

## Deployment Instructions

### Step 1: SSH into AWS
```bash
cd ~/BizzChat/backend
```

### Step 2: Stop existing process
```bash
pm2 kill
```

### Step 3: Rebuild (with new TypeScript config)
```bash
pnpm run build
```

You should see output like:
```
Processing 34 files...
✓ Fixed: controllers/invoiceController.js
✓ Fixed: controllers/orderController.js
... (all 19 service/controller/middleware files)
✓ Done! Fixed 19 files.
```

### Step 4: Start with PM2
```bash
pm2 start dist/index.js --name bizchat-backend --max-memory-restart 512M
pm2 save
sudo pm2 startup
pm2 status
```

Status should show: `online` ✅

### Step 5: Verify
```bash
# Check logs for any module errors
pm2 logs --lines 50

# Test health endpoint
curl http://localhost:3000/api/health
```

Expected response: `{"status":"ok","timestamp":"2026-04-23T...","services":{"database":"ok","ollama":"..."}}`

## Why This Fix Works

1. **TypeScript now preserves .js extensions** in compiled code
   - `import app from "./app.js"` → `import app from "./app.js"` ✅
   - (Previously: → `import app from "./app"` ❌)

2. **fix-imports.js as safety net** catches any remaining unextended imports
   - Uses corrected regex with proper quote handling
   - Processes all 34 files in dist/ directory

3. **Combined approach is bulletproof**
   - TypeScript config prevents the problem at source
   - Post-build script catches any edge cases

## Verification Checklist

- [ ] `pnpm run build` completes without errors
- [ ] Output shows "✓ Fixed: 19 files"
- [ ] `pm2 status` shows "online"
- [ ] `pm2 logs` shows no `ERR_MODULE_NOT_FOUND` errors
- [ ] `curl http://localhost:3000/api/health` returns HTTP 200
- [ ] Frontend loads at https://bizz-chat-frontend.vercel.app
- [ ] No socket connection errors in browser console

## If Issues Persist

### Check compiled output
```bash
head -5 dist/index.js
# Should show: import app from "./app.js";
```

### Check for remaining unextended imports
```bash
grep -r 'from.*[^.js]"' dist/ | grep -v '.js' | head -5
# Should return nothing (all imports have .js)
```

### View full logs
```bash
pm2 logs --lines 200
```

### Last resort: Manual rebuild
```bash
rm -rf dist node_modules
pnpm install
pnpm run build
pm2 restart bizchat-backend
pm2 logs --lines 50
```

---

## Summary

The ERR_MODULE_NOT_FOUND error was caused by TypeScript stripping `.js` extensions from the compiled output. This is now fixed by:

1. Adding `preserveModuleExtensions: true` to tsconfig.json (TypeScript 5.2+)
2. Fixing the regex in fix-imports.js to properly handle both quote types
3. Running the complete deployment sequence to rebuild with new config

The deployment should now succeed with the backend starting online and health endpoint responding.
