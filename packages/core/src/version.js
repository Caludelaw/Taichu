/**
 * Version — single source of truth for Taichu CMS version.
 *
 * Reads the project root package.json at startup (zero external dependencies).
 * All modules that report a version MUST use this function.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let _version = null;

/**
 * Get the Taichu CMS version from the root package.json.
 * Result is cached after the first call.
 *
 * @returns {string} version string (e.g. '0.8.0')
 */
export function getTaichuVersion() {
  if (_version) return _version;
  try {
    // Navigate: packages/core/src → packages/core → packages → project root
    const rootPkg = join(__dirname, '..', '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(rootPkg, 'utf-8'));
    _version = pkg.version || '0.0.0';
  } catch {
    _version = '0.0.0';
  }
  return _version;
}
