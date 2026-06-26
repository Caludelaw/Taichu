/**
 * ActivityPub Routes
 *
 * GET  /.well-known/webfinger?resource=acct:taichu@host   — WebFinger discovery
 * GET  /api/activitypub/actor                              — Actor JSON-LD
 * GET  /api/activitypub/outbox                             — Activity outbox
 * POST /api/activitypub/inbox                              — Receive activities
 * GET  /api/activitypub/followers                          — Followers collection
 */

import {
  actorObject,
  webfingerResponse,
  createContentActivity,
  processInboxActivity
} from '../activitypub.js';
import { getStore } from '../context.js';
import { createLogger } from '../logger.js';
import { getTaichuVersion } from '../../../core/src/version.js';

const log = createLogger('ap-routes');

const AP_CONTENT_TYPE = 'application/activity+json; charset=utf-8';

/** @param {import('../context.js').Context} ctx */
export async function activityPubRoutes(ctx) {
  const { pathname } = ctx.url;
  const method = ctx.req.method;

  // WebFinger
  if (pathname === '/.well-known/webfinger' && method === 'GET') {
    const resource = ctx.url.searchParams.get('resource');
    if (!resource) {
      ctx.res.writeHead(400, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: 'Missing "resource" parameter' }));
      return;
    }
    const result = webfingerResponse(resource);
    ctx.res.writeHead(200, { 'Content-Type': 'application/jrd+json' });
    ctx.res.end(JSON.stringify(result));
    return;
  }

  // NodeInfo (for fediverse discovery)
  if (pathname === '/.well-known/nodeinfo' && method === 'GET') {
    ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({
      links: [{ rel: 'http://nodeinfo.diaspora.software/ns/schema/2.0', href: `${getBaseUrl(ctx)}/api/activitypub/nodeinfo` }]
    }));
    return;
  }

  // Actor
  if (pathname === '/api/activitypub/actor' && method === 'GET') {
    const actor = actorObject();
    ctx.res.writeHead(200, { 'Content-Type': AP_CONTENT_TYPE });
    ctx.res.end(JSON.stringify(actor));
    return;
  }

  // Outbox
  if (pathname === '/api/activitypub/outbox' && method === 'GET') {
    const store = getStore();
    const activities = [];
    try {
      // Get recently published content as activities
      const docs = await store.list({ type: 'article', status: 'published', limit: 20, orderBy: 'updated_at', order: 'desc' });
      for (const doc of docs) {
        activities.push(createContentActivity(doc));
      }
    } catch (_) {}

    const outbox = {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: `${getBaseUrl(ctx)}/api/activitypub/outbox`,
      type: 'OrderedCollection',
      totalItems: activities.length,
      orderedItems: activities
    };

    ctx.res.writeHead(200, { 'Content-Type': AP_CONTENT_TYPE });
    ctx.res.end(JSON.stringify(outbox));
    return;
  }

  // Followers
  if (pathname === '/api/activitypub/followers' && method === 'GET') {
    ctx.res.writeHead(200, { 'Content-Type': AP_CONTENT_TYPE });
    ctx.res.end(JSON.stringify({
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: `${getBaseUrl(ctx)}/api/activitypub/followers`,
      type: 'OrderedCollection',
      totalItems: 0,
      orderedItems: []
    }));
    return;
  }

  // Inbox (POST only)
  if (pathname === '/api/activitypub/inbox' && method === 'POST') {
    try {
      const result = await processInboxActivity(ctx.body, ctx.req.headers);
      if (result.accepted) {
        ctx.res.writeHead(result.response ? 200 : 202, { 'Content-Type': AP_CONTENT_TYPE });
        ctx.res.end(JSON.stringify(result.response || { accepted: true }));
      } else {
        ctx.res.writeHead(401, { 'Content-Type': 'application/json' });
        ctx.res.end(JSON.stringify({ error: result.reason || 'Rejected' }));
      }
    } catch (err) {
      log.error(`Inbox error: ${err.message}`);
      ctx.res.writeHead(500, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: 'Internal error' }));
    }
    return;
  }

  // NodeInfo endpoint
  if (pathname === '/api/activitypub/nodeinfo' && method === 'GET') {
    ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({
      version: '2.0',
      software: { name: 'taichu', version: getTaichuVersion() },
      protocols: ['activitypub'],
      services: { inbound: [], outbound: [] },
      openRegistrations: false,
      usage: { users: { total: 1 } },
      metadata: { nodeName: 'Taichu CMS' }
    }));
    return;
  }

  ctx.res.writeHead(404, { 'Content-Type': 'application/json' });
  ctx.res.end(JSON.stringify({ error: 'NOT_FOUND' }));
}

function getBaseUrl(ctx) {
  const proto = ctx.req.headers['x-forwarded-proto'] || 'http';
  const host = ctx.req.headers['x-forwarded-host'] || ctx.req.headers.host || 'localhost';
  return `${proto}://${host}`;
}
