<template>
  <div>
    <h1 class="page-title">✅ 审核队列</h1>
    <div v-if="loading" class="loading">加载中...</div>
    <div v-if="items.length" class="table-wrap">
      <table>
        <thead><tr><th>标题</th><th>类型</th><th>状态</th><th>请求时间</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="item in items" :key="item.id">
            <td>{{ item.data?.title || item.id }}</td>
            <td>{{ item.type }}</td>
            <td><span :class="'tag tag-' + (item.data?.workflowState || item.status)">{{ item.data?.workflowState || item.status }}</span></td>
            <td>{{ fmtTime(item.data?.reviewRequestedAt) }}</td>
            <td class="actions">
              <button @click="approve(item)" class="btn-sm btn-green">✓ 通过</button>
              <button @click="rejectPrompt(item)" class="btn-sm btn-red">✗ 驳回</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else class="empty">暂无待审核内容</div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api/index.js'

const loading = ref(true)
const items = ref([])

onMounted(load)
async function load() {
  try {
    const res = await api.listContent('article', { limit: 100 })
    items.value = (res.docs || []).filter(d => d.data?.workflowState === 'pending_review')
  } catch (e) { console.error(e) }
  loading.value = false
}

async function approve(item) {
  try {
    await fetch(`/api/workflow/approve/${item.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('taichu_token')}` },
      body: JSON.stringify({ comment: 'Approved' })
    })
    await load()
  } catch (e) { alert('操作失败: ' + e.message) }
}

async function rejectPrompt(item) {
  const reason = prompt('驳回原因：')
  if (!reason) return
  try {
    await fetch(`/api/workflow/reject/${item.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('taichu_token')}` },
      body: JSON.stringify({ reason })
    })
    await load()
  } catch (e) { alert('操作失败: ' + e.message) }
}

function fmtTime(t) { return t ? new Date(t).toLocaleString('zh-CN') : '-' }
</script>

<style scoped>
.page-title { font-size: 24px; margin-bottom: 16px; }
.table-wrap { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { padding: 10px 16px; text-align: left; border-bottom: 1px solid var(--border); }
th { font-weight: 600; color: var(--text-secondary); background: var(--bg); }
.tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.tag-pending_review { background: var(--badge-draft-bg, #FEF3C7); color: var(--badge-draft-color, #92400E); }
.tag-published, .tag-approved { background: var(--badge-published-bg, #DCFCE7); color: var(--badge-published-color, #166534); }
.tag-rejected { background: var(--badge-danger-bg, #FEE2E2); color: var(--badge-danger-color, #991B1B); }
.actions { display: flex; gap: 6px; }
.btn-sm { padding: 4px 12px; border: none; border-radius: 4px; font-size: 12px; cursor: pointer; }
.btn-green { background: #10B981; color: #fff; }
.btn-red { background: #EF4444; color: #fff; }
.empty { padding: 32px; text-align: center; color: var(--text-muted); }
</style>
