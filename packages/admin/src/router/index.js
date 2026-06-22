import { createRouter, createWebHashHistory } from 'vue-router'
import { auth } from '../stores/auth.js'

// Lazy-loaded views for automatic code splitting
const Login = () => import('../views/Login.vue')
const Dashboard = () => import('../views/Dashboard.vue')
const ContentList = () => import('../views/ContentList.vue')
const ContentEdit = () => import('../views/ContentEdit.vue')
const ApiKeys = () => import('../views/ApiKeys.vue')
const Media = () => import('../views/Media.vue')
const Settings = () => import('../views/Settings.vue')
const AuditLog = () => import('../views/AuditLog.vue')
const Webhooks = () => import('../views/Webhooks.vue')
const Pipelines = () => import('../views/Pipelines.vue')
const Workflow = () => import('../views/Workflow.vue')
const Revisions = () => import('../views/Revisions.vue')
const Users = () => import('../views/Users.vue')
const Categories = () => import('../views/Categories.vue')
const Theme = () => import('../views/Theme.vue')
const ThemeManager = () => import('../views/ThemeManager.vue')
const Navigation = () => import('../views/Navigation.vue')
const PluginMarketplace = () => import('../views/PluginMarketplace.vue')
const AgentMarketplace = () => import('../views/AgentMarketplace.vue')
const Tags = () => import('../views/Tags.vue')
const ApiDocs = () => import('../views/ApiDocs.vue')
const Comments = () => import('../views/Comments.vue')

const routes = [
  { path: '/login', component: Login, meta: { public: true } },
  { path: '/', redirect: '/dashboard' },
  { path: '/dashboard', component: Dashboard },
  { path: '/content/:type', component: ContentList, props: true },
  { path: '/content/:type/new', component: ContentEdit, props: true },
  { path: '/content/:type/:id', component: ContentEdit, props: true },
  { path: '/content/:type/:id/revisions', component: Revisions, props: true },
  { path: '/apikeys', component: ApiKeys },
  { path: '/media', component: Media },
  { path: '/settings', component: Settings },
  { path: '/audit', component: AuditLog },
  { path: '/webhooks', component: Webhooks },
  { path: '/pipelines', component: Pipelines },
  { path: '/workflow', component: Workflow },
  { path: '/users', component: Users },
  { path: '/categories', component: Categories },
  { path: '/theme', component: Theme },
  { path: '/theme-manager', component: ThemeManager },
  { path: '/navigation', component: Navigation },
  { path: '/plugins', component: PluginMarketplace },
  { path: '/agents', component: AgentMarketplace },
  { path: '/tags', component: Tags },
  { path: '/api-docs', component: ApiDocs },
  { path: '/comments', component: Comments }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

router.beforeEach((to) => {
  if (!to.meta.public && !auth.isLoggedIn) {
    return '/login'
  }
})

export default router
