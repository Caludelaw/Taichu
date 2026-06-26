<template>
  <div>
    <div class="header">
      <h1 class="page-title">🤖 Agent 市场</h1>
      <span class="stats-badge">{{ agents.length }} 个 Agent 在线</span>
    </div>

    <div class="search-bar">
      <input v-model="query" placeholder="搜索 Agent 名称、描述、工具..." class="input" @input="fetchAgents" />
      <select v-model="selectedTag" @change="fetchAgents" class="input select-sm">
        <option value="">全部标签</option>
        <option v-for="t in tags" :key="t" :value="t">{{ t }}</option>
      </select>
      <select v-model="selectedTool" @change="fetchAgents" class="input select-sm">
        <option value="">全部工具</option>
        <option v-for="tl in tools" :key="tl" :value="tl">{{ tl }}</option>
      </select>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="loading" class="loading">加载中...</div>

    <div v-else-if="agents.length" class="agent-grid">
      <div v-for="a in agents" :key="a.id" class="agent-card">
        <div class="agent-header">
          <h3>{{ a.capability?.name || a.id }}</h3>
          <span class="badge-active">🟢 {{ a.status }}</span>
        </div>
        <p class="agent-desc">{{ a.capability?.description || '无描述' }}</p>
        <div class="agent-meta">
          <span class="version">v{{ a.capability?.version || '1.0.0' }}</span>
          <span class="last-seen" :title="a.lastSeenAt">最后在线: {{ formatTime(a.lastSeenAt) }}</span>
        </div>
        <div v-if="a.capability?.tags?.length" class="agent-tags">
          <span v-for="t in a.capability.tags" :key="t" class="tag">{{ t }}</span>
        </div>
        <div v-if="a.capability?.tools?.length" class="agent-tools">
          <span class="tools-label">工具:</span>
          <span v-for="tl in a.capability.tools" :key="tl.name" class="tool-badge" :title="tl.description">{{ tl.name }}</span>
        </div>
        <div v-if="a.capability?.endpoints?.length" class="agent-endpoints">
          <span class="endpoints-label">端点:</span>
          <span v-for="ep in a.capability.endpoints" :key="ep.path" class="endpoint-badge">
            <span class="method">{{ ep.method }}</span> {{ ep.path }}
          </span>
        </div>
        <div class="agent-actions">
          <button @click="viewAgent(a)" class="btn btn-sm">📋 详情</button>
        </div>
      </div>
    </div>
    <div v-else class="empty">暂无已注册的 Agent</div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const agents = ref([])
const tags = ref([])
const tools = ref([])
const query = ref('')
const selectedTag = ref('')
const selectedTool = ref('')
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  await Promise.all([fetchAgents(), fetchTags(), fetchTools()])
})

async function fetchAgents() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams()
    if (query.value) params.set('query', query.value)
    if (selectedTag.value) params.set('tag', selectedTag.value)
    if (selectedTool.value) params.set('tool', selectedTool.value)
    params.set('limit', '50')

    const res = await fetch(`/api/agents?${params}`, { headers: authHeaders() })
    if (!res.ok) throw new Error('Failed to fetch agents')
    const data = await res.json()
    agents.value = data.agents || []
  } catch (e) {
    error.value = '加载 Agent 列表失败: ' + e.message
  } finally {
    loading.value = false
  }
}

async function fetchTags() {
  try {
    const res = await fetch('/api/agents/tags', { headers: authHeaders() })
    if (res.ok) {
      const data = await res.json()
      tags.value = data.tags || []
    }
  } catch {}
}

async function fetchTools() {
  try {
    const res = await fetch('/api/agents/tools', { headers: authHeaders() })
    if (res.ok) {
      const data = await res.json()
      tools.value = data.tools || []
    }
  } catch {}
}

function viewAgent(agent) {
  alert(JSON.stringify(agent.capability, null, 2))
}

function formatTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const now = new Date()
  const diff = now - d
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前'
  return d.toLocaleDateString('zh-CN')
}

function authHeaders() {
  const token = localStorage.getItem('taichu_token')
  return token ? { 'Authorization': `Bearer ${token}` } : {}
}
</script>

<style scoped>
.agent-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 16px;
  margin-top: 16px;
}
.agent-card {
  background: var(--surface, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: var(--radius, 8px);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.agent-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.agent-header h3 {
  margin: 0;
  font-size: 16px;
  color: var(--text-primary, #111827);
}
.agent-desc {
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
  margin: 0;
  line-height: 1.5;
}
.agent-meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--text-muted, #9ca3af);
}
.agent-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.agent-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  font-size: 12px;
}
.tools-label {
  color: var(--text-muted, #9ca3af);
  margin-right: 4px;
}
.tool-badge {
  background: var(--bg, #f3f4f6);
  color: var(--text-secondary, #6b7280);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-family: monospace;
}
.agent-endpoints {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  font-size: 12px;
}
.endpoints-label {
  color: var(--text-muted, #9ca3af);
  margin-right: 4px;
}
.endpoint-badge {
  background: var(--bg, #f3f4f6);
  color: var(--text-secondary, #6b7280);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-family: monospace;
}
.endpoint-badge .method {
  color: var(--primary, #10b981);
  font-weight: 600;
}
.agent-actions {
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px solid var(--border, #e5e7eb);
}
.badge-active {
  background: var(--badge-published-bg, #d1fae5);
  color: var(--badge-published-color, #065f46);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
}
.stats-badge {
  color: var(--text-muted, #9ca3af);
  font-size: 14px;
}
.tag {
  background: #e0e7ff;
  color: #3730a3;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
}
.search-bar {
  display: flex;
  gap: 12px;
  margin: 16px 0;
  align-items: center;
}
.search-bar select.select-sm {
  width: 160px;
}
.version {
  font-weight: 600;
  color: var(--text-primary, #111827);
}
.loading, .empty {
  text-align: center;
  padding: 40px;
  color: var(--text-muted, #9ca3af);
}
.error {
  color: var(--danger, #ef4444);
  padding: 12px;
  background: var(--danger-bg, #fef2f2);
  border-radius: var(--radius, 8px);
  margin: 16px 0;
}
</style>
