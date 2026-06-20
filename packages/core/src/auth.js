/**
 * Auth — 零依赖认证模块
 *
 * 双通道认证：
 *   JWT     → 人类用户（登录后签发，Bearer Token）
 *   API Key → AI Agent（预生成，X-Taichu-Agent-Key Header）
 *
 * 所有实现基于 Node.js 内置 crypto 模块，零外部依赖。
 */

import crypto from 'node:crypto';

// ─── 密码哈希 ───────────────────────────────────────────────

/**
 * 使用 PBKDF2 哈希密码（迭代 10 万次，128-bit salt）
 * 输出格式：pbkdf2_sha256$100000$salt_hex$hash_hex
 */
export function hashPassword(password, saltHex) {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
  return `pbkdf2_sha256$100000$${salt.toString('hex')}$${hash}`;
}

/**
 * 验证密码是否匹配哈希
 */
export function verifyPassword(password, hashed) {
  try {
    const [, iterations, saltHex, hash] = hashed.split('$');
    if (!iterations || !saltHex || !hash) return false;
    const salt = Buffer.from(saltHex, 'hex');
    const computed = crypto.pbkdf2Sync(password, salt, parseInt(iterations), 32, 'sha256').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(hash, 'hex'));
  } catch {
    return false;
  }
}

// ─── JWT ────────────────────────────────────────────────────

function base64urlEncode(str) {
  return Buffer.from(str)
    .toString('base64url');
}

function base64urlDecode(str) {
  return Buffer.from(str, 'base64url').toString('utf8');
}

/**
 * 签发 JWT Token
 *
 * @param {object} payload — 载荷（sub, role, scope 等）
 * @param {string} secret — 签名密钥
 * @param {object} [options]
 * @param {string} [options.expiresIn] — 过期时间，如 '24h', '7d'
 * @returns {string} JWT token
 */
export function signJWT(payload, secret, options = {}) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const expMap = { s: 1, m: 60, h: 3600, d: 86400 };

  let exp = null;
  if (options.expiresIn) {
    const match = options.expiresIn.match(/^(\d+)([smhd])$/);
    if (match) {
      exp = now + parseInt(match[1]) * (expMap[match[2]] || 3600);
    }
  }

  const claims = {
    ...payload,
    iat: now,
    ...(exp ? { exp } : {})
  };

  const headerB64 = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(claims));
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * 验证并解析 JWT Token
 *
 * @param {string} token — JWT token 字符串
 * @param {string} secret — 签名密钥
 * @returns {{ valid: boolean, payload?: object, error?: string }}
 */
export function verifyJWT(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'Invalid token format' };
    }

    const [headerB64, payloadB64, sigB64] = parts;

    // Verify signature
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    if (sigB64 !== expectedSig) {
      return { valid: false, error: 'Invalid signature' };
    }

    // Parse claims
    const claims = JSON.parse(base64urlDecode(payloadB64));

    // Check expiration
    if (claims.exp && claims.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false, error: 'Token expired' };
    }

    return { valid: true, payload: claims };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

// ─── API Key ─────────────────────────────────────────────────

/**
 * 生成 API Key
 * 格式：taichu_<32字节随机hex>
 *
 * @param {string} [label] — 标签（备忘用，如 "My Super Niuma Agent"）
 * @returns {{ key: string, prefix: string, label: string, createdAt: string }}
 */
export function generateAPIKey(label = '') {
  const key = `taichu_${crypto.randomBytes(32).toString('hex')}`;
  const prefix = key.substring(0, 14); // "taichu_a1b2c3"
  // Store the hash, not the raw key
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  return {
    key,      // 仅生成时返回一次
    prefix,   // 用于 UI 展示 "taichu_a1b2***"
    hash,     // 存储到数据库
    label,
    createdAt: new Date().toISOString()
  };
}

/**
 * 验证 API Key 是否匹配已存储的哈希
 */
export function verifyAPIKey(key, storedHash) {
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
}

// ─── Password Reset Token ───────────────────────────────────

/**
 * 生成密码重置 Token（JWT，1 小时过期，专用 purpose）
 *
 * @param {string} userId — 用户 ID
 * @param {string} secret — JWT 签名密钥
 * @returns {string} 重置 token
 */
export function generateResetToken(userId, secret) {
  return signJWT(
    { sub: userId, purpose: 'password-reset' },
    secret,
    { expiresIn: '1h' }
  );
}

/**
 * 验证密码重置 Token
 *
 * @param {string} token — 重置 token
 * @param {string} secret — JWT 签名密钥
 * @returns {{ valid: boolean, userId?: string, error?: string }}
 */
export function validateResetToken(token, secret) {
  const result = verifyJWT(token, secret);

  if (!result.valid) {
    return { valid: false, error: result.error };
  }

  if (result.payload.purpose !== 'password-reset') {
    return { valid: false, error: 'Token has wrong purpose' };
  }

  return { valid: true, userId: result.payload.sub };
}
