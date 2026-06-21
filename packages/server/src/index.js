/**
 * @taichu/server — Taichu HTTP Server
 *
 * 零外部依赖的 HTTP 服务。
 * 负责：
 *   1. 路由分发
 *   2. JSON 解析
 *   3. CORS 处理
 *   4. 静态文件服务（管理后台 SPA）
 *   5. MCP 端点（Phase 2）
 *
 * 设计原则：
 *   - 每个模块可独立测试
 *   - 错误统一捕获并序列化为 JSON
 *   - 请求上下文通过 context object 传递
 */

import { createServer } from 'node:http';
import { router } from './router.js';
import { parseBody } from './body-parser.js';
import { corsMiddleware } from './middleware/cors.js';
import { errorHandler } from './middleware/error-handler.js';
import { createContext } from './context.js';
import { bootstrap } from './bootstrap.js';
import { initSearch } from './search.js';
import { logger } from './logger.js';
import { loadConfig, getConfig, getConfigWarnings, configSummary } from './config.js';
import { getWSS } from './websocket.js';
import { getWebhookManager } from './webhook.js';
import { rateLimit } from './middleware/rate-limit.js';
import { csrfProtection } from './middleware/csrf.js';
import { recordRequest } from '../../core/src/metrics.js';
import { record as auditRecord } from './audit.js';
import { snapshotRevision } from './revisions.js';
import { notify } from './notify.js';
import { startScheduler, stopScheduler } from './scheduler.js';

export async function start(configOverrides = {}) {
  const config = loadConfig();
  const { port, host, storage, dataDir, version } = config;

  // Pre-init store so the first request doesn't pay cold-start cost
  const ctx = await createContext({ req: null, res: null, url: null, body: null, config: { storage, dataDir } });
  const storeType = ctx.store.getDbPath ? `sqlite (${ctx.store.getDbPath()})` : 'memory';

  // Init vector search index
  await initSearch(ctx.store, ctx.hooks);

  // Init WebSocket for real-time updates
  const wss = getWSS();

  // Init webhook manager
  const webhooks = getWebhookManager(ctx.store);

  // Init scheduled publishing scheduler
  startScheduler(ctx.hooks);

  // Register content change broadcasts via hooks
  for (const event of ['afterCreate', 'afterUpdate', 'afterDelete']) {
    ctx.hooks.on(event, async (doc) => {
      const wsEvent = event.replace('after', '').toLowerCase();
      const payload = {
        id: doc.id, type: doc.type, status: doc.status,
        title: doc.data?.title || doc.data?.name || '',
        updatedAt: doc.updatedAt
      };

      // WebSocket broadcast
      wss.broadcast(doc.type || '*', wsEvent, payload);

      // Webhook fire (async, don't block)
      webhooks.fire(wsEvent, { ...payload, data: doc.data }).catch(() => {});

      // Audit log (async, don't block)
      auditRecord({
        actorId: doc.createdBy || doc._meta?.createdBy?.agentId || 'system',
        actorType: doc._meta?.createdBy?.type || 'system',
        action: wsEvent,
        resourceType: doc.type,
        resourceId: doc.id,
        detail: { title: doc.data?.title, status: doc.status }
      }).catch(() => {});

      // Snapshot revision (async, don't block)
      if (wsEvent !== 'delete') {
        snapshotRevision(doc, { id: doc.createdBy || 'system' }).catch(() => {});
      }

      // IM notification (async, don't block)
      notify(`content_${wsEvent}d`, { doc, summary: payload.title || '' }).catch(() => {});
    });
  }

  const server = createServer(async (req, res) => {
    const startTime = Date.now();
    let statusCode = 200;

    // Capture status code for metrics
    const origWriteHead = res.writeHead.bind(res);
    res.writeHead = function(code, ...args) {
      statusCode = code;
      return origWriteHead(code, ...args);
    };

    res.on('finish', () => {
      const urlObj = new URL(req.url, `http://localhost`);
      recordRequest(req.method, urlObj.pathname, statusCode, Date.now() - startTime);
    });

    try {
      // 1. CORS
      corsMiddleware(req, res);
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // 2. Parse URL
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

      // 3. Rate limit (skip for health, static files)
      if (!url.pathname.startsWith('/admin') && !url.pathname.startsWith('/uploads') && url.pathname !== '/health' && url.pathname !== '/ready' && url.pathname !== '/ws-test.html') {
        const ctx = { req, res, url };
        if (!rateLimit(ctx)) return; // 429 already written
      }

      // 3. Parse body (for POST/PUT/PATCH)
      let body = null;
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        body = await parseBody(req);
      }

      // 4. Build context (reuses pre-initialized store)
      const ctx2 = await createContext({ req, res, url, body, config: { storage, dataDir } });

      // 5. CSRF protection for admin API mutating requests
      if (!await csrfProtection(ctx2)) return;

      // 6. Route
      await router(ctx2);

    } catch (err) {
      errorHandler(res, err);
    }
  });

  // Attach WebSocket to HTTP server
  wss.attach(server);

  server.listen(port, host, () => {
    const startMsg = [
      '',
      '  ██████╗ ██╗ ██████╗ ███╗   ██╗',
      ' ██╔════╝ ██║██╔═══██╗████╗  ██║',
      ' ██║  ███╗██║██║   ██║██╔██╗ ██║',
      ' ██║   ██║██║██║   ██║██║╚██╗██║',
      ' ╚██████╔╝██║╚██████╔╝██║ ╚████║',
      '  ╚═════╝ ╚═╝ ╚═════╝ ╚═╝  ╚═══╝',
      '',
      `  Taichu CMS v${version}`,
      `  AI Agent-Native Content Infrastructure`,
      `  Store:     ${storeType}`,
      '',
      `  Local:   http://localhost:${port}`,
      `  Network: http://${host}:${port}`,
      '',
      `  API:     http://localhost:${port}/api`,
      `  Health:  http://localhost:${port}/api/health`,
      `  Live:    ws://localhost:${port}`,
      '',
      `  Ready.`,
      ''
    ].join('\n');
    console.log(startMsg);
  });

  // Graceful shutdown
  const shutdown = async (signal) => {
    logger.info(`${signal} received. Shutting down...`);
    stopScheduler();
    wss.close();
    server.close(() => {
      logger.info('HTTP server closed');
      // Flush store if needed
      if (ctx.store.flush) {
        ctx.store.flush().then(() => process.exit(0)).catch(() => process.exit(0));
      } else {
        process.exit(0);
      }
    });
    // Force exit after 10s
    setTimeout(() => process.exit(1), 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Try: TAICHU_PORT=${port + 1} npm start`);
    } else {
      console.error('Server error:', err.message);
    }
    process.exit(1);
  });

  return server;
}

// Run directly if called as main module
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  bootstrap();
  await start({});
}
