#!/usr/bin/env node

/**
 * Comprehensive pre-deployment test
 * Simulates what will happen on AWS Lightsail
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log("🔍 Pre-Deployment Validation\n");

const checks = [];

// Check 1: dist folder exists
try {
  const distExists = fs.existsSync(path.join(__dirname, "dist"));
  if (distExists) {
    console.log("✅ dist/ folder exists");
    checks.push(true);
  } else {
    console.log("❌ dist/ folder missing - need to run build first");
    checks.push(false);
  }
} catch (e) {
  console.log("❌ Error checking dist/:", e.message);
  checks.push(false);
}

// Check 2: dist/index.js exists
try {
  const indexExists = fs.existsSync(path.join(__dirname, "dist", "index.js"));
  if (indexExists) {
    console.log("✅ dist/index.js exists");
    checks.push(true);
  } else {
    console.log("❌ dist/index.js missing");
    checks.push(false);
  }
} catch (e) {
  console.log("❌ Error checking dist/index.js:", e.message);
  checks.push(false);
}

// Check 3: ecosystem.config.js exists and is valid
try {
  const ecoExists = fs.existsSync(path.join(__dirname, "ecosystem.config.js"));
  if (ecoExists) {
    const content = fs.readFileSync(path.join(__dirname, "ecosystem.config.js"), "utf-8");
    if (content.includes("module.exports") && content.includes("bizchat-backend")) {
      console.log("✅ ecosystem.config.js valid");
      checks.push(true);
    } else {
      console.log("❌ ecosystem.config.js missing required config");
      checks.push(false);
    }
  } else {
    console.log("❌ ecosystem.config.js missing");
    checks.push(false);
  }
} catch (e) {
  console.log("❌ Error checking ecosystem.config.js:", e.message);
  checks.push(false);
}

// Check 4: fix-imports.js exists
try {
  const fixExists = fs.existsSync(path.join(__dirname, "fix-imports.js"));
  if (fixExists) {
    console.log("✅ fix-imports.js exists");
    checks.push(true);
  } else {
    console.log("❌ fix-imports.js missing");
    checks.push(false);
  }
} catch (e) {
  console.log("❌ Error checking fix-imports.js:", e.message);
  checks.push(false);
}

// Check 5: All critical dist files have .js extensions in imports
try {
  const criticalFiles = [
    "dist/index.js",
    "dist/app.js",
    "dist/routes/index.js",
  ];
  
  let allGood = true;
  for (const file of criticalFiles) {
    const content = fs.readFileSync(path.join(__dirname, file), "utf-8");
    const importMatches = content.match(/from\s+['"](\.[^'"]*?)['"]]/g);
    if (importMatches) {
      for (const match of importMatches) {
        if (!match.includes(".js") && !match.includes(".json")) {
          allGood = false;
          console.log(`❌ Found import without .js in ${file}: ${match}`);
        }
      }
    }
  }
  
  if (allGood) {
    console.log("✅ All critical files have .js extensions in imports");
    checks.push(true);
  } else {
    checks.push(false);
  }
} catch (e) {
  console.log("❌ Error checking imports:", e.message);
  checks.push(false);
}

// Check 6: package.json has correct build script
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf-8"));
  if (pkg.scripts && pkg.scripts.build === "tsc && node fix-imports.js") {
    console.log("✅ package.json build script correct");
    checks.push(true);
  } else {
    console.log("❌ package.json build script incorrect or missing");
    checks.push(false);
  }
} catch (e) {
  console.log("❌ Error checking package.json:", e.message);
  checks.push(false);
}

// Check 7: tsconfig.json has DOM in lib
try {
  const ts = JSON.parse(fs.readFileSync(path.join(__dirname, "tsconfig.json"), "utf-8"));
  if (ts.compilerOptions && ts.compilerOptions.lib && ts.compilerOptions.lib.includes("DOM")) {
    console.log("✅ tsconfig.json has DOM in lib");
    checks.push(true);
  } else {
    console.log("❌ tsconfig.json missing DOM in lib");
    checks.push(false);
  }
} catch (e) {
  console.log("❌ Error checking tsconfig.json:", e.message);
  checks.push(false);
}

// Summary
console.log(`\n${checks.filter(c => c).length}/${checks.length} checks passed`);

if (checks.every(c => c)) {
  console.log("\n✅ All pre-deployment checks PASSED");
  console.log("Ready for AWS deployment!");
  process.exit(0);
} else {
  console.log("\n❌ Some checks FAILED");
  console.log("Run: pnpm run build");
  process.exit(1);
}
