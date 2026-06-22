/**
 * Agent Marketplace — Capability Discovery API
 *
 * 零依赖的 Agent 能力注册与发现模块。
 * Agent 注册自身能力（名称、描述、工具列表、端点、速率限制），
 * 其他 Agent 通过关键词/标签/能力类型发现匹配的能力提供者。
 *
 * 数据结构:
 *   Capability { name, description, version, tools[], endpoints[], scopes[], tags[], rateLimit, metadata }
 *   AgentEntry { id, capability, status, createdAt, updatedAt, lastSeenAt }
 */

import { randomBytes, timingSafeEqual } from 'node:crypto';

// ── 内存注册表 ──────────────────────────────────────────────────
/** @type {Map<string, AgentEntry>} */
const registry = new Map();

/**
 * 生成唯一的 Agent 注册 ID。
 * @returns {string}
 */
export function generateAgentId() {
  return `agent_${randomBytes(12).toString('hex')}`;
}

/**
 * 生成 Agent 注册令牌（用于后续更新/注销）。
 * @returns {string}
 */
export function generateAgentToken() {
  return `atok_${randomBytes(16).toString('hex')}`;
}

/**
 * 验证 Capability 数据结构。
 * @param {object} capability
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateCapability(capability) {
  const errors = [];
  if (!capability || typeof capability !== 'object') {
    return { valid: false, errors: ['Capability must be an object'] };
  }
  if (!capability.name || typeof capability.name !== 'string') {
    errors.push('name is required and must be a string');
  }
  if (capability.name && capability.name.length > 100) {
    errors.push('name must be 100 characters or fewer');
  }
  if (capability.description && typeof capability.description !== 'string') {
    errors.push('description must be a string');
  }
  if (capability.version && typeof capability.version !== 'string') {
    errors.push('version must be a string');
  }
  if (capability.tools && !Array.isArray(capability.tools)) {
    errors.push('tools must be an array');
  }
  if (capability.endpoints && !Array.isArray(capability.endpoints)) {
    errors.push('endpoints must be an array');
  }
  if (capability.scopes && !Array.isArray(capability.scopes)) {
    errors.push('scopes must be an array');
  }
  if (capability.tags && !Array.isArray(capability.tags)) {
    errors.push('tags must be an array');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * 注册一个 Agent 到市场中。
 *
 * @param {object} capability — Agent 能力描述
 * @param {string} capability.name — 能力名称（唯一标识）
 * @param {string} capability.description — 能力描述
 * @param {string} [capability.version='1.0.0'] — 版本号
 * @param {Array<{name:string, description?:string, inputSchema?:object}>} [capability.tools=[]] — 提供的工具列表
 * @param {Array<{path:string, method:string, description?:string}>} [capability.endpoints=[]] — 暴露的端点
 * @param {string[]} [capability.scopes=[]] — 所需权限作用域
 * @param {string[]} [capability.tags=[]] — 标签
 * @param {{ requestsPerMinute?:number }} [capability.rateLimit] — 速率限制
 * @param {object} [capability.metadata] — 扩展元数据
 * @param {string} [token] — 更新时需要的注册令牌
 * @returns {{ entry: AgentEntry, token: string }}
 */
export function registerAgent(capability, token) {
  const validation = validateCapability(capability);
  if (!validation.valid) {
    const err = new Error(`Invalid capability: ${validation.errors.join('; ')}`);
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const normalized = {
    name: capability.name,
    description: capability.description || '',
    version: capability.version || '1.0.0',
    tools: capability.tools || [],
    endpoints: capability.endpoints || [],
    scopes: capability.scopes || [],
    tags: (capability.tags || []).map(t => t.toLowerCase()),
    rateLimit: capability.rateLimit || {},
    metadata: capability.metadata || {}
  };

  const now = new Date().toISOString();

  // 检查是否已存在（更新模式）
  for (const [id, existing] of registry) {
    if (existing.capability.name === normalized.name) {
      if (token && existing.token && !safeEqual(token, existing.token)) {
        const err = new Error('Invalid agent token for update');
        err.code = 'UNAUTHORIZED';
        throw err;
      }
      const updated = {
        ...existing,
        capability: normalized,
        updatedAt: now,
        lastSeenAt: now
      };
      registry.set(id, updated);
      return { entry: updated, token: existing.token };
    }
  }

  // 新建注册
  const id = generateAgentId();
  const newToken = generateAgentToken();
  const entry = {
    id,
    capability: normalized,
    status: 'active',
    token: newToken,
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now
  };
  registry.set(id, entry);
  return { entry, token: newToken };
}

/**
 * 注销一个 Agent。
 * @param {string} agentId — Agent ID
 * @param {string} token — 注册令牌
 * @returns {boolean}
 */
export function unregisterAgent(agentId, token) {
  const entry = registry.get(agentId);
  if (!entry) return false;
  if (!safeEqual(token, entry.token)) {
    const err = new Error('Invalid agent token for unregister');
    err.code = 'UNAUTHORIZED';
    throw err;
  }
  return registry.delete(agentId);
}

/**
 * 更新 Agent 心跳时间。
 * @param {string} agentId — Agent ID
 * @param {string} token — 注册令牌
 * @returns {boolean}
 */
export function agentHeartbeat(agentId, token) {
  const entry = registry.get(agentId);
  if (!entry) return false;
  if (!safeEqual(token, entry.token)) return false;
  entry.lastSeenAt = new Date().toISOString();
  return true;
}

/**
 * 获取所有已注册的 Agent。
 * @returns {AgentEntry[]}
 */
export function listAgents() {
  return Array.from(registry.values());
}

/**
 * 获取单个 Agent 的详细信息。
 * @param {string} agentId
 * @returns {AgentEntry|undefined}
 */
export function getAgent(agentId) {
  return registry.get(agentId);
}

/**
 * 发现 Agent — 按关键词/标签/能力匹配搜索。
 *
 * @param {object} opts
 * @param {string} [opts.query] — 自由文本搜索（匹配名称、描述、标签、工具名）
 * @param {string} [opts.tag] — 按标签过滤
 * @param {string} [opts.tool] — 按工具名搜索
 * @param {string} [opts.scope] — 按权限作用域搜索
 * @param {string} [opts.status] — 按状态过滤（默认 'active'）
 * @param {number} [opts.limit=20]
 * @param {number} [opts.offset=0]
 * @returns {{ agents: AgentEntry[], total: number }}
 */
export function discoverAgents(opts = {}) {
  const { query, tag, tool, scope, status = 'active', limit = 20, offset = 0 } = opts;

  let results = Array.from(registry.values());

  // 状态过滤
  results = results.filter(a => a.status === status);

  // 自由文本搜索
  if (query) {
    const q = query.toLowerCase();
    results = results.filter(a =>
      a.capability.name.toLowerCase().includes(q) ||
      a.capability.description.toLowerCase().includes(q) ||
      a.capability.tags.some(t => t.includes(q)) ||
      a.capability.tools.some(t => t.name.toLowerCase().includes(q))
    );
  }

  // 标签过滤
  if (tag) {
    const t = tag.toLowerCase();
    results = results.filter(a => a.capability.tags.includes(t));
  }

  // 工具名搜索
  if (tool) {
    const t = tool.toLowerCase();
    results = results.filter(a =>
      a.capability.tools.some(tl => tl.name.toLowerCase().includes(t))
    );
  }

  // 作用域搜索
  if (scope) {
    results = results.filter(a => a.capability.scopes.includes(scope));
  }

  const total = results.length;
  const agents = results.slice(offset, offset + limit);

  return { agents, total };
}

/**
 * 获取市场中所有标签（用于过滤器 UI）。
 * @returns {string[]}
 */
export function listTags() {
  const tags = new Set();
  for (const entry of registry.values()) {
    for (const tag of entry.capability.tags) {
      tags.add(tag);
    }
  }
  return Array.from(tags).sort();
}

/**
 * 获取市场中所有工具名称（用于自动补全）。
 * @returns {string[]}
 */
export function listTools() {
  const tools = new Set();
  for (const entry of registry.values()) {
    for (const tool of entry.capability.tools) {
      tools.add(tool.name);
    }
  }
  return Array.from(tools).sort();
}

/**
 * 常量时间字符串比较，防止时序攻击。
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  if (bufA.length !== bufB.length) {
    // 仍然做常量时间比较以避免长度信息泄露
    const maxLen = Math.max(bufA.length, bufB.length);
    for (let i = 0; i < maxLen; i++) {
      (bufA[i] || 0) ^ (bufB[i] || 0);
    }
    return false;
  }
  try {
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
