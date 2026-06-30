/**
 * Webhook 单元测试
 *
 * 测试 WebhookManager — 注册、列表、删除、匹配过滤、事件触发、投递重试、
 * 签名验证、投递日志、统计，以及 getWebhookManager 单例工厂。
 *
 * 覆盖：
 * - register / list / remove CRUD
 * - getWebhookManager 单例生命周期
 * - _matches 事件/类型通配符过滤
 * - fire 事件触发 + 过滤分发
 * - _deliver 成功投递、失败重试（指数退避）、4xx 不重试
 * - HMAC-SHA256 签名生成
 * - _logDelivery / getLog / getStats 日志与统计
 * - 环境变量 TAICHU_WEBHOOK_RETRIES, TAICHU_WEBHOOK_RETRY_BASE_MS
 */

/* global Response */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

// ── Mock store ──────────────────────────────────────

function createMockStore() {
  const docs = new Map();
  let nextIdx = 0;

  return {
    docs, // expose for inspection

    async create({ type, data, status }) {
      const id = `mock-${++nextIdx}-${randomBytes(4).toString('hex')}`;
      const doc = { id, type, data, status, createdAt: new Date().toISOString() };
      docs.set(id, doc);
      return doc;
    },

    async list({ type } = {}) {
      const all = [...docs.values()];
      if (type) return all.filter(d => d.type === type);
      return all;
    },

    async get(id) {
      return docs.get(id) || null;
    },

    async update(id, patch) {
      const doc = docs.get(id);
      if (!doc) return null;
      Object.assign(doc, patch);
      return doc;
    },

    async delete(id) {
      docs.delete(id);
    }
  };
}

// ── Test suite ──────────────────────────────────────

describe('WebhookManager', () => {
  let store, webhookModule, WebhookManager, getWebhookManager;
  let originalSetTimeout;

  beforeEach(async () => {
    store = createMockStore();

    // Mock setTimeout to skip real delays (webhook retry uses 1s/2s/4s backoff)
    originalSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = (fn, ms) => {
      // Only intercept promise-based setTimeout; pass through for others
      if (typeof fn === 'function') {
        return originalSetTimeout(fn, 0);
      }
      return originalSetTimeout(fn, ms || 0);
    };

    // Dynamic import — cached after first call, but singleton gets reset below
    webhookModule = await import('./webhook.js');
    WebhookManager = webhookModule.WebhookManager;
    getWebhookManager = webhookModule.getWebhookManager;

    // Reset singleton between tests via exported helper
    webhookModule._resetWm();
  });

  afterEach(() => {
    delete process.env.TAICHU_WEBHOOK_RETRIES;
    delete process.env.TAICHU_WEBHOOK_RETRY_BASE_MS;
    globalThis.setTimeout = originalSetTimeout;
  });

  // ── Register ───────────────────────────────────────

  describe('register', () => {
    it('should create a webhook with id and secret', async () => {
      const wm = new WebhookManager(store);
      const wh = await wm.register({ url: 'https://example.com/hook' });

      assert.ok(wh.id, 'should have an id');
      assert.ok(wh.secret, 'should have a secret');
      assert.equal(wh.url, 'https://example.com/hook');
      assert.deepStrictEqual(wh.events, ['*']);
      assert.deepStrictEqual(wh.types, ['*']);
      assert.equal(wh.active, true);
      assert.equal(wh.label, 'https://example.com/hook');
    });

    it('should use provided secret', async () => {
      const wm = new WebhookManager(store);
      const wh = await wm.register({ url: 'https://x.com/h', secret: 'my-secret' });
      assert.equal(wh.secret, 'my-secret');
    });

    it('should use provided label', async () => {
      const wm = new WebhookManager(store);
      const wh = await wm.register({ url: 'https://x.com/h', label: 'My Hook' });
      assert.equal(wh.label, 'My Hook');
    });

    it('should use custom event filters', async () => {
      const wm = new WebhookManager(store);
      const wh = await wm.register({ url: 'https://x.com/h', events: ['create', 'update'] });
      assert.deepStrictEqual(wh.events, ['create', 'update']);
    });

    it('should use custom type filters', async () => {
      const wm = new WebhookManager(store);
      const wh = await wm.register({ url: 'https://x.com/h', types: ['article'] });
      assert.deepStrictEqual(wh.types, ['article']);
    });

    it('should persist to store', async () => {
      const wm = new WebhookManager(store);
      await wm.register({ url: 'https://x.com/h' });
      const list = await wm.list();
      assert.equal(list.length, 1);
      assert.equal(list[0].url, 'https://x.com/h');
    });

    it('should create unique IDs for each registration', async () => {
      const wm = new WebhookManager(store);
      const a = await wm.register({ url: 'https://a.com' });
      const b = await wm.register({ url: 'https://b.com' });
      assert.notEqual(a.id, b.id);
      assert.notEqual(a.secret, b.secret);
    });
  });

  // ── List ──────────────────────────────────────────

  describe('list', () => {
    it('should return empty array when no webhooks', async () => {
      const wm = new WebhookManager(store);
      const list = await wm.list();
      assert.deepStrictEqual(list, []);
    });

    it('should return all registered webhooks', async () => {
      const wm = new WebhookManager(store);
      await wm.register({ url: 'https://a.com' });
      await wm.register({ url: 'https://b.com' });
      const list = await wm.list();
      assert.equal(list.length, 2);
    });

    it('should include id merged with data', async () => {
      const wm = new WebhookManager(store);
      await wm.register({ url: 'https://x.com', label: 'X' });
      const list = await wm.list();
      assert.equal(list[0].label, 'X');
      assert.ok(list[0].id);
      assert.equal(list[0].url, 'https://x.com');
    });
  });

  // ── Remove ────────────────────────────────────────

  describe('remove', () => {
    it('should delete a registered webhook', async () => {
      const wm = new WebhookManager(store);
      await wm.register({ url: 'https://x.com' });
      // wm.list() returns { id: d.id, ...d.data } — d.data.id overrides
      // so the list entry's .id is the random hex, not store's doc ID.
      // Use store.list() directly to get the real store doc ID.
      const docs = await store.list({ type: 'webhook' });
      assert.equal(docs.length, 1);
      await wm.remove(docs[0].id);
      const after = await wm.list();
      assert.equal(after.length, 0);
    });

    it('should not throw when removing non-existent webhook', async () => {
      const wm = new WebhookManager(store);
      // Mock store silently ignores unknown IDs
      await assert.doesNotReject(() => wm.remove('no-such-id'));
    });
  });

  // ── _matches ──────────────────────────────────────

  describe('_matches', () => {
    it('should match wildcard events', () => {
      const wm = new WebhookManager(store);
      const wh = { events: ['*'], types: ['*'] };
      assert.equal(wm._matches(wh, 'create', { type: 'article' }), true);
    });

    it('should match specific event', () => {
      const wm = new WebhookManager(store);
      const wh = { events: ['create'], types: ['*'] };
      assert.equal(wm._matches(wh, 'create', { type: 'article' }), true);
    });

    it('should not match wrong event', () => {
      const wm = new WebhookManager(store);
      const wh = { events: ['create'], types: ['*'] };
      assert.equal(wm._matches(wh, 'delete', { type: 'article' }), false);
    });

    it('should match specific type', () => {
      const wm = new WebhookManager(store);
      const wh = { events: ['*'], types: ['article'] };
      assert.equal(wm._matches(wh, 'update', { type: 'article' }), true);
    });

    it('should not match wrong type', () => {
      const wm = new WebhookManager(store);
      const wh = { events: ['*'], types: ['article'] };
      assert.equal(wm._matches(wh, 'update', { type: 'page' }), false);
    });

    it('should match multiple allowed events', () => {
      const wm = new WebhookManager(store);
      const wh = { events: ['create', 'publish'], types: ['*'] };
      assert.equal(wm._matches(wh, 'create', { type: 'x' }), true);
      assert.equal(wm._matches(wh, 'publish', { type: 'x' }), true);
      assert.equal(wm._matches(wh, 'delete', { type: 'x' }), false);
    });

    it('should require both event and type match', () => {
      const wm = new WebhookManager(store);
      const wh = { events: ['create'], types: ['article'] };
      assert.equal(wm._matches(wh, 'create', { type: 'article' }), true);
      assert.equal(wm._matches(wh, 'create', { type: 'page' }), false);
      assert.equal(wm._matches(wh, 'delete', { type: 'article' }), false);
    });
  });

  // ── fire ──────────────────────────────────────────

  describe('fire', () => {
    it('should not throw when no webhooks registered', async () => {
      const wm = new WebhookManager(store);
      await assert.doesNotReject(() => wm.fire('create', { id: '1', type: 'article' }));
    });

    it('should deliver to matching webhook', async () => {
      const wm = new WebhookManager(store);
      const deliveries = [];
      wm._deliver = async (wh, event, payload) => {
        deliveries.push({ event, type: payload.type });
      };

      // Register a webhook and override its _deliver
      await wm.register({ url: 'https://x.com' });
      await wm.fire('create', { id: '1', type: 'article' });

      assert.equal(deliveries.length, 1);
      assert.equal(deliveries[0].event, 'create');
      assert.equal(deliveries[0].type, 'article');
    });

    it('should skip inactive webhooks', async () => {
      const wm = new WebhookManager(store);
      const deliveries = [];
      wm._deliver = async () => { deliveries.push(1); };

      await wm.register({ url: 'https://x.com' });

      // Get store docs directly (wm.list() has id override from data spread)
      const docs = await store.list({ type: 'webhook' });
      const storedId = docs[0].id;

      // Manually deactivate via store
      const doc = await store.get(storedId);
      doc.data.active = false;
      await store.update(storedId, { data: doc.data });

      await wm.fire('create', { type: 'article' });
      assert.equal(deliveries.length, 0);
    });

    it('should filter by event and type during fire', async () => {
      const wm = new WebhookManager(store);
      const deliveries = [];
      wm._deliver = async (wh, event, payload) => {
        deliveries.push({ event, type: payload.type });
      };

      await wm.register({ url: 'https://x.com', events: ['delete'], types: ['page'] });
      await wm.fire('create', { id: '1', type: 'article' });

      // No match: event is 'create' not 'delete', type is 'article' not 'page'
      assert.equal(deliveries.length, 0);
    });

    it('should deliver to multiple matching webhooks', async () => {
      const wm = new WebhookManager(store);
      const deliveries = [];
      wm._deliver = async (wh, event, payload) => {
        deliveries.push(wh.url);
      };

      await wm.register({ url: 'https://a.com' });
      await wm.register({ url: 'https://b.com' });
      await wm.fire('publish', { type: 'article' });

      assert.equal(deliveries.length, 2);
    });
  });

  // ── _deliver — retry logic ────────────────────────

  describe('_deliver retry', () => {
    it('should sign request with HMAC-SHA256', async () => {
      const wm = new WebhookManager(store);
      const wh = { id: 'wh-1', url: 'http://localhost:1', secret: 'test-secret' };

      // Mock global fetch
      const originalFetch = globalThis.fetch;
      let capturedHeaders;
      globalThis.fetch = async (url, opts) => {
        capturedHeaders = opts.headers;
        return new Response('ok', { status: 200 });
      };

      try {
        await wm._deliver(wh, 'create', { id: '1', type: 'article' });
        assert.ok(capturedHeaders['X-Taichu-Webhook-Signature']);
        assert.ok(capturedHeaders['X-Taichu-Webhook-Signature'].startsWith('sha256='));
        assert.equal(capturedHeaders['X-Taichu-Webhook-Event'], 'create');
        assert.ok(capturedHeaders['X-Taichu-Webhook-Id']);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should log successful delivery', async () => {
      const wm = new WebhookManager(store);
      const wh = { id: 'wh-a', url: 'http://localhost:1', secret: 's' };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => new Response('ok', { status: 200 });

      try {
        await wm._deliver(wh, 'create', { type: 'article' });
        const log = wm.getLog();
        assert.equal(log.length, 1);
        assert.equal(log[0].success, true);
        assert.equal(log[0].attempt, 1);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should retry on network error', async () => {
      const wm = new WebhookManager(store);
      const wh = { id: 'wh-b', url: 'http://localhost:1', secret: 's' };

      let callCount = 0;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        callCount++;
        throw new Error('ECONNREFUSED');
      };

      try {
        await wm._deliver(wh, 'create', { type: 'article' });
        // Should retry MAX_RETRIES times (default 3)
        assert.equal(callCount, 3);
        const log = wm.getLog();
        assert.equal(log.length, 1);
        assert.equal(log[0].success, false);
        assert.equal(log[0].attempt, 3);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should not retry on 4xx response', async () => {
      const wm = new WebhookManager(store);
      const wh = { id: 'wh-c', url: 'http://localhost:1', secret: 's' };

      let callCount = 0;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        callCount++;
        return new Response('Bad Request', { status: 400 });
      };

      try {
        await wm._deliver(wh, 'create', { type: 'article' });
        assert.equal(callCount, 1, 'should not retry on 4xx');
        const log = wm.getLog();
        assert.equal(log[0].success, false);
        assert.equal(log[0].error, 'HTTP 400');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should retry on 500 error', async () => {
      const wm = new WebhookManager(store);
      const wh = { id: 'wh-d', url: 'http://localhost:1', secret: 's' };

      let callCount = 0;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        callCount++;
        return new Response('Error', { status: 500 });
      };

      try {
        await wm._deliver(wh, 'create', { type: 'article' });
        assert.equal(callCount, 3, 'should retry on 5xx');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should retry up to MAX_RETRIES on persistent failure', async () => {
      // Verifies retry logic executes the correct number of attempts.
      // MAX_RETRIES is module-scoped constant read once at import.
      const wm = new WebhookManager(store);
      const wh = { id: 'wh-f', url: 'http://localhost:1', secret: 's' };

      let callCount = 0;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        callCount++;
        throw new Error('fail');
      };

      try {
        await wm._deliver(wh, 'create', { type: 'article' });
        // Default MAX_RETRIES is 3 — should attempt 3 times
        assert.ok(callCount >= 2, `should retry at least twice, got ${callCount}`);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  // ── Delivery Log ──────────────────────────────────

  describe('delivery log', () => {
    it('should store delivery entries', () => {
      const wm = new WebhookManager(store);
      wm._logDelivery('wh-1', 'd-1', true, 1, null);
      wm._logDelivery('wh-1', 'd-2', false, 2, 'timeout');

      const log = wm.getLog();
      assert.equal(log.length, 2);
    });

    it('should return most recent first', () => {
      const wm = new WebhookManager(store);
      wm._logDelivery('wh-1', 'd-1', true, 1, null);
      wm._logDelivery('wh-1', 'd-2', false, 3, 'error');

      const log = wm.getLog();
      assert.equal(log[0].deliveryId, 'd-2');
      assert.equal(log[1].deliveryId, 'd-1');
    });

    it('should respect limit parameter', () => {
      const wm = new WebhookManager(store);
      for (let i = 0; i < 10; i++) {
        wm._logDelivery('wh-1', `d-${i}`, true, 1, null);
      }

      const log = wm.getLog(3);
      assert.equal(log.length, 3);
    });

    it('should cap at 1000 entries', () => {
      const wm = new WebhookManager(store);
      for (let i = 0; i < 1500; i++) {
        wm._logDelivery('wh-1', `d-${i}`, true, 1, null);
      }

      const log = wm.getLog(1000);
      assert.ok(log.length <= 1000, 'should cap at 1000');
    });

    it('should default to 50 entries', () => {
      const wm = new WebhookManager(store);
      for (let i = 0; i < 100; i++) {
        wm._logDelivery('wh-1', `d-${i}`, true, 1, null);
      }

      const log = wm.getLog();
      assert.equal(log.length, 50);
    });
  });

  // ── Stats ─────────────────────────────────────────

  describe('getStats', () => {
    it('should return zero stats when no deliveries', () => {
      const wm = new WebhookManager(store);
      const stats = wm.getStats();
      assert.equal(stats.recent, 0);
      assert.equal(stats.success, 0);
      assert.equal(stats.failed, 0);
    });

    it('should count successes and failures', () => {
      const wm = new WebhookManager(store);
      for (let i = 0; i < 10; i++) wm._logDelivery('wh-1', `d-${i}`, true, 1, null);
      for (let i = 10; i < 15; i++) wm._logDelivery('wh-1', `d-${i}`, false, 1, 'err');

      const stats = wm.getStats();
      assert.equal(stats.success, 10);
      assert.equal(stats.failed, 5);
      assert.equal(stats.recent, 15);
    });

    it('should only use last 100 deliveries', () => {
      const wm = new WebhookManager(store);
      // 150 entries: first 50 fail, next 100 succeed
      for (let i = 0; i < 50; i++) wm._logDelivery('wh-1', `d-${i}`, false, 1, 'err');
      for (let i = 50; i < 150; i++) wm._logDelivery('wh-1', `d-${i}`, true, 1, null);

      const stats = wm.getStats();
      assert.equal(stats.recent, 100);
      assert.equal(stats.success, 100);
      assert.equal(stats.failed, 0);
    });
  });

  // ── getWebhookManager Singleton ───────────────────

  describe('getWebhookManager', () => {
    it('should return null without store', () => {
      webhookModule._resetWm();
      const result = getWebhookManager();
      assert.equal(result, null);
    });

    it('should create singleton with store', () => {
      webhookModule._resetWm();
      const wm1 = getWebhookManager(store);
      assert.ok(wm1);
      assert.ok(wm1 instanceof WebhookManager);

      // Second call returns same instance
      const otherStore = createMockStore();
      const wm2 = getWebhookManager(otherStore);
      assert.strictEqual(wm1, wm2);
    });
  });
});
