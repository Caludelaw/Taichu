<template>
  <div>
    <div class="header">
      <h2 class="page-title">{{ $t('categories.title') }}</h2>
      <button class="btn" @click="showEdit(null)">{{ $t('categories.new') }}</button>
    </div>

    <table v-if="categories.length" class="table">
      <thead><tr><th>{{ $t('categories.name') }}</th><th>{{ $t('categories.description') }}</th><th>{{ $t('categories.parent') }}</th><th>{{ $t('contentList.col_actions') }}</th></tr></thead>
      <tbody>
        <tr v-for="c in categories" :key="c.id">
          <td><strong>{{ c.data?.name || c.id }}</strong></td>
          <td>{{ c.data?.description || '-' }}</td>
          <td>{{ c.data?.parentId ? (categories.find(x => x.id === c.data.parentId)?.data?.name || c.data.parentId) : '-' }}</td>
          <td>
            <button class="btn-sm" @click="showEdit(c)">{{ $t('categories.edit') }}</button>
            <button class="btn-sm btn-danger" @click="remove(c.id)">{{ $t('categories.delete') }}</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else class="empty">{{ $t('categories.no_items') }}</p>

    <div v-if="editing" class="modal-overlay" @click.self="editing = null">
      <div class="modal-card">
        <h3>{{ editingCat && editingCat.id ? $t('categories.edit') : $t('categories.new') }}</h3>
        <div class="form-group">
          <label>{{ $t('categories.name') }}</label>
          <input v-model="form.name" class="input" />
        </div>
        <div class="form-group">
          <label>{{ $t('categories.description') }}</label>
          <input v-model="form.description" class="input" />
        </div>
        <div class="form-group">
          <label>{{ $t('categories.parent') }}</label>
          <select v-model="form.parentId" class="input">
            <option value="">{{ $t('categories.none_top') }}</option>
            <option v-for="c in categories" v-if="c.id !== editingCat?.id" :key="c.id" :value="c.id">{{ c.data?.name }}</option>
          </select>
        </div>
        <div class="modal-actions">
          <button class="btn" @click="saveCat">{{ $t('common.save') }}</button>
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
const categories = ref([])
const editing = ref(null)
const editingCat = ref(null)
const form = ref({ name: '', description: '', parentId: '' })

async function load() {
  try {
    const { docs } = await api.listContent('category', { limit: 200 })
    categories.value = (docs || []).sort((a, b) => (a.data?.name || '').localeCompare(b.data?.name || ''))
  } catch (e) { console.error(e) }
}

function showEdit(c) {
  editingCat.value = c
  form.value = c ? { name: c.data?.name || '', description: c.data?.description || '', parentId: c.data?.parentId || '' } : { name: '', description: '', parentId: '' }
  editing.value = true
}

async function saveCat() {
  try {
    if (editingCat.value?.id) {
      await api.updateContent('category', editingCat.value.id, { data: { ...editingCat.value.data, ...form.value } })
    } else {
      await api.create('category', form.value)
    }
    editing.value = null
    load()
  } catch (e) { notifyError($t('categories.save_error'), e) }
}

async function remove(id) {
  if (!confirm($t('categories.delete_confirm'))) return
  try {
    await api.deleteContent('category', id)
    load()
  } catch (e) { notifyError($t('categories.delete'), e) }
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
