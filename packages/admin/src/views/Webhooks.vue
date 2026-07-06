<template>
  <div>
    <div class="header">
      <h2 class="page-title">{{ $t('webhooks.title') }}</h2>
      <button class="btn" @click="showCreate = true">{{ $t('webhooks.new') }}</button>
    </div>

    <div v-if="showCreate" class="create-box">
      <input v-model="form.url" placeholder="https://..." class="input" />
      <input v-model="form.events" placeholder="content.created,content.updated" class="input" />
      <div class="create-actions">
        <button class="btn" @click="create">{{ $t('common.save') }}</button>
        <button class="btn btn-cancel" @click="showCreate = false">{{ $t('common.cancel') }}</button>
      </div>
    </div>

    <table v-if="webhooks.length" class="table">
      <thead><tr><th>{{ $t('webhooks.url') }}</th><th>{{ $t('webhooks.events') }}</th><th>{{ $t('webhooks.status') }}</th><th>{{ $t('webhooks.actions') }}</th></tr></thead>
      <tbody>
        <tr v-for="w in webhooks" :key="w.id">
          <td><code>{{ w.url }}</code></td>
          <td>{{ (w.events || []).join(', ') }}</td>
          <td><span v-if="w.active"><Icon name="check-circle" :size="12" /> {{ $t('webhooks.active') }}</span><span v-else><Icon name="x-circle" :size="12" /> {{ $t('webhooks.inactive') }}</span></td>
          <td>
            <button class="btn-sm btn-danger" @click="remove(w.id)">{{ $t('webhooks.delete') }}</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else class="empty">{{ $t('webhooks.no_items') }}</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api/index.js'
import { notifyError } from '../utils/format.js'
import { useI18n } from '../i18n.js'
import Icon from '../components/Icon.vue'

const { t: $t } = useI18n()
const webhooks = ref([])
const showCreate = ref(false)
const form = ref({ url: '', events: '' })

async function load() {
  try {
    const { docs } = await api.listContent('webhook', { limit: 200 })
    webhooks.value = docs || []
  } catch (e) { console.error(e) }
}

async function create() {
  try {
    await api.create('webhook', { url: form.value.url, events: form.value.events.split(',').map(s => s.trim()).filter(Boolean), active: true })
    showCreate.value = false
    form.value = { url: '', events: '' }
    load()
  } catch (e) { notifyError($t('webhooks.save_error'), e) }
}

async function remove(id) {
  if (!confirm($t('webhooks.delete_confirm'))) return
  try {
    await api.deleteContent('webhook', id)
    load()
  } catch (e) { notifyError($t('webhooks.delete'), e) }
}

onMounted(load)
</script>

<style scoped>
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-title { font-size: 22px; }
.btn { padding: 8px 20px; background: var(--primary); color: white; border: none; border-radius: var(--radius); font-size: 14px; cursor: pointer; font-weight: 600; }
.btn-cancel { background: var(--bg); color: var(--text-primary); border: 1px solid var(--border); }
.create-box { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; margin-bottom: 20px; }
.input { width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; font-size: 14px; background: var(--bg); color: var(--text-primary); margin-bottom: 8px; }
.create-actions { display: flex; gap: 8px; }
.table { width: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); border-collapse: collapse; }
.table th, .table td { padding: 10px 16px; text-align: left; font-size: 14px; border-bottom: 1px solid var(--border); }
.table th { font-weight: 600; color: var(--text-secondary); background: var(--bg); }
.btn-sm { padding: 4px 12px; font-size: 12px; border: 1px solid var(--border); background: var(--surface); border-radius: 4px; cursor: pointer; }
.btn-danger { color: var(--danger); }
.empty { color: var(--text-secondary); font-size: 14px; margin-top: 40px; text-align: center; }
</style>
