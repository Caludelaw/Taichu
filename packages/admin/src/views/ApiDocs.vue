<template>
  <div>
    <div class="header">
      <h2>{{ $t('apiDocs.title') }}</h2>
    </div>
    <p class="desc">Taichu CMS — REST / GraphQL / WebSocket API Reference</p>

    <div class="toc">
      <a v-for="s in sections" :key="s.id" :href="`#${s.id}`" class="toc-link">{{ s.label }}</a>
    </div>

    <section v-for="s in sections" :key="s.id" :id="s.id" class="api-section">
      <h3 class="section-title">{{ s.label }}</h3>
      <div v-for="ep in s.endpoints" :key="ep.path + ep.method" class="endpoint-card">
        <div class="ep-header">
          <span class="ep-method" :class="ep.method">{{ ep.method }}</span>
          <code class="ep-path">{{ ep.path }}</code>
          <span v-if="ep.auth" class="ep-auth"><Icon name="lock" :size="12" /> {{ ep.auth }}</span>
          <span v-else class="ep-auth public"><Icon name="globe" :size="12" /> Public</span>
        </div>
        <p class="ep-desc">{{ ep.desc }}</p>
        <details v-if="ep.curl" class="ep-curl">
          <summary>curl Example</summary>
          <pre><code>{{ ep.curl }}</code></pre>
        </details>
        <details v-if="ep.response" class="ep-resp">
          <summary>Response</summary>
          <pre><code>{{ ep.response }}</code></pre>
        </details>
      </div>
    </section>
  </div>
</template>

<script setup>
import { useI18n } from '../i18n.js'
import Icon from '../components/Icon.vue'
const { t: $t } = useI18n()

const sections = [
  {
    id: 'auth',
    label: '认证 Auth',
    endpoints: [
      { method: 'POST', path: '/api/auth/register', auth: false, desc: '注册新用户，返回 JWT token', curl: `curl -X POST http://localhost:3120/api/auth/register \\
  -H "Content-Type: application/json" \\
  -d '{"username":"admin","password":"mypassword","email":"admin@example.com"}'`, response: `{\n  "user": { "id": "u1", "username": "admin", "role": "author" },\n  "token": "eyJhbGciOiJIUzI1NiIs..."\n}` },
      { method: 'POST', path: '/api/auth/login', auth: false, desc: '用户登录，返回 JWT token（7天有效）', curl: `curl -X POST http://localhost:3120/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"username":"admin","password":"mypassword"}'` },
      { method: 'POST', path: '/api/auth/apikeys', auth: 'JWT', desc: '为 AI Agent 生成 API Key', curl: `curl -X POST http://localhost:3120/api/auth/apikeys \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"label":"my-agent","scopes":["article:write"]}'` },
      { method: 'GET', path: '/api/auth/apikeys', auth: 'JWT', desc: '列出当前用户的所有 API Key' },
      { method: 'DELETE', path: '/api/auth/apikeys/:prefix', auth: 'JWT', desc: '吊销一个 API Key' },
    ]
  },
  {
    id: 'content',
    label: '内容 Content',
    endpoints: [
      { method: 'GET', path: '/api/content/:type', auth: '可选', desc: '列出某类型全部文档。设置 TAICHU_PUBLIC_READ=1 可公开访问', curl: `curl http://localhost:3120/api/content/article \\
  -H "Authorization: Bearer <token>"` },
      { method: 'GET', path: '/api/content/:type/:id', auth: '可选', desc: '获取单个文档详情', curl: `curl http://localhost:3120/api/content/article/doc-id \\
  -H "Authorization: Bearer <token>"` },
      { method: 'POST', path: '/api/content/:type', auth: ':type:write', desc: '创建新文档', curl: `curl -X POST http://localhost:3120/api/content/article \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"data":{"title":"Hello","slug":"hello","body":"{}"},"status":"draft"}'`, response: `{\n  "id": "a1b2c3",\n  "type": "article",\n  "data": { "title": "Hello" },\n  "status": "draft",\n  "createdAt": "2026-01-01T00:00:00Z"\n}` },
      { method: 'PUT', path: '/api/content/:type/:id', auth: ':type:write', desc: '更新文档。可设置 status="scheduled" + publishedAt 实现定时发布', curl: `curl -X PUT http://localhost:3120/api/content/article/doc-id \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"data":{"title":"Updated"},"status":"published"}'` },
      { method: 'DELETE', path: '/api/content/:type/:id', auth: ':type:delete', desc: '删除文档' },
      { method: 'POST', path: '/api/content/:type/batch', auth: ':type:write', desc: '批量操作（delete / publish / archive）', curl: `curl -X POST http://localhost:3120/api/content/article/batch \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"action":"publish","ids":["id1","id2"]}'` },
    ]
  },
  {
    id: 'search',
    label: '搜索 & 发现',
    endpoints: [
      { method: 'GET', path: '/api/search?q=&type=', auth: false, desc: '全文语义搜索（最少2字符）', curl: `curl "http://localhost:3120/api/search?q=hello&type=article"` },
      { method: 'GET', path: '/api/content-types', auth: false, desc: '列出所有已注册的内容类型', curl: 'curl http://localhost:3120/api/content-types' },
      { method: 'GET', path: '/api/content-types/:name', auth: false, desc: '获取某类型 JSON Schema', curl: 'curl http://localhost:3120/api/content-types/article' },
      { method: 'GET', path: '/api/health', auth: false, desc: '健康检查', curl: 'curl http://localhost:3120/api/health', response: '{\n  "status": "ok",\n  "version": "0.6.0",\n  "uptime": 3600,\n  "store": "memory"\n}' },
    ]
  },
  {
    id: 'graphql',
    label: 'GraphQL',
    endpoints: [
      { method: 'GET', path: '/api/graphql', auth: false, desc: 'GraphiQL 交互式 IDE（浏览器打开）' },
      { method: 'POST', path: '/api/graphql', auth: 'Mutation 需验证', desc: '执行 GraphQL 查询/变更', curl: `curl -X POST http://localhost:3120/api/graphql \\
  -H "Content-Type: application/json" \\
  -d '{"query":"{ contentList(type: \\"article\\") { id data } }"}'` },
    ]
  },
  {
    id: 'media',
    label: '媒体库 Media',
    endpoints: [
      { method: 'POST', path: '/api/media/upload', auth: 'JWT', desc: '上传文件（multipart/form-data，支持多文件）', curl: `curl -X POST http://localhost:3120/api/media/upload \\
  -H "Authorization: Bearer <token>" \\
  -F "file=@image.png"'` },
      { method: 'GET', path: '/api/media', auth: 'JWT', desc: '列出媒体文件元数据（最多50条）' },
      { method: 'GET', path: '/api/media/:id', auth: 'JWT', desc: '获取媒体文件元数据详情' },
      { method: 'DELETE', path: '/api/media/:id', auth: 'JWT', desc: '删除媒体文件及元数据' },
    ]
  },
  {
    id: 'revisions',
    label: '版本管理 Revisions',
    endpoints: [
      { method: 'GET', path: '/api/content/:type/:id/revisions', auth: 'JWT', desc: '列出文档的所有历史版本' },
      { method: 'GET', path: '/api/content/:type/:id/revisions/diff?from=&to=', auth: 'JWT', desc: '对比两个版本的差异', curl: `curl "http://localhost:3120/api/content/article/doc-id/revisions/diff?from=rev1&to=rev2" \\
  -H "Authorization: Bearer <token>"` },
      { method: 'POST', path: '/api/content/:type/:id/revisions/:revId/restore', auth: 'JWT', desc: '恢复到某个历史版本' },
    ]
  },
  {
    id: 'workflow',
    label: '审核工作流 Workflow',
    endpoints: [
      { method: 'POST', path: '/api/workflow/request/:docId', auth: 'JWT', desc: '提交文档审核 (draft → pending_review)' },
      { method: 'POST', path: '/api/workflow/approve/:docId', auth: 'JWT', desc: '审核通过 (pending_review → approved → published)' },
      { method: 'POST', path: '/api/workflow/reject/:docId', auth: 'JWT', desc: '驳回审核 (pending_review → rejected)', curl: `curl -X POST http://localhost:3120/api/workflow/reject/doc-id \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"reason":"需要修改标题"}'` },
      { method: 'GET', path: '/api/workflow/status/:docId', auth: 'JWT', desc: '查询审核状态及可用操作' },
    ]
  },
  {
    id: 'relationships',
    label: '内容关系图谱',
    endpoints: [
      { method: 'GET', path: '/api/content/:type/:id/relationships', auth: 'JWT', desc: '列出文档的全部关系（出向+入向）' },
      { method: 'POST', path: '/api/content/:type/:id/relationships', auth: 'JWT', desc: '创建内容关系 (related_to / parent_of / child_of / references / translated_from)', curl: `curl -X POST http://localhost:3120/api/content/article/id1/relationships \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"targetId":"id2","type":"related_to"}'` },
      { method: 'GET', path: '/api/content/:type/:id/relationships/backlinks', auth: 'JWT', desc: '获取入向引用（反向链接）' },
      { method: 'DELETE', path: '/api/content/:type/:id/relationships/:targetId?type=', auth: 'JWT', desc: '删除关系' },
      { method: 'GET', path: '/api/content/:type/:id/graph?depth=&types=', auth: 'JWT', desc: 'BFS 子图遍历（默认深度2）', curl: `curl "http://localhost:3120/api/content/article/id1/graph?depth=3&types=related_to,references" \\
  -H "Authorization: Bearer <token>"` },
    ]
  },
  {
    id: 'admin',
    label: '管理 Admin',
    endpoints: [
      { method: 'GET', path: '/api/audit', auth: 'JWT', desc: '查询审计日志' },
      { method: 'GET', path: '/api/audit/stats', auth: 'JWT', desc: '审计统计（按操作/发起人聚合）' },
      { method: 'GET', path: '/api/site-settings', auth: false, desc: '获取站点设置' },
      { method: 'PUT', path: '/api/site-settings', auth: 'JWT', desc: '更新站点设置' },
      { method: 'GET', path: '/api/pipelines', auth: false, desc: '列出内容管道模板' },
      { method: 'GET', path: '/api/export/:type?format=&status=', auth: 'JWT', desc: '导出内容（json / md / csv）', curl: `curl "http://localhost:3120/api/export/article?format=csv&status=published" \\
  -H "Authorization: Bearer <token>"` },
    ]
  },
  {
    id: 'webhooks',
    label: 'Webhooks',
    endpoints: [
      { method: 'POST', path: '/api/webhooks', auth: 'JWT', desc: '注册 Webhook', curl: `curl -X POST http://localhost:3120/api/webhooks \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com/hook","events":["create","update"],"types":["article"]}'` },
      { method: 'GET', path: '/api/webhooks', auth: 'JWT', desc: '列出所有 Webhook 及运行统计' },
      { method: 'GET', path: '/api/webhooks/log', auth: 'JWT', desc: '获取 Webhook 投递日志' },
      { method: 'DELETE', path: '/api/webhooks/:id', auth: 'JWT', desc: '删除 Webhook' },
    ]
  },
  {
    id: 'plugins',
    label: '插件市场 Plugins',
    endpoints: [
      { method: 'GET', path: '/api/plugins', auth: 'JWT', desc: '列出已安装插件' },
      { method: 'GET', path: '/api/plugins/marketplace?search=&category=', auth: 'JWT', desc: '搜索/浏览插件市场' },
      { method: 'POST', path: '/api/plugins/install', auth: 'JWT', desc: '安装插件', curl: `curl -X POST http://localhost:3120/api/plugins/install \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"repo":"username/taichu-plugin-seo"}'` },
      { method: 'POST', path: '/api/plugins/uninstall/:name', auth: 'JWT', desc: '卸载插件' },
    ]
  },
  {
    id: 'theme',
    label: '主题 Theme & SSO',
    endpoints: [
      { method: 'GET', path: '/api/theme', auth: false, desc: '列出可用主题' },
      { method: 'POST', path: '/api/theme/activate/:name', auth: 'JWT', desc: '激活主题' },
      { method: 'DELETE', path: '/api/theme/:name', auth: 'JWT', desc: '删除自定义主题' },
      { method: 'GET', path: '/api/sso/providers', auth: false, desc: '列出 SSO 提供商' },
      { method: 'GET', path: '/api/sso/oidc', auth: false, desc: '发起 OIDC 登录' },
    ]
  },
  {
    id: 'federation',
    label: '联邦协议 & 协作',
    endpoints: [
      { method: 'GET', path: '/.well-known/webfinger?resource=', auth: false, desc: 'WebFinger 发现' },
      { method: 'GET', path: '/.well-known/nodeinfo', auth: false, desc: 'NodeInfo 服务器元数据' },
      { method: 'GET', path: '/api/activitypub/actor', auth: false, desc: 'ActivityPub Actor JSON-LD' },
      { method: 'POST', path: '/api/activitypub/inbox', auth: false, desc: '接收 ActivityPub 活动' },
      { method: 'GET', path: '/api/ws', auth: false, desc: 'WebSocket 连接信息' },
      { method: 'GET', path: '/api/collab/sessions', auth: 'JWT', desc: '活跃协作编辑会话' },
      { method: 'GET', path: '/rss.xml', auth: false, desc: 'RSS 2.0 Feed' },
      { method: 'GET', path: '/sitemap.xml', auth: false, desc: '搜索引擎 Sitemap' },
    ]
  },
  {
    id: 'websocket',
    label: 'WebSocket 实时推送',
    endpoints: [
      { method: 'WS', path: 'ws://localhost:3120', auth: false, desc: 'WebSocket 连接（根路径升级）', curl: `// JavaScript 示例：\nconst ws = new WebSocket('ws://localhost:3120')\n\nws.onopen = () => {\n  ws.send(JSON.stringify({\n    type: 'subscribe',\n    channel: 'article'\n  }))\n}\n\nws.onmessage = (e) => {\n  const event = JSON.parse(e.data)\n  // { type: 'create'|'update'|'delete', doc: {...} }\n}` },
    ]
  },
]
</script>

<style scoped>
.toc { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; }
.toc-link {
  padding: 4px 12px; background: var(--surface); border: 1px solid var(--border);
  border-radius: 4px; font-size: 13px; color: var(--primary); text-decoration: none;
}
.toc-link:hover { background: var(--primary-bg); }
.api-section { margin-bottom: 32px; }
.section-title {
  font-size: 18px; font-weight: 700; margin-bottom: 12px; padding-bottom: 8px;
  border-bottom: 2px solid var(--primary); color: var(--text-primary);
}
.endpoint-card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 8px; padding: 16px; margin-bottom: 12px;
}
.ep-header { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
.ep-method {
  display: inline-block; padding: 2px 8px; border-radius: 4px;
  font-size: 11px; font-weight: 700; text-transform: uppercase; color: white;
}
.ep-method.GET { background: #10B981; }
.ep-method.POST { background: #3B82F6; }
.ep-method.PUT { background: #F59E0B; }
.ep-method.DELETE { background: #EF4444; }
.ep-method.WS { background: #8B5CF6; }
.ep-path { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.ep-auth {
  font-size: 11px; padding: 2px 6px; border-radius: 4px;
  background: var(--tag-bg); color: var(--text-secondary);
}
.ep-auth.public { color: #065F46; background: #D1FAE5; }
.ep-desc { font-size: 13px; color: var(--text-secondary); margin: 0 0 8px; }
.ep-curl, .ep-resp { margin-top: 8px; }
.ep-curl summary, .ep-resp summary {
  font-size: 12px; color: var(--primary); cursor: pointer; font-weight: 600;
}
.ep-curl pre, .ep-resp pre {
  margin-top: 8px; padding: 12px 16px; background: #1F2937; color: #E5E7EB;
  border-radius: 6px; font-size: 12px; overflow-x: auto; white-space: pre;
  font-family: 'Courier New', monospace;
}
</style>
