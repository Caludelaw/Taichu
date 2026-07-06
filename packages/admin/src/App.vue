<template>
  <div v-if="auth.isLoggedIn" class="layout">
    <!-- Hamburger toggle for mobile -->
    <button class="menu-toggle" @click="sidebarOpen = !sidebarOpen" :aria-label="sidebarOpen ? $t('nav.close_menu') : $t('nav.open_menu')">
      <span></span><span></span><span></span>
    </button>

    <!-- Mobile overlay backdrop -->
    <div v-if="sidebarOpen" class="sidebar-overlay" @click="sidebarOpen = false"></div>

    <aside class="sidebar" :class="{ open: sidebarOpen }">
      <div class="logo" @click="$router.push('/dashboard'); sidebarOpen = false">
        <Icon name="lightning" :size="18" /> {{ $t('app.logo') }}
      </div>
      <nav>
        <div class="nav-section">{{ $t('nav.section_content') }}</div>
        <template v-for="t in types" :key="t.name">
          <router-link :to="`/content/${t.name}`" class="nav-item" @click="sidebarOpen = false">
            <Icon name="file" :size="14" /> {{ t.label }}
          </router-link>
        </template>
        <router-link to="/media" class="nav-item" @click="sidebarOpen = false"><Icon name="image" :size="14" /> {{ $t('nav.media') }}</router-link>
        <router-link to="/categories" class="nav-item" @click="sidebarOpen = false"><Icon name="folder" :size="14" /> {{ $t('nav.categories') }}</router-link>
        <router-link to="/tags" class="nav-item" @click="sidebarOpen = false"><Icon name="tag" :size="14" /> {{ $t('nav.tags') }}</router-link>
        <router-link to="/comments" class="nav-item" @click="sidebarOpen = false"><Icon name="message-circle" :size="14" /> {{ $t('nav.comments') }}</router-link>
        <router-link to="/navigation" class="nav-item" @click="sidebarOpen = false"><Icon name="compass" :size="14" /> {{ $t('nav.navigation') }}</router-link>

        <div class="nav-section">{{ $t('nav.section_manage') }}</div>
        <router-link to="/users" class="nav-item" @click="sidebarOpen = false"><Icon name="users" :size="14" /> {{ $t('nav.users') }}</router-link>
        <router-link to="/apikeys" class="nav-item" @click="sidebarOpen = false"><Icon name="key" :size="14" /> {{ $t('nav.apikeys') }}</router-link>
        <router-link to="/webhooks" class="nav-item" @click="sidebarOpen = false"><Icon name="link" :size="14" /> {{ $t('nav.webhooks') }}</router-link>
        <router-link to="/settings" class="nav-item" @click="sidebarOpen = false"><Icon name="settings" :size="14" /> {{ $t('nav.settings') }}</router-link>
        <router-link to="/theme" class="nav-item" @click="sidebarOpen = false"><Icon name="palette" :size="14" /> {{ $t('nav.theme') }}</router-link>
        <router-link to="/theme-manager" class="nav-item" @click="sidebarOpen = false"><Icon name="package" :size="14" /> {{ $t('nav.theme_manager') }}</router-link>

        <div class="nav-section">{{ $t('nav.section_security') }}</div>
        <router-link to="/audit" class="nav-item" @click="sidebarOpen = false"><Icon name="clipboard" :size="14" /> {{ $t('nav.audit') }}</router-link>
        <router-link to="/workflow" class="nav-item" @click="sidebarOpen = false"><Icon name="check-circle" :size="14" /> {{ $t('nav.workflow') }}</router-link>

        <div class="nav-section">{{ $t('nav.section_dev') }}</div>
        <router-link to="/plugins" class="nav-item" @click="sidebarOpen = false"><Icon name="puzzle" :size="14" /> {{ $t('nav.plugins') }}</router-link>
        <router-link to="/agents" class="nav-item" @click="sidebarOpen = false"><Icon name="bot" :size="14" /> {{ $t('nav.agents') }}</router-link>
        <router-link to="/pipelines" class="nav-item" @click="sidebarOpen = false"><Icon name="refresh" :size="14" /> {{ $t('nav.pipelines') }}</router-link>
        <router-link to="/api-docs" class="nav-item" @click="sidebarOpen = false"><Icon name="book" :size="14" /> {{ $t('nav.api_docs') }}</router-link>
        <a href="/api/graphql" target="_blank" class="nav-item"><Icon name="microscope" :size="14" /> {{ $t('nav.graphiql') }}</a>
        <a href="/ws-test.html" target="_blank" class="nav-item"><Icon name="antenna" :size="14" /> {{ $t('nav.ws_test') }}</a>
      </nav>
      <div class="sidebar-footer">
        <button class="btn-theme" @click="toggleDark" :title="isDark ? $t('nav.toggle_light') : $t('nav.toggle_dark')">
          <Icon :name="isDark ? 'sun' : 'moon'" :size="16" />
        </button>
        <div class="lang-switch">
          <select v-model="locale" @change="switchLang" class="lang-select">
            <option v-for="l in i18n.supportedLocales" :key="l.code" :value="l.code">{{ l.label }}</option>
          </select>
        </div>
        <span class="user">{{ auth.user?.username }}</span>
        <button @click="logout" class="btn-logout">{{ $t('nav.logout') }}</button>
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
import Icon from './components/Icon.vue'

const router = useRouter()
const types = ref([])
const i18n = useI18n()
const $t = i18n.t
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
  display: flex; align-items: center; gap: 6px; padding: 8px 20px; color: var(--text-secondary); text-decoration: none;
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
