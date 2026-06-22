/**
 * @taichu/core — 核心模块测试
 *
 * 运行: node --test packages/core/src/core.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createContentType } from './content-type.js';
import { createMemoryStore } from './store.js';
import { createHookSystem } from './hooks.js';
import { hashPassword, verifyPassword, signJWT, verifyJWT, generateAPIKey, verifyAPIKey, generateResetToken, validateResetToken } from './auth.js';
import { TaichuError, ValidationError, NotFoundError, UnauthorizedError, ForbiddenError, ConflictError } from './errors.js';
import { generateETag, etagMatches, modifiedSince, latestUpdate } from './cache.js';
import { counterInc, histogramObserve, gaugeSet, recordRequest, generateMetrics, resetMetrics, getGauge, getCounter } from './metrics.js';
import { registerAgent, unregisterAgent, agentHeartbeat, discoverAgents, listAgents, getAgent, listTags, listTools, validateCapability, generateAgentId, generateAgentToken } from './agent-marketplace.js';
import { createHmac } from 'node:crypto';

// ════════════════════════════════════════════════════════════
// Content Type
// ════════════════════════════════════════════════════════════

describe('ContentType', () => {
  it('should create a content type with fields', () => {
    const Article = createContentType('article', {
      label: '文章',
      fields: {
        title: { type: 'string', required: true, maxLength: 200 },
        slug:  { type: 'string', required: true },
        tags:  { type: 'array', items: { type: 'string' } }
      }
    });

    assert.equal(Article.name, 'article');
    assert.equal(Article.label, '文章');
    assert.equal(Object.keys(Article.fields).length, 3);
  });

  it('should validate a valid document', () => {
    const Article = createContentType('article', {
      fields: {
        title: { type: 'string', required: true },
        body:  { type: 'json' }
      }
    });

    const result = Article.validate({ title: 'Hello', body: {} });
    assert.equal(result.valid, true);
  });

  it('should reject missing required fields', () => {
    const Article = createContentType('article', {
      fields: { title: { type: 'string', required: true } }
    });

    const result = Article.validate({});
    assert.equal(result.valid, false);
    assert.equal(result.errors.length, 1);
  });

  it('should validate string maxLength', () => {
    const Article = createContentType('article', {
      fields: { title: { type: 'string', maxLength: 10 } }
    });

    const result = Article.validate({ title: 'this is way too long' });
    assert.equal(result.valid, false);
  });

  it('should validate enum values', () => {
    const Article = createContentType('article', {
      fields: { status: { type: 'enum', values: ['draft', 'published'] } }
    });

    assert.equal(Article.validate({ status: 'draft' }).valid, true);
    assert.equal(Article.validate({ status: 'deleted' }).valid, false);
  });

  it('should export JSON Schema', () => {
    const Article = createContentType('article', {
      label: '文章',
      schemaOrg: 'Article',
      fields: {
        title: { type: 'string', required: true },
        tags:  { type: 'array', items: { type: 'string' } }
      }
    });

    const schema = Article.toJSONSchema();
    assert.equal(schema.title, '文章');
    assert.equal(schema.type, 'object');
    assert.ok(schema.required.includes('title'));
  });
});

// ════════════════════════════════════════════════════════════
// Store (Memory)
// ════════════════════════════════════════════════════════════

describe('MemoryStore', () => {
  it('should create and retrieve a document', async () => {
    const store = createMemoryStore();
    const doc = await store.create({ type: 'article', data: { title: 'Test' } });

    assert.ok(doc.id);
    assert.equal(doc.type, 'article');
    assert.equal(doc.data.title, 'Test');
    assert.equal(doc.status, 'draft');

    const got = await store.get(doc.id);
    assert.equal(got.data.title, 'Test');
  });

  it('should list documents by type', async () => {
    const store = createMemoryStore();
    await store.create({ type: 'article', data: { title: 'A' } });
    await store.create({ type: 'article', data: { title: 'B' } });
    await store.create({ type: 'page',    data: { title: 'C' } });

    const articles = await store.list({ type: 'article' });
    assert.equal(articles.length, 2);

    const pages = await store.list({ type: 'page' });
    assert.equal(pages.length, 1);
  });

  it('should filter by status', async () => {
    const store = createMemoryStore();
    await store.create({ type: 'article', data: { title: 'A' }, status: 'draft' });
    await store.create({ type: 'article', data: { title: 'B' }, status: 'published' });

    const drafts = await store.list({ type: 'article', status: 'draft' });
    assert.equal(drafts.length, 1);
  });

  it('should update a document', async () => {
    const store = createMemoryStore();
    const doc = await store.create({ type: 'article', data: { title: 'Old' } });

    const updated = await store.update(doc.id, { data: { title: 'New' } });
    assert.equal(updated.data.title, 'New');
  });

  it('should delete a document', async () => {
    const store = createMemoryStore();
    const doc = await store.create({ type: 'article', data: {} });

    const deleted = await store.delete(doc.id);
    assert.equal(deleted, true);

    const got = await store.get(doc.id);
    assert.equal(got, null);
  });

  it('should count documents', async () => {
    const store = createMemoryStore();
    await store.create({ type: 'article', data: {} });
    await store.create({ type: 'article', data: {} });
    await store.create({ type: 'page',    data: {} });

    const count = await store.count({ type: 'article' });
    assert.equal(count, 2);
  });
});

// ════════════════════════════════════════════════════════════
// Hook System
// ════════════════════════════════════════════════════════════

describe('HookSystem', () => {
  it('should run registered hooks', async () => {
    const hooks = createHookSystem();
    const calls = [];

    hooks.on('test', async (payload) => {
      calls.push(payload);
    });

    await hooks.run('test', 'hello');
    assert.deepEqual(calls, ['hello']);
  });

  it('should run hooks in priority order', async () => {
    const hooks = createHookSystem();
    const order = [];

    hooks.on('test', () => { order.push('low'); }, 20);
    hooks.on('test', () => { order.push('high'); }, 5);

    await hooks.run('test', null);
    assert.deepEqual(order, ['high', 'low']);
  });

  it('should pass payload through hooks', async () => {
    const hooks = createHookSystem();

    hooks.on('transform', async (payload) => (typeof payload === 'string' ? payload.toUpperCase() : null));

    const result = await hooks.run('transform', 'hello');
    assert.equal(result, 'HELLO');
  });

  it('should stop chain when handler returns null', async () => {
    const hooks = createHookSystem();
    const calls = [];

    hooks.on('test', () => { calls.push(1); return null; });
    hooks.on('test', () => { calls.push(2); });

    await hooks.run('test', null);
    assert.deepEqual(calls, [1]);
  });

  it('should deregister hooks', async () => {
    const hooks = createHookSystem();
    const calls = [];

    const dereg = hooks.on('test', () => { calls.push(1); });
    dereg();
    await hooks.run('test', null);

    assert.deepEqual(calls, []);
  });
});

// ════════════════════════════════════════════════════════════
// Auth
// ════════════════════════════════════════════════════════════

describe('Password Hashing', () => {
  it('should hash and verify a password', () => {
    const hashed = hashPassword('taichu2026');
    assert.ok(hashed.startsWith('pbkdf2_sha256$'));

    assert.equal(verifyPassword('taichu2026', hashed), true);
  });

  it('should reject wrong password', () => {
    const hashed = hashPassword('correct');
    assert.equal(verifyPassword('wrong', hashed), false);
  });

  it('should produce different hashes for same password', () => {
    const h1 = hashPassword('test');
    const h2 = hashPassword('test');
    assert.notEqual(h1, h2, 'Salt should produce different hashes');
    assert.equal(verifyPassword('test', h1), true);
    assert.equal(verifyPassword('test', h2), true);
  });

  it('should handle malformed hash gracefully', () => {
    assert.equal(verifyPassword('test', 'bad_hash'), false);
  });
});

describe('JWT', () => {
  const secret = 'test-secret-key-32-chars-long!!';

  it('should sign and verify a JWT', () => {
    const token = signJWT({ sub: 'user-1', role: 'admin' }, secret, { expiresIn: '1h' });
    assert.ok(typeof token === 'string');

    const result = verifyJWT(token, secret);
    assert.equal(result.valid, true);
    assert.equal(result.payload.sub, 'user-1');
    assert.equal(result.payload.role, 'admin');
  });

  it('should reject tokens with exp in the past', () => {
    const expiredPayload = { sub: 'user-1', iat: Math.floor(Date.now() / 1000) - 7200, exp: Math.floor(Date.now() / 1000) - 3600 };
    const header = JSON.stringify({ alg: 'HS256', typ: 'JWT' });
    const headerB64 = Buffer.from(header).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(expiredPayload)).toString('base64url');
    const sig = createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest('base64url');
    const token = `${headerB64}.${payloadB64}.${sig}`;

    const result = verifyJWT(token, secret);
    assert.equal(result.valid, false);
    assert.equal(result.error, 'Token expired');
  });

  it('should reject tokens with wrong secret', () => {
    const token = signJWT({ sub: 'user-1' }, secret);
    const result = verifyJWT(token, 'wrong-secret');
    assert.equal(result.valid, false);
  });
});

describe('API Key', () => {
  it('should generate a valid API key', () => {
    const key = generateAPIKey('Test Agent');
    assert.ok(key.key.startsWith('taichu_'));
    assert.ok(key.prefix.startsWith('taichu_'));
    assert.equal(key.label, 'Test Agent');
    assert.equal(key.key.length, 71); // taichu_ + 64 hex chars
  });

  it('should verify a valid API key', () => {
    const key = generateAPIKey('Test');
    assert.equal(verifyAPIKey(key.key, key.hash), true);
  });

  it('should reject invalid API key', () => {
    const key = generateAPIKey('Test');
    assert.equal(verifyAPIKey('taichu_fake', key.hash), false);
  });

  it('should produce different keys each time', () => {
    const k1 = generateAPIKey();
    const k2 = generateAPIKey();
    assert.notEqual(k1.key, k2.key);
    assert.notEqual(k1.hash, k2.hash);
  });
});

// ════════════════════════════════════════════════════════════
// Password Reset Token
// ════════════════════════════════════════════════════════════

describe('Password Reset Token', () => {
  const secret = 'test-reset-secret-key-32chars_min';

  it('should generate a valid reset token', () => {
    const token = generateResetToken('user-001', secret);
    assert.ok(typeof token === 'string');
    assert.ok(token.split('.').length === 3);
  });

  it('should validate a correct reset token', () => {
    const token = generateResetToken('user-002', secret);
    const result = validateResetToken(token, secret);
    assert.equal(result.valid, true);
    assert.equal(result.userId, 'user-002');
  });

  it('should reject token with wrong secret', () => {
    const token = generateResetToken('user-003', secret);
    const result = validateResetToken(token, 'wrong-secret-key-for-testing-01');
    assert.equal(result.valid, false);
  });

  it('should reject token with wrong purpose', () => {
    const wrongToken = signJWT(
      { sub: 'user-004', purpose: 'other' },
      secret,
      { expiresIn: '1h' }
    );
    const result = validateResetToken(wrongToken, secret);
    assert.equal(result.valid, false);
  });

  it('should reject expired token', async () => {
    const expiredToken = signJWT(
      { sub: 'user-005', purpose: 'password-reset', exp: Math.floor(Date.now() / 1000) - 60 },
      secret
    );
    const result = validateResetToken(expiredToken, secret);
    assert.equal(result.valid, false);
  });
});

// ════════════════════════════════════════════════════════════
// Errors
// ════════════════════════════════════════════════════════════

describe('TaichuError', () => {
  it('should create a base error', () => {
    const err = new TaichuError('test');
    assert.equal(err.message, 'test');
    assert.equal(err.status, 500);
    assert.equal(err.code, 'TAICHU_ERROR');
  });

  it('should create typed errors with correct status codes', () => {
    assert.equal(new ValidationError('bad').status, 400);
    assert.equal(new NotFoundError('missing').status, 404);
    assert.equal(new UnauthorizedError('nope').status, 401);
    assert.equal(new ForbiddenError('no').status, 403);
    assert.equal(new ConflictError('dup').status, 409);
  });

  it('should serialize to JSON', () => {
    const err = new ValidationError('Invalid title');
    const json = err.toJSON();
    assert.equal(json.error, 'VALIDATION_ERROR');
    assert.equal(json.message, 'Invalid title');
    assert.equal(json.status, 400);
  });

  it('should report type conflicts', () => {
    try {
      new ConflictError('duplicate');
      assert.ok(true);
    } catch {
      assert.fail('Should not throw');
    }
  });
});

// ════════════════════════════════════════════════════════════
// Tokenizer
// ════════════════════════════════════════════════════════════

describe('Tokenizer', () => {
  it('should tokenize Chinese text (n-gram fallback)', async () => {
    const { tokenize } = await import('./tokenizer.js');
    const tokens = tokenize('人工智能正在改变内容管理');
    assert.ok(tokens.length > 0);
    // Should find 2-grams like 人工, 工智, 智能 etc.
    assert.ok(tokens.includes('智能'));
  });

  it('should tokenize English text', async () => {
    const { tokenize } = await import('./tokenizer.js');
    const tokens = tokenize('AI is changing content management');
    assert.ok(tokens.includes('changing'));
    assert.ok(tokens.includes('content'));
  });

  it('should filter stopwords', async () => {
    const { tokenize } = await import('./tokenizer.js');
    const tokens = tokenize('这是一个测试内容');
    assert.ok(!tokens.includes('了'));
    assert.ok(!tokens.includes('的'));
  });
});

// ════════════════════════════════════════════════════════════
// Vector Index
// ════════════════════════════════════════════════════════════

describe('VectorIndex', () => {
  it('should index and search documents', async () => {
    const { TFIDFIndex } = await import('./vector-index.js');
    const idx = new TFIDFIndex();
    idx.add('1', 'artificial intelligence content management');
    idx.add('2', 'machine learning deep learning neural networks');
    idx.add('3', 'content management system headless cms');

    const results = idx.search('content management system');
    assert.ok(results.length > 0);
    // '3' has "content management system headless cms" — most relevant
    assert.equal(results[0].docId, '3');
  });

  it('should return empty for no match', async () => {
    const { TFIDFIndex } = await import('./vector-index.js');
    const idx = new TFIDFIndex();
    idx.add('1', 'hello world');

    const results = idx.search('zzz');
    assert.equal(results.length, 0);
  });
});

// ════════════════════════════════════════════════════════════
// Cache — ETag & conditional requests
// ════════════════════════════════════════════════════════════

describe('Cache', () => {
  it('should generate consistent ETag for same content', () => {
    const e1 = generateETag('{"hello":"world"}');
    const e2 = generateETag('{"hello":"world"}');
    assert.equal(e1, e2);
  });

  it('should generate different ETag for different content', () => {
    const e1 = generateETag('{"a":1}');
    const e2 = generateETag('{"b":2}');
    assert.notEqual(e1, e2);
  });

  it('should start with W/" prefix', () => {
    const etag = generateETag('test');
    assert.ok(etag.startsWith('W/"'));
  });

  it('etagMatches should return true for matching ETag', () => {
    const etag = generateETag('data');
    const headers = { 'if-none-match': etag };
    assert.equal(etagMatches(headers, etag), true);
  });

  it('etagMatches should return false for non-matching ETag', () => {
    const etag = generateETag('data');
    const headers = { 'if-none-match': 'W/"other"' };
    assert.equal(etagMatches(headers, etag), false);
  });

  it('etagMatches should return false when header is missing', () => {
    assert.equal(etagMatches({}, 'W/"abc"'), false);
  });

  it('modifiedSince should return false when modified after If-Modified-Since', () => {
    const past = new Date(Date.now() - 60000).toUTCString();
    const now = new Date().toISOString();
    assert.equal(modifiedSince({ 'if-modified-since': past }, now), false);
  });

  it('modifiedSince should return false when header is missing', () => {
    assert.equal(modifiedSince({}, new Date().toISOString()), false);
  });

  it('latestUpdate should return the most recent updatedAt', () => {
    const docs = [
      { updatedAt: '2026-01-01T00:00:00Z' },
      { updatedAt: '2026-06-20T00:00:00Z' },
      { updatedAt: '2026-03-15T00:00:00Z' }
    ];
    const latest = latestUpdate(docs);
    assert.ok(latest.includes('2026-06-20'));
  });

  it('latestUpdate should return null for empty array', () => {
    assert.equal(latestUpdate([]), null);
    assert.equal(latestUpdate(null), null);
  });
});

// ════════════════════════════════════════════════════════════
// Backup & Restore
// ════════════════════════════════════════════════════════════

import { exportBackup, validateBackup, importBackup } from './backup.js';

describe('Backup & Restore', () => {
  it('should export all documents from store', async () => {
    const store = createMemoryStore();
    await store.create({ type: 'article', data: { title: 'Hello' } });
    await store.create({ type: 'article', data: { title: 'World' } });
    await store.create({ type: 'page', data: { title: 'About' } });

    const backup = await exportBackup(store);

    assert.equal(backup.meta.format, 'taichu-backup');
    assert.equal(backup.meta.version, '1.0');
    assert.equal(backup.meta.stats.documentCount, 3);
    assert.ok(backup.meta.createdAt);
    assert.equal(backup.documents.length, 3);
    assert.equal(backup.apiKeys.length, 0);
  });

  it('should separate api keys from content', async () => {
    const store = createMemoryStore();
    await store.create({ type: 'article', data: { title: 'Post' } });
    await store.create({ type: 'api_key', data: { label: 'Test Key', key: 'taichu_test' } });

    const backup = await exportBackup(store);

    assert.equal(backup.meta.stats.documentCount, 1);
    assert.equal(backup.meta.stats.apiKeyCount, 1);
    assert.equal(backup.documents.length, 1);
    assert.equal(backup.apiKeys.length, 1);
  });

  it('should validate a correct backup', () => {
    const backup = {
      meta: { format: 'taichu-backup', version: '1.0', createdAt: new Date().toISOString(), stats: { documentCount: 1, apiKeyCount: 0 } },
      documents: [{ id: '1', type: 'article', data: { title: 'Test' } }],
      apiKeys: []
    };
    const result = validateBackup(backup);
    assert.equal(result.valid, true);
  });

  it('should reject invalid backup format', () => {
    const result = validateBackup({ meta: { format: 'unknown' } });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('Invalid format'));
  });

  it('should reject backup without documents array', () => {
    const result = validateBackup({ meta: { format: 'taichu-backup' } });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('documents'));
  });

  it('should reject backup with invalid document', () => {
    const backup = {
      meta: { format: 'taichu-backup', version: '1.0' },
      documents: [{ type: 'article' }], // missing id and data
      apiKeys: []
    };
    const result = validateBackup(backup);
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('Invalid document'));
  });

  it('should import documents into empty store', async () => {
    const store = createMemoryStore();
    const backup = {
      meta: { format: 'taichu-backup', version: '1.0', createdAt: new Date().toISOString(), stats: { documentCount: 2, apiKeyCount: 0 } },
      documents: [
        { id: 'a1', type: 'article', data: { title: 'First' }, status: 'published' },
        { id: 'a2', type: 'article', data: { title: 'Second' }, status: 'draft' }
      ],
      apiKeys: []
    };

    const result = await importBackup(store, backup);
    assert.equal(result.imported, 2);
    assert.equal(result.skipped, 0);
    assert.equal(result.errors.length, 0);

    const doc = await store.get('a1');
    assert.equal(doc.data.title, 'First');
    assert.equal(doc.status, 'published');
  });

  it('should skip existing documents with skip strategy', async () => {
    const store = createMemoryStore();
    await store.create({ id: 'a1', type: 'article', data: { title: 'Original' } });

    const backup = {
      meta: { format: 'taichu-backup', version: '1.0', createdAt: new Date().toISOString(), stats: { documentCount: 2, apiKeyCount: 0 } },
      documents: [
        { id: 'a1', type: 'article', data: { title: 'Updated' } },
        { id: 'a2', type: 'article', data: { title: 'New' } }
      ],
      apiKeys: []
    };

    const result = await importBackup(store, backup, { conflictStrategy: 'skip' });
    assert.equal(result.imported, 1);
    assert.equal(result.skipped, 1);

    const doc = await store.get('a1');
    assert.equal(doc.data.title, 'Original'); // not overwritten
  });

  it('should overwrite existing documents with overwrite strategy', async () => {
    const store = createMemoryStore();
    await store.create({ id: 'a1', type: 'article', data: { title: 'Original' } });

    const backup = {
      meta: { format: 'taichu-backup', version: '1.0', createdAt: new Date().toISOString(), stats: { documentCount: 1, apiKeyCount: 0 } },
      documents: [
        { id: 'a1', type: 'article', data: { title: 'Updated' } }
      ],
      apiKeys: []
    };

    const result = await importBackup(store, backup, { conflictStrategy: 'overwrite' });
    assert.equal(result.imported, 1);
    assert.equal(result.skipped, 0);

    const doc = await store.get('a1');
    assert.equal(doc.data.title, 'Updated');
  });

  it('should not import apiKeys by default', async () => {
    const store = createMemoryStore();
    const backup = {
      meta: { format: 'taichu-backup', version: '1.0', createdAt: new Date().toISOString(), stats: { documentCount: 1, apiKeyCount: 1 } },
      documents: [{ id: 'a1', type: 'article', data: { title: 'Post' } }],
      apiKeys: [{ id: 'k1', type: 'api_key', data: { label: 'Key', key: 'taichu_secret' } }]
    };

    const result = await importBackup(store, backup);
    assert.equal(result.imported, 1); // only the article
  });

  it('should import apiKeys when explicitly requested', async () => {
    const store = createMemoryStore();
    const backup = {
      meta: { format: 'taichu-backup', version: '1.0', createdAt: new Date().toISOString(), stats: { documentCount: 1, apiKeyCount: 1 } },
      documents: [{ id: 'a1', type: 'article', data: { title: 'Post' } }],
      apiKeys: [{ id: 'k1', type: 'api_key', data: { label: 'Key', key: 'taichu_secret' } }]
    };

    const result = await importBackup(store, backup, { includeApiKeys: true });
    assert.equal(result.imported, 2);
  });

  it('should reject invalid backup data on import', async () => {
    const store = createMemoryStore();
    await assert.rejects(
      () => importBackup(store, { meta: { format: 'unknown' } }),
      /Invalid backup/
    );
  });
});

// ════════════════════════════════════════════════════════════
// Metrics & Monitoring
// ════════════════════════════════════════════════════════════

describe('Metrics', () => {
  it('should increment counters by label', () => {
    resetMetrics();
    counterInc('taichu_test_requests_total', 'Test counter', { method: 'GET', status: '200' });
    counterInc('taichu_test_requests_total', 'Test counter', { method: 'GET', status: '200' });
    counterInc('taichu_test_requests_total', 'Test counter', { method: 'POST', status: '201' });

    assert.equal(getCounter('taichu_test_requests_total', { method: 'GET', status: '200' }), 2);
    assert.equal(getCounter('taichu_test_requests_total', { method: 'POST', status: '201' }), 1);
    assert.equal(getCounter('taichu_test_requests_total', { method: 'DELETE', status: '404' }), 0);
  });

  it('should set and get gauge values', () => {
    resetMetrics();
    gaugeSet('taichu_test_memory_bytes', 'Test memory', 1024000);
    assert.equal(getGauge('taichu_test_memory_bytes'), 1024000);
  });

  it('should record observations in histograms', () => {
    resetMetrics();
    histogramObserve('taichu_test_duration_seconds', 'Test duration', 0.05);
    histogramObserve('taichu_test_duration_seconds', 'Test duration', 0.15);
    histogramObserve('taichu_test_duration_seconds', 'Test duration', 0.5);
    // Histogram should not throw
    const metrics = generateMetrics();
    assert.ok(metrics.includes('taichu_test_duration_seconds_bucket'));
    assert.ok(metrics.includes('taichu_test_duration_seconds_sum'));
    assert.ok(metrics.includes('taichu_test_duration_seconds_count'));
  });

  it('should record requests with correct labels', () => {
    resetMetrics();
    recordRequest('GET', '/api/content/article', 200, 15);
    recordRequest('GET', '/api/content/article', 200, 25);
    recordRequest('POST', '/api/content/article', 201, 50);

    assert.equal(getCounter('taichu_http_requests_total', { method: 'GET', path: '/api/content/article', status: '200' }), 2);
    assert.equal(getCounter('taichu_http_requests_total', { method: 'POST', path: '/api/content/article', status: '201' }), 1);
  });

  it('should generate valid Prometheus text format', () => {
    resetMetrics();
    counterInc('test_metric', 'A test metric', { env: 'test' });
    gaugeSet('test_gauge', 'A test gauge', 42);

    const output = generateMetrics();
    assert.ok(output.includes('# HELP test_metric'));
    assert.ok(output.includes('# TYPE test_metric counter'));
    assert.ok(output.includes('test_metric{env="test"} 1'));
    assert.ok(output.includes('# HELP test_gauge'));
    assert.ok(output.includes('# TYPE test_gauge gauge'));
    assert.ok(output.includes('test_gauge 42'));
  });

  it('should include system metrics in output', () => {
    resetMetrics();
    const output = generateMetrics();
    assert.ok(output.includes('taichu_process_heap_bytes'));
    assert.ok(output.includes('taichu_process_uptime_seconds'));
    assert.ok(output.includes('taichu_process_rss_bytes'));
  });

  it('should reset all metrics', () => {
    counterInc('test_reset', 'Reset test');
    gaugeSet('test_reset_gauge', 'Reset test gauge', 99);
    resetMetrics();

    assert.equal(getCounter('test_reset'), 0);
    assert.equal(getGauge('test_reset_gauge'), undefined);
  });

  it('should handle escaped characters in label values', () => {
    resetMetrics();
    counterInc('test_escape', 'Test escaping', { path: '/api/content/article' });
    const output = generateMetrics();
    assert.ok(output.includes('test_escape'));
  });

  it('should handle histogram with custom buckets', () => {
    resetMetrics();
    histogramObserve('test_custom_bucket', 'Custom buckets', 0.75, [0.25, 0.5, 0.75, 1.0]);
    const output = generateMetrics();
    assert.ok(output.includes('test_custom_bucket_bucket'));
    assert.ok(output.includes('le="0.75"'));
    assert.ok(output.includes('le="1"'));
    assert.ok(output.includes('le="+Inf"'));
  });
});

// ════════════════════════════════════════════════════════════
// Agent Marketplace
// ════════════════════════════════════════════════════════════

describe('Agent Marketplace', () => {
  it('should validate a valid capability', () => {
    const result = validateCapability({
      name: 'content-translator',
      description: 'Translates content between languages',
      tools: [{ name: 'translate', description: 'Translate text' }],
      tags: ['translation', 'nlp']
    });
    assert.ok(result.valid);
    assert.deepEqual(result.errors, []);
  });

  it('should reject missing name', () => {
    const result = validateCapability({ description: 'No name' });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('name')));
  });

  it('should reject non-object capability', () => {
    const result = validateCapability(null);
    assert.equal(result.valid, false);
  });

  it('should reject invalid tools type', () => {
    const result = validateCapability({ name: 'test', tools: 'not-an-array' });
    assert.equal(result.valid, false);
  });

  it('should register a new agent', () => {
    const result = registerAgent({
      name: 'test-agent',
      description: 'A test agent',
      version: '1.0.0',
      tools: [{ name: 'do_thing', description: 'Do something' }],
      tags: ['test']
    });
    assert.ok(result.entry.id.startsWith('agent_'));
    assert.ok(result.token.startsWith('atok_'));
    assert.equal(result.entry.capability.name, 'test-agent');
    assert.equal(result.entry.status, 'active');
    assert.equal(result.entry.capability.tools.length, 1);
  });

  it('should normalize tags to lowercase', () => {
    const result = registerAgent({
      name: 'tag-test',
      description: 'Testing tags',
      tags: ['AI', 'NLP', 'Content']
    });
    assert.deepEqual(result.entry.capability.tags, ['ai', 'nlp', 'content']);
  });

  it('should update existing agent with correct token', () => {
    const first = registerAgent({ name: 'update-test', description: 'Initial' });
    const updated = registerAgent(
      { name: 'update-test', description: 'Updated' },
      first.token
    );
    assert.equal(updated.entry.capability.description, 'Updated');
    assert.equal(updated.entry.id, first.entry.id);
    assert.equal(updated.token, first.token);
  });

  it('should reject update with wrong token', () => {
    registerAgent({ name: 'wrong-token-test', description: 'Original' });
    assert.throws(() => {
      registerAgent(
        { name: 'wrong-token-test', description: 'Hijack!' },
        'atok_wrong_token_here'
      );
    }, /Invalid agent token/);
  });

  it('should list all registered agents', () => {
    registerAgent({ name: 'list-test-1', description: 'First' });
    registerAgent({ name: 'list-test-2', description: 'Second' });
    const agents = listAgents();
    const names = agents.map(a => a.capability.name);
    assert.ok(names.includes('list-test-1'));
    assert.ok(names.includes('list-test-2'));
  });

  it('should get single agent by ID', () => {
    const result = registerAgent({ name: 'get-test', description: 'Get me' });
    const entry = getAgent(result.entry.id);
    assert.ok(entry);
    assert.equal(entry.capability.name, 'get-test');
  });

  it('should return undefined for unknown agent', () => {
    assert.equal(getAgent('agent_nonexistent'), undefined);
  });

  it('should discover agents by query', () => {
    registerAgent({
      name: 'search-target',
      description: 'Content moderation and spam detection',
      tools: [{ name: 'detect_spam' }],
      tags: ['moderation', 'content']
    });
    registerAgent({
      name: 'unrelated',
      description: 'Image optimization',
      tools: [{ name: 'optimize_image' }],
      tags: ['media']
    });

    const result = discoverAgents({ query: 'spam' });
    assert.equal(result.total, 1);
    assert.equal(result.agents[0].capability.name, 'search-target');
  });

  it('should discover agents by tag', () => {
    registerAgent({ name: 'media-agent', description: 'Media handler', tags: ['media', 'image'] });
    registerAgent({ name: 'text-agent', description: 'Text handler', tags: ['nlp', 'text'] });

    const result = discoverAgents({ tag: 'media' });
    assert.ok(result.total >= 1);
    assert.ok(result.agents.every(a => a.capability.tags.includes('media')));
  });

  it('should discover agents by tool name', () => {
    registerAgent({
      name: 'tool-agent',
      description: 'Has tools',
      tools: [{ name: 'special_tool' }, { name: 'other_tool' }]
    });

    const result = discoverAgents({ tool: 'special_tool' });
    assert.ok(result.total >= 1);
    assert.ok(result.agents.some(a =>
      a.capability.tools.some(t => t.name === 'special_tool')
    ));
  });

  it('should filter by status (default active)', () => {
    registerAgent({ name: 'active-agent', description: 'Active one' });
    const result = discoverAgents({});
    assert.ok(result.agents.every(a => a.status === 'active'));
  });

  it('should paginate results', () => {
    for (let i = 0; i < 30; i++) {
      registerAgent({ name: `paginate-${i}`, description: `Agent ${i}` });
    }
    const result = discoverAgents({ limit: 10, offset: 5 });
    assert.equal(result.agents.length, 10);
    assert.ok(result.total >= 25);
  });

  it('should unregister agent with correct token', () => {
    const result = registerAgent({ name: 'remove-me', description: 'To be removed' });
    const removed = unregisterAgent(result.entry.id, result.token);
    assert.equal(removed, true);
    assert.equal(getAgent(result.entry.id), undefined);
  });

  it('should not unregister with wrong token', () => {
    const result = registerAgent({ name: 'keep-me', description: 'Should stay' });
    assert.throws(() => {
      unregisterAgent(result.entry.id, 'atok_wrong');
    }, /Invalid agent token/);
    assert.ok(getAgent(result.entry.id));
  });

  it('should return false for unregister unknown agent', () => {
    const result = registerAgent({ name: 'tmp-agent', description: 'Temporary' });
    assert.equal(unregisterAgent('agent_nonexistent', result.token), false);
  });

  it('should update heartbeat', () => {
    const result = registerAgent({ name: 'heartbeat-test', description: 'Heartbeat' });
    const ok = agentHeartbeat(result.entry.id, result.token);
    assert.equal(ok, true);
  });

  it('should reject heartbeat with wrong token', () => {
    const result = registerAgent({ name: 'hb-wrong', description: 'Hearbeat wrong' });
    assert.equal(agentHeartbeat(result.entry.id, 'atok_wrong'), false);
  });

  it('should return false for heartbeat on unknown agent', () => {
    const result = registerAgent({ name: 'hb-tmp', description: 'HB temp' });
    assert.equal(agentHeartbeat('agent_nonexistent', result.token), false);
  });

  it('should list all distinct tags', () => {
    registerAgent({ name: 'tag-agent-1', description: 'A', tags: ['translation', 'nlp'] });
    registerAgent({ name: 'tag-agent-2', description: 'B', tags: ['media', 'nlp', 'seo'] });
    const tags = listTags();
    assert.ok(tags.includes('nlp'));
    assert.ok(tags.includes('translation'));
    assert.ok(tags.includes('media'));
    assert.ok(tags.includes('seo'));
    // Tags should be sorted
    for (let i = 1; i < tags.length; i++) {
      assert.ok(tags[i] > tags[i - 1]);
    }
  });

  it('should list all distinct tool names', () => {
    registerAgent({
      name: 'tool-agent-1',
      description: 'A',
      tools: [{ name: 'translate' }, { name: 'detect_lang' }]
    });
    registerAgent({
      name: 'tool-agent-2',
      description: 'B',
      tools: [{ name: 'translate' }, { name: 'optimize_seo' }]
    });
    const tools = listTools();
    assert.ok(tools.includes('translate'));
    assert.ok(tools.includes('detect_lang'));
    assert.ok(tools.includes('optimize_seo'));
  });

  it('should generate unique agent IDs', () => {
    const id1 = generateAgentId();
    const id2 = generateAgentId();
    assert.notEqual(id1, id2);
    assert.ok(id1.startsWith('agent_'));
  });

  it('should generate unique agent tokens', () => {
    const t1 = generateAgentToken();
    const t2 = generateAgentToken();
    assert.notEqual(t1, t2);
    assert.ok(t1.startsWith('atok_'));
  });
});
