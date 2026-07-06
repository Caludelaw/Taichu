<template>
  <div>
    <div class="header">
      <h1 class="page-title">{{ $t('comments.title') }}</h1>
      <div class="search-bar">
        <select v-model="statusFilter" @change="load" class="input select-sm">
          <option value="">{{ $t('common.all') }}</option>
          <option value="pending">{{ $t('comments.status_pending') }}</option>
          <option value="approved">{{ $t('comments.status_approved') }}</option>
          <option value="spam">{{ $t('comments.status_spam') }}</option>
        </select>
      </div>
    </div>

    <table v-if="comments.length" class="table">
      <thead>
        <tr>
          <th style="width:180px">{{ $t('comments.author') }}</th>
          <th>{{ $t('comments.content') }}</th>
          <th style="width:80px">{{ $t('comments.post') }}</th>
          <th style="width:80px">{{ $t('comments.status') }}</th>
          <th style="width:100px">{{ $t('comments.time') }}</th>
          <th style="width:160px">{{ $t('comments.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="c in comments" :key="c.id" :class="{ pending: c.data?.status === 'pending' }">
          <td>
            <strong>{{ c.data?.author || $t('comments.anonymous') }}</strong>
            <div style="font-size:11px;color:var(--text-muted)">{{ c.data?.email || '' }}</div>
          </td>
          <td><div class="comment-body">{{ c.data?.body }}</div></td>
          <td>
            <a v-if="c.data?.postId" :href="`/post/${c.data.postId}`" target="_blank" class="post-link">
              <Icon name="link" :size="12" /> {{ $t('comments.view') }}
            </a>
          </td>
          <td><span :class="`badge badge-${statusBadge(c.data?.status)}`">{{ statusLabel(c.data?.status) }}</span></td>
          <td class="date-col">{{ fmtDate(c.createdAt, 'date') }}</td>
          <td>
            <button v-if="c.data?.status === 'pending'" @click="approve(c.id)" class="btn-sm" style="color:#065F46"><Icon name="check-small" :size="12" /> {{ $t('comments.approve') }}</button>
            <button v-if="c.data?.status !== 'spam'" @click="markSpam(c.id)" class="btn-sm"><Icon name="ban" :size="12" /> {{ $t('comments.spam') }}</button>
            <button @click="remove(c.id)" class="btn-sm btn-danger">{{ $t('common.status_archived') }}</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else class="empty">{{ $t('comments.no_items') }}</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api/index.js'
import { fmtDate, notifyError } from '../utils/format.js'
import { useI18n } from '../i18n.js'
import Icon from '../components/Icon.vue'

const { t: $t, statusLabel } = useI18n()
const comments = ref([])
const statusFilter = ref('pending')

async function load() {
  try {
    const { docs } = await api.listContent('comment', { limit: 200, status: statusFilter.value || undefined })
    comments.value = (docs || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  } catch (e) {
    console.error(e)
  }
}

async function approve(id) {
  try {
    await api.updateContent('comment', id, { data: { status: 'approved' } })
    load()
  } catch (e) { notifyError($t('comments.approve_error'), e) }
}

async function markSpam(id) {
  try {
    await api.updateContent('comment', id, { data: { status: 'spam' } })
    load()
  } catch (e) { notifyError($t('comments.spam_error'), e) }
}

async function remove(id) {
  if (!confirm($t('contentList.delete_confirm'))) return
  try {
    await api.deleteContent('comment', id)
    load()
  } catch (e) { notifyError($t('comments.status_spam'), e) }
}

function statusBadge(s) {
  const map = { pending: 'scheduled', approved: 'published', spam: 'archived' }
  return map[s] || 'archived'
}

onMounted(load)
</script>

<style scoped>
tr.pending { background: #FFFBEB; }
.comment-body { max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.post-link { font-size: 12px; color: var(--primary); text-decoration: none; }
</style>
