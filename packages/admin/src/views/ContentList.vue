<template>
  <div>
    <div class="header">
      <h2 class="page-title">{{ typeLabel }}</h2>
      <div class="header-actions">
        <button v-if="!reorderMode" class="btn btn-outline" @click="enterReorder">{{ $t('contentList.reorder_mode') }}</button>
        <button class="btn" @click="$router.push(`/content/${type}/new`)"><Icon name="plus" :size="14" /> {{ $t('contentList.new') }}</button>
      </div>
    </div>

    <div v-if="reorderMode" class="reorder-bar">
      <Icon name="grip-vertical" :size="14" />
      <span>{{ $t('contentList.reorder_hint') }}</span>
      <button class="btn-sm btn-primary" @click="saveReorder" :disabled="reorderSaving">{{ reorderSaving ? '...' : $t('contentList.reorder_save') }}</button>
      <button class="btn-sm" @click="exitReorder">{{ $t('contentList.reorder_exit') }}</button>
    </div>

    <div v-if="!reorderMode" class="search-bar">
      <input v-model="searchQuery" @input="debounceSearch" :placeholder="$t('contentList.search_placeholder')" class="input" />
      <select v-model="statusFilter" @change="load" class="input select-sm">
        <option value="">{{ $t('contentList.all_status') }}</option>
        <option value="draft">{{ $t('contentList.status_draft') }}</option>
        <option value="scheduled">{{ $t('contentList.status_scheduled') }}</option>
        <option value="published">{{ $t('contentList.status_published') }}</option>
        <option value="archived">{{ $t('contentList.status_archived') }}</option>
      </select>
    </div>

    <div v-if="selected.length && !reorderMode" class="batch-bar">
      <span>{{ $t('contentList.selected_count', { n: selected.length }) }}</span>
      <button @click="batchAction('publish')" class="btn-sm btn-batch"><Icon name="upload-cloud" :size="12" /> {{ $t('contentList.batch_publish') }}</button>
      <button @click="batchAction('archive')" class="btn-sm btn-batch"><Icon name="package" :size="12" /> {{ $t('contentList.batch_archive') }}</button>
      <button @click="batchAction('delete')" class="btn-sm btn-batch-danger"><Icon name="trash" :size="12" /> {{ $t('contentList.batch_delete') }}</button>
      <button @click="selected = []" class="btn-sm">{{ $t('contentList.cancel') }}</button>
    </div>

    <table v-if="docs.length" class="table" :class="{ 'reorder-table': reorderMode }">
      <thead>
        <tr>
          <th v-if="!reorderMode" style="width:40px"><input type="checkbox" @change="toggleAll" :checked="allSelected" /></th>
          <th v-else style="width:36px"></th>
          <th>{{ $t('contentList.col_title') }}</th>
          <th>{{ $t('contentList.col_status') }}</th>
          <th>{{ $t('contentList.col_updated') }}</th>
          <th v-if="!reorderMode">{{ $t('contentList.col_actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(doc, i) in docs"
          :key="doc.id"
          :class="{
            selected: selected.includes(doc.id),
            'drag-over': reorderMode && dragOverIndex === i,
            dragging: reorderMode && dragIndex === i
          }"
          :draggable="reorderMode"
          @dragstart="onDragStart($event, i)"
          @dragover.prevent="onDragOver($event, i)"
          @dragleave="onDragLeave(i)"
          @drop="onDrop(i)"
          @dragend="onDragEnd"
        >
          <td v-if="!reorderMode"><input type="checkbox" :checked="selected.includes(doc.id)" @change="toggleSelect(doc.id)" /></td>
          <td v-else class="drag-handle" :title="$t('contentList.drag_handle')">
            <Icon name="grip-vertical" :size="14" />
          </td>
          <td>
            <a href="#" @click.prevent="reorderMode ? null : $router.push(`/content/${type}/${doc.id}`)">
              {{ doc.data.title || doc.data.name || $t('contentList.untitled') }}
            </a>
          </td>
          <td><span :class="`badge badge-${doc.status}`">{{ statusLabel(doc.status) }}</span></td>
          <td class="date">{{ fmtDate(doc.updatedAt) }}</td>
          <td v-if="!reorderMode">
            <button class="btn-sm" @click="$router.push(`/content/${type}/${doc.id}`)">{{ $t('contentList.edit') }}</button>
            <button class="btn-sm btn-danger" @click="remove(doc.id)">{{ $t('contentList.delete') }}</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else-if="!loading" class="empty">{{ $t('contentList.no_items', { type: typeLabel }) }}</p>
    <p v-else class="empty">{{ $t('contentList.loading') }}</p>

    <div v-if="totalPages > 1 && !reorderMode" class="pagination">
      <button :disabled="page <= 1" @click="goPage(page - 1)" class="btn-page">{{ $t('contentList.prev_page') }}</button>
      <span class="page-info">{{ $t('contentList.page_info', { page, totalPages, total }) }}</span>
      <button :disabled="page >= totalPages" @click="goPage(page + 1)" class="btn-page">{{ $t('contentList.next_page') }}</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { api } from '../api/index.js'
import { fmtDate, statusLabel, notifyError, notifySuccess } from '../utils/format.js'
import { useI18n } from '../i18n.js'
import Icon from '../components/Icon.vue'

const { t: $t } = useI18n()
const props = defineProps({ type: String, types: Array })
const docs = ref([])
const loading = ref(false)
const page = ref(1)
const total = ref(0)
const searchQuery = ref('')
const statusFilter = ref('')
const pageSize = 20
const selected = ref([])
let searchTimer = null

// Drag-and-drop reorder state
const reorderMode = ref(false)
const reorderSaving = ref(false)
const dragIndex = ref(-1)
const dragOverIndex = ref(-1)

const allSelected = computed(() => docs.value.length > 0 && selected.value.length === docs.value.length)

const typeLabel = computed(() => {
  const t = (props.types || []).find(t => t.name === props.type)
  return t ? t.label : props.type
})

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

async function load() {
  loading.value = true
  try {
    const params = { limit: pageSize, offset: (page.value - 1) * pageSize }
    if (searchQuery.value) params.search = searchQuery.value
    if (statusFilter.value) params.status = statusFilter.value
    const res = await api.list(props.type, params)
    docs.value = res.docs || []
    total.value = res.total || docs.value.length
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

function debounceSearch() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { page.value = 1; load() }, 300)
}

function goPage(p) {
  page.value = p
  load()
}

async function remove(id) {
  if (!confirm($t('contentList.delete_confirm'))) return
  try {
    await api.delete(props.type, id)
    load()
  } catch (e) {
    notifyError($t('contentList.delete'), e)
  }
}

function toggleSelect(id) {
  const i = selected.value.indexOf(id)
  if (i >= 0) selected.value.splice(i, 1)
  else selected.value.push(id)
}

function toggleAll(e) {
  selected.value = e.target.checked ? docs.value.map(d => d.id) : []
}

async function batchAction(action) {
  const actionLabels = {
    publish: $t('contentList.action_publish'),
    archive: $t('contentList.action_archive'),
    delete: $t('contentList.action_delete')
  }
  if (!confirm($t('contentList.batch_confirm', { action: actionLabels[action], n: selected.value.length }))) return
  try {
    await api.request(`/content/${props.type}/batch`, {
      method: 'POST',
      body: JSON.stringify({ action, ids: selected.value })
    })
    selected.value = []
    load()
  } catch (e) {
    notifyError($t('contentList.batch_error'), e)
  }
}

// ── Drag-and-Drop Reorder ──────────────────────────

function enterReorder() {
  reorderMode.value = true
  selected.value = []
  // Load all items for reorder (no pagination limit)
  loadAll()
}

async function loadAll() {
  loading.value = true
  try {
    const res = await api.list(props.type, { limit: 1000, orderBy: 'sort_order', order: 'asc' })
    docs.value = res.docs || []
    total.value = docs.value.length
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

function exitReorder() {
  reorderMode.value = false
  dragIndex.value = -1
  dragOverIndex.value = -1
  page.value = 1
  load()
}

function onDragStart(e, i) {
  dragIndex.value = i
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', String(i))
}

function onDragOver(e, i) {
  if (dragIndex.value === -1 || dragIndex.value === i) return
  e.dataTransfer.dropEffect = 'move'
  dragOverIndex.value = i
}

function onDragLeave(i) {
  if (dragOverIndex.value === i) dragOverIndex.value = -1
}

function onDrop(i) {
  if (dragIndex.value === -1 || dragIndex.value === i) return
  const arr = [...docs.value]
  const [moved] = arr.splice(dragIndex.value, 1)
  arr.splice(i, 0, moved)
  docs.value = arr
  dragIndex.value = -1
  dragOverIndex.value = -1
}

function onDragEnd() {
  dragIndex.value = -1
  dragOverIndex.value = -1
}

async function saveReorder() {
  reorderSaving.value = true
  try {
    const ids = docs.value.map(d => d.id)
    await api.reorderContent(props.type, ids)
    notifySuccess($t('contentList.reorder_saved'))
    exitReorder()
  } catch (e) {
    notifyError($t('contentList.reorder_mode'), e)
  } finally {
    reorderSaving.value = false
  }
}

onMounted(load)
watch(() => props.type, () => { page.value = 1; load() })
</script>

<style scoped>
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.header-actions { display: flex; gap: 8px; align-items: center; }
.page-title { font-size: 22px; }
.btn {
  padding: 8px 20px; background: var(--primary); color: white; border: none;
  border-radius: var(--radius); font-size: 14px; cursor: pointer; font-weight: 600;
}
.btn:hover { background: var(--primary-dark); }
.btn-outline {
  background: transparent; color: var(--primary); border: 1px solid var(--primary);
}
.btn-outline:hover { background: var(--primary-bg); }
.table { width: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); border-collapse: collapse; }
.table th, .table td { padding: 10px 16px; text-align: left; font-size: 14px; border-bottom: 1px solid var(--border); }
.table th { font-weight: 600; color: var(--text-secondary); background: var(--bg); }
.table a { color: var(--primary); text-decoration: none; }
tr.selected { background: var(--primary-bg); }

.reorder-table tr { cursor: grab; transition: background 0.15s; }
.reorder-table tr:active { cursor: grabbing; }
.reorder-table tr.dragging { opacity: 0.4; background: var(--primary-bg); }
.reorder-table tr.drag-over { border-top: 2px solid var(--primary); }
.drag-handle { color: var(--text-muted); text-align: center; cursor: grab; padding: 10px 4px !important; width: 36px; }

.reorder-bar {
  display: flex; align-items: center; gap: 10px; padding: 10px 16px;
  background: var(--primary-bg); border: 1px solid var(--primary); border-radius: 8px; margin-bottom: 12px;
  font-size: 13px; color: var(--text-secondary);
}
.btn-primary { color: white; background: var(--primary); border-color: var(--primary); }
.btn-primary:hover:not(:disabled) { background: var(--primary-dark); }
.btn-primary:disabled { opacity: 0.6; cursor: default; }

.batch-bar {
  display: flex; align-items: center; gap: 8px; padding: 10px 16px;
  background: var(--primary-bg); border: 1px solid var(--primary); border-radius: 8px; margin-bottom: 12px;
  font-size: 13px; color: var(--text-secondary);
}
.btn-batch { color: #065F46; border-color: #10B981; background: #D1FAE5; }
.btn-batch:hover { background: #A7F3D0; }
.btn-batch-danger { color: #991B1B; border-color: #FCA5A5; background: #FEE2E2; }
.btn-batch-danger:hover { background: #FECACA; }
.badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
.badge-published { background: var(--badge-published-bg, #D1FAE5); color: var(--badge-published-color, #065F46); }
.badge-draft { background: var(--badge-draft-bg, #FEF3C7); color: var(--badge-draft-color, #92400E); }
.badge-archived { background: var(--badge-archived-bg, #F3F4F6); color: var(--badge-archived-color, #6B7280); }
.badge-active { background: var(--badge-published-bg, #D1FAE5); color: var(--badge-published-color, #065F46); }
.badge-revoked { background: var(--badge-danger-bg, #FEE2E2); color: var(--badge-danger-color, #991B1B); }
.badge-scheduled { background: var(--badge-scheduled-bg, #DBEAFE); color: var(--badge-scheduled-color, #1E40AF); }
.date { color: var(--text-secondary); font-size: 13px; }
.btn-sm { padding: 4px 12px; font-size: 12px; border: 1px solid var(--border); background: var(--surface); border-radius: 4px; cursor: pointer; margin-right: 4px; }
.btn-sm:hover { border-color: var(--primary); }
.btn-danger { color: var(--danger); }
.btn-danger:hover { border-color: var(--danger); background: var(--danger-bg); }
.empty { color: var(--text-secondary); font-size: 14px; margin-top: 40px; text-align: center; }

.search-bar { display: flex; gap: 12px; margin-bottom: 16px; align-items: center; }
.input {
  padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius);
  font-size: 14px; color: var(--text-primary); background: var(--surface);
}
.select-sm { max-width: 130px; }

.pagination { display: flex; justify-content: center; align-items: center; gap: 16px; margin-top: 24px; padding: 16px; }
.btn-page {
  padding: 6px 16px; background: var(--surface); border: 1px solid var(--border);
  border-radius: 6px; font-size: 13px; cursor: pointer; color: var(--text-secondary);
}
.btn-page:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
.btn-page:disabled { opacity: 0.4; cursor: default; }
.page-info { font-size: 13px; color: var(--text-muted); }
</style>
