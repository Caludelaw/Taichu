/**
 * Auth Middleware — 认证中间件
 *
 * 两种认证方式：
 *   Bearer <JWT>        → 解析 JWT，识别人类用户
 *   X-Taichu-Agent-Key    → 匹配 API Key，识别 AI Agent
 *
 * 使用：
 *   const result = await requireAuth(ctx);
 *   if (!result.authenticated) return error;
 *   ctx.actor = result.actor; // { id, type: 'human'|'agent', username, role }
 */

import { verifyJWT, verifyAPIKey } from '../../../core/src/auth.js';
import { getStore } from '../context.js';
import { randomBytes } from 'node:crypto';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** Cached JWT secret for the process lifetime */
let _jwtSecret = null;

/**
 * Get or auto-generate a JWT secret.
 *
 * Priority:
 *   1. TAICHU_JWT_SECRET environment variable
 *   2. Auto-generated secret persisted to .taichu/data/.jwt_secret
 *
 * The hardcoded default 'taichu-dev-secret' is explicitly rejected.
 *
 * @returns {string}
 */
export function getJwtSecret() {
  if (_jwtSecret) return _jwtSecret;

  // 1. Environment variable
  const envSecret = process.env.TAICHU_JWT_SECRET;
  if (envSecret && envSecret !== 'taichu-dev-secret' && envSecret !== 'change-me') {
    _jwtSecret = envSecret;
    return _jwtSecret;
  }

  // 2. Auto-generate and persist
  const dataDir = process.env.TAICHU_DATA_DIR || join(process.cwd(), '.taichu', 'data');
  const secretFile = join(dataDir, '.jwt_secret');

  if (existsSync(secretFile)) {
    _jwtSecret = readFileSync(secretFile, 'utf-8').trim();
    if (_jwtSecret) return _jwtSecret;
  }

  // Generate new secret
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  _jwtSecret = randomBytes(32).toString('hex');
  writeFileSync(secretFile, _jwtSecret, 'utf-8');

  console.log(`  Auth: Auto-generated JWT secret saved to ${secretFile}`);
  return _jwtSecret;
}

/**
 * Require authentication — returns auth result or 401.
 *
 * @param {Context} ctx
 * @returns {Promise<{ authenticated: boolean, status?: number, error?: string, message?: string, actor?: object }>}
 */
export async function requireAuth(ctx) {
  const authHeader = ctx.req.headers['authorization'];
  const agentKey = ctx.req.headers['x-taichu-agent-key'];

  // ── JWT Auth (Human) ──
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const secret = getJwtSecret();
    const result = verifyJWT(token, secret);

    if (!result.valid) {
      return { authenticated: false, status: 401, error: 'UNAUTHORIZED', message: result.error };
    }

    return {
      authenticated: true,
      actor: {
        id: result.payload.sub,
        type: 'human',
        username: result.payload.username,
        role: result.payload.role || 'author'
      }
    };
  }

  // ── API Key Auth (Agent) ──
  if (agentKey) {
    const store = getStore();

    // Extract prefix for O(1) lookup: "taichu_<8 hex>" = 14 chars
    const prefix = agentKey.length >= 14 ? agentKey.substring(0, 14) : agentKey;

    // Try O(1) direct lookup via deterministic document ID
    let keyDoc = await store.get(`api_key:${prefix}`);

    // Backward compatibility: fallback to O(n) for old keys without ID prefix
    if (!keyDoc) {
      const keys = await store.list({ type: 'api_key', status: 'active' });
      for (const doc of keys) {
        if (verifyAPIKey(agentKey, doc.data.hash)) {
          keyDoc = doc;
          break;
        }
      }
    }

    if (keyDoc && keyDoc.status === 'active' && verifyAPIKey(agentKey, keyDoc.data.hash)) {
      const scopes = keyDoc.data.scopes || ['*:*'];
      return {
        authenticated: true,
        actor: {
          id: keyDoc.data.ownerId || `agent_${keyDoc.data.prefix}`,
          type: 'agent',
          role: 'agent',
          keyPrefix: keyDoc.data.prefix,
          label: keyDoc.data.label,
          scopes
        }
      };
    }

    return { authenticated: false, status: 401, error: 'UNAUTHORIZED', message: 'Invalid API key' };
  }

  // ── No credentials ──
  return { authenticated: false, status: 401, error: 'UNAUTHORIZED', message: 'Authentication required' };
}

/**
 * Check if the actor has the required scope.
 *
 * Scope format: "<type>:<action>" where:
 *   - type: content type name (e.g. "article") or "*" for all
 *   - action: "read" | "write" | "delete" | "*" for all
 *
 * Examples:
 *   checkScope(actor, 'article:read')  → true if actor can read articles
 *   checkScope(actor, '*:*')           → true if actor is admin
 *   checkScope(actor, 'media:write')   → true if actor can write media
 *
 * Humans (JWT) always have full access (*:*).
 *
 * @param {object} actor
 * @param {string} required — scope string like "article:read"
 * @returns {boolean}
 */
export function checkScope(actor, required) {
  // Humans always pass
  if (actor.type === 'human') return true;

  const scopes = actor.scopes || [];
  if (scopes.includes('*:*')) return true;

  // Parse required: "type:action" or "type:field:action"
  const parts = required.split(':');
  const reqType = parts[0];
  const reqField = parts.length === 3 ? parts[1] : null;
  const reqAction = parts.length === 3 ? parts[2] : parts[1];

  for (const scope of scopes) {
    const sParts = scope.split(':');

    if (sParts.length === 3) {
      // Field-level scope: type:field:action
      const typeMatch = sParts[0] === '*' || sParts[0] === reqType;
      const fieldMatch = sParts[1] === '*' || (reqField && sParts[1] === reqField);
      const actionMatch = sParts[2] === '*' || sParts[2] === reqAction;
      if (typeMatch && fieldMatch && (reqField ? true : true) && actionMatch) return true;
    } else {
      // Type-level scope: type:action
      const typeMatch = sParts[0] === '*' || sParts[0] === reqType;
      const actionMatch = sParts[1] === '*' || sParts[1] === reqAction;
      if (typeMatch && actionMatch) return true;
    }
  }

  return false;
}

/**
 * Convenience: require auth + scope check in one call.
 * Returns 403 if authenticated but lacking scope.
 */
export async function requireScopedAuth(ctx, scope) {
  const result = await requireAuth(ctx);
  if (!result.authenticated) return result;

  if (!checkScope(result.actor, scope)) {
    return {
      authenticated: false,
      status: 403,
      error: 'FORBIDDEN',
      message: `Insufficient permissions: "${scope}" scope required`
    };
  }

  return result;
}

/**
 * Optional auth — attaches actor if authenticated, but doesn't block.
 */
export async function optionalAuth(ctx) {
  const result = await requireAuth(ctx);
  if (result.authenticated) {
    ctx.actor = result.actor;
  }
}
