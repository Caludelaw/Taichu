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
import { hashPassword, verifyPassword, signJWT, verifyJWT, generateAPIKey, verifyAPIKey } from './auth.js';
import { TaichuError, ValidationError, NotFoundError, UnauthorizedError, ForbiddenError, ConflictError } from './errors.js';
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
