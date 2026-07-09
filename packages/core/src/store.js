/**
 * Store — 存储抽象层
 *
 * 提供统一的 CRUD 接口，后端可以置换不同的存储引擎：
 *   - MemoryStore  — 开发/测试用，内存存储
 *   - SQLiteStore  — 生产环境，基于 better-sqlite3
 *   - 未来扩展：PostgresStore, FileStore, etc.
 *
 * 所有 Store 实现同一个接口，确保上层代码零修改。
 */

/**
 * @typedef {object} Document
 * @property {string} id — 唯一标识符（UUID）
 * @property {string} type — 内容类型名称
 * @property {object} data — 结构化内容数据
 * @property {string} status — 'draft' | 'scheduled' | 'published' | 'archived'
 * @property {string|null} publishedAt — 定时发布时间 (ISO 8601)
 * @property {number} [sortOrder] — 排序权重 (默认 0)
 * @property {string} tenantId — 租户 ID (默认 'default')
 * @property {string} createdAt — ISO 8601
 * @property {string} updatedAt — ISO 8601
 * @property {string} [createdBy] — 创建者 ID（人类或 Agent）
 * @property {object} [meta] — 额外元数据
 */

/**
 * @typedef {object} QueryOptions
 * @property {string} [type] — 按内容类型过滤
 * @property {string} [status] — 按状态过滤
 * @property {string} [tenantId] — 按租户 ID 过滤
 * @property {string} [search] — 全文搜索关键词
 * @property {number} [limit] — 返回数量上限
 * @property {number} [offset] — 分页偏移
 * @property {string} [orderBy] — 排序字段
 * @property {'asc'|'desc'} [order] — 排序方向
 */

/**
 * @typedef {object} Store
 * @property {function(Document): Promise<Document>} create
 * @property {function(string): Promise<Document|null>} get
 * @property {function(QueryOptions): Promise<Document[]>} list
 * @property {function(string, object): Promise<Document>} update
 * @property {function(string): Promise<boolean>} delete
 * @property {function(string[]): Promise<Document[]>} reorder — 批量更新排序
 * @property {function(): Promise<number>} count
 */

import { randomUUID } from 'node:crypto';

/**
 * MemoryStore — 内存存储实现
 * 适合开发、测试、和小规模单机部署
 */
export function createMemoryStore() {
  /** @type {Map<string, Document>} */
  const docs = new Map();

  return {
    async create(doc) {
      const now = new Date().toISOString();
      const document = {
        id: doc.id || randomUUID(),
        type: doc.type || 'default',
        data: doc.data || {},
        status: doc.status || 'draft',
        publishedAt: doc.publishedAt || null,
        sortOrder: doc.sortOrder ?? 0,
        tenantId: doc.tenantId || 'default',
        createdAt: doc.createdAt || now,
        updatedAt: now,
        createdBy: doc.createdBy || null,
        meta: doc.meta || {}
      };
      docs.set(document.id, document);
      return { ...document, data: { ...document.data } };
    },

    async get(id) {
      const doc = docs.get(id);
      if (!doc) return null;
      return { ...doc, data: { ...doc.data } };
    },

    async list(options = {}) {
      let results = Array.from(docs.values());

      if (options.type) {
        results = results.filter(d => d.type === options.type);
      }
      if (options.status) {
        results = results.filter(d => d.status === options.status);
      }
      if (options.tenantId) {
        results = results.filter(d => d.tenantId === options.tenantId);
      }
      if (options.search) {
        const q = options.search.toLowerCase();
        results = results.filter(d =>
          JSON.stringify(d.data).toLowerCase().includes(q) ||
          d.type.toLowerCase().includes(q)
        );
      }

      // Sort by updatedAt descending by default
      const orderBy = options.orderBy || 'updatedAt';
      const order = options.order || 'desc';
      results.sort((a, b) => {
        // Numeric sort for sortOrder (supports both camelCase and snake_case from SQLite)
        if (orderBy === 'sortOrder' || orderBy === 'sort_order') {
          const va = a.sortOrder ?? 0;
          const vb = b.sortOrder ?? 0;
          return order === 'desc' ? vb - va : va - vb;
        }
        const va = a[orderBy] || '';
        const vb = b[orderBy] || '';
        return order === 'desc' ? vb.localeCompare(va) : va.localeCompare(vb);
      });

      const offset = options.offset || 0;
      const limit = options.limit || 50;
      return results.slice(offset, offset + limit).map(d => ({
        ...d, data: { ...d.data }
      }));
    },

    async update(id, patch) {
      const doc = docs.get(id);
      if (!doc) return null;
      const updated = {
        ...doc,
        data: patch.data ? { ...doc.data, ...patch.data } : doc.data,
        status: patch.status !== undefined ? patch.status : doc.status,
        publishedAt: patch.publishedAt !== undefined ? patch.publishedAt : doc.publishedAt,
        meta: patch.meta ? { ...doc.meta, ...patch.meta } : doc.meta,
        updatedAt: new Date().toISOString()
      };
      docs.set(id, updated);
      return { ...updated, data: { ...updated.data } };
    },

    async delete(id) {
      return docs.delete(id);
    },

    /** Batch update sortOrder for reordering */
    async reorder(orderedIds) {
      if (!Array.isArray(orderedIds) || !orderedIds.length) return [];
      const now = new Date().toISOString();
      const result = [];
      for (let i = 0; i < orderedIds.length; i++) {
        const doc = docs.get(orderedIds[i]);
        if (doc) {
          doc.sortOrder = i;
          doc.updatedAt = now;
          result.push({ ...doc, data: { ...doc.data } });
        }
      }
      return result;
    },

    async count(options = {}) {
      let results = Array.from(docs.values());
      if (options.type) results = results.filter(d => d.type === options.type);
      if (options.status) results = results.filter(d => d.status === options.status);
      return results.length;
    }
  };
}

/**
 * Create a store instance based on the engine configuration.
 *
 * Supported engines:
 *   - 'memory' — in-memory store (default, zero dependencies)
 *   - 'sqlite'  — SQLite via sql.js WASM (persistent, requires sql.js package)
 *
 * @param {object} config
 * @param {string} [config.engine] — 'memory' | 'sqlite'
 * @param {string} [config.dataDir] — data directory for file-based stores
 * @returns {Promise<Store>}
 */
export async function createStore(config = {}) {
  const engine = (config.engine || process.env.TAICHU_STORAGE || 'memory').toLowerCase();

  switch (engine) {
    case 'memory':
      return createMemoryStore();

    case 'sqlite': {
      const { createSQLiteStore } = await import('./sqlite-store.js');
      return createSQLiteStore(config);
    }

    default:
      throw new Error(`Unknown storage engine: "${engine}". Supported: memory, sqlite`);
  }
}
