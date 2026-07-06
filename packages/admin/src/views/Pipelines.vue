<template>
  <div>
    <h2 class="page-title"><Icon name="refresh" :size="18" /> {{ $t('pipelines.title') }}</h2>
    <p v-if="!templates.length" class="empty">{{ $t('pipelines.no_items') }}</p>
    <div class="grid" v-else>
      <div v-for="tpl in templates" :key="tpl.id" class="card">
        <strong>{{ tpl.name || tpl.id }}</strong>
        <p class="desc">{{ tpl.description || '-' }}</p>
        <span class="stage-count">{{ (tpl.stages || []).length }} stages</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api/index.js'
import { useI18n } from '../i18n.js'
import Icon from '../components/Icon.vue'

const { t: $t } = useI18n()
const templates = ref([])

onMounted(async () => {
  try {
    const res = await api.listPipelines()
    templates.value = res.templates || []
  } catch (e) { console.error(e) }
})
</script>

<style scoped>
.page-title { font-size: 22px; margin-bottom: 20px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
.desc { font-size: 13px; color: var(--text-secondary); margin: 8px 0; }
.stage-count { font-size: 12px; color: var(--text-muted); }
.empty { color: var(--text-secondary); font-size: 14px; margin-top: 40px; text-align: center; }
</style>
