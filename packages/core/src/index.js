/**
 * @taichu/core — Content Model & Storage Abstraction
 *
 * Taichu 的核心哲学：
 *   - 一切内容都是"文档"(Document)，有类型(ContentType)和语义标记
 *   - 存储是抽象的——今天用 SQLite，明天可以换 Postgres 或文件系统
 *   - 内容不存 HTML 字符串，存结构化数据，由渲染层负责输出格式
 *   - Agent 和人类共享同一套内容模型，只是权限不同
 */

export { createContentType } from './content-type.js';
export { createStore, createMemoryStore } from './store.js';
export { createSQLiteStore } from './sqlite-store.js';
export { createHookSystem } from './hooks.js';
export { TaichuError, ValidationError, NotFoundError, UnauthorizedError, ForbiddenError, ConflictError } from './errors.js';
export { hashPassword, verifyPassword, signJWT, verifyJWT, generateAPIKey, verifyAPIKey } from './auth.js';
export { exportBackup, validateBackup, importBackup } from './backup.js';
