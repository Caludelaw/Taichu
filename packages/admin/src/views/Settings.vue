<template>
  <div>
    <h1 class="page-title">{{ $t('settings.title') }}</h1>
    <div v-if="loading" class="loading">{{ $t('settings.loading') }}</div>

    <div v-if="!loading && settings" class="card">
      <div class="form-group">
        <label>{{ $t('settings.site_name') }}</label>
        <input v-model="settings.siteName" class="input" />
      </div>

      <h3 class="section-title">{{ $t('settings.compliance') }}</h3>
      <div class="form-group">
        <label>{{ $t('settings.icp') }}</label>
        <input v-model="settings.icpNumber" class="input" :placeholder="$t('settings.icp_placeholder')" />
      </div>
      <div class="form-group">
        <label>{{ $t('settings.gongan') }}</label>
        <input v-model="settings.gonganNumber" class="input" :placeholder="$t('settings.gongan_placeholder')" />
      </div>

      <h3 class="section-title">{{ $t('settings.seo') }}</h3>
      <div class="form-group">
        <label>{{ $t('settings.seo_title') }}</label>
        <input v-model="settings.seoTitle" class="input" />
      </div>
      <div class="form-group">
        <label>{{ $t('settings.seo_description') }}</label>
        <textarea v-model="settings.seoDescription" class="input textarea" rows="3"></textarea>
      </div>
      <div class="form-group">
        <label>{{ $t('settings.seo_keywords') }}</label>
        <input v-model="keywordsStr" class="input" :placeholder="$t('settings.seo_keywords_placeholder')" />
      </div>

      <h3 class="section-title">{{ $t('settings.analytics_lang') }}</h3>
      <div class="form-group">
        <label>{{ $t('settings.analytics_id') }}</label>
        <input v-model="settings.analyticsId" class="input" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>{{ $t('settings.default_lang') }}</label>
          <select v-model="settings.language" class="input">
            <option value="zh-CN">中文</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
          </select>
        </div>
        <div class="form-group">
          <label>{{ $t('settings.timezone') }}</label>
          <select v-model="settings.timezone" class="input">
            <option value="Asia/Shanghai">上海 (UTC+8)</option>
            <option value="Asia/Tokyo">东京 (UTC+9)</option>
            <option value="America/New_York">纽约 (UTC-5)</option>
            <option value="Europe/London">伦敦 (UTC+0)</option>
          </select>
        </div>
      </div>

      <div class="actions">
        <button @click="save" class="btn-primary" :disabled="saving">{{ saving ? $t('settings.saving') : $t('settings.save') }}</button>
        <span v-if="saved" class="saved">{{ $t('settings.saved') }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../api/index.js'
import { useI18n } from '../i18n.js'

const { t: $t } = useI18n()
const loading = ref(true)
const saving = ref(false)
const saved = ref(false)
const settings = ref(null)

const keywordsStr = computed({
  get: () => (settings.value?.seoKeywords || []).join(', '),
  set: (v) => { settings.value.seoKeywords = v.split(',').map(s => s.trim()).filter(Boolean) }
})

onMounted(async () => {
  try {
    const data = await api.getSettings()
    settings.value = data
  } catch (e) {
    console.error(e)
  }
  loading.value = false
})

async function save() {
  saving.value = true
  saved.value = false
  try {
    await fetch('/api/site-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('taichu_token')}` },
      body: JSON.stringify(settings.value)
    })
    saved.value = true
    setTimeout(() => saved.value = false, 2000)
  } catch (e) { alert($t('settings.save_error') + ': ' + e.message) }
  saving.value = false
}
</script>

<style scoped>
.page-title { font-size: 24px; margin-bottom: 24px; }
.card { max-width: 640px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 24px; }
.section-title { font-size: 15px; font-weight: 600; color: var(--text-primary); margin: 24px 0 12px; padding-top: 16px; border-top: 1px solid var(--border); }
.form-group { margin-bottom: 16px; }
.form-group label { display: block; font-size: 13px; color: var(--text-secondary); margin-bottom: 6px; font-weight: 500; }
.form-row { display: flex; gap: 16px; }
.form-row .form-group { flex: 1; }
.input { width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; font-size: 14px; background: var(--bg); color: var(--text-primary); }
.textarea { resize: vertical; }
.actions { margin-top: 24px; display: flex; align-items: center; gap: 12px; }
.btn-primary { padding: 10px 24px; background: var(--primary); color: #fff; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
.btn-primary:disabled { opacity: 0.6; }
.saved { color: var(--primary); font-size: 13px; }
</style>
