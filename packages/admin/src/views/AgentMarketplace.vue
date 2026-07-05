<template>
  <div>
    <div class="header">
      <h2 class="page-title">{{ $t('agents.title') }}</h2>
      <div class="search-bar">
        <input v-model="search" :placeholder="$t('agents.search')" class="input" />
      </div>
    </div>

    <div class="grid" v-if="agents.length">
      <div v-for="a in agents" :key="a.id" class="card">
        <div class="card-header">
          <span class="status-dot" :class="a.status === 'online' ? 'online' : 'offline'"></span>
          <strong>{{ a.name || a.id }}</strong>
        </div>
        <p class="desc">{{ a.description || '-' }}</p>
        <div class="tags">
          <span v-for="t in (a.tags || [])" :key="t" class="tag">{{ t }}</span>
        </div>
        <div class="meta">
          <span>{{ $t('agents.tools') }}: {{ (a.tools || []).length }}</span>
          <span>{{ $t('agents.endpoints') }}: {{ (a.endpoints || []).length }}</span>
        </div>
        <button class="btn-sm" @click="select(a)">{{ $t('agents.details') }}</button>
      </div>
    </div>
    <p v-else class="empty">{{ $t('agents.no_items') }}</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api/index.js'
import { useI18n } from '../i18n.js'

const { t: $t } = useI18n()
const agents = ref([])
const search = ref('')

onMounted(async () => {
  try {
    const res = await api.listAgentCapabilities()
    agents.value = res.capabilities || []
  } catch (e) { console.error(e) }
})

function select(agent) {
  console.log('Selected agent:', agent)
}
</script>

<style scoped>
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-title { font-size: 22px; }
.input { padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius); font-size: 14px; background: var(--surface); color: var(--text-primary); width: 200px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
.card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 15px; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; }
.status-dot.online { background: #10B981; }
.status-dot.offline { background: #9CA3AF; }
.desc { font-size: 13px; color: var(--text-secondary); margin-bottom: 8px; }
.tags { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
.tag { padding: 2px 8px; background: var(--tag-bg); border-radius: 4px; font-size: 11px; color: var(--text-secondary); }
.meta { display: flex; gap: 16px; font-size: 12px; color: var(--text-muted); margin-bottom: 8px; }
.btn-sm { padding: 4px 12px; font-size: 12px; border: 1px solid var(--border); background: var(--surface); border-radius: 4px; cursor: pointer; }
.empty { color: var(--text-secondary); font-size: 14px; margin-top: 40px; text-align: center; }
</style>
