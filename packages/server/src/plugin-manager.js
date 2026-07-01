/**
 * Plugin System — 扩展协议与沙箱
 *
 * Taichu 插件基于标准 npm 包 + manifest.json 声明。
 *
 * 插件清单 (taichu.plugin.json):
 * {
 *   "name": "@taichu/plugin-seo",
 *   "version": "1.0.0",
 *   "description": "SEO optimization plugin for Taichu",
 *   "hooks": ["afterCreate", "afterUpdate"],
 *   "routes": false,
 *   "adminPanel": false,
 *   "permissions": ["content:read", "content:write"]
 * }
 *
 * 插件代码 (index.js):
 * export default function(api) {
 *   api.hook('afterCreate', async (doc) => {
 *     await api.logger.info('SEO: optimizing', { id: doc.id });
 *   });
 * }
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createLogger } from './logger.js';

const log = createLogger('plugin');

/**
 * @typedef {object} PluginManifest
 * @property {string} name
 * @property {string} version
 * @property {string} description
 * @property {string[]} hooks
 * @property {boolean} routes
 * @property {boolean} adminPanel
 * @property {string[]} permissions
 */

/**
 * @typedef {object} PluginAPI
 * @property {object} store       — Taichu Store instance
 * @property {object} hooks       — Hook system
 * @property {object} logger      — Plugin-specific logger
 * @property {object} config      — App config
 */

export class PluginManager {
  constructor() {
    /** @type {Map<string, { manifest: PluginManifest, module: any, api: PluginAPI }>} */
    this.plugins = new Map();
  }

  /**
   * Load a plugin from a directory.
   * @param {string} pluginPath — path to plugin directory (must contain taichu.plugin.json)
   * @param {PluginAPI} api
   */
  async load(pluginPath, api) {
    const manifestPath = join(pluginPath, 'taichu.plugin.json');
    if (!existsSync(manifestPath)) {
      throw new Error(`Plugin manifest not found: ${manifestPath}`);
    }

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    if (!manifest.name || !manifest.version) {
      throw new Error('Plugin manifest must have "name" and "version"');
    }

    if (this.plugins.has(manifest.name)) {
      log.warn(`Plugin "${manifest.name}" already loaded, skipping`);
      return;
    }

    log.info(`Loading plugin: ${manifest.name} v${manifest.version}`);

    // Import plugin module
    const modulePath = join(pluginPath, 'index.js');
    if (!existsSync(modulePath)) {
      throw new Error(`Plugin entry point not found: ${modulePath}`);
    }

    const url = pathToFileURL(modulePath).href;
    const mod = await import(url);
    const pluginFn = mod.default || mod;

    if (typeof pluginFn !== 'function') {
      throw new Error(`Plugin "${manifest.name}" must export a default function`);
    }

    // Build plugin API
    const pluginApi = {
      store: api.store,
      hooks: api.hooks,
      logger: createLogger(`plugin:${manifest.name}`),
      config: api.config,
      /** Register a hook handler */
      hook(name, fn, priority) {
        api.hooks.on(name, fn, priority);
      },
      /** Register a custom REST route handler */
      route(method, path, handler) {
        api.hooks.route(method, path, handler);
      }
    };

    // Execute plugin
    await pluginFn(pluginApi);

    this.plugins.set(manifest.name, { manifest, module: mod, api: pluginApi });
    log.info(`Plugin loaded: ${manifest.name}`);
  }

  /**
   * Load all plugins from a directory.
   */
  async loadAll(pluginsDir, api) {
    if (!existsSync(pluginsDir)) return;

    const { readdirSync } = await import('node:fs');
    const entries = readdirSync(pluginsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pluginPath = join(pluginsDir, entry.name);
        const manifestPath = join(pluginPath, 'taichu.plugin.json');
        if (existsSync(manifestPath)) {
          try {
            await this.load(pluginPath, api);
          } catch (err) {
            log.error(`Failed to load plugin "${entry.name}": ${err.message}`);
          }
        }
      }
    }
  }

  /** List loaded plugins */
  list() {
    return Array.from(this.plugins.values()).map(p => ({
      name: p.manifest.name,
      version: p.manifest.version,
      description: p.manifest.description,
      hooks: p.manifest.hooks,
      permissions: p.manifest.permissions
    }));
  }

  /** Get plugin count */
  get count() {
    return this.plugins.size;
  }
}

// ── Singleton ──────────────────────────────────────────────

let _pm = null;

export function getPluginManager() {
  if (!_pm) _pm = new PluginManager();
  return _pm;
}

/** @internal Reset singleton — for tests only */
export function _resetPluginManager() {
  _pm = null;
}
