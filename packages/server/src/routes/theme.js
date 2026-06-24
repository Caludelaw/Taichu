/**
 * Theme Management API
 *
 * GET    /api/theme        — List available themes
 * POST   /api/theme/upload — Upload custom theme (.zip)
 * DELETE /api/theme/:name  — Delete custom theme
 * POST   /api/theme/activate/:name — Activate a theme
 */

import { writeFileSync, mkdirSync, existsSync, unlinkSync, rmdirSync, readdirSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream';
import { requireAuth } from '../middleware/auth.js';
import { createLogger } from '../logger.js';

const log = createLogger('theme');
const THEME_DIR = join(process.cwd(), '.taichu', 'themes');
const PUBLIC_THEME_DIR = join(import.meta.dirname, '..', 'public');

// Built-in themes
const BUILT_IN_THEMES = [
  { name: 'default', label: '默认博客主题', description: 'Taichu 内置简洁博客主题，支持文章/页面/分类/搜索/分页', active: true, builtin: true },
  { name: 'theme-minimal', label: '极简主题', description: '衬线字体 + 留白布局，适合个人博客和作品集', active: false, builtin: true, dir: 'theme-minimal' },
  { name: 'theme-pro', label: 'Pro 主题 (设计系统)', description: 'Taichu 设计系统 v1.0 — 暗色模式、排版体系、语义 HTML、Agent 友好', active: false, builtin: true, dir: 'theme-pro' }
];

/**
 * Get active theme name from persisted site_settings.
 */
async function getActiveTheme(store) {
  try {
    const docs = await store.list({ type: 'site_settings', limit: 1 });
    return docs[0]?.data?.theme?.activeTheme || 'default';
  } catch {
    return 'default';
  }
}

export async function themeRoutes(ctx) {
  const { pathname } = ctx.url;
  const method = ctx.req.method;

  // GET /api/theme — list themes
  if (pathname === '/api/theme' && method === 'GET') {
    // No auth required for listing
    const customThemes = [];
    if (existsSync(THEME_DIR)) {
      readdirSync(THEME_DIR, { withFileTypes: true }).forEach(entry => {
        if (entry.isDirectory()) customThemes.push(entry.name);
      });
    }

    const activeTheme = await getActiveTheme(ctx.store);
    const all = BUILT_IN_THEMES.map(t => ({
      ...t,
      active: t.name === activeTheme
    }));

    for (const name of customThemes) {
      if (!all.find(t => t.name === name)) {
        all.push({ name, label: name, description: '自定义主题', active: name === activeTheme, builtin: false });
      }
    }

    ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ themes: all, active: activeTheme }));
    return;
  }

  // Auth required for management
  const authResult = await requireAuth(ctx);
  if (!authResult.authenticated) {
    ctx.res.writeHead(authResult.status, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ error: authResult.error, message: authResult.message }));
    return;
  }

  // POST /api/theme/activate/:name
  const actMatch = pathname.match(/^\/api\/theme\/activate\/([\w-]+)$/);
  if (actMatch && method === 'POST') {
    const name = actMatch[1];
    const isValid = BUILT_IN_THEMES.some(t => t.name === name) || existsSync(join(THEME_DIR, name));
    if (!isValid) {
      ctx.res.writeHead(404, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: 'Theme not found' }));
      return;
    }
    // Persist active theme to site_settings document
    try {
      const store = ctx.store;
      const docs = await store.list({ type: 'site_settings', limit: 1 });
      const existing = docs[0];

      if (existing) {
        const merged = { ...existing.data, theme: { ...(existing.data.theme || {}), activeTheme: name } };
        await store.update(existing.id, { data: merged });
      } else {
        await store.create({
          type: 'site_settings',
          data: { theme: { activeTheme: name } }
        });
      }

      ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ success: true, active: name }));
    } catch (e) {
      ctx.res.writeHead(500, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // DELETE /api/theme/:name

  // DELETE /api/theme/:name
  const delMatch = pathname.match(/^\/api\/theme\/([\w-]+)$/);
  if (delMatch && method === 'DELETE') {
    const name = delMatch[1];
    if (name === 'default') {
      ctx.res.writeHead(400, { 'Content-Type': 'application/json' });
      ctx.res.end(JSON.stringify({ error: 'Cannot delete default theme' }));
      return;
    }
    const dir = join(THEME_DIR, name);
    if (existsSync(dir)) {
      readdirSync(dir).forEach(f => unlinkSync(join(dir, f)));
      rmdirSync(dir);
    }
    ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({ success: true }));
    return;
  }

  ctx.res.writeHead(404, { 'Content-Type': 'application/json' });
  ctx.res.end(JSON.stringify({ error: 'NOT_FOUND' }));
}
