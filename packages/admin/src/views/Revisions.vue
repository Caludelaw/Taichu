<template>
  <div>
    <div class="page-header">
      <h2 class="page-title">{{ $t('revisions.title') }}</h2>
      <div class="header-actions">
        <button
          v-if="revisions.length >= 2"
          class="btn"
          :class="{ active: compareMode }"
          @click="toggleCompare"
        >
          <Icon name="git-compare" :size="14" />
          {{ compareMode ? $t('revisions.cancel_compare') : $t('revisions.compare') }}
        </button>
      </div>
    </div>

    <!-- Compare Mode Panel -->
    <div v-if="compareMode && revisions.length >= 2" class="compare-panel">
      <p class="compare-hint">{{ $t('revisions.compare_select') }}</p>
      <div class="compare-selects">
        <div class="compare-side">
          <label>{{ $t('revisions.compare_from') }}</label>
          <select v-model="compareFrom" @change="onCompareSelect">
            <option v-for="r in revisions" :key="r.id" :value="r.id">
              v{{ revNum(r) }} — {{ fmtDate(r.timestamp) }}
            </option>
          </select>
        </div>
        <div class="compare-side">
          <label>{{ $t('revisions.compare_to') }}</label>
          <select v-model="compareTo" @change="onCompareSelect">
            <option v-for="r in revisions" :key="r.id" :value="r.id">
              v{{ revNum(r) }} — {{ fmtDate(r.timestamp) }}
            </option>
          </select>
        </div>
      </div>

      <div v-if="compareDiffs !== null" class="compare-result">
        <div class="compare-result-header">
          <Icon name="git-compare" :size="14" />
          <span>{{ $t('revisions.changes_count', { n: compareDiffs.length }) }}</span>
        </div>
        <DiffViewer :diffs="compareDiffs" />
      </div>
    </div>

    <!-- Revision Timeline -->
    <div v-if="revisions.length" class="timeline">
      <div
        v-for="(r, i) in revisions"
        :key="r.id"
        class="rev-item"
        :class="{ expanded: expandedId === r.id }"
      >
        <div class="rev-header" @click="toggleExpand(r.id)">
          <div class="rev-left">
            <span class="rev-version">v{{ revNum(r) }}</span>
            <span class="rev-time">{{ fmtDate(r.timestamp) }}</span>
            <span v-if="r.diff && r.diff.length" class="rev-changes-badge">
              {{ r.diff.length }}
            </span>
          </div>
          <div class="rev-right">
            <span class="rev-author">
              <Icon :name="r.authorType === 'agent' ? 'bot' : 'user'" :size="12" />
              {{ r.authorType === 'agent' ? $t('revisions.col_author_agent') : $t('revisions.col_author_user') }}
              {{ r.author?.substring(0, 8) || '' }}
            </span>
            <span v-if="r.status" class="rev-status" :class="r.status">{{ r.status }}</span>
          </div>
        </div>

        <!-- Expanded diff -->
        <div v-if="expandedId === r.id" class="rev-diff">
          <DiffViewer :diffs="r.diff || []" />
          <div class="rev-actions">
            <button class="btn-sm" @click="restore(r)">
              {{ $t('revisions.restore') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <p v-else-if="!loading" class="empty">
      <Icon name="clock" :size="24" :strokeWidth="1" />
      <span>{{ $t('revisions.no_items') }}</span>
    </p>
    <p v-else class="empty">{{ $t('common.loading') }}</p>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api/index.js'
import { notifyError, notifySuccess } from '../utils/format.js'
import { useI18n } from '../i18n.js'
import Icon from '../components/Icon.vue'
import DiffViewer from '../components/DiffViewer.vue'

const { t: $t } = useI18n()
const route = useRoute()
const revisions = ref([])
const loading = ref(true)
const expandedId = ref(null)

// Compare mode
const compareMode = ref(false)
const compareFrom = ref('')
const compareTo = ref('')
const compareDiffs = ref(null)

const revNum = (r) => {
  const idx = revisions.value.indexOf(r)
  return revisions.value.length - idx
}

onMounted(async () => {
  try {
    const type = route.params.type || route.query.type
    const id = route.params.id || route.query.id
    if (type && id) {
      const res = await api.getRevisions(type, id)
      revisions.value = (res.revisions || []).map(r => ({
        ...r,
        diff: r.diff || []
      }))
      // Default selections for compare
      if (revisions.value.length >= 2) {
        compareFrom.value = revisions.value[0].id
        compareTo.value = revisions.value[1].id
      }
    }
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
})

function toggleExpand(id) {
  expandedId.value = expandedId.value === id ? null : id
}

// Compare mode
function toggleCompare() {
  compareMode.value = !compareMode.value
  if (!compareMode.value) {
    compareDiffs.value = null
  } else {
    fetchCompare()
  }
}

function onCompareSelect() {
  if (compareMode.value) fetchCompare()
}

async function fetchCompare() {
  if (!compareFrom.value || !compareTo.value || compareFrom.value === compareTo.value) {
    compareDiffs.value = null
    return
  }
  try {
    const type = route.params.type || route.query.type
    const id = route.params.id || route.query.id
    const res = await api.getRevisionDiff(type, id, compareFrom.value, compareTo.value)
    compareDiffs.value = res.diff || []
  } catch (e) {
    console.error(e)
    compareDiffs.value = []
  }
}

async function restore(r) {
  const v = revNum(r)
  if (!confirm($t('revisions.restore_confirm', { version: v }))) return
  try {
    const type = route.params.type || route.query.type
    const id = route.params.id || route.query.id
    await api.restoreRevision(type, id, r.id)
    notifySuccess($t('revisions.restore_success', { version: v }))
  } catch (e) {
    notifyError($t('revisions.restore_error'), e)
  }
}

function fmtDate(d) {
  if (!d) return '-'
  return new Date(d).toLocaleString()
}
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.page-title { font-size: 22px; }

.header-actions {
  display: flex;
  gap: 8px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
}

.btn.active {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

/* Compare Panel */
.compare-panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;
}

.compare-hint {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.compare-selects {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.compare-side {
  flex: 1;
}

.compare-side label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.compare-side select {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 13px;
  background: var(--surface);
  color: var(--text-primary);
}

.compare-result {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.compare-result-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 12px;
}

/* Timeline */
.timeline {
  max-width: 720px;
}

.rev-item {
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 10px;
  overflow: hidden;
  background: var(--surface);
}

.rev-item.expanded {
  border-color: var(--primary);
}

.rev-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  cursor: pointer;
  user-select: none;
}

.rev-header:hover {
  background: var(--surface-hover, rgba(0,0,0,0.02));
}

.rev-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.rev-version {
  font-size: 14px;
  font-weight: 700;
  color: var(--primary);
  min-width: 32px;
}

.rev-time {
  font-size: 13px;
  color: var(--text-secondary);
}

.rev-changes-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: rgba(245, 158, 11, 0.12);
  color: #d97706;
  font-size: 11px;
  font-weight: 600;
}

.rev-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.rev-author {
  font-size: 12px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 4px;
}

.rev-status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 600;
  text-transform: uppercase;
}

.rev-status.published { background: rgba(16,185,129,0.12); color: #059669; }
.rev-status.draft { background: rgba(107,114,128,0.12); color: #6b7280; }
.rev-status.archived { background: rgba(239,68,68,0.1); color: #dc2626; }

.rev-diff {
  padding: 0 16px 16px;
  border-top: 1px solid var(--border);
  padding-top: 12px;
}

.rev-actions {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
}

.btn-sm {
  padding: 5px 14px;
  font-size: 12px;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-primary);
}

.btn-sm:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 0;
  color: var(--text-muted);
  font-size: 14px;
}
</style>
