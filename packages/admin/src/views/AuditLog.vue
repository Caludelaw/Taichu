<template>
  <div>
    <h1 class="page-title">📋 审计日志</h1>
    <div class="toolbar">
      <select v-model="filter.action" @change="load" class="input" style="width:160px">
        <option value="">全部操作</option>
        <option value="create">创建</option>
        <option value="update">更新</option>
        <option value="delete">删除</option>
        <option value="publish">发布</option>
        <option value="review_requested">请求审核</option>
        <option value="approved">已批准</option>
        <option value="rejected">已驳回</option>
      </select>
      <button @click="load" class="btn">刷新</button>
    </div>

    <div class="table-wrap">
      <table>
        <thead><tr><th>时间</th><th>操作</th><th>操作者</th><th>资源</th><th>详情</th></tr></thead>
        <tbody>
          <tr v-for="e in entries" :key="e.id">
            <td class="time">{{ fmtTime(e.createdAt) }}</td>
            <td><span :class="'tag tag-' + e.action">{{ e.action }}</span></td>
            <td>{{ e.actorType === 'agent' ? '🤖' : '👤' }} {{ e.actorId?.substring(0, 12) }}</td>
            <td>{{ e.resourceType }}/{{ e.resourceId?.substring(0, 8) }}</td>
            <td>{{ e.detail?.title || '-' }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="!entries.length" class="empty">暂无审计日志</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api/index.js'

const entries = ref([])
const filter = ref({ action: '' })

onMounted(load)
async function load() {
  try {
    const res = await api.getAuditLog(filter.value.action ? { action: filter.value.action } : {})
    entries.value = res.entries || []
  } catch (e) { console.error(e) }
}
function fmtTime(t) { return t ? new Date(t).toLocaleString('zh-CN') : '' }
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
