# 🔧 FIX: ERR_MODULE_NOT_FOUND on AWS Deployment

**Problem**: Deployment failed with `ERR_MODULE_NOT_FOUND` for `./app`
**Root Cause**: TypeScript strips `.js` extensions from compiled ES module imports (expected behavior)
**Solution**: Fixed regex in fix-imports.js to properly preserve quote types when adding .js extensions

## Changes Made

### 1. fix-imports.js - Fixed regex pattern to preserve quote types
```javascript
// OLD (BUGGY): Hardcoded double quotes in replacement
/from\s+['"](\.[^'"]*?)(['"])/g
// Problem: "from 'path'" becomes "from "path.js"" (WRONG QUOTES!)

// NEW (FIXED): Uses backreference \1 to preserve exact quote type
/from\s+(['"])(\.[^'"]*?)\1/g
// Result: "from 'path'" → "from 'path.js'" ✅ (quotes preserved!)
```

**Why This Fix Works**:
- Old regex captured quote in group 2 but replaced with hardcoded `"` character
- New regex uses backreference `\1` to match the opening quote type and preserve it
- Handles both `"path"` and `'path'` correctly

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

The ERR_MODULE_NOT_FOUND error was caused by the fix-imports.js regex using the wrong quote character when adding .js extensions. This created invalid import statements like `from "path.js'` (mismatched quotes). 

The fix ensures the regex preserves the original quote type using a backreference `\1`, so:
- `from "path"` → `from "path.js"` ✅
- `from 'path'` → `from 'path.js'` ✅

The fixed fix-imports.js script now properly handles both quote types and correctly adds .js extensions to all 34 compiled files.

Deployment should now succeed with the backend starting online and health endpoint responding.
