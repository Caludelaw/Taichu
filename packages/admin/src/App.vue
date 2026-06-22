<template>
  <div v-if="auth.isLoggedIn" class="layout">
    <!-- Hamburger toggle for mobile -->
    <button class="menu-toggle" @click="sidebarOpen = !sidebarOpen" :aria-label="sidebarOpen ? '关闭菜单' : '打开菜单'">
      <span></span><span></span><span></span>
    </button>

    <!-- Mobile overlay backdrop -->
    <div v-if="sidebarOpen" class="sidebar-overlay" @click="sidebarOpen = false"></div>

    <aside class="sidebar" :class="{ open: sidebarOpen }">
      <div class="logo" @click="$router.push('/dashboard'); sidebarOpen = false">⚡ Taichu</div>
      <nav>
        <div class="nav-section">内容</div>
        <template v-for="t in types" :key="t.name">
          <router-link :to="`/content/${t.name}`" class="nav-item" @click="sidebarOpen = false">{{ t.label }}</router-link>
        </template>
        <router-link to="/media" class="nav-item" @click="sidebarOpen = false">🖼️ 媒体库</router-link>
        <router-link to="/categories" class="nav-item" @click="sidebarOpen = false">📂 栏目管理</router-link>
        <router-link to="/tags" class="nav-item" @click="sidebarOpen = false">🏷️ 标签管理</router-link>
        <router-link to="/comments" class="nav-item" @click="sidebarOpen = false">💬 评论管理</router-link>
        <router-link to="/navigation" class="nav-item" @click="sidebarOpen = false">🧭 导航菜单</router-link>

        <div class="nav-section">管理</div>
        <router-link to="/users" class="nav-item" @click="sidebarOpen = false">👥 用户管理</router-link>
        <router-link to="/apikeys" class="nav-item" @click="sidebarOpen = false">🔑 API Keys</router-link>
        <router-link to="/webhooks" class="nav-item" @click="sidebarOpen = false">🔗 Webhooks</router-link>
        <router-link to="/settings" class="nav-item" @click="sidebarOpen = false">⚙️ 站点配置</router-link>
        <router-link to="/theme" class="nav-item" @click="sidebarOpen = false">🎨 外观主题</router-link>
        <router-link to="/theme-manager" class="nav-item" @click="sidebarOpen = false">📦 主题管理</router-link>

        <div class="nav-section">安全</div>
        <router-link to="/audit" class="nav-item" @click="sidebarOpen = false">📋 审计日志</router-link>
        <router-link to="/workflow" class="nav-item" @click="sidebarOpen = false">✅ 审核队列</router-link>

        <div class="nav-section">开发</div>
        <router-link to="/plugins" class="nav-item" @click="sidebarOpen = false">🧩 插件市场</router-link>
        <router-link to="/agents" class="nav-item" @click="sidebarOpen = false">🤖 Agent 市场</router-link>
        <router-link to="/pipelines" class="nav-item" @click="sidebarOpen = false">🔄 管道模板</router-link>
        <router-link to="/api-docs" class="nav-item" @click="sidebarOpen = false">📖 API 文档</router-link>
        <a href="/api/graphql" target="_blank" class="nav-item">🔬 GraphiQL</a>
        <a href="/ws-test.html" target="_blank" class="nav-item">📡 WS 测试</a>
      </nav>
      <div class="sidebar-footer">
        <button class="btn-theme" @click="toggleDark" :title="isDark ? '切换亮色模式' : '切换暗色模式'">
          {{ isDark ? '☀️' : '🌙' }}
        </button>
        <div class="lang-switch">
          <select v-model="locale" @change="switchLang" class="lang-select">
            <option v-for="l in i18n.supportedLocales" :key="l.code" :value="l.code">{{ l.flag }} {{ l.label }}</option>
          </select>
        </div>
        <span class="user">{{ auth.user?.username }}</span>
        <button @click="logout" class="btn-logout">退出</button>
      </div>
    </aside>
    <main class="main">
      <router-view :types="types" />
    </main>
  </div>
  <router-view v-else />
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { auth } from './stores/auth.js'
import { api } from './api/index.js'
import { useI18n } from './i18n.js'

const router = useRouter()
const types = ref([])
const i18n = useI18n()
const locale = ref(i18n.locale.value)
const isDark = ref(false)
const sidebarOpen = ref(false)

function applyTheme(dark) {
  isDark.value = dark
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : '')
  localStorage.setItem('taichu-theme', dark ? 'dark' : 'light')
}

function toggleDark() {
  applyTheme(!isDark.value)
}

// Close sidebar on route change
router.afterEach(() => {
  sidebarOpen.value = false
})

onMounted(async () => {
  // Restore theme preference
  const saved = localStorage.getItem('taichu-theme')
  if (saved === 'dark') {
    applyTheme(true)
  } else if (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    applyTheme(true)
  }
  
  if (auth.isLoggedIn) {
    try {
      const res = await api.listTypes()
      types.value = res.types || []
    } catch {
      auth.clearSession()
      router.push('/login')
    }
  }
})

function switchLang() {
  i18n.setLocale(locale.value)
}

function logout() {
  auth.clearSession()
  router.push('/login')
}
</script>

<style>
.layout { display: flex; height: 100vh; position: relative; }
.menu-toggle {
  display: none; position: fixed; top: 12px; left: 12px; z-index: 1001;
  width: 36px; height: 36px; padding: 8px 6px; background: var(--surface);
  border: 1px solid var(--border); border-radius: 6px; cursor: pointer;
  flex-direction: column; justify-content: space-between;
}
.menu-toggle span { display: block; height: 2px; background: var(--text-primary); border-radius: 1px; transition: all 0.2s; }
.sidebar-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 998; }
.sidebar {
  width: 220px; background: var(--surface); border-right: 1px solid var(--border);
  display: flex; flex-direction: column; padding: 16px 0; overflow-y: auto;
  flex-shrink: 0; transition: transform 0.25s ease;
}
.logo {
  font-size: 18px; font-weight: 700; color: var(--primary); padding: 0 20px 20px;
  cursor: pointer;
}
.nav-section {
  font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase;
  padding: 12px 20px 6px; letter-spacing: 0.5px;
}
.nav-item {
  display: block; padding: 8px 20px; color: var(--text-secondary); text-decoration: none;
  font-size: 13px; transition: all 0.15s;
}
.nav-item:hover, .nav-item.router-link-active { color: var(--primary); background: var(--primary-bg); }
.sidebar-footer { margin-top: auto; padding: 16px 20px; border-top: 1px solid var(--border); }
.btn-theme {
  display: block; width: 100%; padding: 6px 0; margin-bottom: 8px;
  background: var(--bg); border: 1px solid var(--border); border-radius: 6px;
  font-size: 16px; cursor: pointer; transition: background 0.2s;
}
.btn-theme:hover { background: var(--primary-bg); }
.lang-switch { margin-bottom: 8px; }
.lang-select {
  width: 100%; padding: 4px 8px; background: var(--bg); border: 1px solid var(--border);
  border-radius: 4px; font-size: 12px; color: var(--text-primary); cursor: pointer;
}
.user { font-size: 13px; color: var(--text-secondary); display: block; margin-bottom: 8px; }
.btn-logout {
  font-size: 12px; color: var(--danger); background: none; border: none; cursor: pointer;
}
.main {
  flex: 1; overflow-y: auto; padding: 32px; background: var(--bg);
}

/* ── Responsive: Tablet ─────────────────────────── */
@media (max-width: 1024px) {
  .main { padding: 24px 16px; }
}

/* ── Responsive: Mobile ─────────────────────────── */
@media (max-width: 768px) {
  .menu-toggle { display: flex; }
  .sidebar-overlay { display: block; }
  .sidebar {
    position: fixed; top: 0; left: 0; bottom: 0; z-index: 999;
    transform: translateX(-100%);
  }
  .sidebar.open { transform: translateX(0); box-shadow: 4px 0 20px rgba(0,0,0,0.15); }
  .main { padding: 16px 12px; padding-top: 56px; }
}
</style>
