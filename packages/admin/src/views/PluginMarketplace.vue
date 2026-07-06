<template>
  <div>
    <div class="header">
      <h2 class="page-title">{{ $t('plugins.title') }}</h2>
      <button class="btn" @click="load"><Icon name="refresh" :size="14" /> {{ $t('plugins.refresh') }}</button>
    </div>

    <div class="grid" v-if="plugins.length">
      <div v-for="p in plugins" :key="p.id" class="card">
        <strong>{{ p.name || p.id }}</strong>
        <p class="desc">{{ p.description || '-' }}</p>
        <div class="meta">
          <span>v{{ p.version || '0.1.0' }}</span>
          <span>{{ p.author || '-' }}</span>
        </div>
        <button v-if="p.installed" class="btn-sm installed"><Icon name="check-circle" :size="12" /> {{ $t('plugins.installed') }}</button>
        <div v-else class="card-actions">
          <button class="btn-sm" @click="install(p)">{{ $t('plugins.install') }}</button>
          <button v-if="p.installed" class="btn-sm btn-danger" @click="uninstall(p)"><Icon name="trash" :size="14" /> {{ $t('plugins.uninstall') }}</button>
        </div>
      </div>
    </div>
    <p v-else class="empty">{{ $t('plugins.no_items') }}</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api/index.js'
import { notifyError } from '../utils/format.js'
import { useI18n } from '../i18n.js'
import Icon from '../components/Icon.vue'

const { t: $t } = useI18n()
const plugins = ref([])

async function load() {
  try {
    const res = await api.listPlugins()
    plugins.value = res.plugins || []
  } catch (e) { console.error(e) }
}

async function install(p) {
  try { await api.installPlugin(p.id); load() }
  catch (e) { notifyError($t('plugins.install'), e) }
}

async function uninstall(p) {
  if (!confirm($t('plugins.uninstall_confirm'))) return
  try { await api.uninstallPlugin(p.id); load() }
  catch (e) { notifyError($t('plugins.uninstall'), e) }
}

onMounted(load)
</script>

<style scoped>
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-title { font-size: 22px; }
.btn { padding: 8px 20px; background: var(--primary); color: white; border: none; border-radius: var(--radius); font-size: 14px; cursor: pointer; font-weight: 600; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
.desc { font-size: 13px; color: var(--text-secondary); margin: 8px 0; }
.meta { display: flex; gap: 16px; font-size: 12px; color: var(--text-muted); margin-bottom: 8px; }
.btn-sm { padding: 4px 12px; font-size: 12px; border: 1px solid var(--border); background: var(--surface); border-radius: 4px; cursor: pointer; margin-right: 4px; }
.installed { color: #065F46; border-color: #10B981; background: #D1FAE5; }
.btn-danger { color: var(--danger); }
.card-actions { margin-top: 8px; }
.empty { color: var(--text-secondary); font-size: 14px; margin-top: 40px; text-align: center; }
</style>
