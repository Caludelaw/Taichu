/**
 * SQLiteStore — 基于 sql.js (WASM) 的持久化存储
 *
 * 特点：
 *   - 纯 JavaScript + WASM，零原生编译依赖
 *   - 数据持久化到文件，重启不丢失
 *   - 支持 JSON 字段查询（SQLite JSON1 扩展）
 *   - 与 MemoryStore 共享同一接口
 *
 * sql.js 是 SQLite 编译为 WebAssembly，跨平台，无需 node-gyp。
 */

import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS documents (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  data         TEXT NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'draft',
  published_at TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  tenant_id    TEXT NOT NULL DEFAULT 'default',
  created_by   TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  meta         TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents(updated_at);
CREATE INDEX IF NOT EXISTS idx_documents_type_status ON documents(type, status);
CREATE INDEX IF NOT EXISTS idx_documents_scheduled ON documents(status, published_at);
CREATE INDEX IF NOT EXISTS idx_documents_tenant ON documents(tenant_id);
`;

const MIGRATION_SQL = [
  `ALTER TABLE documents ADD COLUMN published_at TEXT;`,
  `ALTER TABLE documents ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';`,
  `ALTER TABLE documents ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;`
];

const INDEX_MIGRATIONS = [
  'CREATE INDEX IF NOT EXISTS idx_documents_scheduled ON documents(status, published_at)',
  'CREATE INDEX IF NOT EXISTS idx_documents_tenant ON documents(tenant_id)'
];

/**
 * Create a SQLiteStore instance.
 *
 * @param {object} config
 * @param {string} [config.dataDir] — 数据目录路径，默认 `.taichu/data`
 * @param {string} [config.dbPath] — 数据库文件路径，默认 `{dataDir}/taichu.db`
 * @returns {Promise<Store>}
 */
export async function createSQLiteStore(config = {}) {
  // Lazy-load sql.js — only when SQLiteStore is actually used
  const sqlModule = await import('sql.js');

  let SQL = null;
  let db = null;
  let dbPath = null;
  let dirty = false;
  let flushTimer = null;
  const FLUSH_INTERVAL = process.env.TAICHU_SQLITE_FLUSH_MS ? parseInt(process.env.TAICHU_SQLITE_FLUSH_MS) : 5000;

  async function init() {
    SQL = await sqlModule.default();
    const dataDir = config.dataDir || join(process.cwd(), '.taichu', 'data');
    dbPath = config.dbPath || join(dataDir, 'taichu.db');

    // Ensure data directory exists
    if (!existsSync(dataDir)) {
      await mkdir(dataDir, { recursive: true });
    }

    // Load existing database or create new one
    if (existsSync(dbPath)) {
      const buffer = await readFile(dbPath);
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
    }

    // Run schema migration
    db.run(SCHEMA_SQL);

    // Run column migrations for existing databases
    for (const mig of MIGRATION_SQL) {
      try {
        db.run(mig);
      } catch (e) {
        if (!e.message?.includes('duplicate column')) throw e;
      }
    }

    // Ensure indices exist (idempotent for new + migrated DBs)
    for (const idx of INDEX_MIGRATIONS) {
      try { db.run(idx); } catch (e) { /* ignore */ }
    }

    // HA-ready PRAGMAs: WAL mode for better concurrency and Litestream compatibility
    // Note: sql.js WASM does not produce OS-level WAL files, so Litestream continuous
    // replication requires migrating to better-sqlite3 for full support.
    // These pragmas still improve internal SQLite behavior within sql.js.
    try { db.run('PRAGMA journal_mode=WAL;'); } catch (e) { /* ignore */ }
    try { db.run('PRAGMA synchronous=NORMAL;'); } catch (e) { /* ignore */ }
    try { db.run('PRAGMA busy_timeout=5000;'); } catch (e) { /* ignore */ }

    await saveToDisk();

    return db;
  }

  async function saveToDisk() {
    const data = db.export();
    const buffer = Buffer.from(data);
    await writeFile(dbPath, buffer);
    dirty = false;
  }

  /** Mark database as dirty and schedule a debounced flush */
  function markDirty() {
    dirty = true;
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(async () => {
      if (dirty) await saveToDisk();
    }, FLUSH_INTERVAL);
  }

  // Flush on process exit
  process.on('beforeExit', async () => {
    if (dirty && db) await saveToDisk();
  });

  function rowToDoc(row) {
    if (!row) return null;
    return {
      id: row[0],
      type: row[1],
      data: safeJsonParse(row[2]),
      status: row[3],
      publishedAt: row[4] || null,
      sortOrder: row[5] ?? 0,
      tenantId: row[6] || 'default',
      createdBy: row[7],
      createdAt: row[8],
      updatedAt: row[9],
      meta: safeJsonParse(row[10])
    };
  }

  /**
   * Escape SQL string value (simple implementation)
   */
  function esc(val) {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'number') return String(val);
    return `'${String(val).replace(/'/g, "''")}'`;
  }

  // Initialize the database
  await init();

  return {
    async create(doc) {
      const now = new Date().toISOString();
      const id = doc.id || randomUUID();
      const type = doc.type || 'default';
      const data = JSON.stringify(doc.data || {});
      const status = doc.status || 'draft';
      const publishedAt = doc.publishedAt || null;
      const sortOrder = doc.sortOrder ?? 0;
      const tenantId = doc.tenantId || 'default';
      const createdBy = doc.createdBy || null;
      const createdAt = doc.createdAt || now;
      const meta = JSON.stringify(doc.meta || {});

      db.run(
        `INSERT INTO documents (id, type, data, status, published_at, sort_order, tenant_id, created_by, created_at, updated_at, meta)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, type, data, status, publishedAt, sortOrder, tenantId, createdBy, createdAt, now, meta]
      );

      markDirty();

      return { id, type, data: safeJsonParse(data), status, publishedAt, sortOrder, tenantId, createdBy, createdAt, updatedAt: now, meta: safeJsonParse(meta) };
    },

    async get(id) {
      const stmt = db.prepare('SELECT * FROM documents WHERE id = ?');
      stmt.bind([id]);

      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return rowToDocFromObj(row);
      }
      stmt.free();
      return null;
    },

    async list(options = {}) {
      const conditions = [];
      const params = [];

      if (options.type) {
        conditions.push('type = ?');
        params.push(options.type);
      }
      if (options.status) {
        conditions.push('status = ?');
        params.push(options.status);
      }
      if (options.tenantId) {
        conditions.push('tenant_id = ?');
        params.push(options.tenantId);
      }
      if (options.search) {
        conditions.push("(data LIKE ? OR type LIKE ?)");
        const q = `%${options.search}%`;
        params.push(q, q);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Whitelist validation for ORDER BY columns — prevents SQL injection
      const ALLOWED_ORDER_COLUMNS = new Set(['id', 'type', 'status', 'created_at', 'updated_at', 'sort_order']);
      const orderBy = ALLOWED_ORDER_COLUMNS.has(options.orderBy) ? options.orderBy : 'updated_at';
      const order = options.order === 'asc' ? 'ASC' : 'DESC';
      // LIMIT/OFFSET must be integers
      const limit = Math.min(Math.max(1, parseInt(options.limit) || 50), 1000);
      const offset = Math.max(0, parseInt(options.offset) || 0);

      const sql = `SELECT * FROM documents ${where} ORDER BY ${orderBy} ${order} LIMIT ? OFFSET ?`;
      const allParams = [...params, limit, offset];
      const stmt = db.prepare(sql);
      stmt.bind(allParams);

      const results = [];
      while (stmt.step()) {
        results.push(rowToDocFromObj(stmt.getAsObject()));
      }
      stmt.free();

      return results;
    },

    async update(id, patch) {
      const existing = await this.get(id);
      if (!existing) return null;

      const now = new Date().toISOString();

      // Batch all updates in a single transaction
      db.run('BEGIN TRANSACTION');

      if (patch.data) {
        const merged = { ...existing.data, ...patch.data };
        db.run('UPDATE documents SET data = ?, updated_at = ? WHERE id = ?', [
          JSON.stringify(merged), now, id
        ]);
        existing.data = merged;
      }

      if (patch.status !== undefined) {
        db.run('UPDATE documents SET status = ?, updated_at = ? WHERE id = ?', [
          patch.status, now, id
        ]);
        existing.status = patch.status;
      }

      // publishedAt: explicit null clears it, string value sets it
      if (patch.publishedAt !== undefined) {
        const val = patch.publishedAt || null;
        db.run('UPDATE documents SET published_at = ?, updated_at = ? WHERE id = ?', [
          val, now, id
        ]);
        existing.publishedAt = val;
      }

      if (patch.meta) {
        const merged = { ...existing.meta, ...patch.meta };
        db.run('UPDATE documents SET meta = ?, updated_at = ? WHERE id = ?', [
          JSON.stringify(merged), now, id
        ]);
        existing.meta = merged;
      }

      db.run('UPDATE documents SET updated_at = ? WHERE id = ?', [now, id]);
      db.run('COMMIT');

      existing.updatedAt = now;
      markDirty();
      return existing;
    },

    async delete(id) {
      const existing = await this.get(id);
      if (!existing) return false;

      db.run('DELETE FROM documents WHERE id = ?', [id]);
      markDirty();
      return true;
    },

    /** Batch update sort_order for reordering */
    async reorder(orderedIds) {
      if (!Array.isArray(orderedIds) || !orderedIds.length) return [];

      db.run('BEGIN TRANSACTION');
      const docs = [];
      try {
        for (let i = 0; i < orderedIds.length; i++) {
          db.run('UPDATE documents SET sort_order = ?, updated_at = ? WHERE id = ?', [
            i, new Date().toISOString(), orderedIds[i]
          ]);
          const doc = await this.get(orderedIds[i]);
          if (doc) docs.push(doc);
        }
        db.run('COMMIT');
      } catch (e) {
        db.run('ROLLBACK');
        throw e;
      }
      markDirty();
      return docs;
    },

    async count(options = {}) {
      const conditions = [];
      const params = [];

      if (options.type) {
        conditions.push('type = ?');
        params.push(options.type);
      }
      if (options.status) {
        conditions.push('status = ?');
        params.push(options.status);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const stmt = db.prepare(`SELECT COUNT(*) as cnt FROM documents ${where}`);
      stmt.bind(params);

      let count = 0;
      if (stmt.step()) {
        count = stmt.getAsObject().cnt;
      }
      stmt.free();
      return count;
    },

    /** Close database connection */
    async close() {
      if (dirty && db) await saveToDisk();
      if (db) {
        db.close();
        db = null;
      }
    },

    /** Get database path */
    getDbPath() {
      return dbPath;
    }
  };
}

function rowToDocFromObj(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    data: safeJsonParse(row.data),
    status: row.status,
    publishedAt: row.published_at || null,
    sortOrder: row.sort_order ?? 0,
    tenantId: row.tenant_id || 'default',
    createdBy: row.created_by || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    meta: safeJsonParse(row.meta, {})
  };
}

/**
 * Safely parse JSON string, returning fallback on parse error.
 * Handles null/undefined input and corrupted JSON gracefully.
 */
function safeJsonParse(str, fallback = {}) {
  if (str == null) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}
