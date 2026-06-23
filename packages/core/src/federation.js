/**
 * Federation — Cross-Instance Content Discovery
 *
 * Taichu 联邦协议：让多个 Taichu 实例之间发现和共享内容。
 *
 * 核心功能：
 *   - 远程实例注册表（add/remove/list）
 *   - WebFinger 自动发现
 *   - 远程内容浏览（通过 ActivityPub Outbox 或 REST API）
 *   - 远程实例健康检查
 *   - 内容规范化（统一远程内容格式）
 *
 * 架构原则：
 *   - 零外部依赖（仅 Node.js built-ins）
 *   - 实例注册表可通过 store 持久化
 *   - 内容发现通过标准 ActivityPub 协议
 */

/**
 * @typedef {Object} RemoteInstance
 * @property {string} url       - 实例基础 URL
 * @property {string} name      - 实例名称
 * @property {string} [version] - 实例版本
 * @property {string} [actor]   - Actor URL
 * @property {string} status    - 'active' | 'inactive' | 'error'
 * @property {string} addedAt   - ISO 8601 添加时间
 * @property {string} [lastSeen] - 最后心跳时间
 * @property {string} [error]   - 最后一次错误信息
 */

/**
 * @typedef {Object} RemoteContent
 * @property {string} id        - 远程内容 ID
 * @property {string} title     - 标题
 * @property {string} type      - 内容类型
 * @property {string} url       - 远程 URL
 * @property {string} [summary] - 摘要
 * @property {string} [published] - 发布时间
 * @property {string} instanceUrl - 所属实例 URL
 */

// ════════════════════════════════════════════════════════════
// Instance Registry
// ════════════════════════════════════════════════════════════

/** @type {Map<string, RemoteInstance>} */
const _instances = new Map();

/**
 * Add a remote instance to the registry.
 */
export function addRemoteInstance(url, name = '', opts = {}) {
  const normalized = normalizeUrl(url);
  if (!normalized) {
    throw new Error('Invalid instance URL');
  }

  if (_instances.has(normalized)) {
    // Update existing
    const existing = _instances.get(normalized);
    if (name) existing.name = name;
    if (opts.version) existing.version = opts.version;
    if (opts.actor) existing.actor = opts.actor;
    existing.status = 'active';
    existing.lastSeen = new Date().toISOString();
    existing.error = undefined;
    return existing;
  }

  /** @type {RemoteInstance} */
  const instance = {
    url: normalized,
    name: name || extractHostname(normalized),
    version: opts.version || undefined,
    actor: opts.actor || undefined,
    status: 'active',
    addedAt: new Date().toISOString(),
    lastSeen: new Date().toISOString()
  };

  _instances.set(normalized, instance);
  return instance;
}

/**
 * Remove a remote instance from the registry.
 */
export function removeRemoteInstance(url) {
  const normalized = normalizeUrl(url);
  if (!normalized) return false;
  return _instances.delete(normalized);
}

/**
 * Get a specific remote instance.
 */
export function getRemoteInstance(url) {
  const normalized = normalizeUrl(url);
  return _instances.get(normalized) || null;
}

/**
 * List all registered remote instances.
 */
export function listRemoteInstances(filter = {}) {
  let items = Array.from(_instances.values());

  if (filter.status) {
    items = items.filter(i => i.status === filter.status);
  }

  if (filter.search) {
    const q = filter.search.toLowerCase();
    items = items.filter(i =>
      i.name.toLowerCase().includes(q) ||
      i.url.toLowerCase().includes(q)
    );
  }

  return items;
}

/**
 * Mark an instance as having an error.
 */
export function markInstanceError(url, errorMsg) {
  const normalized = normalizeUrl(url);
  const inst = _instances.get(normalized);
  if (inst) {
    inst.status = 'error';
    inst.error = errorMsg;
    inst.lastSeen = new Date().toISOString();
  }
}

/**
 * Update instance heartbeat.
 */
export function instanceHeartbeat(url) {
  const normalized = normalizeUrl(url);
  const inst = _instances.get(normalized);
  if (inst) {
    inst.lastSeen = new Date().toISOString();
    if (inst.status === 'inactive' || inst.status === 'error') {
      inst.status = 'active';
      inst.error = undefined;
    }
  }
}

/**
 * Get instance count.
 */
export function instanceCount() {
  return _instances.size;
}

/**
 * Clear all instances (for testing).
 */
export function clearInstances() {
  _instances.clear();
}

// ════════════════════════════════════════════════════════════
// WebFinger Discovery
// ════════════════════════════════════════════════════════════

/**
 * Build WebFinger URL for a given host.
 */
export function buildWebfingerUrl(host, username = 'taichu') {
  const scheme = host.startsWith('http') ? '' : 'https://';
  return `${scheme}${host}/.well-known/webfinger?resource=acct:${username}@${extractHostname(host)}`;
}

/**
 * Build NodeInfo discovery URL.
 */
export function buildNodeInfoUrl(host) {
  const scheme = host.startsWith('http') ? '' : 'https://';
  return `${scheme}${host}/.well-known/nodeinfo`;
}

/**
 * Build actor URL for an instance.
 */
export function buildActorUrl(host) {
  const scheme = host.startsWith('http') ? '' : 'https://';
  return `${scheme}${host}/api/activitypub/actor`;
}

/**
 * Build outbox URL for an instance.
 */
export function buildOutboxUrl(host) {
  const scheme = host.startsWith('http') ? '' : 'https://';
  return `${scheme}${host}/api/activitypub/outbox`;
}

/**
 * Try to auto-discover a Taichu instance on a given host.
 * Returns candidate URLs if the host looks like a Taichu instance.
 */
export function discoverCandidates(host) {
  const normalized = host.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const candidates = [
    `https://${normalized}`,
    `http://${normalized}`
  ];

  // Try common subdomain patterns
  if (!normalized.includes('.')) {
    candidates.push(`https://${normalized}.localhost`);
  }

  return candidates;
}

// ════════════════════════════════════════════════════════════
// Content Parsing & Normalization
// ════════════════════════════════════════════════════════════

/**
 * Normalize remote ActivityPub actor data.
 */
export function normalizeActorResponse(actorData) {
  if (!actorData || typeof actorData !== 'object') return null;

  return {
    id: actorData.id || '',
    type: actorData.type || 'Person',
    name: actorData.name || actorData.preferredUsername || '',
    summary: actorData.summary || '',
    url: actorData.url || '',
    inbox: actorData.inbox || '',
    outbox: actorData.outbox || '',
    followers: actorData.followers || ''
  };
}

/**
 * Normalize a remote activity into a RemoteContent item.
 */
export function normalizeRemoteActivity(activity, instanceUrl) {
  const obj = activity.object || activity;

  /** @type {RemoteContent} */
  const content = {
    id: obj.id || activity.id || '',
    title: obj.name || obj.title || obj.content?.substring(0, 80) || '',
    type: obj.type || 'Article',
    url: obj.url || obj.id || '',
    summary: obj.summary || obj.content?.substring(0, 200) || '',
    published: obj.published || activity.published || '',
    instanceUrl: instanceUrl || ''
  };

  return content;
}

/**
 * Normalize a list of remote activities from an outbox.
 */
export function normalizeOutboxResponse(outboxData, instanceUrl) {
  if (!outboxData || typeof outboxData !== 'object') return [];

  const items = outboxData.orderedItems || outboxData.items || [];
  return items.map(activity => normalizeRemoteActivity(activity, instanceUrl));
}

/**
 * Parse NodeInfo response to extract instance metadata.
 */
export function normalizeNodeInfo(nodeInfoData) {
  if (!nodeInfoData || typeof nodeInfoData !== 'object') return null;

  return {
    version: nodeInfoData.version || '2.0',
    software: {
      name: nodeInfoData.software?.name || '',
      version: nodeInfoData.software?.version || ''
    },
    protocols: nodeInfoData.protocols || [],
    openRegistrations: nodeInfoData.openRegistrations || false,
    metadata: nodeInfoData.metadata || {}
  };
}

// ════════════════════════════════════════════════════════════
// Content Type Compatibility
// ════════════════════════════════════════════════════════════

/**
 * Map common ActivityPub types to Taichu content types.
 */
const AP_TYPE_MAP = {
  'Article': 'article',
  'Note': 'article',
  'Page': 'page',
  'Image': 'media',
  'Video': 'media',
  'Audio': 'media',
  'Document': 'article',
  'Event': 'article'
};

/**
 * Try to map an ActivityPub type to a Taichu content type.
 */
export function mapApTypeToTaichu(apType) {
  return AP_TYPE_MAP[apType] || 'article';
}

/**
 * Check if two content types are compatible for federation.
 */
export function areTypesCompatible(typeA, typeB) {
  if (typeA === typeB) return true;
  // article is the universal fallback
  if (typeA === 'article' || typeB === 'article') return true;
  return false;
}

// ════════════════════════════════════════════════════════════
// Utilities
// ════════════════════════════════════════════════════════════

/**
 * Normalize an instance URL.
 */
function normalizeUrl(url) {
  if (!url || typeof url !== 'string') return null;
  let normalized = url.trim().replace(/\/+$/, '');
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = `https://${normalized}`;
  }
  try {
    const parsed = new URL(normalized);
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * Extract hostname from a URL.
 */
function extractHostname(url) {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname;
  } catch {
    return url;
  }
}
