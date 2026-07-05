<template>
  <div>
    <h1 class="page-title">{{ $t('audit.title') }}</h1>
    <div class="toolbar">
      <select v-model="filter.action" @change="load" class="input" style="width:160px">
        <option value="">{{ $t('audit.all_actions') }}</option>
        <option value="create">{{ $t('audit.action_create') }}</option>
        <option value="update">{{ $t('audit.action_update') }}</option>
        <option value="delete">{{ $t('audit.action_delete') }}</option>
        <option value="publish">{{ $t('audit.action_publish') }}</option>
        <option value="review_requested">{{ $t('audit.action_request_review') }}</option>
        <option value="approved">{{ $t('audit.action_approve') }}</option>
        <option value="rejected">{{ $t('audit.action_reject') }}</option>
      </select>
      <button @click="load" class="btn">{{ $t('common.search') }}</button>
    </div>

    <div class="table-wrap">
      <table>
        <thead><tr><th>{{ $t('audit.col_time') }}</th><th>{{ $t('audit.col_action') }}</th><th>{{ $t('audit.col_actor') }}</th><th>{{ $t('audit.col_target') }}</th><th>{{ $t('contentEdit.edit') }}</th></tr></thead>
        <tbody>
          <tr v-for="e in entries" :key="e.id">
            <td class="time">{{ fmtTime(e.createdAt) }}</td>
            <td><span :class="'tag tag-' + e.action">{{ e.action }}</span></td>
            <td>{{ e.actorType === 'agent' ? $t('audit.col_actor_agent') : $t('audit.col_actor_user') }} {{ e.actorId?.substring(0, 12) }}</td>
            <td>{{ e.resourceType }}/{{ e.resourceId?.substring(0, 8) }}</td>
            <td>{{ e.detail?.title || '-' }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="!entries.length" class="empty">{{ $t('audit.no_items') }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api/index.js'
import { useI18n } from '../i18n.js'

const { t: $t } = useI18n()
const entries = ref([])
const filter = ref({ action: '' })

onMounted(load)
async function load() {
  try {
    const res = await api.getAuditLog(filter.value.action ? { action: filter.value.action } : {})
    entries.value = res.entries || []
  } catch (e) { console.error(e) }
}
function fmtTime(t) { return t ? new Date(t).toLocaleString() : '' }
</script>

<style scoped>
.page-title { font-size: 24px; margin-bottom: 16px; }
.toolbar { display: flex; gap: 12px; margin-bottom: 16px; align-items: center; }
.input { padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; background: var(--bg); color: var(--text-primary); }
.btn { padding: 6px 16px; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; font-size: 13px; cursor: pointer; color: var(--text-primary); }
.table-wrap { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { padding: 10px 16px; text-align: left; border-bottom: 1px solid var(--border); }
th { font-weight: 600; color: var(--text-secondary); background: var(--bg); }
.time { white-space: nowrap; color: var(--text-secondary); }
.tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.tag-create, .tag-publish, .tag-approved { background: var(--badge-published-bg, #DCFCE7); color: var(--badge-published-color, #166534); }
.tag-update { background: var(--badge-draft-bg, #FEF3C7); color: var(--badge-draft-color, #92400E); }
.tag-delete, .tag-review_requested, .tag-rejected { background: var(--badge-danger-bg, #FEE2E2); color: var(--badge-danger-color, #991B1B); }
.empty { padding: 32px; text-align: center; color: var(--text-muted); }
</style>
