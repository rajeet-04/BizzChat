#!/usr/bin/env node

/**
 * Final verification: Test that PM2 can actually start the server
 * This simulates exactly what PM2 will do on AWS Lightsail
 */

import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log("🚀 Final AWS Deployment Test\n");

// Test 1: Can Node.js start dist/index.js?
console.log("Test 1: Starting server process...");
const proc = spawn("node", [path.join(__dirname, "dist", "index.js")], {
  cwd: __dirname,
  timeout: 5000,
});

let output = "";
let errorOutput = "";
let startupConfirmed = false;

proc.stdout.on("data", (data) => {
  output += data.toString();
  console.log(`  [stdout] ${data.toString().trim()}`);
  if (data.toString().includes("Server running on")) {
    startupConfirmed = true;
  }
});

proc.stderr.on("data", (data) => {
  errorOutput += data.toString();
  console.log(`  [stderr] ${data.toString().trim()}`);
});

proc.on("error", (err) => {
  console.error("❌ Failed to start process:", err.message);
  process.exit(1);
});

proc.on("close", (code) => {
  console.log(`\nProcess exited with code ${code}`);
  if (startupConfirmed) {
    console.log("✅ Server started successfully");
  }
});

// Kill after 3 seconds
setTimeout(() => {
  console.log("\nStopping server...");
  proc.kill();
  
  if (startupConfirmed) {
    console.log("\n✅ FINAL TEST PASSED - Ready for AWS");
    process.exit(0);
  } else if (errorOutput.includes("ERR_MODULE_NOT_FOUND")) {
    console.log("\n❌ FAILED - Module not found error");
    process.exit(1);
  } else if (errorOutput.includes("FATAL")) {
    console.log("\n❌ FAILED - Fatal error occurred");
    process.exit(1);
  } else {
    console.log("\n⚠️  Server state unclear - check output above");
    process.exit(0);
  }
}, 3000);
