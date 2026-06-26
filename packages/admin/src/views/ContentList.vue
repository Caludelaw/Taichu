<template>
  <div>
    <div class="header">
      <h2 class="page-title">{{ typeLabel }}</h2>
      <button class="btn" @click="$router.push(`/content/${type}/new`)">+ 新建</button>
    </div>

    <div class="search-bar">
      <input v-model="searchQuery" @input="debounceSearch" placeholder="搜索标题..." class="input" />
      <select v-model="statusFilter" @change="load" class="input select-sm">
        <option value="">全部状态</option>
        <option value="draft">草稿</option>
        <option value="scheduled">定时</option>
        <option value="published">已发布</option>
        <option value="archived">已归档</option>
      </select>
    </div>

    <div v-if="selected.length" class="batch-bar">
      <span>已选 {{ selected.length }} 项</span>
      <button @click="batchAction('publish')" class="btn-sm btn-batch">📤 批量发布</button>
      <button @click="batchAction('archive')" class="btn-sm btn-batch">📦 批量归档</button>
      <button @click="batchAction('delete')" class="btn-sm btn-batch-danger">🗑️ 批量删除</button>
      <button @click="selected = []" class="btn-sm">取消</button>
    </div>

    <table v-if="docs.length" class="table">
      <thead>
        <tr>
          <th style="width:40px"><input type="checkbox" @change="toggleAll" :checked="allSelected" /></th>
          <th>标题</th>
          <th>状态</th>
          <th>更新时间</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="doc in docs" :key="doc.id" :class="{ selected: selected.includes(doc.id) }">
          <td><input type="checkbox" :checked="selected.includes(doc.id)" @change="toggleSelect(doc.id)" /></td>
          <td>
            <a href="#" @click.prevent="$router.push(`/content/${type}/${doc.id}`)">
              {{ doc.data.title || doc.data.name || '(无标题)' }}
            </a>
          </td>
          <td><span :class="`badge badge-${doc.status}`">{{ statusLabel(doc.status) }}</span></td>
          <td class="date">{{ fmtDate(doc.updatedAt) }}</td>
          <td>
            <button class="btn-sm" @click="$router.push(`/content/${type}/${doc.id}`)">编辑</button>
            <button class="btn-sm btn-danger" @click="remove(doc.id)">删除</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else-if="!loading" class="empty">暂无{{ typeLabel }}内容</p>
    <p v-else class="empty">加载中...</p>

    <div v-if="totalPages > 1" class="pagination">
      <button :disabled="page <= 1" @click="goPage(page - 1)" class="btn-page">‹ 上一页</button>
      <span class="page-info">第 {{ page }} / {{ totalPages }} 页 (共 {{ total }} 条)</span>
      <button :disabled="page >= totalPages" @click="goPage(page + 1)" class="btn-page">下一页 ›</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { api } from '../api/index.js'
import { fmtDate, statusLabel, notifyError } from '../utils/format.js'

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
  if (!confirm('确认删除？')) return
  try {
    await api.delete(props.type, id)
    load()
  } catch (e) {
    notifyError('删除', e)
  }
}

// fmtDate, statusLabel, notifyError — from ../utils/format.js

function toggleSelect(id) {
  const i = selected.value.indexOf(id)
  if (i >= 0) selected.value.splice(i, 1)
  else selected.value.push(id)
}

function toggleAll(e) {
  selected.value = e.target.checked ? docs.value.map(d => d.id) : []
}

async function batchAction(action) {
  const label = { publish: '发布', archive: '归档', delete: '删除' }
  if (!confirm(`确定批量${label[action]} ${selected.value.length} 条内容？`)) return
  try {
    await api.request(`/content/${props.type}/batch`, {
      method: 'POST',
      body: JSON.stringify({ action, ids: selected.value })
    })
    selected.value = []
    load()
  } catch (e) {
    notifyError('批量操作', e)
  }
}

onMounted(load)
watch(() => props.type, () => { page.value = 1; load() })
</script>

<style scoped>
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-title { font-size: 22px; }
.btn {
  padding: 8px 20px; background: var(--primary); color: white; border: none;
  border-radius: var(--radius); font-size: 14px; cursor: pointer; font-weight: 600;
}
.btn:hover { background: var(--primary-dark); }
.table { width: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); border-collapse: collapse; }
.table th, .table td { padding: 10px 16px; text-align: left; font-size: 14px; border-bottom: 1px solid var(--border); }
.table th { font-weight: 600; color: var(--text-secondary); background: var(--bg); }
.table a { color: var(--primary); text-decoration: none; }
tr.selected { background: var(--primary-bg); }

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
