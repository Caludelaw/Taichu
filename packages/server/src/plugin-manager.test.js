/**
 * Plugin Manager 单元测试
 *
 * 测试 PluginManager — 插件加载、清单验证、load/loadAll、list/count、
 * 单例工厂 getPluginManager，以及 Plugin API (hook/route)。
 *
 * 覆盖：
 * - PluginManager 构造与初始化
 * - load() 成功加载、缺失 manifest、缺失 name/version、缺失入口、无效导出
 * - load() 重复加载跳过
 * - loadAll() 目录遍历、错误插件跳过
 * - list() / count
 * - getPluginManager() 单例
 * - Plugin API 正确注入（store, hooks, logger, config）
 * - Plugin API.method (hook/route) 正确委托到 hooks system
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TMP = join(__dirname, '..', '..', '.test-plugins');

// ── Helpers ─────────────────────────────────────────

function cleanTmp() {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
}

/**
 * Create a plugin fixture directory.
 * @param {string} name — directory name
 * @param {object|null} manifest — taichu.plugin.json content (null = skip)
 * @param {string|null} source — index.js content (null = skip)
 * @returns {string} path to plugin directory
 */
function setupPlugin(name, manifest, source) {
  const dir = join(TMP, name);
  mkdirSync(dir, { recursive: true });
  if (manifest) {
    writeFileSync(join(dir, 'taichu.plugin.json'), JSON.stringify(manifest, null, 2));
  }
  if (source) {
    writeFileSync(join(dir, 'index.js'), source);
  }
  return dir;
}

/**
 * Create a default valid plugin with default export function.
 */
function setupValidPlugin(name = 'test-plugin', version = '1.0.0') {
  return setupPlugin(name, {
    name,
    version,
    description: 'A test plugin',
    hooks: ['afterCreate'],
    routes: false,
    adminPanel: false,
    permissions: ['content:read']
  }, `export default function(api) { api._called = true; }`);
}

function createMockAPI(overrides = {}) {
  const hooks = {
    handlers: [],
    on(name, fn, priority) {
      this.handlers.push({ name, fn, priority });
    },
    route(method, path, handler) {
      this._routes = this._routes || [];
      this._routes.push({ method, path, handler });
    },
    ...overrides.hooks
  };
  return {
    store: { create() {}, list() {}, get() {}, ...overrides.store },
    hooks,
    logger: { info() {}, warn() {}, error() {}, ...overrides.logger },
    config: { port: 3120, ...overrides.config }
  };
}

beforeEach(cleanTmp);
afterEach(cleanTmp);

// ── PluginManager Tests ─────────────────────────────

describe('PluginManager', () => {
  // ── constructor ────────────────────────────

  describe('constructor', () => {
    it('should initialize with empty plugins map', async () => {
      const { PluginManager } = await import('./plugin-manager.js');
      const pm = new PluginManager();
      assert.equal(pm.count, 0);
      assert.deepEqual(pm.list(), []);
    });
  });

  // ── load() error cases ─────────────────────

  describe('load — errors', () => {
    it('should throw when manifest file is missing', async () => {
      const { PluginManager } = await import('./plugin-manager.js');
      const pm = new PluginManager();
      const dir = setupPlugin('no-manifest', null, 'export default function() {}');
      await assert.rejects(
        () => pm.load(dir, createMockAPI()),
        /manifest not found/
      );
    });

    it('should throw when manifest is missing name', async () => {
      const { PluginManager } = await import('./plugin-manager.js');
      const pm = new PluginManager();
      const dir = setupPlugin('bad-name', { version: '1.0.0' }, 'export default function() {}');
      await assert.rejects(
        () => pm.load(dir, createMockAPI()),
        /must have "name" and "version"/
      );
    });

    it('should throw when manifest is missing version', async () => {
      const { PluginManager } = await import('./plugin-manager.js');
      const pm = new PluginManager();
      const dir = setupPlugin('bad-ver', { name: 'p' }, 'export default function() {}');
      await assert.rejects(
        () => pm.load(dir, createMockAPI()),
        /must have "name" and "version"/
      );
    });

    it('should throw when entry point index.js is missing', async () => {
      const { PluginManager } = await import('./plugin-manager.js');
      const pm = new PluginManager();
      const dir = setupPlugin('no-entry', {
        name: 'no-entry',
        version: '1.0.0'
      }, null); // no index.js
      await assert.rejects(
        () => pm.load(dir, createMockAPI()),
        /entry point not found/
      );
    });

    it('should throw when module does not export a function', async () => {
      const { PluginManager } = await import('./plugin-manager.js');
      const pm = new PluginManager();
      const dir = setupPlugin('no-fn', {
        name: 'no-fn',
        version: '1.0.0'
      }, 'export const foo = 42;');
      await assert.rejects(
        () => pm.load(dir, createMockAPI()),
        /must export a default function/
      );
    });

    it('should throw for named-only export (mod.default||mod returns namespace)', async () => {
      const { PluginManager } = await import('./plugin-manager.js');
      const pm = new PluginManager();
      const dir = setupPlugin('named-only', {
        name: 'named-only',
        version: '1.0.0'
      }, 'export function init() {}');
      await assert.rejects(
        () => pm.load(dir, createMockAPI()),
        /must export a default function/
      );
    });
  });

  // ── load() success cases ──────────────────

  describe('load — success', () => {
    it('should load a valid plugin and register it', async () => {
      const { PluginManager } = await import('./plugin-manager.js');
      const pm = new PluginManager();
      const dir = setupValidPlugin('my-plugin', '2.0.0');

      await pm.load(dir, createMockAPI());

      assert.equal(pm.count, 1);
      const list = pm.list();
      assert.equal(list.length, 1);
      assert.equal(list[0].name, 'my-plugin');
      assert.equal(list[0].version, '2.0.0');
      assert.equal(list[0].description, 'A test plugin');
      assert.deepEqual(list[0].hooks, ['afterCreate']);
      assert.deepEqual(list[0].permissions, ['content:read']);
    });

    it('should call the plugin export function with api', async () => {
      const { PluginManager } = await import('./plugin-manager.js');
      const pm = new PluginManager();
      // Use api.store as shared reference sink — pluginApi copies store ref
      const dir = setupPlugin('call-test', {
        name: 'call-test',
        version: '1.0.0'
      }, `export default function(api) {
        api.store._receivedApi = true;
        api.store._storeOk = !!api.store;
        api.store._hooksOk = !!api.hooks;
        api.store._loggerOk = !!api.logger;
        api.store._configOk = !!api.config;
        api.store._hookFnOk = typeof api.hook === 'function';
        api.store._routeFnOk = typeof api.route === 'function';
      }`);

      const api = createMockAPI();
      await pm.load(dir, api);

      assert.equal(api.store._receivedApi, true);
      assert.equal(api.store._storeOk, true);
      assert.equal(api.store._hooksOk, true);
      assert.equal(api.store._loggerOk, true);
      assert.equal(api.store._configOk, true);
      assert.equal(api.store._hookFnOk, true);
      assert.equal(api.store._routeFnOk, true);
    });

    it('should skip when plugin with same name is already loaded', async () => {
      const { PluginManager } = await import('./plugin-manager.js');
      const pm = new PluginManager();
      const dir = setupValidPlugin('dup', '1.0.0');

      await pm.load(dir, createMockAPI());
      assert.equal(pm.count, 1);

      // Second load should be a no-op
      await pm.load(dir, createMockAPI());
      assert.equal(pm.count, 1);
    });

    it('should inject pluginApi.hook() that delegates to hooks.on()', async () => {
      const { PluginManager } = await import('./plugin-manager.js');
      const pm = new PluginManager();
      const hooksApi = createMockAPI();
      const dir = setupPlugin('hook-test', {
        name: 'hook-test',
        version: '1.0.0'
      }, `export default function(api) {
        api.hook('afterCreate', 'my-handler', 10);
      }`);

      await pm.load(dir, hooksApi);

      assert.equal(hooksApi.hooks.handlers.length, 1);
      assert.equal(hooksApi.hooks.handlers[0].name, 'afterCreate');
      assert.equal(hooksApi.hooks.handlers[0].fn, 'my-handler');
      assert.equal(hooksApi.hooks.handlers[0].priority, 10);
    });

    it('should inject pluginApi.route() that delegates to hooks.route()', async () => {
      const { PluginManager } = await import('./plugin-manager.js');
      const pm = new PluginManager();
      const hooksApi = createMockAPI();
      const dir = setupPlugin('route-test', {
        name: 'route-test',
        version: '1.0.0'
      }, `export default function(api) {
        api.route('GET', '/custom', 'my-route-handler');
      }`);

      await pm.load(dir, hooksApi);

      assert.equal(hooksApi.hooks._routes.length, 1);
      assert.equal(hooksApi.hooks._routes[0].method, 'GET');
      assert.equal(hooksApi.hooks._routes[0].path, '/custom');
      assert.equal(hooksApi.hooks._routes[0].handler, 'my-route-handler');
    });

    it('should load plugin with adminPanel and routes flags', async () => {
      const { PluginManager } = await import('./plugin-manager.js');
      const pm = new PluginManager();
      const dir = setupPlugin('admin-plugin', {
        name: 'admin-plugin',
        version: '3.0.0',
        description: 'Admin tool',
        hooks: [],
        routes: true,
        adminPanel: true,
        permissions: ['admin:full']
      }, 'export default function(api) {}');

      await pm.load(dir, createMockAPI());
      assert.equal(pm.count, 1);
      const list = pm.list();
      assert.deepEqual(list[0].permissions, ['admin:full']);
    });
  });

  // ── loadAll() ───────────────────────────────

  describe('loadAll', () => {
    it('should not throw when plugins directory does not exist', async () => {
      const { PluginManager } = await import('./plugin-manager.js');
      const pm = new PluginManager();
      const noDir = join(TMP, 'nonexistent');
      await pm.loadAll(noDir, createMockAPI());
      assert.equal(pm.count, 0);
    });

    it('should load all plugins from a directory', async () => {
      const { PluginManager } = await import('./plugin-manager.js');
      const pm = new PluginManager();
      setupValidPlugin('p1', '1.0.0');
      setupValidPlugin('p2', '1.0.0');
      setupValidPlugin('p3', '2.0.0');

      await pm.loadAll(TMP, createMockAPI());

      assert.equal(pm.count, 3);
      const names = pm.list().map(p => p.name).sort();
      assert.deepEqual(names, ['p1', 'p2', 'p3']);
    });

    it('should skip subdirectories without manifest', async () => {
      const { PluginManager } = await import('./plugin-manager.js');
      const pm = new PluginManager();
      setupValidPlugin('good', '1.0.0');
      // Directory without manifest
      mkdirSync(join(TMP, 'not-a-plugin'), { recursive: true });

      await pm.loadAll(TMP, createMockAPI());

      assert.equal(pm.count, 1);
      assert.equal(pm.list()[0].name, 'good');
    });

    it('should continue loading other plugins when one fails', async () => {
      const { PluginManager } = await import('./plugin-manager.js');
      const pm = new PluginManager();
      // Broken plugin (no default export → will throw)
      setupPlugin('bad', { name: 'bad', version: '1.0.0' }, 'export const x = 1;');
      // Valid plugin
      setupValidPlugin('good', '1.0.0');

      await pm.loadAll(TMP, createMockAPI());

      // good should still load despite bad failing
      assert.equal(pm.count, 1);
      assert.equal(pm.list()[0].name, 'good');
    });

    it('should skip files (non-directory entries) in plugins dir', async () => {
      const { PluginManager } = await import('./plugin-manager.js');
      const pm = new PluginManager();
      setupValidPlugin('real-plugin', '1.0.0');
      writeFileSync(join(TMP, 'readme.md'), '# Plugins');

      await pm.loadAll(TMP, createMockAPI());

      assert.equal(pm.count, 1);
    });
  });

  // ── list() ──────────────────────────────────

  describe('list', () => {
    it('should return empty array when no plugins loaded', async () => {
      const { PluginManager } = await import('./plugin-manager.js');
      const pm = new PluginManager();
      assert.deepEqual(pm.list(), []);
    });

    it('should return plugin info without internal fields', async () => {
      const { PluginManager } = await import('./plugin-manager.js');
      const pm = new PluginManager();
      const dir = setupValidPlugin('listed', '1.0.0');
      await pm.load(dir, createMockAPI());

      const list = pm.list();
      assert.equal(list.length, 1);
      assert.equal(list[0].name, 'listed');
      assert.equal(list[0].version, '1.0.0');
      // Should not expose internal module or api
      assert.equal('module' in list[0], false);
      assert.equal('api' in list[0], false);
    });

    it('should list all loaded plugins in order', async () => {
      const { PluginManager } = await import('./plugin-manager.js');
      const pm = new PluginManager();
      const p1 = setupValidPlugin('a', '1.0.0');
      const p2 = setupValidPlugin('b', '2.0.0');
      await pm.load(p1, createMockAPI());
      await pm.load(p2, createMockAPI());

      const list = pm.list();
      assert.equal(list.length, 2);
      const names = list.map(p => p.name);
      assert.deepEqual(names, ['a', 'b']);
    });
  });

  // ── count ───────────────────────────────────

  describe('count', () => {
    it('should return 0 for new manager', async () => {
      const { PluginManager } = await import('./plugin-manager.js');
      const pm = new PluginManager();
      assert.equal(pm.count, 0);
    });

    it('should reflect number of loaded plugins', async () => {
      const { PluginManager } = await import('./plugin-manager.js');
      const pm = new PluginManager();
      assert.equal(pm.count, 0);

      await pm.load(setupValidPlugin('c1', '1.0.0'), createMockAPI());
      assert.equal(pm.count, 1);

      await pm.load(setupValidPlugin('c2', '2.0.0'), createMockAPI());
      assert.equal(pm.count, 2);
    });

    it('should not double-count on duplicate load', async () => {
      const { PluginManager } = await import('./plugin-manager.js');
      const pm = new PluginManager();
      const dir = setupValidPlugin('c-dup', '1.0.0');
      await pm.load(dir, createMockAPI());
      await pm.load(dir, createMockAPI());
      assert.equal(pm.count, 1);
    });
  });

  // ── getPluginManager singleton ──────────────

  describe('getPluginManager', () => {
    it('should return a PluginManager instance', async () => {
      const { getPluginManager, PluginManager } = await import('./plugin-manager.js');
      const pm = getPluginManager();
      assert.ok(pm instanceof PluginManager);
    });

    it('should return the same instance (singleton)', async () => {
      const { getPluginManager } = await import('./plugin-manager.js');
      const a = getPluginManager();
      const b = getPluginManager();
      assert.strictEqual(a, b);
    });

    it('should create new instance after reset', async () => {
      const mod = await import('./plugin-manager.js');
      const a = mod.getPluginManager();
      mod._resetPluginManager();
      const b = mod.getPluginManager();
      assert.notStrictEqual(a, b);
      assert.ok(b instanceof mod.PluginManager);
    });
  });
});
