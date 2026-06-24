/**
 * Audit & Pipeline API Routes
 *
 * GET  /api/audit          — Query audit logs
 * GET  /api/audit/stats    — Audit statistics
 * GET  /api/pipelines      — List pipeline templates
 * POST /api/pipelines/run  — Execute a pipeline
 * GET  /api/site-settings  — Get site settings (ICP, analytics, etc.)
 * PUT  /api/site-settings  — Update site settings
 */

import { requireAuth } from '../middleware/auth.js';
import { query as queryAudit, cleanupOldLogs } from '../audit.js';
import { getStore } from '../context.js';

export async function auditRoutes(ctx) {
  const { pathname } = ctx.url;
  const method = ctx.req.method;

  // GET /api/audit
  if (pathname === '/api/audit' && method === 'GET') {
    const authResult = await requireAuth(ctx);
    if (!authResult.authenticated) {
      ctx.res.writeHead(authResult.status, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: authResult.error, message: authResult.message }));
      return;
    }

    const entries = await queryAudit(Object.fromEntries(ctx.url.searchParams));
    ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ entries, total: entries.length }));
    return;
  }

  // GET /api/audit/stats
  if (pathname === '/api/audit/stats' && method === 'GET') {
    const authResult = await requireAuth(ctx);
    if (!authResult.authenticated) {
      ctx.res.writeHead(authResult.status, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: authResult.error, message: authResult.message }));
      return;
    }

    const entries = await queryAudit({ limit: 1000 });
    const byAction = {};
    const byActor = {};
    for (const e of entries) {
      byAction[e.action] = (byAction[e.action] || 0) + 1;
      const key = `${e.actorType}:${e.actorId.substring(0, 8)}`;
      byActor[key] = (byActor[key] || 0) + 1;
    }

    ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ total: entries.length, byAction, byActor }));
    return;
  }

  // GET/PUT /api/site-settings
  if (pathname === '/api/site-settings') {
    const store = getStore();

    if (method === 'GET') {
      const docs = await store.list({ type: 'site_settings', limit: 1 });
      const settings = docs[0]?.data || getDefaultSettings();
      ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify(settings));
      return;
    }

    if (method === 'PUT') {
      const authResult = await requireAuth(ctx);
      if (!authResult.authenticated) {
        ctx.res.writeHead(authResult.status, { 'Content-Type': 'application/json' });
        ctx.res.end(JSON.stringify({ error: authResult.error, message: authResult.message }));
        return;
      }

      const docs = await store.list({ type: 'site_settings', limit: 1 });
      const existing = docs[0];

      if (existing) {
        const merged = { ...existing.data, ...ctx.body };
        await store.update(existing.id, { data: merged });
      } else {
        await store.create({ type: 'site_settings', data: { ...getDefaultSettings(), ...ctx.body } });
      }

      ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ success: true }));
      return;
    }
  }

  // GET /api/pipelines
  if (pathname === '/api/pipelines' && method === 'GET') {
    const { PipelineEngine } = await import('../pipeline.js');
    const store = getStore();
    const hooks = (await import('../context.js')).getHooks();
    const engine = new PipelineEngine(store, hooks);
    ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ templates: engine.listTemplates() }));
    return;
  }

  ctx.res.writeHead(404, { 'Content-Type': 'application/json' });
  ctx.res.end(JSON.stringify({ error: 'NOT_FOUND' }));
}

// ── Revision Routes (also used by API) ────────────────────

import { getRevisions, diffObjects, restoreRevision } from '../revisions.js';

/**
 * Handle revision routes.
 * GET  /api/content/:type/:id/revisions
 * GET  /api/content/:type/:id/revisions/diff?from=revId1&to=revId2
 * POST /api/content/:type/:id/revisions/:revId/restore
 */
export async function revisionRoutes(ctx, type, id) {
  const { pathname } = ctx.url;
  const method = ctx.req.method;

  const authResult = await requireAuth(ctx);
  if (!authResult.authenticated) {
    ctx.res.writeHead(authResult.status, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: authResult.error, message: authResult.message }));
    return;
  }

  // GET revisions diff between two versions
  const diffMatch = pathname.match(/\/revisions\/diff$/);
  if (diffMatch && method === 'GET') {
    const fromId = ctx.url.searchParams.get('from');
    const toId = ctx.url.searchParams.get('to');

    if (!fromId || !toId) {
      ctx.res.writeHead(400, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Both "from" and "to" revision IDs are required' }));
      return;
    }

    const store = getStore();
    const fromRev = await store.get(fromId);
    const toRev = await store.get(toId);

    if (!fromRev || fromRev.type !== 'revision' || fromRev.data.docId !== id) {
      ctx.res.writeHead(404, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: 'NOT_FOUND', message: 'Source revision not found' }));
      return;
    }
    if (!toRev || toRev.type !== 'revision' || toRev.data.docId !== id) {
      ctx.res.writeHead(404, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: 'NOT_FOUND', message: 'Target revision not found' }));
      return;
    }

    const dataDiff = diffObjects(fromRev.data.data, toRev.data.data);
    const statusChanged = fromRev.data.status !== toRev.data.status;

    ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({
      from: {
        id: fromRev.id,
        timestamp: fromRev.data.timestamp || fromRev.createdAt,
        status: fromRev.data.status,
        author: fromRev.data.author
      },
      to: {
        id: toRev.id,
        timestamp: toRev.data.timestamp || toRev.createdAt,
        status: toRev.data.status,
        author: toRev.data.author
      },
      statusChanged,
      statusDiff: statusChanged ? { from: fromRev.data.status, to: toRev.data.status } : null,
      fieldsChanged: dataDiff.length,
      diff: dataDiff
    }));
    return;
  }

  // GET revisions list
  if (pathname.endsWith('/revisions') && method === 'GET') {
    const revs = await getRevisions(id);
    const result = revs.map((r, i, arr) => ({
      ...r,
      diff: i < arr.length - 1 ? diffObjects(arr[i + 1].data, r.data) : []
    }));
    ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ revisions: result, total: result.length }));
    return;
  }

  // POST restore
  const restoreMatch = pathname.match(/\/revisions\/([\w-]+)\/restore$/);
  if (restoreMatch && method === 'POST') {
    const doc = await restoreRevision(id, restoreMatch[1]);
    if (!doc) {
      ctx.res.writeHead(404, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: 'NOT_FOUND' }));
      return;
    }
    ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ success: true, doc }));
    return;
  }

  ctx.res.writeHead(404, { 'Content-Type': 'application/json' });
  ctx.res.end(JSON.stringify({ error: 'NOT_FOUND' }));
}

function getDefaultSettings() {
  return {
    siteName: 'Taichu CMS',
    siteDescription: '',
    icpNumber: '',
    gonganNumber: '',
    analyticsId: '',
    language: 'zh-CN',
    timezone: 'Asia/Shanghai',
    theme: { activeTheme: 'default' }
  };
}
