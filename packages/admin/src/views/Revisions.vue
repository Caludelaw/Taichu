<template>
  <div>
    <h2 class="page-title">{{ $t('revisions.title') }}</h2>

    <div v-if="revisions.length" class="timeline">
      <div v-for="(r, i) in revisions" :key="r.id || i" class="rev-item">
        <div class="rev-version">v{{ r.version || (revisions.length - i) }}</div>
        <div class="rev-meta">
          <span class="rev-time">{{ fmtDate(r.createdAt) }}</span>
          <span v-if="r.authorType === 'agent'"><Icon name="bot" :size="12" /> {{ $t('revisions.col_author_agent') }} {{ r.authorId?.substring(0, 8) }}</span>
          <span v-else><Icon name="user" :size="12" /> {{ $t('revisions.col_author_user') }} {{ r.authorId?.substring(0, 8) }}</span>
        </div>
        <div class="rev-summary">{{ r.summary || '-' }}</div>
        <button class="btn-sm" @click="restore(r)">{{ $t('revisions.restore') }}</button>
      </div>
    </div>
    <p v-else class="empty">{{ $t('revisions.no_items') }}</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api/index.js'
import { notifyError } from '../utils/format.js'
import { useI18n } from '../i18n.js'
import Icon from '../components/Icon.vue'

const { t: $t } = useI18n()
const route = useRoute()
const revisions = ref([])

onMounted(async () => {
  try {
    const type = route.query.type
    const id = route.query.id
    if (type && id) {
      const res = await api.getRevisions(type, id)
      revisions.value = res.revisions || []
    }
  } catch (e) { console.error(e) }
})

async function restore(r) {
  if (!confirm($t('revisions.restore_confirm', { version: r.version }))) return
  try {
    await api.restoreRevision(route.query.type, route.query.id, r.id)
    alert($t('revisions.restore_success', { version: r.version }))
  } catch (e) { notifyError($t('revisions.restore_error'), e) }
}

function fmtDate(d) { return d ? new Date(d).toLocaleString() : '-' }
</script>

<style scoped>
.page-title { font-size: 22px; margin-bottom: 24px; }
.timeline { max-width: 600px; }
.rev-item { padding: 16px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 12px; }
.rev-version { font-size: 14px; font-weight: 700; color: var(--primary); margin-bottom: 4px; }
.rev-meta { font-size: 12px; color: var(--text-muted); margin-bottom: 8px; display: flex; gap: 16px; }
.rev-summary { font-size: 13px; color: var(--text-secondary); margin-bottom: 8px; }
.btn-sm { padding: 4px 12px; font-size: 12px; border: 1px solid var(--border); background: var(--surface); border-radius: 4px; cursor: pointer; }
.empty { color: var(--text-secondary); font-size: 14px; margin-top: 40px; text-align: center; }
</style>
