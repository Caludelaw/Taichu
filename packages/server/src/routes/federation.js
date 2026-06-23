/**
 * Federation Routes — Cross-Instance Content Discovery
 *
 * GET    /api/federation/instances                    — List known remote instances
 * POST   /api/federation/instances                    — Add a remote instance
 * DELETE /api/federation/instances/:id                — Remove a remote instance
 * GET    /api/federation/instances/:id/health         — Check remote instance health
 * GET    /api/federation/instances/:id/content        — Browse remote content
 * GET    /api/federation/instances/:id/content/:type  — Browse by content type
 * GET    /api/federation/discover?host=example.com    — Auto-discover instance
 * GET    /api/federation/stats                        — Federation statistics
 */

import {
  addRemoteInstance,
  removeRemoteInstance as _removeInstance,
  listRemoteInstances,
  getRemoteInstance,
  markInstanceError,
  instanceHeartbeat,
  instanceCount,
  buildWebfingerUrl,
  buildNodeInfoUrl,
  buildActorUrl,
  buildOutboxUrl,
  normalizeActorResponse,
  normalizeOutboxResponse,
  normalizeNodeInfo
} from '../../../core/src/federation.js';
import { requireAuth } from '../middleware/auth.js';
import { createLogger } from '../logger.js';

const log = createLogger('federation');

/**
 * Fetch JSON from a URL with timeout.
 */
async function fetchJSON(url, opts = {}) {
  const { timeout = 10000, headers = {} } = opts;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json, application/activity+json, application/jrd+json',
        'User-Agent': 'Taichu-Federation/1.0',
        ...headers
      },
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Route handler for federation endpoints.
 * @param {import('../context.js').Context} ctx
 */
export async function federationRoutes(ctx) {
  const { pathname } = ctx.url;
  const method = ctx.req.method;

  // Federation discover
  if (pathname === '/api/federation/discover' && method === 'GET') {
    return handleDiscover(ctx);
  }

  // Federation stats
  if (pathname === '/api/federation/stats' && method === 'GET') {
    return handleStats(ctx);
  }

  // Instance health check
  const healthMatch = pathname.match(/^\/api\/federation\/instances\/(.+)\/health$/);
  if (healthMatch && method === 'GET') {
    return handleInstanceHealth(ctx, decodeURIComponent(healthMatch[1]));
  }

  // Instance content browse
  const contentMatch = pathname.match(/^\/api\/federation\/instances\/(.+)\/content(?:\/([a-z][a-z0-9_]*))?$/);
  if (contentMatch && method === 'GET') {
    const instanceId = decodeURIComponent(contentMatch[1]);
    const type = contentMatch[2] || undefined;
    return handleInstanceContent(ctx, instanceId, type);
  }

  // Instance-specific operations
  const instanceMatch = pathname.match(/^\/api\/federation\/instances\/(.+)$/);
  if (instanceMatch) {
    const instanceId = decodeURIComponent(instanceMatch[1]);
    if (method === 'GET') {
      return handleGetInstance(ctx, instanceId);
    }
    if (method === 'DELETE') {
      return handleRemoveInstance(ctx, instanceId);
    }
  }

  // List / Add instances
  if (pathname === '/api/federation/instances') {
    if (method === 'GET') {
      return handleListInstances(ctx);
    }
    if (method === 'POST') {
      return handleAddInstance(ctx);
    }
  }

  ctx.res.writeHead(404, { 'Content-Type': 'application/json' });
  ctx.res.end(JSON.stringify({ error: 'NOT_FOUND' }));
}

// ════════════════════════════════════════════════════════════
// Handlers
// ════════════════════════════════════════════════════════════

async function handleDiscover(ctx) {
  const host = ctx.url.searchParams.get('host');
  if (!host) {
    ctx.res.writeHead(400, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: 'MISSING_PARAM', message: '?host= is required' }));
    return;
  }

  const results = { host, candidates: [], discovered: null, errors: [] };

  // Try webfinger discovery
  const wfUrl = buildWebfingerUrl(host);
  try {
    const wfData = await fetchJSON(wfUrl);
    results.webfinger = wfData;
  } catch (err) {
    results.errors.push(`WebFinger: ${err.message}`);
  }

  // Try actor endpoint
  const actorUrl = buildActorUrl(host);
  try {
    const actorData = await fetchJSON(actorUrl);
    results.actor = normalizeActorResponse(actorData);
  } catch (err) {
    results.errors.push(`Actor: ${err.message}`);
  }

  // Try nodeinfo
  const niUrl = buildNodeInfoUrl(host);
  try {
    const niData = await fetchJSON(niUrl);
    results.nodeinfo = niData;
  } catch (err) {
    results.errors.push(`NodeInfo: ${err.message}`);
  }

  // Try health endpoint
  const healthUrl = `https://${host.replace(/^https?:\/\//, '')}/health`;
  try {
    const healthData = await fetchJSON(healthUrl);
    results.health = healthData;
  } catch {
    // Health is optional
  }

  // Determine if discovered
  if (results.actor) {
    results.discovered = {
      url: results.actor.url || `https://${host}`,
      name: results.actor.name || host,
      version: results.health?.version || 'unknown',
      actor: results.actor.id || null
    };
  }

  ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
  ctx.res.end(JSON.stringify(results));
}

async function handleListInstances(ctx) {
  const auth = await requireAuth(ctx);
  if (!auth.authenticated) {
    ctx.res.writeHead(401, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: 'UNAUTHORIZED' }));
    return;
  }

  const status = ctx.url.searchParams.get('status') || undefined;
  const search = ctx.url.searchParams.get('search') || undefined;

  const filter = {};
  if (status) filter.status = status;
  if (search) filter.search = search;

  const instances = listRemoteInstances(filter);

  ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
  ctx.res.end(JSON.stringify({
    total: instances.length,
    instances: instances.map(i => ({
      url: i.url,
      name: i.name,
      version: i.version,
      status: i.status,
      addedAt: i.addedAt,
      lastSeen: i.lastSeen,
      error: i.error
    }))
  }));
}

async function handleAddInstance(ctx) {
  const auth = await requireAuth(ctx);
  if (!auth.authenticated) {
    ctx.res.writeHead(401, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: 'UNAUTHORIZED' }));
    return;
  }

  if (auth.actor.role !== 'admin') {
    ctx.res.writeHead(403, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: 'FORBIDDEN', message: 'Admin role required' }));
    return;
  }

  const { url, name, autoDiscover } = ctx.body || {};
  if (!url) {
    ctx.res.writeHead(400, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: 'MISSING_PARAM', message: '"url" is required' }));
    return;
  }

  try {
    let opts = {};

    // Auto-discover if requested
    if (autoDiscover !== false) {
      try {
        const actorUrl = buildActorUrl(url);
        const actorData = await fetchJSON(actorUrl, { timeout: 8000 });
        const normalized = normalizeActorResponse(actorData);
        if (normalized) {
          opts.actor = normalized.id;
          if (!name) opts.name = normalized.name;
        }

        // Try to get version from nodeinfo
        try {
          const niUrl = buildNodeInfoUrl(url);
          const niData = await fetchJSON(niUrl, { timeout: 5000 });
          const niNormalized = normalizeNodeInfo(niData);
          if (niNormalized) {
            opts.version = niNormalized.software.version;
          }
        } catch (_) {}
      } catch (err) {
        log.warn(`Auto-discover failed for ${url}: ${err.message}`);
      }
    }

    if (name && !opts.name) opts.name = name;

    const instance = addRemoteInstance(url, name || '', opts);

    ctx.res.writeHead(201, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({
      success: true,
      instance: {
        url: instance.url,
        name: instance.name,
        version: instance.version,
        status: instance.status,
        addedAt: instance.addedAt
      }
    }));
  } catch (err) {
    ctx.res.writeHead(400, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: 'ADD_FAILED', message: err.message }));
  }
}

async function handleGetInstance(ctx, instanceId) {
  const auth = await requireAuth(ctx);
  if (!auth.authenticated) {
    ctx.res.writeHead(401, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: 'UNAUTHORIZED' }));
    return;
  }

  const instance = getRemoteInstance(instanceId);
  if (!instance) {
    ctx.res.writeHead(404, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: 'NOT_FOUND', message: 'Instance not in registry' }));
    return;
  }

  ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
  ctx.res.end(JSON.stringify(instance));
}

async function handleRemoveInstance(ctx, instanceId) {
  const auth = await requireAuth(ctx);
  if (!auth.authenticated) {
    ctx.res.writeHead(401, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: 'UNAUTHORIZED' }));
    return;
  }

  if (auth.actor.role !== 'admin') {
    ctx.res.writeHead(403, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: 'FORBIDDEN', message: 'Admin role required' }));
    return;
  }

  const removed = _removeInstance(instanceId);
  if (!removed) {
    ctx.res.writeHead(404, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: 'NOT_FOUND', message: 'Instance not in registry' }));
    return;
  }

  ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
  ctx.res.end(JSON.stringify({ success: true, removed: instanceId }));
}

async function handleInstanceHealth(ctx, instanceId) {
  const auth = await requireAuth(ctx);
  if (!auth.authenticated) {
    ctx.res.writeHead(401, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: 'UNAUTHORIZED' }));
    return;
  }

  const instance = getRemoteInstance(instanceId);
  if (!instance) {
    ctx.res.writeHead(404, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: 'NOT_FOUND', message: 'Instance not in registry' }));
    return;
  }

  const result = { url: instance.url, alive: false, latency: 0, details: {} };

  const start = Date.now();
  try {
    const healthUrl = `${instance.url}/health`;
    const healthData = await fetchJSON(healthUrl, { timeout: 10000 });
    result.latency = Date.now() - start;
    result.details = healthData;

    if (healthData && (healthData.status === 'ok' || healthData.uptime)) {
      result.alive = true;
      instanceHeartbeat(instance.url);
    }
  } catch (err) {
    result.latency = Date.now() - start;
    result.error = err.message;
    markInstanceError(instance.url, `Health check failed: ${err.message}`);
  }

  result.status = result.alive ? 'healthy' : 'unhealthy';
  ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
  ctx.res.end(JSON.stringify(result));
}

async function handleInstanceContent(ctx, instanceId, type) {
  const auth = await requireAuth(ctx);
  if (!auth.authenticated) {
    ctx.res.writeHead(401, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: 'UNAUTHORIZED' }));
    return;
  }

  const instance = getRemoteInstance(instanceId);
  if (!instance) {
    ctx.res.writeHead(404, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: 'NOT_FOUND', message: 'Instance not in registry' }));
    return;
  }

  const limit = Math.min(parseInt(ctx.url.searchParams.get('limit')) || 20, 100);
  const offset = parseInt(ctx.url.searchParams.get('offset')) || 0;
  const search = ctx.url.searchParams.get('search') || undefined;

  const items = [];

  try {
    // Try ActivityPub outbox first
    const outboxUrl = buildOutboxUrl(instance.url);
    const outboxData = await fetchJSON(outboxUrl, { timeout: 15000 });
    const activities = normalizeOutboxResponse(outboxData, instance.url);

    for (const activity of activities) {
      const mappedType = type || 'article';
      items.push({
        id: activity.id,
        title: activity.title,
        type: mappedType,
        url: activity.url,
        summary: activity.summary,
        published: activity.published,
        instanceUrl: instance.url,
        instanceName: instance.name
      });
    }
  } catch (err) {
    log.warn(`Outbox fetch failed for ${instance.url}: ${err.message}`);
    // Fall back: try REST API
    try {
      const apiPath = type ? `/api/content/${type}` : '/api/content/article';
      const apiUrl = `${instance.url}${apiPath}?limit=${limit}`;
      const apiData = await fetchJSON(apiUrl, { timeout: 15000 });

      if (Array.isArray(apiData)) {
        for (const doc of apiData) {
          items.push({
            id: doc.id || '',
            title: doc.data?.title || doc.title || '',
            type: doc.type || type || 'article',
            url: `${instance.url}/api/content/${doc.type || type}/${doc.id}`,
            summary: doc.data?.summary || doc.data?.body?.substring(0, 200) || '',
            published: doc.publishedAt || doc.createdAt || '',
            instanceUrl: instance.url,
            instanceName: instance.name
          });
        }
      } else if (apiData && typeof apiData === 'object') {
        // Wrapped response
        const docs = apiData.data || apiData.items || apiData.docs || [];
        for (const doc of docs) {
          items.push({
            id: doc.id || '',
            title: doc.data?.title || doc.title || '',
            type: doc.type || type || 'article',
            url: `${instance.url}/api/content/${doc.type || type}/${doc.id}`,
            summary: doc.data?.summary || '',
            published: doc.publishedAt || doc.createdAt || '',
            instanceUrl: instance.url,
            instanceName: instance.name
          });
        }
      }
    } catch (fallbackErr) {
      log.warn(`API fallback also failed for ${instance.url}: ${fallbackErr.message}`);
    }
  }

  // Apply search filter
  let filtered = items;
  if (search) {
    const q = search.toLowerCase();
    filtered = items.filter(item =>
      item.title.toLowerCase().includes(q) ||
      item.summary.toLowerCase().includes(q)
    );
  }

  // Apply pagination
  const paged = filtered.slice(offset, offset + limit);

  ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
  ctx.res.end(JSON.stringify({
    instance: { url: instance.url, name: instance.name },
    total: filtered.length,
    offset,
    limit,
    items: paged
  }));
}

async function handleStats(ctx) {
  const auth = await requireAuth(ctx);
  if (!auth.authenticated) {
    ctx.res.writeHead(401, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: 'UNAUTHORIZED' }));
    return;
  }

  const instances = listRemoteInstances();
  const active = instances.filter(i => i.status === 'active').length;
  const inactive = instances.filter(i => i.status === 'inactive').length;
  const error = instances.filter(i => i.status === 'error').length;

  ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
  ctx.res.end(JSON.stringify({
    totalInstances: instances.length,
    active,
    inactive,
    error,
    instances: instances.map(i => ({
      url: i.url,
      name: i.name,
      status: i.status,
      lastSeen: i.lastSeen
    }))
  }));
}
