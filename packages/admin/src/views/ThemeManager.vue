<template>
  <div>
    <div class="header">
      <h2 class="page-title">{{ $t('themeManager.title') }}</h2>
      <label class="upload-btn">
        {{ $t('themeManager.upload') }}
        <input type="file" accept=".zip" @change="uploadTheme" hidden />
      </label>
    </div>

    <div v-if="activeTheme" class="active-card card">
      <strong>{{ $t('themeManager.active_theme') }}: {{ activeTheme.name || activeTheme.id }}</strong>
    </div>

    <h3 style="margin: 24px 0 12px;">{{ $t('themeManager.built_in') }}</h3>
    <div class="grid" v-if="themes.length">
      <div v-for="t in themes" :key="t.id" class="card">
        <strong>{{ t.name || t.id }}</strong>
        <p class="desc">{{ t.description || '-' }}</p>
        <p class="meta">v{{ t.version || '1.0.0' }} · {{ t.author || 'Taichu' }}</p>
        <div class="actions">
          <button v-if="!t.active" class="btn-sm" @click="activate(t)">{{ $t('themeManager.activate') }}</button>
          <span v-else class="active-badge">{{ $t('themeManager.active_theme') }}</span>
          <button v-if="!t.builtin" class="btn-sm btn-danger" @click="remove(t.id)">{{ $t('themeManager.delete') }}</button>
        </div>
      </div>
    </div>
    <p v-else class="empty">{{ $t('themeManager.no_themes') }}</p>

    <div class="how-to">
      <strong>{{ $t('themeManager.how_to') }}</strong>
      <p>创建 index.html（使用 __TAICHU__ 占位符）和 config.json</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api/index.js'
import { notifyError } from '../utils/format.js'
import { useI18n } from '../i18n.js'

const { t: $t } = useI18n()
const themes = ref([])
const activeTheme = ref(null)

async function load() {
  try {
    const res = await api.listThemes()
    themes.value = res.themes || []
    activeTheme.value = themes.value.find(t => t.active) || null
  } catch (e) { console.error(e) }
}

async function activate(t) {
  try {
    await api.activateTheme(t.id)
    await load()
  } catch (e) { notifyError($t('themeManager.activate'), e) }
}

async function remove(id) {
  if (!confirm($t('themeManager.delete_confirm'))) return
  try {
    await api.deleteTheme(id)
    load()
  } catch (e) { notifyError($t('themeManager.delete'), e) }
}

async function uploadTheme(e) {
  const file = e.target.files[0]
  if (!file) return
  const formData = new FormData()
  formData.append('theme', file)
  try {
    await fetch('/api/themes/upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('taichu_token')}` },
      body: formData
    })
    alert($t('themeManager.upload_success'))
    load()
  } catch (e) { notifyError($t('themeManager.error'), e) }
  e.target.value = ''
}

onMounted(load)
</script>

<style scoped>
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-title { font-size: 22px; }
.upload-btn {
  padding: 8px 20px; background: var(--primary); color: white; border: none;
  border-radius: var(--radius); font-size: 14px; cursor: pointer; font-weight: 600;
}
.upload-btn:hover { background: var(--primary-dark); }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
.active-card { border-color: var(--primary); background: var(--primary-bg); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
.desc { font-size: 13px; color: var(--text-secondary); margin: 8px 0; }
.meta { font-size: 12px; color: var(--text-muted); margin-bottom: 8px; }
.actions { display: flex; gap: 8px; align-items: center; }
.active-badge { font-size: 12px; color: var(--primary); font-weight: 600; }
.btn-sm { padding: 4px 12px; font-size: 12px; border: 1px solid var(--border); background: var(--surface); border-radius: 4px; cursor: pointer; }
.btn-danger { color: var(--danger); }
.empty { color: var(--text-secondary); font-size: 14px; margin-top: 40px; text-align: center; }
.how-to { margin-top: 32px; padding: 16px; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; }
.how-to p { font-size: 13px; color: var(--text-secondary); margin-top: 8px; }
</style>
