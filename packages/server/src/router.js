/**
 * Router — Taichu 路由分发
 *
 * 基于 URL 模式匹配的轻量路由。
 * 支持：
 *   - 静态路由：/api/health
 *   - 参数路由：/api/content/:type/:id
 *   - HTTP 方法区分
 */

import { apiRoutes } from './routes/api.js';
import { authRoutes } from './routes/auth.js';
import { graphqlRoutes } from './routes/graphql.js';
import { mediaRoutes } from './routes/media.js';
import { collabRoutes } from './routes/collab.js';
import { webhookRoutes } from './routes/webhook.js';
import { auditRoutes, revisionRoutes } from './routes/audit.js';
import { relationshipRoutes } from './routes/relationships.js';
import { pluginMarketplaceRoutes } from './routes/plugin-marketplace.js';
import { agentMarketplaceRoutes } from './routes/agent-marketplace.js';
import { activityPubRoutes } from './routes/activitypub.js';
import { workflowRoutes } from './routes/workflow.js';
import { wechatRoutes } from './routes/wechat.js';
import { ssoRoutes } from './routes/sso.js';
import { themeRoutes } from './routes/theme.js';
import { rssSitemapRoutes } from './routes/rss.js';
import { exportRoutes } from './routes/export.js';
import { importRoutes } from './routes/import.js';
import { federationRoutes } from './routes/federation.js';
import { serveStatic } from './static.js';
import { createMediaStore } from './media-store.js';
import { renderTheme, serveThemeAsset } from './theme-engine.js';
import { livenessCheck, readinessCheck } from './health.js';
import { requireAuth } from './middleware/auth.js';
import { exportBackup, validateBackup, importBackup } from '../../core/src/backup.js';
import { generateMetrics } from '../../core/src/metrics.js';
import { generateCSRFToken } from './middleware/csrf.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');

/**
 * @param {import('./context.js').Context} ctx
 */
export async function router(ctx) {
  const { pathname } = ctx.url;
  const method = ctx.req.method;

  // Auth routes
  if (pathname.startsWith('/api/auth')) {
    return authRoutes(ctx);
  }

  // CSRF token endpoint — SPA fetches before mutating requests
  if (pathname === '/api/csrf-token' && method === 'GET') {
    const token = generateCSRFToken();
    ctx.res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': `csrf_token=${token}; Path=/; SameSite=Lax; HttpOnly=false`
    });
    ctx.res.end(JSON.stringify({ csrfToken: token }));
    return;
  }

  // ActivityPub & WebFinger (no auth required for federation)
  if (pathname.startsWith('/api/activitypub') || pathname.startsWith('/.well-known/')) {
    return activityPubRoutes(ctx);
  }

  // GraphQL API
  if (pathname === '/api/graphql') {
    return graphqlRoutes(ctx);
  }

  // Collaboration & WebSocket
  if (pathname.startsWith('/api/collab') || pathname === '/api/ws') {
    return collabRoutes(ctx);
  }

  // Webhooks
  if (pathname.startsWith('/api/webhooks')) {
    return webhookRoutes(ctx);
  }

  // Audit, pipelines, site settings
  if (pathname.startsWith('/api/audit') || pathname.startsWith('/api/pipelines') || pathname === '/api/site-settings') {
    return auditRoutes(ctx);
  }

  // Workflow routes (review/approve/reject)
  if (pathname.startsWith('/api/workflow')) {
    return workflowRoutes(ctx);
  }

  // SSO routes
  if (pathname.startsWith('/api/sso')) {
    return ssoRoutes(ctx);
  }

  // Theme management routes
  if (pathname.startsWith('/api/theme')) {
    return themeRoutes(ctx);
  }

  // WeChat integration routes
  if (pathname.startsWith('/api/wechat')) {
    return wechatRoutes(ctx);
  }

  // Media routes (upload/list/delete)
  if (pathname.startsWith('/api/media')) {
    return mediaRoutes(ctx);
  }

  // Revision routes (must precede content routes)
  const revMatch = pathname.match(/^\/api\/content\/([a-z][a-z0-9_]*)\/([\w-]+)\/(revisions.*)$/);
  if (revMatch) {
    return revisionRoutes(ctx, revMatch[1], revMatch[2]);
  }

  // Relationship routes (must precede content routes)
  const relMatch = pathname.match(/^\/api\/content\/([a-z][a-z0-9_]*)\/([\w-]+)\/(relationships|graph)/);
  if (relMatch) {
    return relationshipRoutes(ctx);
  }

  // Plugin marketplace routes
  if (pathname.startsWith('/api/plugins')) {
    return pluginMarketplaceRoutes(ctx);
  }

  // Agent marketplace routes
  if (pathname.startsWith('/api/agents')) {
    return agentMarketplaceRoutes(ctx);
  }

  // Content API routes
  if (pathname.startsWith('/api')) {
    return apiRoutes(ctx);
  }

  // Admin SPA static files
  if (pathname.startsWith('/admin')) {
    const served = await serveStatic(ctx, PUBLIC_DIR, pathname);
    if (served) return;
  }

  // Uploaded media files
  if (pathname.startsWith('/uploads/')) {
    const mediaStore = createMediaStore();
    const relativePath = pathname.slice('/uploads/'.length);
    const served = await serveStatic(ctx, mediaStore.uploadDir, relativePath);
    if (served) return;
  }

  // Theme static assets
  if (pathname.startsWith('/theme/')) {
    const assetPath = pathname.replace('/theme/', '');
    const served = await serveThemeAsset(ctx, assetPath);
    if (served) return;
  }

  // Public static files (ws-test.html, etc.)
  {
    const served = await serveStatic(ctx, PUBLIC_DIR, pathname);
    if (served) return;
  }

  // Metrics — Prometheus format (admin only)
  if (pathname === '/metrics') {
    return handleMetrics(ctx);
  }

  // Health check — liveness (always 200 if process is alive)
  if (pathname === '/health') {
    const { getWSS } = await import('./websocket.js');
    const { getConfig } = await import('./config.js');
    const cfg = getConfig();
    const result = livenessCheck(cfg, () => getWSS().getStats());
    ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify(result));
    return;
  }

  // Readiness check — probes store connectivity
  if (pathname === '/ready') {
    const { getConfig } = await import('./config.js');
    const cfg = getConfig();
    const result = await readinessCheck(ctx.store);
    const status = result.status === 'ready' ? 200 : 503;
    ctx.res.writeHead(status, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ ...result, version: cfg.version }));
    return;
  }

  // Backup & Restore — admin-only
  if (pathname === '/api/backup' && method === 'GET') {
    return handleBackup(ctx);
  }
  if (pathname === '/api/backup/restore' && method === 'POST') {
    return handleRestore(ctx);
  }

  // Content Export
  if (pathname.startsWith('/api/export')) {
    const handled = await exportRoutes(ctx);
    if (handled) return;
  }

  // Content Import
  if (pathname.startsWith('/api/import')) {
    const handled = await importRoutes(ctx);
    if (handled) return;
  }

  // Federation — Cross-Instance Content Discovery
  if (pathname.startsWith('/api/federation')) {
    return federationRoutes(ctx);
  }

  // RSS & Sitemap
  if (pathname === '/rss.xml' || pathname === '/sitemap.xml') {
    return rssSitemapRoutes(ctx);
  }

  // Frontend Theme — catch-all for non-API, non-admin paths
  if (!pathname.startsWith('/api') && !pathname.startsWith('/admin') && !pathname.startsWith('/uploads')) {
    return renderTheme(ctx);
  }

  // 404
  ctx.res.writeHead(404, { 'Content-Type': 'application/json' });
  ctx.res.end(JSON.stringify({
    error: 'NOT_FOUND',
    message: `Route not found: ${method} ${pathname}`
  }));
}

/**
 * Handle GET /api/backup — export full backup (admin only)
 * @param {import('./context.js').Context} ctx
 */
async function handleBackup(ctx) {
  const auth = await requireAuth(ctx);
  if (!auth.authenticated) {
    ctx.res.writeHead(auth.status || 401, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: auth.error, message: auth.message }));
    return;
  }
  if (auth.actor.role !== 'admin') {
    ctx.res.writeHead(403, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: 'FORBIDDEN', message: 'Admin role required' }));
    return;
  }

  try {
    const backup = await exportBackup(ctx.store);
    const json = JSON.stringify(backup, null, 2);
    const filename = `taichu-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

    ctx.res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': Buffer.byteLength(json)
    });
    ctx.res.end(json);
  } catch (err) {
    ctx.res.writeHead(500, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: 'BACKUP_FAILED', message: err.message }));
  }
}

/**
 * Handle POST /api/backup/restore — import backup (admin only)
 * @param {import('./context.js').Context} ctx
 */
async function handleRestore(ctx) {
  const auth = await requireAuth(ctx);
  if (!auth.authenticated) {
    ctx.res.writeHead(auth.status || 401, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: auth.error, message: auth.message }));
    return;
  }
  if (auth.actor.role !== 'admin') {
    ctx.res.writeHead(403, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: 'FORBIDDEN', message: 'Admin role required' }));
    return;
  }

  try {
    const validation = validateBackup(ctx.body);
    if (!validation.valid) {
      ctx.res.writeHead(400, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: 'INVALID_BACKUP', message: validation.error }));
      return;
    }

    const conflictStrategy = ctx.url.searchParams.get('conflict') || 'skip';
    const includeApiKeys = ctx.url.searchParams.get('includeApiKeys') === 'true';

    const result = await importBackup(ctx.store, ctx.body, {
      conflictStrategy,
      includeApiKeys
    });

    ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({
      success: true,
      imported: result.imported,
      skipped: result.skipped,
      errors: result.errors
    }));
  } catch (err) {
    ctx.res.writeHead(500, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: 'RESTORE_FAILED', message: err.message }));
  }
}

/**
 * Handle GET /metrics — Prometheus metrics endpoint (admin only)
 * @param {import('./context.js').Context} ctx
 */
async function handleMetrics(ctx) {
  const auth = await requireAuth(ctx);
  if (!auth.authenticated) {
    ctx.res.writeHead(auth.status || 401, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: auth.error, message: auth.message }));
    return;
  }
  if (auth.actor.role !== 'admin') {
    ctx.res.writeHead(403, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: 'FORBIDDEN', message: 'Admin role required' }));
    return;
  }

  try {
    const metrics = generateMetrics();
    ctx.res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': Buffer.byteLength(metrics) });
    ctx.res.end(metrics);
  } catch (err) {
    ctx.res.writeHead(500, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: 'METRICS_FAILED', message: err.message }));
  }
}
