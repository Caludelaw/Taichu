#!/usr/bin/env node
/**
 * Setup Git Hooks — install pre-commit hook
 *
 * Usage: node scripts/setup-hooks.js
 *
 * Reads hooks from scripts/ directory and symlinks them into .git/hooks/.
 * Works on Linux/macOS/Windows (Git Bash).
 */

import { symlinkSync, existsSync, unlinkSync, readdirSync, writeFileSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const hooksDir = join(__dirname, '..', '.git', 'hooks');
const srcDir = __dirname;

// Find all .sh files in scripts/
const hookFiles = readdirSync(srcDir)
  .filter(f => f.endsWith('.sh') || f === 'pre-commit');

if (!existsSync(hooksDir)) {
  // Not a git repository (e.g., Docker build, CI), skip silently
  console.log('No .git/hooks directory — skipping hook setup (non-repo environment)');
  process.exit(0);
}

let installed = 0;
for (const file of hookFiles) {
  const hookName = file.replace('.sh', '');
  const src = join(srcDir, file);
  const dest = join(hooksDir, hookName);

  // Remove existing
  if (existsSync(dest)) unlinkSync(dest);

  try {
    // Write wrapper that invokes bash with the script
    const wrapper = `#!/usr/bin/env sh\nsh "${src.replace(/\\/g, '/')}"\n`;
    writeFileSync(dest, wrapper);
    chmodSync(dest, 0o755);
    console.log(`✅ Installed: .git/hooks/${hookName}`);
    installed++;
  } catch (e) {
    // Fallback: copy the script directly
    try {
      writeFileSync(dest, `#!/usr/bin/env sh\nsh "${src.replace(/\\/g, '/')}"\n`);
      chmodSync(dest, 0o755);
      console.log(`✅ Installed: .git/hooks/${hookName}`);
      installed++;
    } catch (e2) {
      console.error(`❌ Failed to install ${hookName}: ${e2.message}`);
    }
  }
}

console.log(`\n🎉 Installed ${installed} Git hook(s). Pre-commit checks active.`);
