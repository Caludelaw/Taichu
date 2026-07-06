<template>
  <div>
    <h2 class="page-title">{{ $t('theme.title') }}</h2>

    <div class="card">
      <h3>{{ $t('theme.brand_colors') }}</h3>
      <div class="form-group">
        <label>{{ $t('theme.primary_color') }}</label>
        <div class="color-row">
          <input type="color" v-model="config.primaryColor" class="color-picker" />
          <input v-model="config.primaryColor" class="input" />
        </div>
      </div>
      <div class="form-group">
        <label>{{ $t('theme.bg_color') }}</label>
        <div class="color-row">
          <input type="color" v-model="config.bgColor" class="color-picker" />
          <input v-model="config.bgColor" class="input" />
        </div>
      </div>

      <h3>{{ $t('theme.typography') }}</h3>
      <div class="form-group">
        <label>{{ $t('theme.font_family') }}</label>
        <select v-model="config.fontFamily" class="input">
          <option value="system-ui, sans-serif">System UI</option>
          <option value="'Inter', sans-serif">Inter</option>
          <option value="'Noto Sans SC', sans-serif">Noto Sans SC</option>
          <option value="'Noto Sans JP', sans-serif">Noto Sans JP</option>
        </select>
      </div>

      <h3>{{ $t('theme.layout') }}</h3>
      <div class="form-group">
        <label>{{ $t('theme.container_width') }}</label>
        <input v-model="config.containerWidth" class="input" placeholder="1200px" />
      </div>

      <h3>{{ $t('theme.custom_css') }}</h3>
      <textarea v-model="config.customCSS" class="input textarea" rows="6" placeholder="/* Custom CSS */"></textarea>

      <div class="actions">
        <button @click="save" class="btn-primary">{{ $t('theme.save') }}</button>
        <span v-if="saved" class="saved"><Icon name="check-circle" :size="14" /> {{ $t('theme.saved') }}</span>
      </div>
      <p class="tip">{{ $t('theme.tip') }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api/index.js'
import { useI18n } from '../i18n.js'
import Icon from '../components/Icon.vue'

const { t: $t } = useI18n()
const config = ref({
  primaryColor: '#10B981',
  bgColor: '#F8FAFC',
  fontFamily: 'system-ui, sans-serif',
  containerWidth: '1200px',
  customCSS: ''
})
const saved = ref(false)

onMounted(async () => {
  try {
    const data = await api.getThemeConfig()
    if (data) Object.assign(config.value, data)
  } catch (e) { console.error(e) }
})

async function save() {
  try {
    await api.saveThemeConfig(config.value)
    saved.value = true
    setTimeout(() => saved.value = false, 2000)
  } catch (e) { alert($t('theme.save_error') + ': ' + e.message) }
}
</script>

<style scoped>
.page-title { font-size: 22px; margin-bottom: 24px; }
.card { max-width: 640px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 24px; }
h3 { font-size: 15px; margin: 24px 0 12px; padding-top: 16px; border-top: 1px solid var(--border); }
.form-group { margin-bottom: 16px; }
.form-group label { display: block; font-size: 13px; color: var(--text-secondary); margin-bottom: 6px; }
.color-row { display: flex; gap: 8px; align-items: center; }
.color-picker { width: 40px; height: 36px; border: none; cursor: pointer; padding: 0; }
.input { width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; font-size: 14px; background: var(--bg); color: var(--text-primary); }
.textarea { resize: vertical; font-family: monospace; font-size: 13px; }
.actions { margin-top: 24px; display: flex; align-items: center; gap: 12px; }
.btn-primary { padding: 10px 24px; background: var(--primary); color: #fff; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
.saved { color: var(--primary); font-size: 13px; }
.tip { font-size: 12px; color: var(--text-muted); margin-top: 16px; }
</style>
