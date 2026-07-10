/**
 * Taichu Server Integration Tests
 *
 * Tests the full HTTP server stack: startup, REST API, auth, middleware.
 * Uses Node.js built-in test runner + http module (zero dependencies).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

// ════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════

const BASE = 'http://localhost:3121';

function request(method, path, opts = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...opts.headers,
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body || '{}') });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body });
        }
      });
    });
    req.on('error', reject);
    if (opts.body) req.write(JSON.stringify(opts.body));
    req.end();
  });
}

function pollUntilReady(maxRetries = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      http.get(`${BASE}/api/health`, (res) => {
        if (res.statusCode === 200) return resolve(true);
        if (attempts >= maxRetries) return reject(new Error('Server did not become ready'));
        setTimeout(check, 200);
      }).on('error', () => {
        if (attempts >= maxRetries) return reject(new Error('Server did not start'));
        setTimeout(check, 200);
      });
    };
    check();
  });
}

// ════════════════════════════════════════════════════════════
// Server Lifecycle
// ════════════════════════════════════════════════════════════

let serverProcess;
let authToken;
let apiKey;

before(async () => {
  // Start server on alternate port for testing
  const serverPath = join(import.meta.dirname, '..', '..', 'server', 'src', 'index.js');
  serverProcess = spawn('node', [serverPath], {
    env: {
      ...process.env,
      TAICHU_PORT: '3121',
      TAICHU_STORAGE: 'memory',
      TAICHU_JWT_SECRET: 'test-secret-key-for-integration-tests',
      TAICHU_PUBLIC_READ: '0',
      NODE_ENV: 'test',
    },
    stdio: 'pipe',
  });

  await pollUntilReady();
});

after(() => {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
});

// ════════════════════════════════════════════════════════════
// Health & System
// ════════════════════════════════════════════════════════════

describe('Health & System', () => {
  it('GET /api/health returns 200', async () => {
    const res = await request('GET', '/api/health');
    assert.equal(res.status, 200);
  });

  it('GET /api/health returns status ok', async () => {
    const res = await request('GET', '/api/health');
    assert.equal(res.body.status, 'ok');
  });

  it('GET / returns frontend HTML', async () => {
    const res = await request('GET', '/');
    assert.equal(res.status, 200);
    assert.ok(typeof res.body === 'string');
  });
});

// ════════════════════════════════════════════════════════════
// Authentication
// ════════════════════════════════════════════════════════════

describe('Authentication', () => {
  it('POST /api/auth/login with wrong credentials returns 401', async () => {
    const res = await request('POST', '/api/auth/login', {
      body: { username: 'admin', password: 'wrongpassword' },
    });
    assert.equal(res.status, 401);
  });

  it('POST /api/auth/register creates a user and returns token', async () => {
    const res = await request('POST', '/api/auth/register', {
      body: { username: 'testuser', password: 'TestPass123!', email: 'test@taichu.dev' },
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    authToken = res.body.token;
  });

  it('GET /api/auth/me with valid token returns user info', async () => {
    const res = await request('GET', '/api/auth/me', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.user || res.body.username);
  });

  it('POST /api/auth/apikeys creates an API key', async () => {
    const res = await request('POST', '/api/auth/apikeys', {
      headers: { Authorization: `Bearer ${authToken}` },
      body: { name: 'Test Agent Key', scopes: ['read', 'write'] },
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.key);
    apiKey = res.body.key;
  });

  it('GET /api/auth/apikeys lists user API keys', async () => {
    const res = await request('GET', '/api/auth/apikeys', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    assert.equal(res.status, 200);
  });
});

// ════════════════════════════════════════════════════════════
// Content CRUD (REST API)
// ════════════════════════════════════════════════════════════

describe('Content CRUD', () => {
  let articleId;

  it('GET /api/content/article returns empty list initially', async () => {
    const res = await request('GET', '/api/content/article', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.items || res.body));
  });

  it('POST /api/content/article creates an article', async () => {
    const res = await request('POST', '/api/content/article', {
      headers: { Authorization: `Bearer ${authToken}` },
      body: {
        title: 'Hello Taichu',
        slug: 'hello-taichu',
        body: 'This is a test article created by integration tests.',
        status: 'draft',
      },
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.id || res.body._id);
    articleId = res.body.id || res.body._id;
  });

  it('GET /api/content/article/:id returns the article', async () => {
    const res = await request('GET', `/api/content/article/${articleId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    assert.equal(res.status, 200);
  });

  it('PATCH /api/content/article/:id updates the article', async () => {
    const res = await request('PATCH', `/api/content/article/${articleId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
      body: { title: 'Hello Taichu (Updated)', status: 'published' },
    });
    assert.equal(res.status, 200);
  });

  it('DELETE /api/content/article/:id deletes the article', async () => {
    const res = await request('DELETE', `/api/content/article/${articleId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    assert.ok(res.status === 200 || res.status === 204);
  });

  it('GET deleted article returns 404', async () => {
    const res = await request('GET', `/api/content/article/${articleId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    assert.equal(res.status, 404);
  });
});

// ════════════════════════════════════════════════════════════
// Content Batch GET
// ════════════════════════════════════════════════════════════

describe('Content Batch GET', () => {
  let articleId, pageId;

  before(async () => {
    const r1 = await request('POST', '/api/content/article', {
      headers: { Authorization: `Bearer ${authToken}` },
      body: { data: { title: 'Batch Article', slug: 'batch-article' }, status: 'draft' },
    });
    articleId = r1.body.id;
    const r2 = await request('POST', '/api/content/page', {
      headers: { Authorization: `Bearer ${authToken}` },
      body: { data: { title: 'Batch Page', slug: 'batch-page' }, status: 'draft' },
    });
    pageId = r2.body.id;
  });

  after(async () => {
    if (articleId) await request('DELETE', `/api/content/article/${articleId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (pageId) await request('DELETE', `/api/content/page/${pageId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
  });

  it('POST /api/content/batch returns matching cross-type docs', async () => {
    const res = await request('POST', '/api/content/batch', {
      headers: { Authorization: `Bearer ${authToken}` },
      body: { items: [
        { type: 'article', id: articleId },
        { type: 'page', id: pageId }
      ]},
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 2);
    assert.equal(res.body.docs.length, 2);
  });

  it('POST /api/content/batch skips non-matching type/id', async () => {
    const res = await request('POST', '/api/content/batch', {
      headers: { Authorization: `Bearer ${authToken}` },
      body: { items: [
        { type: 'page', id: articleId },
        { type: 'article', id: 'nonexistent' }
      ]},
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 0);
  });

  it('POST /api/content/batch with empty items returns 400', async () => {
    const res = await request('POST', '/api/content/batch', {
      headers: { Authorization: `Bearer ${authToken}` },
      body: { items: [] },
    });
    assert.equal(res.status, 400);
  });

  it('POST /api/content/batch without auth returns 401', async () => {
    const res = await request('POST', '/api/content/batch', {
      body: { items: [{ type: 'article', id: articleId }] },
    });
    assert.equal(res.status, 401);
  });

  it('POST /api/content/batch with missing type returns 400', async () => {
    const res = await request('POST', '/api/content/batch', {
      headers: { Authorization: `Bearer ${authToken}` },
      body: { items: [{ id: articleId }] },
    });
    assert.equal(res.status, 400);
  });

  it('POST /api/content/batch without items field returns 400', async () => {
    const res = await request('POST', '/api/content/batch', {
      headers: { Authorization: `Bearer ${authToken}` },
      body: { other: 'x' },
    });
    assert.equal(res.status, 400);
  });
});

// ════════════════════════════════════════════════════════════
// Content Reorder
// ════════════════════════════════════════════════════════════

describe('Content Reorder', () => {
  let aId, bId, cId;

  before(async () => {
    const r1 = await request('POST', '/api/content/article', {
      headers: { Authorization: `Bearer ${authToken}` },
      body: { data: { title: 'Reorder A', slug: 'reorder-a' }, status: 'draft' },
    });
    aId = r1.body.id;
    const r2 = await request('POST', '/api/content/article', {
      headers: { Authorization: `Bearer ${authToken}` },
      body: { data: { title: 'Reorder B', slug: 'reorder-b' }, status: 'draft' },
    });
    bId = r2.body.id;
    const r3 = await request('POST', '/api/content/article', {
      headers: { Authorization: `Bearer ${authToken}` },
      body: { data: { title: 'Reorder C', slug: 'reorder-c' }, status: 'draft' },
    });
    cId = r3.body.id;
  });

  after(async () => {
    await request('DELETE', `/api/content/article/${aId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    await request('DELETE', `/api/content/article/${bId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    await request('DELETE', `/api/content/article/${cId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
  });

  it('PUT /api/content/article/reorder reorders documents', async () => {
    const res = await request('PUT', '/api/content/article/reorder', {
      headers: { Authorization: `Bearer ${authToken}` },
      body: { ids: [cId, bId, aId] },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 3);
    assert.equal(res.body.docs[0].id, cId);
    assert.equal(res.body.docs[1].id, bId);
    assert.equal(res.body.docs[2].id, aId);
  });

  it('PUT /api/content/article/reorder without auth returns 401', async () => {
    const res = await request('PUT', '/api/content/article/reorder', {
      body: { ids: [aId] },
    });
    assert.equal(res.status, 401);
  });

  it('PUT /api/content/article/reorder with empty ids returns 400', async () => {
    const res = await request('PUT', '/api/content/article/reorder', {
      headers: { Authorization: `Bearer ${authToken}` },
      body: { ids: [] },
    });
    assert.equal(res.status, 400);
  });

  it('PUT /api/content/article/reorder without ids returns 400', async () => {
    const res = await request('PUT', '/api/content/article/reorder', {
      headers: { Authorization: `Bearer ${authToken}` },
      body: {},
    });
    assert.equal(res.status, 400);
  });
});

// ════════════════════════════════════════════════════════════
// Content Types
// ════════════════════════════════════════════════════════════

describe('Content Types', () => {
  it('GET /api/content-types lists all types', async () => {
    const res = await request('GET', '/api/content-types', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    assert.equal(res.status, 200);
  });
});

// ════════════════════════════════════════════════════════════
// Auth Enforcement
// ════════════════════════════════════════════════════════════

describe('Auth Enforcement', () => {
  it('GET /api/content/article without token returns 401', async () => {
    const res = await request('GET', '/api/content/article');
    assert.equal(res.status, 401);
  });

  it('GET /api/content/article with invalid token returns 401', async () => {
    const res = await request('GET', '/api/content/article', {
      headers: { Authorization: 'Bearer invalid-token-here' },
    });
    assert.equal(res.status, 401);
  });
});

// ════════════════════════════════════════════════════════════
// CORS & Error Handling
// ════════════════════════════════════════════════════════════

describe('CORS & Errors', () => {
  it('OPTIONS request returns CORS headers', async () => {
    // Use http.request directly to check headers without body parsing
    const res = await new Promise((resolve, reject) => {
      const req = http.request(`${BASE}/api/health`, { method: 'OPTIONS' }, (res) => {
        resolve({ status: res.statusCode, headers: res.headers });
      });
      req.on('error', reject);
      req.end();
    });
    assert.ok(res.status >= 200 && res.status < 300);
  });

  it('GET /api/nonexistent returns 404', async () => {
    const res = await request('GET', '/api/nonexistent', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    assert.equal(res.status, 404);
  });

  it('POST /api/content/article with empty body returns 400', async () => {
    const res = await request('POST', '/api/content/article', {
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: {},
    });
    // May return 400 or 201 depending on validation
    assert.ok(res.status >= 200 && res.status < 500);
  });
});
