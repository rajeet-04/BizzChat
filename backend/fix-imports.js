#!/usr/bin/env node

/**
 * Post-build script to add .js extensions to ES module imports
 * Fixes ERR_MODULE_NOT_FOUND when using "type": "module" in package.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "dist");

function walkDir(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDir(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(fullPath);
    }
  }
  return files;
}

function fixImportsInFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, "utf-8");
    const originalContent = content;

    // Replace relative imports from "./x" to "./x.js" (but not if already has extension)
    // Pattern: from "relative/path" where relative path doesn't have .js or other extension
    // This captures: from "path" or from 'path'
    content = content.replace(/from\s+(['"])(\.[^'"]*?)\1/g, (match, quote, importPath) => {
      // Skip if it already has an extension (ends with .xxx)
      if (/\.\w+$/.test(importPath)) {
        return match;
      }
      // Add .js extension, preserving the original quote type
      return `from ${quote}${importPath}.js${quote}`;
    });

    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, "utf-8");
      console.log(`✓ Fixed: ${path.relative(distDir, filePath)}`);
      return true;
    }
    return false;
  } catch (err) {
    console.error(`✗ Error in ${filePath}:`, err.message);
    return false;
  }
}

try {
  const files = walkDir(distDir);
  console.log(`Processing ${files.length} files...\n`);
  
  let fixed = 0;
  files.forEach((file) => {
    if (fixImportsInFile(file)) {
      fixed++;
    }
  });

  console.log(`\n✓ Done! Fixed ${fixed} files.`);
} catch (err) {
  console.error("Error:", err.message);
  process.exit(1);
}
