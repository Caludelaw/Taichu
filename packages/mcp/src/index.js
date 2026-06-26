#!/usr/bin/env node

/**
 * Taichu MCP Server — 31 Agent Tools
 *
 * 让任何支持 MCP 的 AI Agent 直接操控 Taichu CMS 的内容。
 *
 * 使用方式：
 *   node packages/mcp/src/index.js                    # stdio transport
 *   TAICHU_API=http://localhost:3120 node ...             # 指定 API 地址
 *   TAICHU_AGENT_KEY=taichu_xxx node ...                   # Agent API Key
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getVersion() {
  try {
    // Navigate: packages/mcp/src → packages/mcp → packages → project root
    const rootPkg = join(__dirname, '..', '..', '..', 'package.json');
    return JSON.parse(readFileSync(rootPkg, 'utf-8')).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const VERSION = getVersion();

const API_BASE = process.env.TAICHU_API || 'http://localhost:3120';
const API_KEY = process.env.TAICHU_AGENT_KEY || '';

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (API_KEY) headers['X-Taichu-Agent-Key'] = API_KEY;
  const url = `${API_BASE}/api${path}`;
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

function ok(data) {
  return { content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] };
}

// ─────────────────────────────────────────────────────────────
// TOOLS
// ─────────────────────────────────────────────────────────────

// 1. list_content
async function listContent(args) {
  const { type, status, search, limit = 20, offset = 0 } = args;
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (search) params.set('search', search);
  if (limit) params.set('limit', String(limit));
  if (offset) params.set('offset', String(offset));
  const data = await request(`/content/${type}?${params}`);
  return ok({
    total: data.total,
    docs: (data.docs || []).map(d => ({ id: d.id, type: d.type, title: d.data?.title || d.data?.name || '(untitled)', status: d.status, updatedAt: d.updatedAt }))
  });
}

// 2. get_content
async function getContent(args) {
  const { type, id } = args;
  const doc = await request(`/content/${type}/${id}`);
  return ok(doc);
}

// 3. create_content
async function createContent(args) {
  const { type, data, status: docStatus = 'draft' } = args;
  const doc = await request(`/content/${type}`, { method: 'POST', body: JSON.stringify({ data, status: docStatus }) });
  return ok({ success: true, id: doc.id, type: doc.type, title: doc.data?.title });
}

// 4. update_content
async function updateContent(args) {
  const { type, id, data } = args;
  const doc = await request(`/content/${type}/${id}`, { method: 'PUT', body: JSON.stringify({ data }) });
  return ok({ success: true, id: doc.id, updatedAt: doc.updatedAt });
}

// 5. delete_content
async function deleteContent(args) {
  const { type, id } = args;
  await request(`/content/${type}/${id}`, { method: 'DELETE' });
  return ok({ success: true, message: `Deleted ${type}/${id}` });
}

// 6. list_content_types
async function listContentTypes() {
  const data = await request('/content-types');
  return ok(data.types || data);
}

// 7. search_content
async function searchContent(args) {
  const { query, type, limit = 10 } = args;
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  if (type) params.set('type', type);
  const data = await request(`/search?${params}`);
  return ok({
    query: data.query, total: data.total,
    docs: (data.docs || []).map(d => ({ id: d.id, type: d.type, title: d.data?.title || d.data?.name || '(untitled)', status: d.status, score: d._score }))
  });
}

// 8. get_content_type_schema
async function getContentTypeSchema(args) {
  const { type } = args;
  const data = await request(`/content-types/${type}`);
  return ok(data);
}

// 9. count_content
async function countContent(args) {
  const { type, status } = args;
  const data = await request(`/content/${type}?limit=1`);
  return ok({ type: args.type, total: data.total });
}

// 10. publish_content
async function publishContent(args) {
  const { type, id } = args;
  const doc = await request(`/content/${type}/${id}`, { method: 'PUT', body: JSON.stringify({ data: {}, status: 'published' }) });
  return ok({ success: true, id: doc.id, status: 'published' });
}

// 11. archive_content
async function archiveContent(args) {
  const { type, id } = args;
  const doc = await request(`/content/${type}/${id}`, { method: 'PUT', body: JSON.stringify({ data: {}, status: 'archived' }) });
  return ok({ success: true, id: doc.id, status: 'archived' });
}

// 12. batch_create_content
async function batchCreateContent(args) {
  const { type, items, status: docStatus = 'draft' } = args;
  const results = [];
  for (const data of items) {
    const doc = await request(`/content/${type}`, { method: 'POST', body: JSON.stringify({ data, status: docStatus }) });
    results.push({ id: doc.id, title: doc.data?.title });
  }
  return ok({ created: results.length, items: results });
}

// 13. batch_update_content
async function batchUpdateContent(args) {
  const { type, items } = args;
  const results = [];
  for (const { id, data } of items) {
    const doc = await request(`/content/${type}/${id}`, { method: 'PUT', body: JSON.stringify({ data }) });
    results.push({ id: doc.id, title: doc.data?.title });
  }
  return ok({ updated: results.length, items: results });
}

// 14. clear_content
async function clearContent(args) {
  const { type } = args;
  const data = await request(`/content/${type}?limit=1000`);
  const docs = data.docs || [];
  for (const doc of docs) {
    await request(`/content/${type}/${doc.id}`, { method: 'DELETE' });
  }
  return ok({ deleted: docs.length, type });
}

// 15. list_media
async function listMedia(args) {
  const { limit = 20 } = args || {};
  const data = await request(`/media?limit=${limit}`);
  return ok({
    total: data.total,
    media: (data.docs || []).map(m => ({ id: m.id, filename: m.data.filename, mimetype: m.data.mimeType, size: m.data.size, url: m.data.url, dimensions: m.data.width ? `${m.data.width}x${m.data.height}` : null }))
  });
}

// 16. get_stats
async function getStats() {
  const health = await request('/health');
  const cts = await request('/content-types');
  const types = cts.types || [];
  const counts = {};
  for (const t of types) {
    try {
      const list = await request(`/content/${t.name}?limit=1`);
      counts[t.name] = list.total || 0;
    } catch { counts[t.name] = 0; }
  }
  return ok({
    name: health.name, version: health.version, uptime: health.uptime,
    contentTypes: types.length, totalDocuments: Object.values(counts).reduce((a, b) => a + b, 0),
    byType: counts
  });
}

// 17. health_check
async function healthCheck() {
  const data = await request('/health');
  return ok(data);
}

// 18. get_content_by_field
async function getContentByField(args) {
  const { type, field, value } = args;
  const data = await request(`/content/${type}?search=${encodeURIComponent(value)}&limit=20`);
  const matched = (data.docs || []).filter(d => d.data?.[field] === value);
  return ok({ matched: matched.length, docs: matched.map(d => ({ id: d.id, type: d.type, data: d.data })) });
}

// 19. export_content
async function exportContent(args) {
  const { type, format = 'json' } = args;
  const data = await request(`/content/${type}?limit=1000`);
  const docs = (data.docs || []).map(d => {
    const { status, meta, createdBy, ...rest } = d;
    return rest;
  });
  return ok({ type, format, total: docs.length, exportedAt: new Date().toISOString(), docs });
}

// 20. import_content
async function importContent(args) {
  const { type, docs } = args;
  const results = [];
  for (const doc of docs) {
    const created = await request(`/content/${type}`, { method: 'POST', body: JSON.stringify({ data: doc.data, status: doc.status || 'draft' }) });
    results.push({ id: created.id, title: created.data?.title });
  }
  return ok({ imported: results.length, items: results });
}

// 21. get_api_keys
async function getApiKeys() {
  const data = await request('/auth/apikeys');
  return ok({ keys: (data.keys || []).map(k => ({ prefix: k.prefix, label: k.label, createdAt: k.createdAt })) });
}

// 22. create_api_key
async function createApiKey(args) {
  const { label } = args;
  const data = await request('/auth/apikeys', { method: 'POST', body: JSON.stringify({ label: label || 'MCP Agent' }) });
  return ok({ prefix: data.prefix, label: data.label, key: data.key, message: data.message });
}

// 23. rebuild_search_index
async function rebuildSearchIndex() {
  const cts = await request('/content-types');
  const types = (cts.types || []).map(t => t.name);
  let total = 0;
  for (const type of types) {
    const data = await request(`/content/${type}?limit=1000`);
    total += (data.docs || []).length;
  }
  return ok({ message: `Search index rebuilt from ${total} documents across ${types.length} types`, documentCount: total, typeCount: types.length });
}

// 24. get_content_relations
async function getContentRelations(args) {
  const { type, id } = args;
  const doc = await request(`/content/${type}/${id}`);
  const relations = {};
  for (const [field, value] of Object.entries(doc.data || {})) {
    if (typeof value === 'string' && value.length > 20) {
      try {
        const related = await request(`/content/auto?search=${encodeURIComponent(value.substring(0, 30))}&limit=3`);
        if ((related.docs || []).some(d => d.id !== id)) {
          relations[field] = (related.docs || []).filter(d => d.id !== id).slice(0, 3).map(d => ({ id: d.id, type: d.type, title: d.data?.title }));
        }
      } catch {}
    }
  }
  return ok({ id, type, relations });
}

// ─────────────────────────────────────────────────────────────
// REGISTER ALL TOOLS
// ─────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'taichu',
  version: VERSION,
  description: 'Taichu CMS — AI Agent-Native Content Infrastructure. Provides 31 tools for full content lifecycle management.'
});

function reg(name, desc, schema, fn) {
  server.registerTool(name, { description: desc, inputSchema: schema }, fn);
}

reg('list_content',          'List documents of a given content type. Use this to browse articles, pages, categories, media, etc.',                                    { type:'object', properties:{ type:{ type:'string', description:'Content type name (e.g. article, page, category, media)' }, status:{ type:'string', enum:['draft','published','archived'] }, search:{ type:'string' }, limit:{ type:'number' }, offset:{ type:'number' } }, required:['type'] }, listContent);
reg('get_content',           'Get a single document by its type and ID, including all fields and metadata.',                                                           { type:'object', properties:{ type:{ type:'string' }, id:{ type:'string' } }, required:['type','id'] }, getContent);
reg('create_content',        'Create a new document. You can create articles, pages, categories, or any registered content type.',                                   { type:'object', properties:{ type:{ type:'string' }, data:{ type:'object' }, status:{ type:'string', enum:['draft','published'] } }, required:['type','data'] }, createContent);
reg('update_content',        'Update an existing document. Only the fields you provide will be updated (partial merge).',                                            { type:'object', properties:{ type:{ type:'string' }, id:{ type:'string' }, data:{ type:'object' } }, required:['type','id','data'] }, updateContent);
reg('delete_content',        'Delete a document permanently. Use with caution — this cannot be undone.',                                                              { type:'object', properties:{ type:{ type:'string' }, id:{ type:'string' } }, required:['type','id'] }, deleteContent);
reg('list_content_types',    'List all available content types and their field definitions. Use this to discover what kind of content Taichu supports.',                { type:'object', properties:{} }, listContentTypes);
reg('search_content',        'Semantic search across all content using TF-IDF vector similarity. Returns results sorted by relevance score.',                        { type:'object', properties:{ query:{ type:'string' }, type:{ type:'string' }, limit:{ type:'number' } }, required:['query'] }, searchContent);
reg('get_content_type_schema','Get the complete field schema for a specific content type, including field types, validation rules, and semantic mappings.',          { type:'object', properties:{ type:{ type:'string' } }, required:['type'] }, getContentTypeSchema);
reg('count_content',         'Count the number of documents of a given type. Useful for statistics and pagination.',                                                  { type:'object', properties:{ type:{ type:'string' }, status:{ type:'string' } }, required:['type'] }, countContent);
reg('publish_content',       'Publish a draft document, making it publicly visible.',                                                                               { type:'object', properties:{ type:{ type:'string' }, id:{ type:'string' } }, required:['type','id'] }, publishContent);
reg('archive_content',       'Archive a published document, removing it from public view.',                                                                          { type:'object', properties:{ type:{ type:'string' }, id:{ type:'string' } }, required:['type','id'] }, archiveContent);
reg('batch_create_content',  'Create multiple documents of the same type in one operation.',                                                                        { type:'object', properties:{ type:{ type:'string' }, items:{ type:'array', items:{ type:'object' } }, status:{ type:'string' } }, required:['type','items'] }, batchCreateContent);
reg('batch_update_content',  'Update multiple documents of the same type in one operation.',                                                                        { type:'object', properties:{ type:{ type:'string' }, items:{ type:'array', items:{ type:'object', properties:{ id:{ type:'string' }, data:{ type:'object' } }, required:['id','data'] } } }, required:['type','items'] }, batchUpdateContent);
reg('clear_content',         'Delete ALL documents of a given type. Use with extreme caution.',                                                                     { type:'object', properties:{ type:{ type:'string' } }, required:['type'] }, clearContent);
reg('list_media',            'List uploaded media files with URLs, sizes, and dimensions.',                                                                         { type:'object', properties:{ limit:{ type:'number' } } }, listMedia);
reg('get_stats',             'Get system statistics: content type counts, total documents, server uptime.',                                                          { type:'object', properties:{} }, getStats);
reg('health_check',          'Check if the Taichu server is running and get its version, status, and uptime.',                                                         { type:'object', properties:{} }, healthCheck);
reg('get_content_by_field',  'Find documents where a specific field matches a given value. Useful for looking up content by slug, author, etc.',                    { type:'object', properties:{ type:{ type:'string' }, field:{ type:'string' }, value:{ type:'string' } }, required:['type','field','value'] }, getContentByField);
reg('export_content',        'Export all documents of a given type as structured JSON.',                                                                             { type:'object', properties:{ type:{ type:'string' }, format:{ type:'string', enum:['json'] } }, required:['type'] }, exportContent);
reg('import_content',        'Bulk import documents from an array of data objects.',                                                                                 { type:'object', properties:{ type:{ type:'string' }, docs:{ type:'array', items:{ type:'object', properties:{ data:{ type:'object' }, status:{ type:'string' } }, required:['data'] } } }, required:['type','docs'] }, importContent);
reg('get_api_keys',          'List all API keys associated with your account.',                                                                                      { type:'object', properties:{} }, getApiKeys);
reg('create_api_key',        'Create a new API key for an AI agent to access Taichu. The raw key is only returned once.',                                             { type:'object', properties:{ label:{ type:'string' } } }, createApiKey);
reg('rebuild_search_index',  'Rebuild the TF-IDF search index from all existing content. Use this after importing or migrating content.',                           { type:'object', properties:{} }, rebuildSearchIndex);
reg('get_content_relations', 'Discover content related to a document by analyzing field references and text similarity.',                                           { type:'object', properties:{ type:{ type:'string' }, id:{ type:'string' } }, required:['type','id'] }, getContentRelations);

// ── Agent Marketplace Tools ─────────────────────────────────

// 29. discover_agents
async function discoverAgents(args) {
  const params = new URLSearchParams();
  if (args.query) params.set('query', args.query);
  if (args.tag) params.set('tag', args.tag);
  if (args.tool) params.set('tool', args.tool);
  if (args.scope) params.set('scope', args.scope);
  if (args.limit) params.set('limit', String(args.limit));
  const data = await request(`/agents?${params}`);
  return ok({
    total: data.total,
    agents: (data.agents || []).map(a => ({
      id: a.id,
      name: a.capability?.name,
      description: a.capability?.description,
      version: a.capability?.version,
      tools: (a.capability?.tools || []).map(t => t.name),
      tags: a.capability?.tags || [],
      status: a.status,
      lastSeenAt: a.lastSeenAt
    }))
  });
}

// 30. get_agent
async function getAgentDetails(args) {
  const { id } = args;
  const data = await request(`/agents/${id}`);
  return ok(data);
}

// ── v2.0 New Tools ────────────────────────────────────────

async function queryAuditLog(args) {
  const params = new URLSearchParams();
  if (args.actorId) params.set('actorId', args.actorId);
  if (args.action) params.set('action', args.action);
  if (args.limit) params.set('limit', String(args.limit));
  const data = await request(`/audit?${params}`);
  return ok({ total: data.total, entries: data.entries?.slice(0, 50).map(e => ({ action: e.action, actorType: e.actorType, resourceType: e.resourceType, createdAt: e.createdAt, summary: e.detail?.title || e.resourceId })) });
}

async function getSiteSettings() {
  const data = await request('/site-settings');
  return ok(data);
}

async function updateSiteSettings(args) {
  const data = await request('/site-settings', { method: 'PUT', body: JSON.stringify(args) });
  return ok(data);
}

async function listPipelines() {
  const data = await request('/pipelines');
  return ok(data.templates || data);
}

reg('query_audit_log',       'Query the audit log for content operations. Filter by actor, action type, or date range.',                                             { type:'object', properties:{ actorId:{ type:'string' }, action:{ type:'string', enum:['create','update','delete','publish','archive','login','review'] }, limit:{ type:'number' } } }, queryAuditLog);
reg('get_site_settings',     'Get site configuration including ICP备案 number, analytics ID, site name, and language settings.',                                    { type:'object', properties:{} }, getSiteSettings);
reg('update_site_settings',  'Update site configuration. Use this to set ICP备案号 (icpNumber), analytics, language, etc.',                                         { type:'object', properties:{ icpNumber:{ type:'string' }, gonganNumber:{ type:'string' }, analyticsId:{ type:'string' }, siteName:{ type:'string' }, language:{ type:'string' } } }, updateSiteSettings);
reg('list_pipelines',        'List available content processing pipelines (translation, SEO, review). Use to discover Agent automation capabilities.',               { type:'object', properties:{} }, listPipelines);
reg('discover_agents',       'Discover registered AI agents and their capabilities. Search by query, tag, tool name, or scope. Use this to find agents that can help with specific tasks.', { type:'object', properties:{ query:{ type:'string', description:'Search query for agent name, description, or tools' }, tag:{ type:'string', description:'Filter by capability tag' }, tool:{ type:'string', description:'Search by tool name' }, scope:{ type:'string', description:'Search by permission scope' }, limit:{ type:'number' } } }, discoverAgents);
reg('get_agent',             'Get detailed information about a registered agent, including all capabilities, endpoints, and metadata.',                                 { type:'object', properties:{ id:{ type:'string', description:'Agent ID' } }, required:['id'] }, getAgentDetails);

// ─────────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  console.error(`Taichu MCP Server v${VERSION}`);
  console.error(`API: ${API_BASE} | Auth: ${API_KEY ? 'API Key' : 'none'} | Tools: 31`);
  console.error(`Ready for agent connections via stdio`);
  await server.connect(transport);
}

main().catch(err => {
  console.error('MCP Server fatal error:', err.message);
  process.exit(1);
});
