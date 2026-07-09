/**
 * API Routes
 *
 * 所有 /api/* 的路由处理。
 *
 * 端点设计：
 *   GET    /api/content/:type          — 列出某类型的所有文档
 *   GET    /api/content/:type/:id      — 获取单个文档
 *   POST   /api/content/:type          — 创建文档
 *   PUT    /api/content/:type/:id      — 更新文档
 *   DELETE /api/content/:type/:id      — 删除文档
 *   GET    /api/content-types          — 列出所有已注册的内容类型
 *   GET    /api/content-types/:name    — 获取内容类型 Schema
 *   GET    /api/health                 — 健康检查
 */

import { NotFoundError, ValidationError } from '../../../core/src/errors.js';
import { getTaichuVersion } from '../../../core/src/version.js';
import { search as vectorSearch } from '../search.js';
import { requireAuth, requireScopedAuth, optionalAuth } from '../middleware/auth.js';
import { serveCached, latestUpdate } from '../../../core/src/cache.js';

// Built-in content type registry
// Plugins/extensions can register additional types via hooks
const _contentTypes = new Map();

/**
 * Register a content type for API exposure.
 */
export function registerContentType(ct) {
  _contentTypes.set(ct.name, ct);
}

/**
 * Get a registered content type by name.
 * @param {string} name
 * @returns {import('../../../core/src/content-type.js').ContentType | undefined}
 */
export function getContentType(name) {
  return _contentTypes.get(name);
}

/**
 * Get all registered content types (for GraphQL resolver).
 */
export function getContentTypes() {
  return Array.from(_contentTypes.values()).map(ct => ({
    name: ct.name,
    label: ct.label,
    description: ct.description,
    schemaOrg: ct.schemaOrg || null,
    fieldCount: Object.keys(ct.fields).length
  }));
}

/**
 * @param {import('../context.js').Context} ctx
 */
export async function apiRoutes(ctx) {
  const { pathname } = ctx.url;
  const method = ctx.req.method;

  // /api/health
  if (pathname === '/api/health') {
    ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({
      status: 'ok',
      name: 'taichu',
      version: getTaichuVersion(),
      uptime: process.uptime()
    }));
    return;
  }

  // /api/search?q=xxx&type=article
  if (pathname === '/api/search' && method === 'GET') {
    const q = ctx.url.searchParams.get('q') || '';
    const type = ctx.url.searchParams.get('type') || null;

    if (!q || q.length < 2) {
      ctx.res.writeHead(400, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Query must be at least 2 characters' }));
      return;
    }

    const results = vectorSearch(q, 20);
    const docs = [];
    for (const { docId, score } of results) {
      try {
        const doc = await ctx.store.get(docId);
        if (doc && (!type || doc.type === type)) {
          docs.push({ ...doc, _score: Math.round(score * 100) / 100 });
        }
      } catch (e) { /* skip */ }
    }

    ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ query: q, docs, total: docs.length }));
    return;
  }

  // /api/content-types
  if (pathname === '/api/content-types' && method === 'GET') {
    const types = Array.from(_contentTypes.values()).map(ct => ({
      name: ct.name,
      label: ct.label,
      description: ct.description,
      schemaOrg: ct.schemaOrg,
      fields: ct.fields,
      fieldCount: Object.keys(ct.fields).length
    }));
    ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ types }));
    return;
  }

  // /api/content-types/:name
  const ctMatch = pathname.match(/^\/api\/content-types\/([a-z][a-z0-9_]*)$/);
  if (ctMatch && method === 'GET') {
    const ct = _contentTypes.get(ctMatch[1]);
    if (!ct) {
      ctx.res.writeHead(404, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: 'NOT_FOUND', message: `Content type "${ctMatch[1]}" not found` }));
      return;
    }
    ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify(ct.toJSONSchema()));
    return;
  }

  // /api/content/:type
  const listMatch = pathname.match(/^\/api\/content\/([a-z][a-z0-9_]*)$/);
  if (listMatch && method === 'GET') {
    // Auth required by default; set TAICHU_PUBLIC_READ=1 to allow anonymous GET
    if (!process.env.TAICHU_PUBLIC_READ) {
      const authResult = await requireAuth(ctx);
      if (!authResult.authenticated) {
        ctx.res.writeHead(authResult.status, { 'Content-Type': 'application/json' });
        ctx.res.end(JSON.stringify({ error: authResult.error, message: authResult.message }));
        return;
      }
      ctx.actor = authResult.actor;
    } else {
      await optionalAuth(ctx);
    }

    const type = listMatch[1];
    const queryOpts = Object.fromEntries(ctx.url.searchParams);
    // Multi-tenant: enforce tenant filter unless admin explicitly overrides
    if (ctx.multiTenant && !queryOpts.tenantId) {
      queryOpts.tenantId = ctx.tenantId;
    }
    const docs = await ctx.store.list({ type, ...queryOpts });
    const body = JSON.stringify({ docs, total: docs.length });
    const modified = latestUpdate(docs);
    const isPublic = !!process.env.TAICHU_PUBLIC_READ;
    if (serveCached(ctx, body, { lastModified: modified, visibility: isPublic ? 'public' : 'private' })) return;
    return;
  }

  if (listMatch && method === 'POST') {
    // Require scoped auth for content creation
    // Exception: comments can be submitted publicly
    const type = listMatch[1];
    if (type !== 'comment') {
      const authResult = await requireScopedAuth(ctx, `${type}:write`);
      if (!authResult.authenticated) {
        ctx.res.writeHead(authResult.status, { 'Content-Type': 'application/json' });
        ctx.res.end(JSON.stringify({ error: authResult.error, message: authResult.message }));
        return;
      }
      ctx.actor = authResult.actor;
    } else {
      await optionalAuth(ctx);
    }
    const ct = _contentTypes.get(type);
    if (!ct) {
      ctx.res.writeHead(400, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: 'VALIDATION_ERROR', message: `Unknown content type: "${type}"` }));
      return;
    }

    // Validate
    const validation = ct.validate(ctx.body?.data || {});
    if (!validation.valid) {
      ctx.res.writeHead(400, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: 'VALIDATION_ERROR', errors: validation.errors }));
      return;
    }

    // Scheduled publishing: validate publishedAt when status='scheduled'
    const requestedStatus = ctx.body.status;
    if (requestedStatus === 'scheduled') {
      const pubAt = ctx.body.publishedAt || ctx.body.data?.publishedAt;
      if (!pubAt) {
        ctx.res.writeHead(400, { 'Content-Type': 'application/json' });
        ctx.res.end(JSON.stringify({ error: 'VALIDATION_ERROR', message: 'publishedAt is required when status is "scheduled"' }));
        return;
      }
      if (new Date(pubAt) <= new Date()) {
        ctx.res.writeHead(400, { 'Content-Type': 'application/json' });
        ctx.res.end(JSON.stringify({ error: 'VALIDATION_ERROR', message: 'publishedAt must be in the future for scheduled content' }));
        return;
      }
    }

    // Run beforeCreate hooks
    let payload = { type, data: ctx.body.data, status: ctx.body.status, publishedAt: ctx.body.publishedAt || null, tenantId: ctx.tenantId };
    payload = await ctx.hooks.run('beforeCreate', payload, ctx);

    const doc = await ctx.store.create(payload);

    // Run afterCreate hooks
    await ctx.hooks.run('afterCreate', doc, ctx);

    ctx.res.writeHead(201, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify(doc));
    return;
  }

  // /api/content/:type/reorder — drag-and-drop reorder
  const reorderMatch = pathname.match(/^\/api\/content\/([a-z][a-z0-9_]*)\/reorder$/);
  if (reorderMatch && method === 'PUT') {
    const authResult = await requireScopedAuth(ctx, `${reorderMatch[1]}:write`);
    if (!authResult.authenticated) {
      ctx.res.writeHead(authResult.status, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: authResult.error, message: authResult.message }));
      return;
    }
    ctx.actor = authResult.actor;

    const { ids } = ctx.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      ctx.res.writeHead(400, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: 'VALIDATION_ERROR', message: 'ids[] array is required' }));
      return;
    }

    try {
      const docs = await ctx.store.reorder(ids);
      ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ docs, total: docs.length }));
    } catch (e) {
      ctx.res.writeHead(500, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: 'INTERNAL_ERROR', message: e.message }));
    }
    return;
  }

  // /api/content/:type/batch — bulk operations
  const batchMatch = pathname.match(/^\/api\/content\/([a-z][a-z0-9_]*)\/batch$/);
  if (batchMatch && method === 'POST') {
    const authResult = await requireScopedAuth(ctx, `${batchMatch[1]}:write`);
    if (!authResult.authenticated) {
      ctx.res.writeHead(authResult.status, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: authResult.error, message: authResult.message }));
      return;
    }
    ctx.actor = authResult.actor;

    const { action, ids } = ctx.body || {};
    if (!action || !Array.isArray(ids) || !ids.length) {
      ctx.res.writeHead(400, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: 'VALIDATION_ERROR', message: 'action and ids[] are required' }));
      return;
    }

    const validActions = ['delete', 'publish', 'archive'];
    if (!validActions.includes(action)) {
      ctx.res.writeHead(400, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: 'VALIDATION_ERROR', message: `action must be one of: ${validActions.join(', ')}` }));
      return;
    }

    const results = { success: 0, failed: 0, errors: [] };
    for (const id of ids) {
      try {
        const doc = await ctx.store.get(id);
        if (!doc || doc.type !== batchMatch[1]) {
          results.failed++;
          results.errors.push({ id, error: 'Not found or wrong type' });
          continue;
        }

        if (action === 'delete') {
          await ctx.store.delete(id);
          await ctx.hooks.run('afterDelete', { id, type: batchMatch[1] }, ctx);
        } else {
          await ctx.store.update(id, { status: action === 'publish' ? 'published' : 'archived' });
        }
        results.success++;
      } catch (e) {
        results.failed++;
        results.errors.push({ id, error: e.message });
      }
    }

    ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify(results));
    return;
  }

  // /api/content/:type/:id
  const itemMatch = pathname.match(/^\/api\/content\/([a-z][a-z0-9_]*)\/([\w-]+)$/);
  if (itemMatch) {
    const [, type, id] = itemMatch;

    if (method === 'GET') {
      if (!process.env.TAICHU_PUBLIC_READ) {
        const authResult = await requireAuth(ctx);
        if (!authResult.authenticated) {
          ctx.res.writeHead(authResult.status, { 'Content-Type': 'application/json' });
          ctx.res.end(JSON.stringify({ error: authResult.error, message: authResult.message }));
          return;
        }
        ctx.actor = authResult.actor;
      } else {
        await optionalAuth(ctx);
      }

      const doc = await ctx.store.get(id);
      if (!doc) {
        ctx.res.writeHead(404, { 'Content-Type': 'application/json' });
        ctx.res.end(JSON.stringify({ error: 'NOT_FOUND', message: `Document "${id}" not found` }));
        return;
      }
      const body = JSON.stringify(doc);
      const isPublic = !!process.env.TAICHU_PUBLIC_READ;
      if (serveCached(ctx, body, { lastModified: doc.updatedAt, visibility: isPublic ? 'public' : 'private' })) return;
      return;
    }

    if (method === 'PUT') {
      const authResult = await requireScopedAuth(ctx, `${type}:write`);
      if (!authResult.authenticated) {
        ctx.res.writeHead(authResult.status, { 'Content-Type': 'application/json' });
        ctx.res.end(JSON.stringify({ error: authResult.error, message: authResult.message }));
        return;
      }
      ctx.actor = authResult.actor;

      // Scheduled publishing: validate publishedAt when status='scheduled'
      const requestedStatus = ctx.body.status;
      if (requestedStatus === 'scheduled') {
        const pubAt = ctx.body.publishedAt || ctx.body.data?.publishedAt;
        if (!pubAt) {
          ctx.res.writeHead(400, { 'Content-Type': 'application/json' });
          ctx.res.end(JSON.stringify({ error: 'VALIDATION_ERROR', message: 'publishedAt is required when status is "scheduled"' }));
          return;
        }
        if (new Date(pubAt) <= new Date()) {
          ctx.res.writeHead(400, { 'Content-Type': 'application/json' });
          ctx.res.end(JSON.stringify({ error: 'VALIDATION_ERROR', message: 'publishedAt must be in the future for scheduled content' }));
          return;
        }
      }

      let payload = { id, type, data: ctx.body.data, status: ctx.body.status, publishedAt: ctx.body.publishedAt || undefined };
      payload = await ctx.hooks.run('beforeUpdate', payload, ctx);

      const doc = await ctx.store.update(id, payload);
      if (!doc) {
        ctx.res.writeHead(404, { 'Content-Type': 'application/json' });
        ctx.res.end(JSON.stringify({ error: 'NOT_FOUND', message: `Document "${id}" not found` }));
        return;
      }

      await ctx.hooks.run('afterUpdate', doc, ctx);
      ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify(doc));
      return;
    }

    if (method === 'DELETE') {
      const authResult = await requireScopedAuth(ctx, `${type}:delete`);
      if (!authResult.authenticated) {
        ctx.res.writeHead(authResult.status, { 'Content-Type': 'application/json' });
        ctx.res.end(JSON.stringify({ error: authResult.error, message: authResult.message }));
        return;
      }
      ctx.actor = authResult.actor;

      const basePayload = { id, type };
      const payload = await ctx.hooks.run('beforeDelete', basePayload, ctx);

      const deleted = await ctx.store.delete(id);
      if (!deleted) {
        ctx.res.writeHead(404, { 'Content-Type': 'application/json' });
        ctx.res.end(JSON.stringify({ error: 'NOT_FOUND', message: `Document "${id}" not found` }));
        return;
      }

      await ctx.hooks.run('afterDelete', { id, type }, ctx);
      ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ success: true }));
      return;
    }
  }

  // 404 for API
  ctx.res.writeHead(404, { 'Content-Type': 'application/json' });
  ctx.res.end(JSON.stringify({
    error: 'NOT_FOUND',
    message: `API route not found: ${method} ${pathname}`
  }));
}
