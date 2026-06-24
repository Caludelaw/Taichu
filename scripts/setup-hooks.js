#!/usr/bin/env node
/**
 * Setup Git Hooks — graceful, safe for deployment.
 */

import { existsSync, readdirSync, writeFileSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const hooksDir = join(__dirname, '..', '.git', 'hooks');
const srcDir = __dirname;

// Graceful — deploy/CI environments won't have .git
if (!existsSync(hooksDir)) {
  console.log('Skipping hooks — no .git directory (deploy/CI)');
  process.exit(0);
}

const hookFiles = readdirSync(srcDir).filter(f => f.endsWith('.sh') || f === 'pre-commit');
let installed = 0;

for (const file of hookFiles) {
  const hookName = file.replace('.sh', '');
  const src = join(srcDir, file).replace(/\\/g, '/');
  const dest = join(hooksDir, hookName);
  try {
    writeFileSync(dest, `#!/usr/bin/env sh\nsh "${src}"\n`);
    chmodSync(dest, 0o755);
    installed++;
  } catch (e) {
    // Silently skip if chmod fails (Windows)
  }
}

if (installed) console.log(`Installed ${installed} Git hook(s)`);
else console.log('No hooks to install');
