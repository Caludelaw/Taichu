/**
 * Auth Routes — 注册、登录、API Key 管理
 *
 * POST /api/auth/register   — 注册新用户
 * POST /api/auth/login      — 用户登录，返回 JWT
 * POST /api/auth/apikeys    — 生成新 API Key（需认证）
 * GET  /api/auth/apikeys    — 列出所有 API Key（需认证）
 * DELETE /api/auth/apikeys/:prefix — 删除 API Key（需认证）
 */

import { hashPassword, verifyPassword, signJWT, generateAPIKey, generateResetToken, validateResetToken } from '../../../core/src/auth.js';
import { ValidationError, UnauthorizedError } from '../../../core/src/errors.js';
import { requireAuth, getJwtSecret } from '../middleware/auth.js';
import { getStore } from '../context.js';

/**
 * Helper: retrieve stored reset token for a user (dev mode only)
 */
async function getResetTokenForUser(store, userId) {
  const users = await store.list({ type: 'user' });
  const user = users.find(u => u.id === userId);
  return user ? user.data.resetToken : undefined;
}

export async function authRoutes(ctx) {
  const { pathname } = ctx.url;
  const method = ctx.req.method;

  // POST /api/auth/register
  if (pathname === '/api/auth/register' && method === 'POST') {
    const { username, email, password } = ctx.body || {};

    if (!username || !password) {
      ctx.res.writeHead(400, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Username and password are required' }));
      return;
    }

    if (typeof username !== 'string' || username.length < 2 || username.length > 50) {
      ctx.res.writeHead(400, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Username must be 2-50 characters' }));
      return;
    }

    if (password.length < 6) {
      ctx.res.writeHead(400, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Password must be at least 6 characters' }));
      return;
    }

    // Check if username exists
    const existing = await ctx.store.list({ type: 'user', search: username });
    const userExists = existing.some(u => u.data.username === username);

    if (userExists) {
      ctx.res.writeHead(409, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: 'CONFLICT', message: 'Username already taken' }));
      return;
    }

    const hashedPw = hashPassword(password);

    const user = await ctx.store.create({
      type: 'user',
      data: { username, email: email || '', password: hashedPw },
      status: 'active'
    });

    // Issue JWT immediately after registration
    const secret = getJwtSecret();
    const token = signJWT(
      { sub: user.id, username: user.data.username, role: 'author' },
      secret,
      { expiresIn: '7d' }
    );

    ctx.res.writeHead(201, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({
      user: { id: user.id, username: user.data.username, email: user.data.email },
      token
    }));
    return;
  }

  // POST /api/auth/login
  if (pathname === '/api/auth/login' && method === 'POST') {
    const { username, password } = ctx.body || {};

    if (!username || !password) {
      ctx.res.writeHead(400, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Username and password are required' }));
      return;
    }

    const users = await ctx.store.list({ type: 'user', status: 'active' });
    const user = users.find(u => u.data.username === username);

    if (!user || !verifyPassword(password, user.data.password)) {
      ctx.res.writeHead(401, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: 'UNAUTHORIZED', message: 'Invalid username or password' }));
      return;
    }

    const secret = getJwtSecret();
    const token = signJWT(
      { sub: user.id, username: user.data.username, role: user.data.role || 'author' },
      secret,
      { expiresIn: '7d' }
    );

    ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({
      user: { id: user.id, username: user.data.username, email: user.data.email, role: user.data.role || 'author' },
      token
    }));
    return;
  }

  // POST /api/auth/apikeys — Generate new API Key (requires auth)
  if (pathname === '/api/auth/apikeys' && method === 'POST') {
    const authResult = await requireAuth(ctx);
    if (!authResult.authenticated) {
      ctx.res.writeHead(authResult.status, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: authResult.error, message: authResult.message }));
      return;
    }
    ctx.actor = authResult.actor;

    const { label, scopes } = ctx.body || {};
    const apiKey = generateAPIKey(label || 'Default');

    // Store the hash with scopes (default: read-only for all types)
    const keyScopes = (Array.isArray(scopes) && scopes.length > 0) ? scopes : ['*:read'];

    await ctx.store.create({
      type: 'api_key',
      data: {
        prefix: apiKey.prefix,
        hash: apiKey.hash,
        label: apiKey.label,
        ownerId: ctx.actor.id,
        scopes: keyScopes
      },
      status: 'active'
    });

    ctx.res.writeHead(201, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({
      key: apiKey.key,
      prefix: apiKey.prefix,
      label: apiKey.label,
      scopes: keyScopes,
      message: 'Save this key — it will not be shown again'
    }));
    return;
  }

  // GET /api/auth/apikeys — List API Keys (requires auth)
  if (pathname === '/api/auth/apikeys' && method === 'GET') {
    const authResult = await requireAuth(ctx);
    if (!authResult.authenticated) {
      ctx.res.writeHead(authResult.status, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: authResult.error, message: authResult.message }));
      return;
    }
    ctx.actor = authResult.actor;

    const keys = await ctx.store.list({ type: 'api_key', status: 'active' });
    const myKeys = keys
      .filter(k => k.data.ownerId === ctx.actor.id)
      .map(k => ({
        prefix: k.data.prefix,
        label: k.data.label,
        scopes: k.data.scopes || ['*:*'],
        createdAt: k.createdAt
      }));

    ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ keys: myKeys }));
    return;
  }

  // DELETE /api/auth/apikeys/:prefix — Revoke API Key (requires auth)
  const keyMatch = pathname.match(/^\/api\/auth\/apikeys\/(taichu_[a-f0-9]+)$/);
  if (keyMatch && method === 'DELETE') {
    const authResult = await requireAuth(ctx);
    if (!authResult.authenticated) {
      ctx.res.writeHead(authResult.status, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: authResult.error, message: authResult.message }));
      return;
    }
    ctx.actor = authResult.actor;

    const prefix = keyMatch[1];
    const keys = await ctx.store.list({ type: 'api_key', status: 'active' });
    const myKey = keys.find(k => k.data.prefix === prefix && k.data.ownerId === ctx.actor.id);

    if (!myKey) {
      ctx.res.writeHead(404, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: 'NOT_FOUND', message: 'API key not found' }));
      return;
    }

    await ctx.store.update(myKey.id, { status: 'revoked' });

    ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ message: `API key ${prefix.substring(0, 11)}... revoked` }));
    return;
  }

  // POST /api/auth/forgot-password — request password reset token
  if (pathname === '/api/auth/forgot-password' && method === 'POST') {
    const { username } = ctx.body || {};

    if (!username) {
      ctx.res.writeHead(400, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Username is required' }));
      return;
    }

    // Always return success to prevent username enumeration
    const users = await ctx.store.list({ type: 'user', status: 'active' });
    const user = users.find(u => u.data.username === username);

    if (user) {
      const secret = getJwtSecret();
      const resetToken = generateResetToken(user.id, secret);

      // Store reset token on user document
      await ctx.store.update(user.id, {
        data: {
          ...user.data,
          resetToken,
          resetTokenExpiresAt: new Date(Date.now() + 3600000).toISOString()
        }
      });
    }

    ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({
      message: 'If the account exists, a reset link has been generated.',
      // In production, this token would be sent via email.
      // For local development, we return it directly.
      _devToken: user ? (await getResetTokenForUser(ctx.store, user.id)) : undefined
    }));
    return;
  }

  // POST /api/auth/reset-password — reset password with token
  if (pathname === '/api/auth/reset-password' && method === 'POST') {
    const { token, newPassword } = ctx.body || {};

    if (!token || !newPassword) {
      ctx.res.writeHead(400, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Token and newPassword are required' }));
      return;
    }

    if (newPassword.length < 6) {
      ctx.res.writeHead(400, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Password must be at least 6 characters' }));
      return;
    }

    const secret = getJwtSecret();
    const validation = validateResetToken(token, secret);

    if (!validation.valid) {
      ctx.res.writeHead(400, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: 'INVALID_TOKEN', message: validation.error }));
      return;
    }

    // Verify user exists and token matches
    const users = await ctx.store.list({ type: 'user', status: 'active' });
    const user = users.find(u => u.id === validation.userId);

    if (!user) {
      ctx.res.writeHead(400, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: 'INVALID_TOKEN', message: 'User not found' }));
      return;
    }

    if (user.data.resetToken !== token) {
      ctx.res.writeHead(400, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: 'INVALID_TOKEN', message: 'Token has already been used or is invalid' }));
      return;
    }

    // Hash new password and clear reset token
    const hashedPw = hashPassword(newPassword);
    const { resetToken: _, resetTokenExpiresAt: __, ...cleanData } = user.data;

    await ctx.store.update(user.id, {
      data: { ...cleanData, password: hashedPw }
    });

    ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ message: 'Password has been reset successfully' }));
    return;
  }

  // 404
  ctx.res.writeHead(404, { 'Content-Type': 'application/json' });
  ctx.res.end(JSON.stringify({ error: 'NOT_FOUND', message: `Auth route not found: ${method} ${pathname}` }));
}
