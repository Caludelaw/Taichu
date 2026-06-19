/**
 * Backup & Restore — 内容归档与恢复
 *
 * 零外部依赖的完整备份方案：
 *   - exportBackup(store) → 导出所有文档 + API 密钥为 JSON 归档
 *   - validateBackup(data)  → 校验备份格式有效性
 *   - importBackup(store, data, opts) → 从归档恢复内容
 *
 * 设计原则：
 *   - 备份格式自描述（meta 区包含版本、时间戳、统计）
 *   - 恢复支持冲突策略：skip（跳过已存在）、overwrite（覆盖）、merge（合并）
 *   - 全部纯函数，接收 store 作为参数，不依赖全局状态
 */

/**
 * @typedef {object} BackupMeta
 * @property {string} version — 备份格式版本号
 * @property {string} format — 固定值 'taichu-backup'
 * @property {string} createdAt — ISO 8601 创建时间
 * @property {object} stats — 统计信息
 * @property {number} stats.documentCount — 文档总数
 * @property {number} stats.apiKeyCount — API 密钥数
 */

/**
 * @typedef {object} BackupData
 * @property {BackupMeta} meta
 * @property {import('./store.js').Document[]} documents
 * @property {import('./store.js').Document[]} apiKeys
 */

const BACKUP_FORMAT = 'taichu-backup';
const BACKUP_VERSION = '1.0';

/**
 * 导出备份 — 从 store 中获取所有内容和 API 密钥，打包为归档对象。
 *
 * @param {import('./store.js').Store} store
 * @returns {Promise<BackupData>}
 */
export async function exportBackup(store) {
  const documents = [];
  const apiKeys = [];
  let offset = 0;
  const pageSize = 500;

  // Paginate through all documents
  let page;
  do {
    page = await store.list({ limit: pageSize, offset });
    documents.push(...page);
    offset += pageSize;
  } while (page.length === pageSize);

  // Separate API keys into their own section
  const contentDocs = [];
  for (const doc of documents) {
    if (doc.type === 'api_key') {
      apiKeys.push(doc);
    } else {
      contentDocs.push(doc);
    }
  }

  return {
    meta: {
      version: BACKUP_VERSION,
      format: BACKUP_FORMAT,
      createdAt: new Date().toISOString(),
      stats: {
        documentCount: contentDocs.length,
        apiKeyCount: apiKeys.length
      }
    },
    documents: contentDocs,
    apiKeys
  };
}

/**
 * 校验备份数据格式。
 *
 * @param {unknown} data — 待校验的备份数据
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateBackup(data) {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Backup data must be an object' };
  }

  if (!data.meta || data.meta.format !== BACKUP_FORMAT) {
    return { valid: false, error: `Invalid format: expected "${BACKUP_FORMAT}"` };
  }

  if (!Array.isArray(data.documents)) {
    return { valid: false, error: 'Missing "documents" array' };
  }

  if (!Array.isArray(data.apiKeys)) {
    return { valid: false, error: 'Missing "apiKeys" array' };
  }

  // Validate each document has required fields
  for (let i = 0; i < data.documents.length; i++) {
    const doc = data.documents[i];
    if (!doc.id || !doc.type || !doc.data) {
      return { valid: false, error: `Invalid document at index ${i}: missing id/type/data` };
    }
  }

  for (let i = 0; i < data.apiKeys.length; i++) {
    const key = data.apiKeys[i];
    if (!key.id || key.type !== 'api_key' || !key.data) {
      return { valid: false, error: `Invalid api_key at index ${i}` };
    }
  }

  return { valid: true };
}

/**
 * 恢复备份 — 将归档数据恢复到 store。
 *
 * @param {import('./store.js').Store} store
 * @param {BackupData} data — 备份数据
 * @param {object} [opts]
 * @param {'skip'|'overwrite'|'merge'} [opts.conflictStrategy='skip'] — 冲突处理策略
 * @param {boolean} [opts.includeApiKeys=false] — 是否恢复 API 密钥
 * @returns {Promise<{ imported: number, skipped: number, errors: Array<{id: string, error: string}> }>}
 */
export async function importBackup(store, data, opts = {}) {
  const { conflictStrategy = 'skip', includeApiKeys = false } = opts;

  const validation = validateBackup(data);
  if (!validation.valid) {
    throw new Error(`Invalid backup: ${validation.error}`);
  }

  const result = { imported: 0, skipped: 0, errors: [] };

  const items = includeApiKeys
    ? [...data.documents, ...data.apiKeys]
    : data.documents;

  for (const doc of items) {
    try {
      const existing = await store.get(doc.id);

      if (existing) {
        switch (conflictStrategy) {
          case 'skip':
            result.skipped++;
            continue;
          case 'overwrite':
            // Delete existing and recreate to get fresh timestamps
            await store.delete(doc.id);
            break;
          case 'merge':
            // Merge data into existing document
            await store.update(doc.id, {
              ...doc,
              data: { ...existing.data, ...doc.data },
              meta: { ...existing.meta, ...doc.meta }
            });
            result.imported++;
            continue;
          default:
            result.skipped++;
            continue;
        }
      }

      await store.create({
        id: doc.id,
        type: doc.type,
        data: doc.data || {},
        status: doc.status || 'draft',
        publishedAt: doc.publishedAt || null,
        tenantId: doc.tenantId || 'default',
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        createdBy: doc.createdBy || null,
        meta: doc.meta || {}
      });
      result.imported++;
    } catch (err) {
      result.errors.push({ id: doc.id, error: err.message });
    }
  }

  return result;
}
