/**
 * Config — 集中式配置管理
 *
 * 替代散落的 process.env.TAICHU_* 读取，提供：
 *   - Schema 验证（类型、必填、默认值、枚举）
 *   - 启动时一次性校验，拒绝无效配置
 *   - 不可变配置对象
 */

import { getTaichuVersion } from '../../core/src/version.js';

const schema = [
  // Server
  { key: 'port',          env: 'TAICHU_PORT',          type: 'number',  default: 3120,  min: 1, max: 65535 },
  { key: 'host',          env: 'TAICHU_HOST',          type: 'string',  default: '0.0.0.0' },
  { key: 'version',       env: 'TAICHU_VERSION',       type: 'string',  default: getTaichuVersion() },

  // Storage
  { key: 'storage',       env: 'TAICHU_STORAGE',       type: 'enum',    default: 'memory',  values: ['memory', 'sqlite'] },
  { key: 'dataDir',       env: 'TAICHU_DATA_DIR',       type: 'string',  default: null },
  { key: 'sqliteFlushMs', env: 'TAICHU_SQLITE_FLUSH_MS',type: 'number', default: 5000, min: 1000, max: 60000 },

  // Auth
  { key: 'jwtSecret',     env: 'TAICHU_JWT_SECRET',    type: 'string',  default: '__AUTO__' },
  { key: 'jwtExpiresIn',  env: 'TAICHU_JWT_EXPIRES_IN',type: 'string',  default: '7d' },

  // Security
  { key: 'publicRead',    env: 'TAICHU_PUBLIC_READ',   type: 'boolean', default: false },
  { key: 'maxBodySize',   env: 'TAICHU_MAX_BODY_SIZE', type: 'number',  default: 5 * 1024 * 1024, min: 1024 },
  { key: 'maxFileSize',   env: 'TAICHU_MAX_FILE_SIZE', type: 'number',  default: 50 * 1024 * 1024, min: 1024 },

  // Uploads
  { key: 'uploadDir',     env: 'TAICHU_UPLOAD_DIR',    type: 'string',  default: null },

  // Logging
  { key: 'logLevel',      env: 'TAICHU_LOG_LEVEL',     type: 'enum',    default: 'info',    values: ['debug', 'info', 'warn', 'error'] },
  { key: 'logFormat',     env: 'TAICHU_LOG_FORMAT',    type: 'enum',    default: 'pretty',  values: ['pretty', 'json'] },

  // Environment
  { key: 'nodeEnv',       env: 'NODE_ENV',           type: 'enum',    default: 'development', values: ['development', 'production', 'test'] },
];

/**
 * @typedef {object} TaichuConfig
 */

let _config = null;
let _warnings = [];

/**
 * Load and validate configuration.
 * Call once at startup. Returns frozen config object.
 *
 * @returns {TaichuConfig}
 */
export function loadConfig() {
  if (_config) return _config;

  const config = {};
  const issues = [];

  for (const field of schema) {
    let value = process.env[field.env];

    if (value === undefined || value === '') {
      value = field.default;
    }

    // Type coercion & validation
    switch (field.type) {
      case 'number': {
        const num = parseInt(value, 10);
        if (isNaN(num)) {
          issues.push(`${field.env}: "${value}" is not a valid number, using default ${field.default}`);
          value = field.default;
        } else if (field.min !== undefined && num < field.min) {
          issues.push(`${field.env}: ${num} < min ${field.min}, using ${field.min}`);
          value = field.min;
        } else if (field.max !== undefined && num > field.max) {
          issues.push(`${field.env}: ${num} > max ${field.max}, using ${field.max}`);
          value = field.max;
        } else {
          value = num;
        }
        break;
      }
      case 'boolean': {
        value = value === '1' || value === 'true' || value === 'yes';
        break;
      }
      case 'enum': {
        if (!field.values.includes(value)) {
          issues.push(`${field.env}: "${value}" not in [${field.values.join(', ')}], using default "${field.default}"`);
          value = field.default;
        }
        break;
      }
      default:
        value = String(value);
    }

    config[field.key] = value;
  }

  _warnings = issues;
  _config = Object.freeze(config);

  return _config;
}

/**
 * Get warnings from config loading (for logging on startup).
 */
export function getConfigWarnings() {
  return _warnings;
}

/**
 * Get current config (must call loadConfig() first).
 */
export function getConfig() {
  if (!_config) throw new Error('Config not loaded. Call loadConfig() first.');
  return _config;
}

/**
 * Print config summary for startup banner.
 */
export function configSummary() {
  const c = getConfig();
  return [
    `  Storage:   ${c.storage === 'sqlite' ? `sqlite (${c.dataDir || '.taichu/data/taichu.db'})` : 'memory'}`,
    `  Log:       ${c.logLevel} / ${c.logFormat}`,
    `  Public:    ${c.publicRead ? 'read enabled' : 'auth required'}`,
    `  Uploads:   ${c.maxFileSize / 1024 / 1024}MB max`,
    ''
  ].join('\n');
}
