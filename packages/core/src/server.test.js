/**
 * Server module tests — health, rate limiter, revisions, audit, pipeline
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

// ════════════════════════════════════════════════════════════
// Health Check
// ════════════════════════════════════════════════════════════

describe('Health Check', () => {
  it('livenessCheck returns ok with system info', async () => {
    const { livenessCheck } = await import('../../server/src/health.js');
    const result = livenessCheck(
      { version: '0.7.0', nodeEnv: 'test', storage: 'memory' },
      () => ({ connections: 3 })
    );
    assert.equal(result.status, 'ok');
    assert.equal(result.name, 'taichu');
    assert.equal(result.version, '0.7.0');
    assert.equal(result.env, 'test');
    assert.equal(result.store, 'memory');
    assert.ok(typeof result.uptime === 'number');
    assert.ok(result.uptime >= 0);
    assert.ok(result.memory.rss);
    assert.ok(result.memory.heapUsed);
    assert.equal(result.ws.connections, 3);
    assert.ok(result.timestamp);
  });

  it('readinessCheck returns ready when store is healthy', async () => {
    const { readinessCheck } = await import('../../server/src/health.js');
    const healthyStore = { count: async () => 42 };

    const result = await readinessCheck(healthyStore);
    assert.equal(result.status, 'ready');
    assert.equal(result.checks.store, 'ok');
  });

  it('readinessCheck returns not_ready when store throws', async () => {
    const { readinessCheck } = await import('../../server/src/health.js');
    const brokenStore = { count: async () => { throw new Error('connection lost'); } };

    const result = await readinessCheck(brokenStore);
    assert.equal(result.status, 'not_ready');
    assert.ok(result.checks.store.startsWith('error:'));
    assert.ok(result.checks.store.includes('connection lost'));
  });

  it('readinessCheck returns not_ready when store times out', async () => {
    const { readinessCheck } = await import('../../server/src/health.js');
    const slowStore = { count: async () => new Promise(() => { /* never resolves */ }) };

    const result = await readinessCheck(slowStore, { timeout: 50 });
    assert.equal(result.status, 'not_ready');
    assert.ok(result.checks.store.includes('timed out'));
  });
});

// ════════════════════════════════════════════════════════════
// Rate Limiter
// ════════════════════════════════════════════════════════════

describe('RateLimiter', () => {
  it('should allow requests within limit', async () => {
    const { rateLimit } = await import('../../server/src/middleware/rate-limit.js');
    // Create a mock ctx
    const ctx = { req: { headers: {}, socket: { remoteAddress: '127.0.0.1' } }, res: { writeHead() {}, end() {} }, url: new URL('http://localhost/test') };
    // First requests should pass
    for (let i = 0; i < 5; i++) {
      assert.equal(rateLimit(ctx), true);
    }
  });

  it('should track by IP', async () => {
    const { rateLimit } = await import('../../server/src/middleware/rate-limit.js');
    const ctx = { req: { headers: {}, socket: { remoteAddress: '10.0.0.1' } }, res: { writeHead() {}, end() {} }, url: new URL('http://localhost/test') };
    assert.equal(rateLimit(ctx), true);
  });
});

// ════════════════════════════════════════════════════════════
// Revisions & Diff
// ════════════════════════════════════════════════════════════

describe('Revisions', () => {
  it('should diff two objects', async () => {
    const { diffObjects } = await import('../../server/src/revisions.js');
    const changes = diffObjects(
      { title: 'Old', body: 'same' },
      { title: 'New', body: 'same' }
    );
    assert.equal(changes.length, 1);
    assert.equal(changes[0].field, 'title');
    assert.equal(changes[0].from, 'Old');
    assert.equal(changes[0].to, 'New');
  });

  it('should detect added fields', async () => {
    const { diffObjects } = await import('../../server/src/revisions.js');
    const changes = diffObjects(
      { title: 'Same' },
      { title: 'Same', body: 'new field' }
    );
    assert.equal(changes.length, 1);
    assert.equal(changes[0].field, 'body');
  });

  it('should return empty for identical objects', async () => {
    const { diffObjects } = await import('../../server/src/revisions.js');
    const changes = diffObjects({ a: 1, b: [2] }, { a: 1, b: [2] });
    assert.equal(changes.length, 0);
  });
});

// ════════════════════════════════════════════════════════════
// Pipeline Engine
// ════════════════════════════════════════════════════════════

describe('PipelineEngine', () => {
  it('should list built-in templates', async () => {
    const { TEMPLATES } = await import('../../server/src/pipeline.js');
    assert.ok(TEMPLATES.translation);
    assert.ok(TEMPLATES.seo);
    assert.ok(TEMPLATES.review);
    assert.equal(Object.keys(TEMPLATES).length, 3);
  });

  it('should have correct step counts', async () => {
    const { TEMPLATES } = await import('../../server/src/pipeline.js');
    assert.equal(TEMPLATES.translation.steps.length, 4);
    assert.equal(TEMPLATES.seo.steps.length, 5);
    assert.equal(TEMPLATES.review.steps.length, 2);
  });
});

// ════════════════════════════════════════════════════════════
// Review Policy
// ════════════════════════════════════════════════════════════

describe('ReviewPolicy', () => {
  it('should approve non-agent content', async () => {
    const { ReviewPolicy } = await import('../../server/src/pipeline.js');
    const policy = new ReviewPolicy({ requireHumanReview: true });
    const result = policy.evaluate({ data: { title: 'test' } });
    assert.equal(result.approved, true);
  });

  it('should block agent content when requireHumanReview is true', async () => {
    const { ReviewPolicy } = await import('../../server/src/pipeline.js');
    const policy = new ReviewPolicy({ requireHumanReview: true });
    const result = policy.evaluate({ data: { title: 'test' }, _meta: { createdBy: { type: 'agent' } } });
    assert.equal(result.approved, false);
  });

  it('should allow agent content without review requirement', async () => {
    const { ReviewPolicy } = await import('../../server/src/pipeline.js');
    const policy = new ReviewPolicy({ requireHumanReview: false });
    const result = policy.evaluate({ data: {}, _meta: { createdBy: { type: 'agent' } } });
    assert.equal(result.approved, true);
  });
});

// ════════════════════════════════════════════════════════════
// LLM Providers
// ════════════════════════════════════════════════════════════

describe('LLMProviders', () => {
  it('should list all providers', async () => {
    const { listProviders, createProvider } = await import('../../llm-providers/src/index.js');
    const providers = listProviders();
    assert.ok(providers.includes('qwen'));
    assert.ok(providers.includes('deepseek'));
    assert.ok(providers.includes('ernie'));
    assert.ok(providers.includes('moonshot'));
  });

  it('should create a provider instance', async () => {
    const { createProvider } = await import('../../llm-providers/src/index.js');
    const provider = createProvider('deepseek', { apiKey: 'test-key' });
    assert.equal(provider.defaultModel, 'deepseek-chat');
    assert.ok(provider.baseURL.includes('deepseek.com'));
  });
});

// ════════════════════════════════════════════════════════════
// Auth Provider
// ════════════════════════════════════════════════════════════

describe('AuthProviders', () => {
  it('should list default providers', async () => {
    const { listProviders } = await import('../../server/src/auth-provider.js');
    const providers = listProviders();
    assert.ok(providers.includes('email'));
  });

  it('should register a custom provider', async () => {
    const { registerProvider, getProvider } = await import('../../server/src/auth-provider.js');
    registerProvider('test-provider', { getName: () => 'test-provider' });
    assert.ok(getProvider('test-provider'));
  });
});

// ════════════════════════════════════════════════════════════
// CSRF Protection
// ════════════════════════════════════════════════════════════

describe('CSRF', () => {
  it('should generate unique tokens', async () => {
    const { generateCSRFToken } = await import('../../server/src/middleware/csrf.js');
    const t1 = generateCSRFToken();
    const t2 = generateCSRFToken();
    assert.notEqual(t1, t2);
    assert.ok(t1.length > 20);
  });

  it('should allow GET requests without CSRF token', async () => {
    const { csrfProtection } = await import('../../server/src/middleware/csrf.js');
    const ctx = {
      req: { method: 'GET', headers: {} },
      res: { writeHead() {}, end() {} },
      url: new URL('http://localhost/api/content/article')
    };
    assert.equal(await csrfProtection(ctx), true);
  });

  it('should allow HEAD requests without CSRF token', async () => {
    const { csrfProtection } = await import('../../server/src/middleware/csrf.js');
    const ctx = {
      req: { method: 'HEAD', headers: {} },
      res: { writeHead() {}, end() {} },
      url: new URL('http://localhost/api/content/article')
    };
    assert.equal(await csrfProtection(ctx), true);
  });

  it('should skip CSRF for public API paths', async () => {
    const { csrfProtection } = await import('../../server/src/middleware/csrf.js');
    const ctx = {
      req: { method: 'POST', headers: {} },
      res: { writeHead() {}, end() {} },
      url: new URL('http://localhost/api/auth/login')
    };
    assert.equal(await csrfProtection(ctx), true);
  });

  it('should reject POST without CSRF token', async () => {
    const { csrfProtection } = await import('../../server/src/middleware/csrf.js');
    let writtenStatus = null;
    const ctx = {
      req: { method: 'POST', headers: {} },
      res: {
        writeHead(code) { writtenStatus = code; },
        end() {}
      },
      url: new URL('http://localhost/api/content/article')
    };
    assert.equal(await csrfProtection(ctx), false);
    assert.equal(writtenStatus, 403);
  });

  it('should reject DELETE without CSRF token', async () => {
    const { csrfProtection } = await import('../../server/src/middleware/csrf.js');
    let writtenStatus = null;
    const ctx = {
      req: { method: 'DELETE', headers: {} },
      res: {
        writeHead(code) { writtenStatus = code; },
        end() {}
      },
      url: new URL('http://localhost/api/content/article/a1')
    };
    assert.equal(await csrfProtection(ctx), false);
    assert.equal(writtenStatus, 403);
  });

  it('should reject with mismatched CSRF tokens', async () => {
    const { csrfProtection, generateCSRFToken } = await import('../../server/src/middleware/csrf.js');
    let writtenStatus = null;
    const ctx = {
      req: {
        method: 'POST',
        headers: {
          cookie: `csrf_token=${generateCSRFToken()}`,
          'x-csrf-token': generateCSRFToken()
        }
      },
      res: {
        writeHead(code) { writtenStatus = code; },
        end() {}
      },
      url: new URL('http://localhost/api/content/article')
    };
    assert.equal(await csrfProtection(ctx), false);
    assert.equal(writtenStatus, 403);
  });

  it('should accept with matching CSRF tokens', async () => {
    const { csrfProtection, generateCSRFToken } = await import('../../server/src/middleware/csrf.js');
    const token = generateCSRFToken();
    const ctx = {
      req: {
        method: 'POST',
        headers: {
          cookie: `csrf_token=${token}`,
          'x-csrf-token': token
        }
      },
      res: {
        writeHead() {},
        end() {}
      },
      url: new URL('http://localhost/api/content/article')
    };
    assert.equal(await csrfProtection(ctx), true);
  });

  it('should skip CSRF for non-API paths', async () => {
    const { csrfProtection } = await import('../../server/src/middleware/csrf.js');
    const ctx = {
      req: { method: 'POST', headers: {} },
      res: { writeHead() {}, end() {} },
      url: new URL('http://localhost/admin/settings')
    };
    assert.equal(await csrfProtection(ctx), true);
  });
});
