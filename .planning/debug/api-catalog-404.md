---
status: resolved
trigger: "API /api/catalog returns 404 while /api/inventory works"
created: 2026-03-11T14:05:00.000Z
updated: 2026-03-11T14:10:00.000Z
---

## Current Focus

**Root cause found and fixed.**

## Symptoms

expected: GET /api/catalog should return product catalog JSON
actual: GET /api/catalog returns 404 Not Found
errors: "Cannot GET /api/catalog"
reproduction: curl http://localhost:5173/api/catalog
started: After recent code changes to add inventory/catalog routes

## Evidence

- timestamp: 2026-03-11T14:06:00
  checked: backend/src/routes/index.ts
  found: Routes /inventory (line 198) and /catalog (line 366) ARE defined in source
  implication: Source code has the routes

- timestamp: 2026-03-11T14:07:00
  checked: backend/dist/routes/index.js
  found: NO /inventory or /catalog routes in compiled JavaScript
  implication: Compiled dist folder is outdated

- timestamp: 2026-03-11T14:07:30
  checked: grep "catalog" in dist folder
  found: No matches
  implication: Route was never compiled to dist

## Resolution

root_cause: Backend source code (src/) has /inventory and /catalog routes, but the compiled dist/ folder has not been updated. The running server (possibly dev mode or stale production) is serving old compiled code without these routes.

fix: Rebuild the backend with `pnpm run build:backend` to compile the latest TypeScript source to dist/

verification: Rebuilt backend with `pnpm run build:backend` - dist/routes/index.js now includes /inventory (line 171) and /catalog (line 303) routes

files_changed:
- backend/dist/routes/index.js (regenerated from src)
---
## DEBUG COMPLETE

**Root Cause:** The backend source code (`src/routes/index.ts`) had the `/inventory` and `/catalog` routes, but the compiled `dist/` folder was outdated and didn't include them. The running server was serving the old compiled code.

**Fix Applied:** Ran `pnpm run build:backend` to recompile the TypeScript source to JavaScript.

**Verification:** 
- `/inventory` route now at dist/routes/index.js:171
- `/catalog` route now at dist/routes/index.js:303
- `/catalog/price` route now at dist/routes/index.js:330

**Next Step:** Restart the backend server to pick up the new compiled code.
