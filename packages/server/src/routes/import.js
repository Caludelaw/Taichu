/**
 * Content Import — 文件上传导入内容
 *
 * POST /api/import/:type
 *
 * 支持三种导入格式：Markdown (.md)、CSV (.csv)、JSON (.json)
 * 格式可通过 URL 参数 `?format=md|csv|json` 或自动检测文件扩展名。
 */

import { requireAuth } from '../middleware/auth.js';
import { parseMultipart } from '../multipart.js';
import { getContentType } from './api.js';

/**
 * @param {import('../context.js').Context} ctx
 * @returns {Promise<boolean>}
 */
export async function importRoutes(ctx) {
  const { pathname } = ctx.url;
  const method = ctx.req.method;

  const match = pathname.match(/^\/api\/import\/([a-z][a-z0-9_]*)$/);
  if (!match || method !== 'POST') return false;

  // Auth required
  const authResult = await requireAuth(ctx);
  if (!authResult.authenticated) {
    ctx.res.writeHead(authResult.status, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: authResult.error }));
    return true;
  }

  const type = match[1];
  const ct = getContentType(type);
  if (!ct) {
    ctx.res.writeHead(400, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: `Unknown content type: ${type}` }));
    return true;
  }

  // Determine format: query param > file extension > default json
  let format = ctx.url.searchParams.get('format') ||
               ctx.url.searchParams.get('_format');

  // Optional params
  const conflictStrategy = ctx.url.searchParams.get('conflict') || 'skip';
  const defaultStatus = ctx.url.searchParams.get('status') || 'draft';
  const dryRun = ctx.url.searchParams.get('dryRun') === 'true';

  // Read the request body
  const contentType = ctx.req.headers['content-type'] || '';

  let fileContent;
  let fileName = '';

  if (contentType.includes('multipart/form-data')) {
    // File upload via multipart
    try {
      const { files, fields } = await parseMultipart(ctx.req);
      // Support _format as a hidden field
      if (!format && fields._format) format = fields._format;
      if (!format && fields.format) format = fields.format;

      if (files.length === 0) {
        ctx.res.writeHead(400, { 'Content-Type': 'application/json' });
        ctx.res.end(JSON.stringify({ error: 'No file uploaded' }));
        return true;
      }

      const file = files[0];
      fileContent = file.buffer.toString('utf-8');
      fileName = file.filename || '';
    } catch (err) {
      ctx.res.writeHead(err.status || 400, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: err.message }));
      return true;
    }
  } else {
    // Raw body — assume JSON if no file upload
    try {
      let body = '';
      await new Promise((resolve, reject) => {
        ctx.req.on('data', chunk => { body += chunk.toString(); });
        ctx.req.on('end', resolve);
        ctx.req.on('error', reject);
      });
      fileContent = body;
      if (!format) format = 'json';
    } catch (_err) {
      ctx.res.writeHead(500, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: 'Failed to read request body' }));
      return true;
    }
  }

  // Auto-detect format from filename
  if (!format && fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    switch (ext) {
      case 'md':
      case 'markdown':  format = 'md'; break;
      case 'csv':       format = 'csv'; break;
      case 'json':      format = 'json'; break;
    }
  }

  // Fallback
  if (!format) format = 'json';

  // Parse the content
  const { parseMarkdown, parseCSV, parseJSON, importContent } = await import(
    '../../../core/src/import-content.js'
  );

  let items;
  try {
    switch (format) {
      case 'md':
      case 'markdown': {
        const item = parseMarkdown(fileContent, { type, status: defaultStatus, tenantId: ctx.tenantId });
        items = [item]; // Single item for Markdown
        break;
      }
      case 'csv':
        items = parseCSV(fileContent, { type, status: defaultStatus, tenantId: ctx.tenantId });
        break;
      case 'json':
        items = parseJSON(fileContent, { type, status: defaultStatus, tenantId: ctx.tenantId });
        break;
      default:
        ctx.res.writeHead(400, { 'Content-Type': 'application/json' });
        ctx.res.end(JSON.stringify({ error: `Unsupported format: ${format}. Use md, csv, or json` }));
        return true;
    }
  } catch (err) {
    ctx.res.writeHead(400, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: `Parse error: ${err.message}` }));
    return true;
  }

  if (items.length === 0) {
    ctx.res.writeHead(400, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: 'No content found to import' }));
    return true;
  }

  // Run beforeImport hook
  let hookPayload = { type, items, format, conflictStrategy, dryRun };
  hookPayload = await ctx.hooks.run('beforeImport', hookPayload, ctx);
  if (!hookPayload) {
    ctx.res.writeHead(403, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: 'Import blocked by hook' }));
    return true;
  }

  // Import
  const result = await importContent(ctx.store, ct, hookPayload.items, {
    conflictStrategy: hookPayload.conflictStrategy,
    dryRun: hookPayload.dryRun,
    tenantId: ctx.tenantId
  });

  // Run afterImport hook
  await ctx.hooks.run('afterImport', { type, result, format }, ctx);

  const status = result.errors.length > 0 && result.imported === 0 ? 400 : 200;
  ctx.res.writeHead(status, { 'Content-Type': 'application/json' });
  ctx.res.end(JSON.stringify({
    success: result.errors.length === 0,
    ...result,
    dryRun: dryRun || undefined
  }));
  return true;
}
