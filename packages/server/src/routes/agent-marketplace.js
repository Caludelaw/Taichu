/**
 * Agent Marketplace Routes
 *
 * 让 Agent 注册自身能力，发现其他 Agent 的能力。
 *
 * GET    /api/agents                  — list/search all registered agents
 * GET    /api/agents/:id              — get single agent details
 * POST   /api/agents/register         — register a new agent capability
 * POST   /api/agents/:id/unregister   — unregister an agent
 * POST   /api/agents/:id/heartbeat    — update agent heartbeat
 * GET    /api/agents/tags             — list all available tags
 * GET    /api/agents/tools            — list all available tool names
 */

import { requireAuth } from '../middleware/auth.js';
import {
  registerAgent,
  unregisterAgent,
  agentHeartbeat,
  getAgent,
  discoverAgents,
  listTags,
  listTools
} from '../../../core/src/agent-marketplace.js';

/** @param {import('../context.js').Context} ctx */
export async function agentMarketplaceRoutes(ctx) {
  const { pathname } = ctx.url;
  const method = ctx.req.method;

  // GET /api/agents/tags — list all tags
  if (pathname === '/api/agents/tags' && method === 'GET') {
    ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ tags: listTags() }));
    return;
  }

  // GET /api/agents/tools — list all tool names
  if (pathname === '/api/agents/tools' && method === 'GET') {
    ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ tools: listTools() }));
    return;
  }

  // POST /api/agents/register — register a new agent
  if (pathname === '/api/agents/register' && method === 'POST') {
    return handleRegister(ctx);
  }

  // GET /api/agents — list/search agents
  if (pathname === '/api/agents' && method === 'GET') {
    return handleDiscover(ctx);
  }

  // GET /api/agents/:id — get single agent
  const detailMatch = pathname.match(/^\/api\/agents\/([a-z][a-z0-9_]+)$/);
  if (detailMatch && method === 'GET') {
    const entry = getAgent(detailMatch[1]);
    if (!entry) {
      ctx.res.writeHead(404, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: 'NOT_FOUND', message: `Agent "${detailMatch[1]}" not found` }));
      return;
    }
    ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify(entry));
    return;
  }

  // POST /api/agents/:id/unregister
  const unregMatch = pathname.match(/^\/api\/agents\/([a-z][a-z0-9_]+)\/unregister$/);
  if (unregMatch && method === 'POST') {
    return handleUnregister(ctx, unregMatch[1]);
  }

  // POST /api/agents/:id/heartbeat
  const hbMatch = pathname.match(/^\/api\/agents\/([a-z][a-z0-9_]+)\/heartbeat$/);
  if (hbMatch && method === 'POST') {
    return handleHeartbeat(ctx, hbMatch[1]);
  }

  ctx.res.writeHead(404, { 'Content-Type': 'application/json' });
  ctx.res.end(JSON.stringify({ error: 'NOT_FOUND' }));
}

/**
 * POST /api/agents/register
 */
async function handleRegister(ctx) {
  const auth = await requireAuth(ctx);
  if (!auth.authenticated) {
    ctx.res.writeHead(auth.status || 401, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: auth.error, message: auth.message }));
    return;
  }

  const { capability, token } = ctx.body || {};

  if (!capability) {
    ctx.res.writeHead(400, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: 'VALIDATION_ERROR', message: 'capability is required' }));
    return;
  }

  try {
    const result = registerAgent(capability, token);
    ctx.res.writeHead(token ? 200 : 201, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({
      id: result.entry.id,
      capability: result.entry.capability,
      status: result.entry.status,
      token: result.token,
      createdAt: result.entry.createdAt,
      updatedAt: result.entry.updatedAt
    }));
  } catch (err) {
    const status = err.code === 'VALIDATION_ERROR' ? 400
      : err.code === 'UNAUTHORIZED' ? 403
      : 500;
    ctx.res.writeHead(status, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: err.code || 'INTERNAL_ERROR', message: err.message }));
  }
}

/**
 * GET /api/agents — discover/search agents
 */
async function handleDiscover(ctx) {
  const auth = await requireAuth(ctx);
  if (!auth.authenticated) {
    ctx.res.writeHead(auth.status || 401, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: auth.error, message: auth.message }));
    return;
  }

  const query = ctx.url.searchParams.get('query') || undefined;
  const tag = ctx.url.searchParams.get('tag') || undefined;
  const tool = ctx.url.searchParams.get('tool') || undefined;
  const scope = ctx.url.searchParams.get('scope') || undefined;
  const status = ctx.url.searchParams.get('status') || 'active';
  const limit = parseInt(ctx.url.searchParams.get('limit') || '20', 10);
  const offset = parseInt(ctx.url.searchParams.get('offset') || '0', 10);

  const result = discoverAgents({ query, tag, tool, scope, status, limit, offset });

  ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
  ctx.res.end(JSON.stringify(result));
}

/**
 * POST /api/agents/:id/unregister
 */
async function handleUnregister(ctx, agentId) {
  const auth = await requireAuth(ctx);
  if (!auth.authenticated) {
    ctx.res.writeHead(auth.status || 401, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: auth.error, message: auth.message }));
    return;
  }

  const { token } = ctx.body || {};

  if (!token) {
    ctx.res.writeHead(400, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: 'VALIDATION_ERROR', message: 'agent token is required to unregister' }));
    return;
  }

  try {
    const removed = unregisterAgent(agentId, token);
    if (removed) {
      ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ unregistered: true, agentId }));
    } else {
      ctx.res.writeHead(404, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: 'NOT_FOUND', message: `Agent "${agentId}" not found` }));
    }
  } catch (err) {
    ctx.res.writeHead(403, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: err.code || 'FORBIDDEN', message: err.message }));
  }
}

/**
 * POST /api/agents/:id/heartbeat
 */
async function handleHeartbeat(ctx, agentId) {
  const { token } = ctx.body || {};

  if (!token) {
    ctx.res.writeHead(400, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: 'VALIDATION_ERROR', message: 'agent token is required for heartbeat' }));
    return;
  }

  const ok = agentHeartbeat(agentId, token);
  ctx.res.writeHead(ok ? 200 : 404, { 'Content-Type': 'application/json' });
  ctx.res.end(JSON.stringify({ heartbeat: ok, timestamp: new Date().toISOString() }));
}
