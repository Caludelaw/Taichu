<template>
  <div>
    <div class="header">
      <h1 class="page-title">🧩 插件市场</h1>
      <button @click="refresh" class="btn" :disabled="refreshing">{{ refreshing ? '刷新中...' : '🔄 刷新' }}</button>
    </div>

    <div class="search-bar">
      <input v-model="search" placeholder="搜索插件..." class="input" @input="filterPlugins" />
      <select v-model="category" @change="filterPlugins" class="input select-sm">
        <option value="">全部分类</option>
        <option value="seo">SEO</option>
        <option value="analytics">分析</option>
        <option value="interaction">互动</option>
        <option value="ai">AI</option>
        <option value="media">媒体</option>
        <option value="content">内容</option>
      </select>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="filtered.length" class="plugin-grid">
      <div v-for="p in filtered" :key="p.name" class="plugin-card" :class="{ installed: p.installed }">
        <div class="plugin-header">
          <h3>{{ p.name.replace('@taichu/plugin-', '') }}</h3>
          <span v-if="p.installed" class="badge-done">✅ 已安装</span>
          <span v-else class="badge-ver">v{{ p.version }}</span>
        </div>
        <p class="plugin-desc">{{ p.description }}</p>
        <div class="plugin-meta">
          <span class="license">{{ p.license }}</span>
          <span v-if="p.author">{{ p.author }}</span>
        </div>
        <div v-if="p.keywords" class="plugin-tags">
          <span v-for="k in p.keywords" :key="k" class="tag">{{ k }}</span>
        </div>
        <div class="plugin-actions">
          <button v-if="!p.installed" @click="install(p)" class="btn-primary btn-sm" :disabled="installing === p.name">
            {{ installing === p.name ? '安装中...' : '⬇️ 安装' }}
          </button>
          <button v-else @click="uninstall(p)" class="btn-danger btn-sm" :disabled="installing === p.name">
            {{ installing === p.name ? '卸载中...' : '🗑️ 卸载' }}
          </button>
        </div>
      </div>
    </div>
    <div v-else-if="!refreshing" class="empty">未找到插件</div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api/index.js'

const plugins = ref([])
const filtered = ref([])
const search = ref('')
const category = ref('')
const error = ref('')
const refreshing = ref(false)
const installing = ref(null)

onMounted(() => fetchMarketplace())

async function fetchMarketplace() {
  refreshing.value = true
  error.value = ''
  try {
    const res = await api.request('/plugins/marketplace')
    plugins.value = res.plugins || []
    filterPlugins()
  } catch (e) {
    error.value = '加载插件市场失败: ' + e.message
  } finally {
    refreshing.value = false
  }
}

function filterPlugins() {
  let result = [...plugins.value]
  if (search.value) {
    const q = search.value.toLowerCase()
    result = result.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      (p.keywords || []).some(k => k.toLowerCase().includes(q))
    )
  }
  if (category.value) {
    result = result.filter(p => p.category === category.value)
  }
  filtered.value = result
}

async function install(p) {
  installing.value = p.name
  error.value = ''
  try {
    await api.request('/plugins/install', {
      method: 'POST',
      body: JSON.stringify({ name: p.name })
    })
    p.installed = true
  } catch (e) {
    error.value = '安装失败: ' + e.message
  } finally {
    installing.value = null
  }
}

async function uninstall(p) {
  if (!confirm(`确定卸载 ${p.name}？`)) return
  installing.value = p.name
  error.value = ''
  try {
    await api.request(`/plugins/uninstall/${encodeURIComponent(p.name)}`, { method: 'POST' })
    p.installed = false
  } catch (e) {
    error.value = '卸载失败: ' + e.message
  } finally {
    installing.value = null
  }
}

async function refresh() {
  await api.request('/plugins/refresh', { method: 'POST' })
  await fetchMarketplace()
}
</script>

<style scoped>
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.search-bar { display: flex; gap: 12px; margin-bottom: 20px; }
.search-bar .input { flex: 1; }
.select-sm { max-width: 140px; }
.plugin-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
.plugin-card {
  background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
  padding: 20px; display: flex; flex-direction: column; gap: 10px; transition: box-shadow 0.15s;
}
.plugin-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
.plugin-card.installed { border-color: #10B981; }
.plugin-header { display: flex; justify-content: space-between; align-items: center; }
.plugin-header h3 { font-size: 15px; font-weight: 600; color: var(--text-primary); margin: 0; }
.badge-done { font-size: 11px; color: var(--badge-published-color, #065F46); background: var(--badge-published-bg, #D1FAE5); padding: 2px 8px; border-radius: 4px; }
.badge-ver { font-size: 11px; color: var(--text-muted); }
.plugin-desc { font-size: 13px; color: var(--text-secondary); line-height: 1.5; margin: 0; }
.plugin-meta { font-size: 11px; color: var(--text-muted); display: flex; gap: 12px; }
.plugin-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.plugin-actions { margin-top: auto; padding-top: 8px; }
.btn-sm { padding: 6px 14px; font-size: 12px; }
.error { color: var(--danger); margin-bottom: 12px; font-size: 13px; }
</style>
