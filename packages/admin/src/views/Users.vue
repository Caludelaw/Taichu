<template>
  <div>
    <div class="header">
      <h1 class="page-title">{{ $t('users.title') }}</h1>
      <span class="page-info">{{ $t('users.count', { n: users.length }) }}</span>
    </div>

    <table v-if="users.length" class="table">
      <thead>
        <tr>
          <th>{{ $t('users.col_username') }}</th>
          <th>{{ $t('users.col_email') }}</th>
          <th style="width:100px">{{ $t('users.col_role') }}</th>
          <th>{{ $t('users.col_registered') }}</th>
          <th>{{ $t('users.col_status') }}</th>
          <th style="width:200px">{{ $t('users.col_actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="u in users" :key="u.id">
          <td><strong>{{ u.data?.displayName || u.data?.username || u.id }}</strong></td>
          <td>{{ u.data?.email || '-' }}</td>
          <td>
            <select v-model="u.data.role" @change="updateRole(u)" class="role-select">
              <option value="admin">{{ $t('users.role_admin') }}</option>
              <option value="editor">{{ $t('users.role_editor') }}</option>
              <option value="user">{{ $t('users.role_user') }}</option>
            </select>
          </td>
          <td class="date-col">{{ fmtDate(u.createdAt, 'date') }}</td>
          <td>
            <span :class="`badge ${u.status === 'active' ? 'badge-published' : 'badge-archived'}`">
              {{ u.status === 'active' ? $t('users.status_active') : $t('users.status_disabled') }}
            </span>
          </td>
          <td>
            <button @click="toggleUser(u)" class="btn-sm">
              {{ u.status === 'active' ? $t('users.disable') : $t('users.enable') }}
            </button>
            <button @click="resetPassword(u)" class="btn-sm" :title="$t('users.reset_error')">{{ $t('users.reset_password') }}</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else class="empty">{{ $t('users.no_users') }}</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api/index.js'
import { fmtDate, notifyError } from '../utils/format.js'
import { useI18n } from '../i18n.js'

const { t: $t } = useI18n()
const users = ref([])

onMounted(async () => {
  try {
    const { docs } = await api.listContent('user', { limit: 200 })
    users.value = (docs || []).map(u => ({
      ...u,
      data: { ...u.data, role: u.data?.role || 'user' }
    }))
  } catch (e) { console.error(e) }
})

async function toggleUser(u) {
  const newStatus = u.status === 'active' ? 'archived' : 'active'
  try {
    await api.updateContent('user', u.id, { status: newStatus })
    u.status = newStatus
  } catch (e) { notifyError($t('users.action_error'), e) }
}

async function updateRole(u) {
  try {
    await api.updateContent('user', u.id, { data: { ...u.data, role: u.data.role } })
  } catch (e) { notifyError($t('users.role_error'), e) }
}

function resetPassword(u) {
  const email = u.data?.email
  if (!email) { notifyError($t('users.reset_error'), $t('users.no_email')); return }
  if (!confirm($t('users.reset_confirm', { name: u.data?.username }))) return
  notifyError($t('users.reset_error'), $t('users.reset_unavailable'))
}
</script>

<style scoped>
.role-select {
  padding: 4px 8px; border: 1px solid var(--border); border-radius: 4px;
  font-size: 12px; background: var(--surface); color: var(--text-primary); cursor: pointer;
}
</style>
