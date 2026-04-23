#!/usr/bin/env node

/**
 * Quick smoke test to verify dist/index.js can actually be imported
 * This simulates what PM2 will try to do on AWS
 */

import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

try {
  console.log("📋 Testing compiled backend...");
  console.log("🔍 Attempting to import dist/index.js...");
  
  // Try to dynamically import the compiled entry point
  // This will catch any module resolution errors immediately
  const indexPath = path.join(__dirname, "dist", "index.js");
  console.log(`📂 Path: ${indexPath}`);
  
  // Check if file exists
  import("fs").then(fs => {
    const exists = fs.existsSync(indexPath);
    if (!exists) {
      console.error("❌ FAILED: dist/index.js does not exist");
      process.exit(1);
    }
    console.log("✓ dist/index.js exists");
    
    // Try importing it (don't run it, just check for import errors)
    import("./dist/index.js").then(() => {
      console.log("✓ dist/index.js imports successfully (server would start here)");
      console.log("✓ All compiled modules resolved correctly");
      console.log("✅ SMOKE TEST PASSED - Ready for AWS deployment");
      process.exit(0);
    }).catch(err => {
      console.error("❌ FAILED: Error importing dist/index.js");
      console.error("Error:", err.message);
      if (err.code === "ERR_MODULE_NOT_FOUND") {
        console.error("This is a missing .js extension error");
      }
      process.exit(1);
    });
  }).catch(err => {
    console.error("❌ FAILED:", err.message);
    process.exit(1);
  });
  
} catch (err) {
  console.error("❌ Smoke test failed:", err.message);
  process.exit(1);
}
