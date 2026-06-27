/**
 * CORS Middleware
 */

const DEFAULT_METHODS = 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
const DEFAULT_HEADERS = 'Content-Type,Authorization,X-Taichu-Agent-Key,X-Taichu-Agent-Id';
const DEFAULT_MAX_AGE = '86400';

/**
 * Apply CORS headers to response.
 *
 * @param {IncomingMessage} req
 * @param {ServerResponse} res
 * @param {string} [origin='*'] — allowed origin, configurable via TAICHU_CORS_ORIGIN env
 */
export function corsMiddleware(req, res, origin = '*') {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', DEFAULT_METHODS);
  res.setHeader('Access-Control-Allow-Headers', DEFAULT_HEADERS);
  res.setHeader('Access-Control-Max-Age', DEFAULT_MAX_AGE);
}
