/**
 * Cache — 零依赖 HTTP 缓存层
 *
 * 为 REST API 提供轻量缓存支持：
 *   - ETag: MD5 哈希，响应内容变化即变化
 *   - Last-Modified: 基于文档 updatedAt 时间戳
 *   - Cache-Control: 可配置的缓存策略头
 *   - If-None-Match: 条件请求，返回 304
 *   - If-Modified-Since: 条件请求，返回 304
 *
 * 所有实现基于 Node.js 内置 crypto 模块，零外部依赖。
 */

import crypto from 'node:crypto';

/**
 * 生成 ETag（弱验证器，MD5 哈希）
 *
 * @param {string} body — JSON 字符串或纯文本
 * @returns {string} 带 W/ 前缀的弱 ETag
 */
export function generateETag(body) {
  const hash = crypto.createHash('md5').update(body, 'utf-8').digest('hex');
  return `W/"${hash}"`;
}

/**
 * 检查 If-None-Match 是否匹配
 *
 * @param {object} headers — Node.js IncomingMessage headers
 * @param {string} etag — 当前 ETag
 * @returns {boolean} true = 304 Not Modified
 */
export function etagMatches(headers, etag) {
  const ifNoneMatch = headers['if-none-match'];
  if (!ifNoneMatch) return false;
  // 支持逗号分隔的多个 ETag
  return ifNoneMatch.split(',').some(tag => tag.trim() === etag);
}

/**
 * 检查 If-Modified-Since 是否晚于或等于 lastModified
 *
 * @param {object} headers — Node.js IncomingMessage headers
 * @param {string|Date} lastModified — ISO 字符串或 Date
 * @returns {boolean} true = 304 Not Modified
 */
export function modifiedSince(headers, lastModified) {
  const ifModifiedSince = headers['if-modified-since'];
  if (!ifModifiedSince || !lastModified) return false;
  const since = new Date(ifModifiedSince).getTime();
  const modified = new Date(lastModified).getTime();
  return !isNaN(since) && !isNaN(modified) && modified <= since;
}

/**
 * 应用缓存响应头
 *
 * 默认策略：
 *   - public 内容: Cache-Control: public, max-age=60, s-maxage=300
 *   - private 内容: Cache-Control: private, max-age=0
 *   - 总是附加 ETag 和 Last-Modified（如果提供）
 *
 * @param {object} context — 服务端上下文/响应对象，需有 req.headers 和 res.setHeader
 * @param {object} options
 * @param {string} options.etag — ETag 值
 * @param {string} [options.lastModified] — Last-Modified 的 Date 或 ISO 字符串
 * @param {string} [options.visibility='private'] — 'public' | 'private'
 * @param {number} [options.maxAge] — Cache-Control max-age（秒），private 默认为 0
 * @param {number} [options.sMaxAge] — Cache-Control s-maxage（秒），仅对 public 生效
 */
export function applyCacheHeaders(context, options = {}) {
  const { etag, lastModified, visibility = 'private', maxAge, sMaxAge } = options;

  if (etag) {
    context.res.setHeader('ETag', etag);
  }

  if (lastModified) {
    const date = lastModified instanceof Date ? lastModified : new Date(lastModified);
    if (!isNaN(date.getTime())) {
      context.res.setHeader('Last-Modified', date.toUTCString());
    }
  }

  // Cache-Control
  if (visibility === 'public') {
    const ma = maxAge ?? 60;
    const sma = sMaxAge ?? 300;
    context.res.setHeader('Cache-Control', `public, max-age=${ma}, s-maxage=${sma}`);
  } else {
    const ma = maxAge ?? 0;
    context.res.setHeader('Cache-Control', `private, max-age=${ma}`);
  }
}

/**
 * 完整的缓存响应流程 — 一站式处理
 *
 * 1. 生成 body 的 ETag
 * 2. 检查 If-None-Match / If-Modified-Since
 * 3. 匹配 → 304，不匹配 → 200 + 缓存头 + body
 *
 * 返回 true 表示已处理（304 或已写入响应），false 表示需要继续处理。
 *
 * @param {object} context — 服务端上下文（需有 req.headers, res 对象）
 * @param {string} body — JSON 字符串
 * @param {object} [options]
 * @param {string} [options.lastModified] — Last-Modified 时间
 * @param {string} [options.visibility='private'] — 'public' | 'private'
 * @returns {boolean} true = 已写入响应（调用方直接 return）
 */
export function serveCached(context, body, options = {}) {
  const etag = generateETag(body);
  const { lastModified, visibility = 'private' } = options;

  // 检查条件请求
  if (etagMatches(context.req.headers, etag) || modifiedSince(context.req.headers, lastModified)) {
    context.res.writeHead(304, {
      'ETag': etag,
      'Cache-Control': 'no-cache'
    });
    context.res.end();
    return true;
  }

  // 应用缓存头
  applyCacheHeaders(context, { etag, lastModified, visibility });

  context.res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  context.res.end(body);
  return true;
}

/**
 * 从文档数组中提取最新的 updatedAt 时间戳
 *
 * 用于列表接口的 Last-Modified 头。
 *
 * @param {Array<{updatedAt?: string}>} docs
 * @returns {string|null}
 */
export function latestUpdate(docs) {
  if (!docs || !docs.length) return null;
  let latest = null;
  for (const doc of docs) {
    if (doc.updatedAt) {
      const t = new Date(doc.updatedAt).getTime();
      if (!latest || t > latest) latest = t;
    }
  }
  return latest ? new Date(latest).toISOString() : null;
}
