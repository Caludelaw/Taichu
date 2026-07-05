<template>
  <div>
    <div class="header">
      <h2 class="page-title">{{ $t('tags.title') }}</h2>
      <button class="btn" @click="showEdit(null)">{{ $t('tags.new') }}</button>
    </div>

    <table v-if="tags.length" class="table">
      <thead><tr><th>{{ $t('tags.name') }}</th><th>{{ $t('tags.slug') }}</th><th>{{ $t('tags.content_count') }}</th><th>{{ $t('contentList.col_actions') }}</th></tr></thead>
      <tbody>
        <tr v-for="t in tags" :key="t.id">
          <td><strong>{{ t.data?.name || t.id }}</strong></td>
          <td><code>{{ t.data?.slug }}</code></td>
          <td>{{ t.count || 0 }}</td>
          <td>
            <button class="btn-sm" @click="showEdit(t)">{{ $t('tags.edit') }}</button>
            <button class="btn-sm btn-danger" @click="remove(t.id)">{{ $t('tags.delete') }}</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else class="empty">{{ $t('tags.no_items') }}</p>

    <div v-if="editing" class="modal-overlay" @click.self="editing = null">
      <div class="modal-card">
        <h3>{{ editingTag && editingTag.id ? $t('tags.edit') : $t('tags.new') }}</h3>
        <div class="form-group">
          <label>{{ $t('tags.name') }}</label>
          <input v-model="form.name" class="input" />
        </div>
        <div class="form-group">
          <label>{{ $t('tags.slug') }}</label>
          <input v-model="form.slug" class="input" />
        </div>
        <div class="modal-actions">
          <button class="btn" @click="saveTag">{{ $t('common.save') }}</button>
          <button class="btn btn-cancel" @click="editing = null">{{ $t('common.cancel') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api/index.js'
import { notifyError } from '../utils/format.js'
import { useI18n } from '../i18n.js'

const { t: $t } = useI18n()
const tags = ref([])
const editing = ref(null)
const editingTag = ref(null)
const form = ref({ name: '', slug: '' })

async function load() {
  try {
    const { docs } = await api.listContent('tag', { limit: 200 })
    tags.value = (docs || []).sort((a, b) => (a.data?.name || '').localeCompare(b.data?.name || ''))
  } catch (e) { console.error(e) }
}

function showEdit(t) {
  editingTag.value = t
  form.value = t ? { name: t.data?.name || '', slug: t.data?.slug || '' } : { name: '', slug: '' }
  editing.value = true
}

async function saveTag() {
  try {
    if (editingTag.value?.id) {
      await api.updateContent('tag', editingTag.value.id, { data: { ...editingTag.value.data, ...form.value } })
    } else {
      await api.create('tag', form.value)
    }
    editing.value = null
    load()
  } catch (e) { notifyError($t('tags.save_error'), e) }
}

async function remove(id) {
  if (!confirm($t('tags.delete_confirm'))) return
  try {
    await api.deleteContent('tag', id)
    load()
  } catch (e) { notifyError($t('tags.delete'), e) }
}

onMounted(load)
</script>

<style scoped>
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-title { font-size: 22px; }
.btn { padding: 8px 20px; background: var(--primary); color: white; border: none; border-radius: var(--radius); font-size: 14px; cursor: pointer; font-weight: 600; }
.btn-cancel { background: var(--bg); color: var(--text-primary); border: 1px solid var(--border); }
.table { width: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); border-collapse: collapse; }
.table th, .table td { padding: 10px 16px; text-align: left; font-size: 14px; border-bottom: 1px solid var(--border); }
.table th { font-weight: 600; color: var(--text-secondary); background: var(--bg); }
.btn-sm { padding: 4px 12px; font-size: 12px; border: 1px solid var(--border); background: var(--surface); border-radius: 4px; cursor: pointer; margin-right: 4px; }
.btn-danger { color: var(--danger); }
.empty { color: var(--text-secondary); font-size: 14px; margin-top: 40px; text-align: center; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1000; display: flex; align-items: center; justify-content: center; }
.modal-card { background: var(--surface); border-radius: 12px; padding: 24px; width: 400px; max-width: 90vw; }
.modal-card h3 { font-size: 18px; margin-bottom: 16px; }
.form-group { margin-bottom: 12px; }
.form-group label { display: block; font-size: 13px; color: var(--text-secondary); margin-bottom: 4px; }
.input { width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; font-size: 14px; background: var(--bg); color: var(--text-primary); }
.modal-actions { display: flex; gap: 8px; margin-top: 16px; }
</style>
