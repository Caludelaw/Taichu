import{u as T,_ as l}from"./index-DPT26yl-.js";import{_ as y}from"./_plugin-vue_export-helper-DlAUqK2U.js";import{f as a,p as t,x as o,u as f,F as n,i as h,e as s,j as k,t as c,v as r,q as u}from"./vendor-vue-o2mYqWBf.js";const b={class:"header"},E={class:"toc"},S=["href"],W=["id"],w={class:"section-title"},J={class:"ep-header"},_={class:"ep-path"},G={key:0,class:"ep-auth"},P={key:1,class:"ep-auth public"},g={class:"ep-desc"},O={key:0,class:"ep-curl"},v={key:1,class:"ep-resp"},A={__name:"ApiDocs",setup(H){const{t:m}=T(),d=[{id:"auth",label:"认证 Auth",endpoints:[{method:"POST",path:"/api/auth/register",auth:!1,desc:"注册新用户，返回 JWT token",curl:`curl -X POST http://localhost:3120/api/auth/register \\
  -H "Content-Type: application/json" \\
  -d '{"username":"admin","password":"mypassword","email":"admin@example.com"}'`,response:`{
  "user": { "id": "u1", "username": "admin", "role": "author" },
  "token": "eyJhbGciOiJIUzI1NiIs..."
}`},{method:"POST",path:"/api/auth/login",auth:!1,desc:"用户登录，返回 JWT token（7天有效）",curl:`curl -X POST http://localhost:3120/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"username":"admin","password":"mypassword"}'`},{method:"POST",path:"/api/auth/apikeys",auth:"JWT",desc:"为 AI Agent 生成 API Key",curl:`curl -X POST http://localhost:3120/api/auth/apikeys \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"label":"my-agent","scopes":["article:write"]}'`},{method:"GET",path:"/api/auth/apikeys",auth:"JWT",desc:"列出当前用户的所有 API Key"},{method:"DELETE",path:"/api/auth/apikeys/:prefix",auth:"JWT",desc:"吊销一个 API Key"}]},{id:"content",label:"内容 Content",endpoints:[{method:"GET",path:"/api/content/:type",auth:"可选",desc:"列出某类型全部文档。设置 TAICHU_PUBLIC_READ=1 可公开访问",curl:`curl http://localhost:3120/api/content/article \\
  -H "Authorization: Bearer <token>"`},{method:"GET",path:"/api/content/:type/:id",auth:"可选",desc:"获取单个文档详情",curl:`curl http://localhost:3120/api/content/article/doc-id \\
  -H "Authorization: Bearer <token>"`},{method:"POST",path:"/api/content/:type",auth:":type:write",desc:"创建新文档",curl:`curl -X POST http://localhost:3120/api/content/article \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"data":{"title":"Hello","slug":"hello","body":"{}"},"status":"draft"}'`,response:`{
  "id": "a1b2c3",
  "type": "article",
  "data": { "title": "Hello" },
  "status": "draft",
  "createdAt": "2026-01-01T00:00:00Z"
}`},{method:"PUT",path:"/api/content/:type/:id",auth:":type:write",desc:'更新文档。可设置 status="scheduled" + publishedAt 实现定时发布',curl:`curl -X PUT http://localhost:3120/api/content/article/doc-id \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"data":{"title":"Updated"},"status":"published"}'`},{method:"DELETE",path:"/api/content/:type/:id",auth:":type:delete",desc:"删除文档"},{method:"POST",path:"/api/content/:type/batch",auth:":type:write",desc:"批量操作（delete / publish / archive）",curl:`curl -X POST http://localhost:3120/api/content/article/batch \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"action":"publish","ids":["id1","id2"]}'`}]},{id:"search",label:"搜索 & 发现",endpoints:[{method:"GET",path:"/api/search?q=&type=",auth:!1,desc:"全文语义搜索（最少2字符）",curl:'curl "http://localhost:3120/api/search?q=hello&type=article"'},{method:"GET",path:"/api/content-types",auth:!1,desc:"列出所有已注册的内容类型",curl:"curl http://localhost:3120/api/content-types"},{method:"GET",path:"/api/content-types/:name",auth:!1,desc:"获取某类型 JSON Schema",curl:"curl http://localhost:3120/api/content-types/article"},{method:"GET",path:"/api/health",auth:!1,desc:"健康检查",curl:"curl http://localhost:3120/api/health",response:`{
  "status": "ok",
  "version": "0.6.0",
  "uptime": 3600,
  "store": "memory"
}`}]},{id:"graphql",label:"GraphQL",endpoints:[{method:"GET",path:"/api/graphql",auth:!1,desc:"GraphiQL 交互式 IDE（浏览器打开）"},{method:"POST",path:"/api/graphql",auth:"Mutation 需验证",desc:"执行 GraphQL 查询/变更",curl:`curl -X POST http://localhost:3120/api/graphql \\
  -H "Content-Type: application/json" \\
  -d '{"query":"{ contentList(type: \\"article\\") { id data } }"}'`}]},{id:"media",label:"媒体库 Media",endpoints:[{method:"POST",path:"/api/media/upload",auth:"JWT",desc:"上传文件（multipart/form-data，支持多文件）",curl:`curl -X POST http://localhost:3120/api/media/upload \\
  -H "Authorization: Bearer <token>" \\
  -F "file=@image.png"'`},{method:"GET",path:"/api/media",auth:"JWT",desc:"列出媒体文件元数据（最多50条）"},{method:"GET",path:"/api/media/:id",auth:"JWT",desc:"获取媒体文件元数据详情"},{method:"DELETE",path:"/api/media/:id",auth:"JWT",desc:"删除媒体文件及元数据"}]},{id:"revisions",label:"版本管理 Revisions",endpoints:[{method:"GET",path:"/api/content/:type/:id/revisions",auth:"JWT",desc:"列出文档的所有历史版本"},{method:"GET",path:"/api/content/:type/:id/revisions/diff?from=&to=",auth:"JWT",desc:"对比两个版本的差异",curl:`curl "http://localhost:3120/api/content/article/doc-id/revisions/diff?from=rev1&to=rev2" \\
  -H "Authorization: Bearer <token>"`},{method:"POST",path:"/api/content/:type/:id/revisions/:revId/restore",auth:"JWT",desc:"恢复到某个历史版本"}]},{id:"workflow",label:"审核工作流 Workflow",endpoints:[{method:"POST",path:"/api/workflow/request/:docId",auth:"JWT",desc:"提交文档审核 (draft → pending_review)"},{method:"POST",path:"/api/workflow/approve/:docId",auth:"JWT",desc:"审核通过 (pending_review → approved → published)"},{method:"POST",path:"/api/workflow/reject/:docId",auth:"JWT",desc:"驳回审核 (pending_review → rejected)",curl:`curl -X POST http://localhost:3120/api/workflow/reject/doc-id \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"reason":"需要修改标题"}'`},{method:"GET",path:"/api/workflow/status/:docId",auth:"JWT",desc:"查询审核状态及可用操作"}]},{id:"relationships",label:"内容关系图谱",endpoints:[{method:"GET",path:"/api/content/:type/:id/relationships",auth:"JWT",desc:"列出文档的全部关系（出向+入向）"},{method:"POST",path:"/api/content/:type/:id/relationships",auth:"JWT",desc:"创建内容关系 (related_to / parent_of / child_of / references / translated_from)",curl:`curl -X POST http://localhost:3120/api/content/article/id1/relationships \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"targetId":"id2","type":"related_to"}'`},{method:"GET",path:"/api/content/:type/:id/relationships/backlinks",auth:"JWT",desc:"获取入向引用（反向链接）"},{method:"DELETE",path:"/api/content/:type/:id/relationships/:targetId?type=",auth:"JWT",desc:"删除关系"},{method:"GET",path:"/api/content/:type/:id/graph?depth=&types=",auth:"JWT",desc:"BFS 子图遍历（默认深度2）",curl:`curl "http://localhost:3120/api/content/article/id1/graph?depth=3&types=related_to,references" \\
  -H "Authorization: Bearer <token>"`}]},{id:"admin",label:"管理 Admin",endpoints:[{method:"GET",path:"/api/audit",auth:"JWT",desc:"查询审计日志"},{method:"GET",path:"/api/audit/stats",auth:"JWT",desc:"审计统计（按操作/发起人聚合）"},{method:"GET",path:"/api/site-settings",auth:!1,desc:"获取站点设置"},{method:"PUT",path:"/api/site-settings",auth:"JWT",desc:"更新站点设置"},{method:"GET",path:"/api/pipelines",auth:!1,desc:"列出内容管道模板"},{method:"GET",path:"/api/export/:type?format=&status=",auth:"JWT",desc:"导出内容（json / md / csv）",curl:`curl "http://localhost:3120/api/export/article?format=csv&status=published" \\
  -H "Authorization: Bearer <token>"`}]},{id:"webhooks",label:"Webhooks",endpoints:[{method:"POST",path:"/api/webhooks",auth:"JWT",desc:"注册 Webhook",curl:`curl -X POST http://localhost:3120/api/webhooks \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com/hook","events":["create","update"],"types":["article"]}'`},{method:"GET",path:"/api/webhooks",auth:"JWT",desc:"列出所有 Webhook 及运行统计"},{method:"GET",path:"/api/webhooks/log",auth:"JWT",desc:"获取 Webhook 投递日志"},{method:"DELETE",path:"/api/webhooks/:id",auth:"JWT",desc:"删除 Webhook"}]},{id:"plugins",label:"插件市场 Plugins",endpoints:[{method:"GET",path:"/api/plugins",auth:"JWT",desc:"列出已安装插件"},{method:"GET",path:"/api/plugins/marketplace?search=&category=",auth:"JWT",desc:"搜索/浏览插件市场"},{method:"POST",path:"/api/plugins/install",auth:"JWT",desc:"安装插件",curl:`curl -X POST http://localhost:3120/api/plugins/install \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"repo":"username/taichu-plugin-seo"}'`},{method:"POST",path:"/api/plugins/uninstall/:name",auth:"JWT",desc:"卸载插件"}]},{id:"theme",label:"主题 Theme & SSO",endpoints:[{method:"GET",path:"/api/theme",auth:!1,desc:"列出可用主题"},{method:"POST",path:"/api/theme/activate/:name",auth:"JWT",desc:"激活主题"},{method:"DELETE",path:"/api/theme/:name",auth:"JWT",desc:"删除自定义主题"},{method:"GET",path:"/api/sso/providers",auth:!1,desc:"列出 SSO 提供商"},{method:"GET",path:"/api/sso/oidc",auth:!1,desc:"发起 OIDC 登录"}]},{id:"federation",label:"联邦协议 & 协作",endpoints:[{method:"GET",path:"/.well-known/webfinger?resource=",auth:!1,desc:"WebFinger 发现"},{method:"GET",path:"/.well-known/nodeinfo",auth:!1,desc:"NodeInfo 服务器元数据"},{method:"GET",path:"/api/activitypub/actor",auth:!1,desc:"ActivityPub Actor JSON-LD"},{method:"POST",path:"/api/activitypub/inbox",auth:!1,desc:"接收 ActivityPub 活动"},{method:"GET",path:"/api/ws",auth:!1,desc:"WebSocket 连接信息"},{method:"GET",path:"/api/collab/sessions",auth:"JWT",desc:"活跃协作编辑会话"},{method:"GET",path:"/rss.xml",auth:!1,desc:"RSS 2.0 Feed"},{method:"GET",path:"/sitemap.xml",auth:!1,desc:"搜索引擎 Sitemap"}]},{id:"websocket",label:"WebSocket 实时推送",endpoints:[{method:"WS",path:"ws://localhost:3120",auth:!1,desc:"WebSocket 连接（根路径升级）",curl:`// JavaScript 示例：
const ws = new WebSocket('ws://localhost:3120')

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'subscribe',
    channel: 'article'
  }))
}

ws.onmessage = (e) => {
  const event = JSON.parse(e.data)
  // { type: 'create'|'update'|'delete', doc: {...} }
}`}]}];return(I,i)=>(s(),a("div",null,[t("div",b,[t("h2",null,o(f(m)("apiDocs.title")),1)]),i[3]||(i[3]=t("p",{class:"desc"},"Taichu CMS — REST / GraphQL / WebSocket API Reference",-1)),t("div",E,[(s(),a(n,null,h(d,p=>t("a",{key:p.id,href:`#${p.id}`,class:"toc-link"},o(p.label),9,S)),64))]),(s(),a(n,null,h(d,p=>t("section",{key:p.id,id:p.id,class:"api-section"},[t("h3",w,o(p.label),1),(s(!0),a(n,null,h(p.endpoints,e=>(s(),a("div",{key:e.path+e.method,class:"endpoint-card"},[t("div",J,[t("span",{class:k(["ep-method",e.method])},o(e.method),3),t("code",_,o(e.path),1),e.auth?(s(),a("span",G,[c(l,{name:"lock",size:12}),r(" "+o(e.auth),1)])):(s(),a("span",P,[c(l,{name:"globe",size:12}),i[0]||(i[0]=r(" Public",-1))]))]),t("p",g,o(e.desc),1),e.curl?(s(),a("details",O,[i[1]||(i[1]=t("summary",null,"curl Example",-1)),t("pre",null,[t("code",null,o(e.curl),1)])])):u("",!0),e.response?(s(),a("details",v,[i[2]||(i[2]=t("summary",null,"Response",-1)),t("pre",null,[t("code",null,o(e.response),1)])])):u("",!0)]))),128))],8,W)),64))]))}},j=y(A,[["__scopeId","data-v-bccb8106"]]);export{j as default};
