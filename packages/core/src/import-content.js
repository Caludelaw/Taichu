/**
 * Content Import — 从 Markdown / CSV / JSON 导入内容
 *
 * 零外部依赖的通用内容导入方案：
 *   - parseMarkdown(content, opts) → 解析 Markdown 文件（支持 YAML 前置元数据）
 *   - parseCSV(content, opts)      → 解析 CSV 表格数据
 *   - parseJSON(content, opts)     → 解析 JSON 对象/数组
 *   - importContent(store, ct, items, opts) → 批量导入至 store
 *
 * 设计原则：
 *   - 每种格式的解析器独立且纯函数
 *   - 导入函数支持冲突策略：skip / overwrite / merge
 *   - 所有导出函数接收 store 和 contentType 作为参数，不依赖全局状态
 *   - 与 backup.js 的 importBackup 保持一致的返回结构
 */

/**
 * @typedef {object} ImportItem
 * @property {string} [type]     — 内容类型名称（若未指定则使用路由中的 type）
 * @property {object} data       — 结构化内容数据
 * @property {string} [status]   — 'draft' | 'published' | 'archived'
 * @property {string} [id]       — 可选 ID（用于去重/覆盖）
 * @property {string} [tenantId]
 * @property {object} [meta]
 */

/**
 * @typedef {object} ImportOptions
 * @property {'skip'|'overwrite'|'merge'} [conflictStrategy='skip']
 * @property {boolean} [dryRun=false]   — 仅校验，不实际导入
 * @property {string} [type]            — 默认内容类型
 * @property {string} [status]          — 默认状态
 * @property {string} [tenantId]
 */

const HEADING_RE = /^#\s+(.+)$/m;

// ─── Markdown ─────────────────────────────────────────────────

/**
 * 解析 Markdown 文本为导入条目。
 *
 * 支持的 Markdown 结构：
 *   1. YAML frontmatter (--- ... ---) → 映射到 data 字段
 *   2. 第一个 # 标题 → data.title
 *   3. 剩余内容 → data.body
 *
 * 单文件模式：返回单个 ImportItem。
 *
 * @param {string} content  — Markdown 文本
 * @param {ImportOptions} [opts]
 * @returns {ImportItem}
 */
export function parseMarkdown(content, opts = {}) {
  const result = { data: {} };

  let rest = content;

  // Try to parse YAML frontmatter
  if (rest.startsWith('---')) {
    const endIdx = rest.indexOf('\n---', 3);
    if (endIdx !== -1) {
      const fm = rest.slice(4, endIdx);
      rest = rest.slice(endIdx + 4).trimStart();
      const frontmatter = parseSimpleYAML(fm);
      Object.assign(result.data, frontmatter);
    }
  }

  // Extract first heading as title
  const headingMatch = rest.match(HEADING_RE);
  if (headingMatch) {
    result.data.title = result.data.title || headingMatch[1].trim();
    // Remove the heading line from body
    rest = rest.replace(HEADING_RE, '').trimStart();
  }

  // Remaining content is the body
  result.data.body = rest.trim() || result.data.body || '';

  // Apply defaults
  result.type = opts.type || result.data.type || 'article';
  result.status = opts.status || result.data.status || 'draft';
  if (opts.tenantId) result.tenantId = opts.tenantId;

  // Clean up non-data fields from data
  delete result.data.type;
  delete result.data.status;

  return result;
}

// ─── CSV ──────────────────────────────────────────────────────

/**
 * 解析 CSV 文本为导入条目列表。
 *
 * 第一行为表头，后续每行为一个文档。
 * 列名映射规则：
 *   - title      → data.title
 *   - body/content → data.body
 *   - status     → status（顶层）
 *   - id         → id（顶层，用于去重）
 *   - slug/author/tags/category → data[field]
 *   - 其余列    → data[col]
 *
 * @param {string} content  — CSV 文本
 * @param {ImportOptions} [opts]
 * @returns {ImportItem[]}
 */
export function parseCSV(content, opts = {}) {
  const lines = parseCSVLines(content);
  if (lines.length < 2) return [];

  const headers = lines[0];
  const items = [];

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    if (row.length === 0 || (row.length === 1 && !row[0])) continue;

    const item = { data: {} };

    for (let j = 0; j < headers.length; j++) {
      const key = (headers[j] || '').trim().toLowerCase();
      const val = (row[j] || '').trim();

      if (!key) continue;

      switch (key) {
        case 'title':   item.data.title = val; break;
        case 'body':
        case 'content': item.data.body = (item.data.body || '') + (item.data.body ? '\n' : '') + val; break;
        case 'status':  item.status = val; break;
        case 'id':      item.id = val; break;
        case 'type':    item.type = val; break;
        default:        item.data[key] = val; break;
      }
    }

    // Apply defaults
    item.type = item.type || opts.type || 'article';
    item.status = item.status || opts.status || 'draft';
    if (opts.tenantId) item.tenantId = opts.tenantId;

    items.push(item);
  }

  return items;
}

// ─── JSON ─────────────────────────────────────────────────────

/**
 * 解析 JSON 文本为导入条目列表。
 *
 * 支持的 JSON 结构：
 *   - 单个对象：`{ "data": {...}, "type": "article" }` → 一个条目
 *   - 对象数组：`[{...}, {...}]` → 多个条目
 *   - 属性数组（无 type/data 包装）：自动包装
 *
 * @param {string} content  — JSON 文本
 * @param {ImportOptions} [opts]
 * @returns {ImportItem[]}
 */
export function parseJSON(content, opts = {}) {
  const parsed = JSON.parse(content);
  const items = Array.isArray(parsed) ? parsed : [parsed];

  return items.map(item => {
    // If item has explicit { type, data, status } structure, use it
    if (item.data && typeof item.data === 'object') {
      const result = {
        type: item.type || opts.type || 'article',
        data: { ...item.data },
        status: item.status || opts.status || 'draft'
      };
      if (item.id) result.id = item.id;
      if (item.tenantId || opts.tenantId) result.tenantId = item.tenantId || opts.tenantId;
      if (item.meta) result.meta = item.meta;
      return result;
    }

    // Otherwise treat whole object as data, extract known top-level keys
    const { id, type, status, tenantId, meta, ...rest } = item;
    return {
      type: type || opts.type || 'article',
      data: rest,
      status: status || opts.status || 'draft',
      tenantId: tenantId || opts.tenantId || undefined,
      ...(id && { id }),
      ...(meta && { meta })
    };
  });
}

// ─── Import Engine ────────────────────────────────────────────

/**
 * 将解析后的条目批量导入到 store。
 *
 * @param {import('./store.js').Store} store
 * @param {import('./content-type.js').ContentType} contentType  — 用于校验每个条目
 * @param {ImportItem[]} items  — 待导入的条目列表
 * @param {ImportOptions} [opts]
 * @returns {Promise<{ imported: number, skipped: number, errors: Array<{index: number, error: string}> }>}
 */
export async function importContent(store, contentType, items, opts = {}) {
  const { conflictStrategy = 'skip', dryRun = false, tenantId } = opts;
  const result = { imported: 0, skipped: 0, errors: [] };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    try {
      // Use item.type or fallback to contentType name
      const docType = item.type || contentType.name;

      // Handle ID-based conflict detection BEFORE validation
      if (item.id) {
        const existing = await store.get(item.id);

        if (existing) {
          switch (conflictStrategy) {
            case 'skip':
              result.skipped++;
              continue;
            case 'overwrite': {
              // Validate incoming data (overwrite requires complete data)
              const owValidation = contentType.validate(item.data);
              if (!owValidation.valid) {
                result.errors.push({ index: i, error: `Validation failed: ${owValidation.errors.join('; ')}` });
                continue;
              }
              if (dryRun) { result.imported++; continue; }
              await store.delete(item.id);
              break;
            }
            case 'merge': {
              // Validate merged result (existing + incoming)
              const merged = { ...existing.data, ...item.data };
              const mergeValidation = contentType.validate(merged);
              if (!mergeValidation.valid) {
                result.errors.push({ index: i, error: `Merge validation failed: ${mergeValidation.errors.join('; ')}` });
                continue;
              }
              if (dryRun) { result.imported++; continue; }
              await store.update(item.id, {
                data: merged,
                status: item.status || existing.status,
                meta: { ...existing.meta, ...item.meta }
              });
              result.imported++;
              continue;
            }
            default:
              result.skipped++;
              continue;
          }
        }
      }

      // Validate content data against the content type schema
      const validation = contentType.validate(item.data);
      if (!validation.valid) {
        result.errors.push({ index: i, error: `Validation failed: ${validation.errors.join('; ')}` });
        continue;
      }

      if (dryRun) {
        result.imported++;
        continue;
      }

      // Build document
      const doc = {
        type: docType,
        data: item.data,
        status: item.status || 'draft',
        tenantId: item.tenantId || tenantId || 'default',
        meta: item.meta || {}
      };

      if (item.id) doc.id = item.id;

      await store.create(doc);
      result.imported++;
    } catch (err) {
      result.errors.push({ index: i, error: err.message });
    }
  }

  return result;
}

// ─── Helpers ──────────────────────────────────────────────────

/**
 * 简易 YAML 解析器 — 仅处理 key: value 形式。
 * 不支持嵌套对象、列表、引用等高级 YAML 特性。
 */
function parseSimpleYAML(text) {
  const result = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    let value = trimmed.slice(colonIdx + 1).trim();

    // Unquote
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    // Type coercion
    if (value === 'true') { result[key] = true; continue; }
    if (value === 'false') { result[key] = false; continue; }
    if (value === 'null' || value === '~') { result[key] = null; continue; }
    if (/^-?\d+$/.test(value)) { result[key] = parseInt(value, 10); continue; }
    if (/^-?\d+\.\d+$/.test(value)) { result[key] = parseFloat(value); continue; }

    // Comma-separated list
    if (value.includes(',')) {
      result[key] = value.split(',').map(s => s.trim()).filter(Boolean);
      continue;
    }

    result[key] = value;
  }
  return result;
}

/**
 * 简易 CSV 行解析器 — 处理引号转义。
 */
function parseCSVLines(content) {
  const lines = [];
  let current = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++; // skip escaped quote
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        current.push(field);
        field = '';
      } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        current.push(field);
        field = '';
        if (current.length > 0) lines.push(current);
        current = [];
        if (ch === '\r') i++; // skip \n in \r\n
      } else if (ch !== '\r') {
        field += ch;
      }
    }
  }

  // Last field/line
  if (field || current.length > 0) {
    current.push(field);
    lines.push(current);
  }

  return lines;
}
