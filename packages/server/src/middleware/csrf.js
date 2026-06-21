/**
 * CSRF Protection Middleware — Double-Submit Cookie Pattern
 *
 * Protects admin API endpoints from cross-site request forgery.
 *
 * Flow:
 *   1. Admin SPA calls GET /api/csrf-token → server sets csrf_token cookie
 *   2. SPA reads cookie, sends X-CSRF-Token header on mutating requests
 *   3. This middleware compares cookie value with header value
 *   4. Since attackers cannot read cookies from the target domain,
 *      they cannot forge the X-CSRF-Token header.
 *
 * Safe methods (no CSRF check): GET, HEAD, OPTIONS
 * Protected paths: /api/* (POST, PUT, PATCH, DELETE)
 * Public endpoints skipped: /api/auth/*, /api/graphql, /api/csrf-token
 */

import { randomBytes, timingSafeEqual } from 'node:crypto';

const TOKEN_BYTES = 32;
const PUBLIC_PREFIXES = ['/api/auth/', '/api/graphql', '/api/csrf-token', '/api/activitypub'];

function isPublicPath(pathname) {
  return PUBLIC_PREFIXES.some(p => pathname.startsWith(p));
}

function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  const cookies = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    cookies[key] = val;
  }
  return cookies;
}

/**
 * Generate a secure random CSRF token (URL-safe base64).
 * @returns {string}
 */
export function generateCSRFToken() {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/**
 * CSRF protection middleware.
 * Returns true if the request is allowed, false if blocked (response already written).
 * @param {import('../context.js').Context} ctx
 * @returns {Promise<boolean>}
 */
export async function csrfProtection(ctx) {
  const { method } = ctx.req;
  const pathname = ctx.url.pathname;
  const req = ctx.req;

  // Only check mutating methods
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return true;
  }

  // Only protect /api/* paths
  if (!pathname.startsWith('/api/')) {
    return true;
  }

  // Skip public API paths
  if (isPublicPath(pathname)) {
    return true;
  }

  // Parse cookies
  const cookies = parseCookies(req.headers.cookie || '');
  const cookieToken = cookies.csrf_token;

  // Get token from header
  const headerToken = req.headers['x-csrf-token'];

  if (!cookieToken || !headerToken) {
    ctx.res.writeHead(403, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({
      error: 'CSRF_TOKEN_MISSING',
      message: 'CSRF token required. Call GET /api/csrf-token first.'
    }));
    return false;
  }

  // Constant-time comparison
  const cookieBuf = Buffer.from(cookieToken);
  const headerBuf = Buffer.from(headerToken);

  if (cookieBuf.length !== headerBuf.length) {
    ctx.res.writeHead(403, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({
      error: 'CSRF_TOKEN_MISMATCH',
      message: 'CSRF token does not match.'
    }));
    return false;
  }

  if (!timingSafeEqual(cookieBuf, headerBuf)) {
    ctx.res.writeHead(403, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({
      error: 'CSRF_TOKEN_MISMATCH',
      message: 'CSRF token does not match.'
    }));
    return false;
  }

  return true;
}
