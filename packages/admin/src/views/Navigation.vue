<template>
  <div>
    <div class="header">
      <h2 class="page-title"><Icon name="compass" :size="18" /> {{ $t('navigation_menu.title') }}</h2>
      <button class="btn" @click="showEdit(null)">{{ $t('navigation_menu.new') }}</button>
    </div>

    <table v-if="items.length" class="table">
      <thead><tr><th>{{ $t('navigation_menu.label') }}</th><th>{{ $t('navigation_menu.url') }}</th><th>{{ $t('navigation_menu.order') }}</th><th>{{ $t('navigation_menu.target') }}</th><th>{{ $t('contentList.col_actions') }}</th></tr></thead>
      <tbody>
        <tr v-for="item in items" :key="item.id">
          <td><strong>{{ item.data?.label || item.id }}</strong></td>
          <td><code>{{ item.data?.url }}</code></td>
          <td>{{ item.data?.order }}</td>
          <td>{{ item.data?.target === '_blank' ? $t('navigation_menu.target_blank') : $t('navigation_menu.target_self') }}</td>
          <td>
            <button class="btn-sm" @click="showEdit(item)">{{ $t('navigation_menu.edit') }}</button>
            <button class="btn-sm btn-danger" @click="remove(item.id)">{{ $t('navigation_menu.delete') }}</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else class="empty">{{ $t('navigation_menu.no_items') }}</p>

    <div v-if="editing" class="modal-overlay" @click.self="editing = null">
      <div class="modal-card">
        <h3>{{ editingItem && editingItem.id ? $t('navigation_menu.edit') : $t('navigation_menu.new') }}</h3>
        <div class="form-group">
          <label>{{ $t('navigation_menu.label') }}</label>
          <input v-model="form.label" class="input" />
        </div>
        <div class="form-group">
          <label>{{ $t('navigation_menu.url') }}</label>
          <input v-model="form.url" class="input" />
        </div>
        <div class="form-group">
          <label>{{ $t('navigation_menu.order') }}</label>
          <input v-model.number="form.order" type="number" class="input" />
        </div>
        <div class="form-group">
          <label>{{ $t('navigation_menu.target') }}</label>
          <select v-model="form.target" class="input">
            <option value="_self">{{ $t('navigation_menu.target_self') }}</option>
            <option value="_blank">{{ $t('navigation_menu.target_blank') }}</option>
          </select>
        </div>
        <div class="modal-actions">
          <button class="btn" @click="saveItem">{{ $t('common.save') }}</button>
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
import Icon from '../components/Icon.vue'

const { t: $t } = useI18n()
const items = ref([])
const editing = ref(null)
const editingItem = ref(null)
const form = ref({ label: '', url: '', order: 0, target: '_self' })

async function load() {
  try {
    const { docs } = await api.listContent('navigation', { limit: 200 })
    items.value = (docs || []).sort((a, b) => (a.data?.order || 0) - (b.data?.order || 0))
  } catch (e) { console.error(e) }
}

function showEdit(item) {
  editingItem.value = item
  form.value = item ? { label: item.data?.label || '', url: item.data?.url || '', order: item.data?.order || 0, target: item.data?.target || '_self' } : { label: '', url: '', order: items.value.length, target: '_self' }
  editing.value = true
}

async function saveItem() {
  try {
    if (editingItem.value?.id) {
      await api.updateContent('navigation', editingItem.value.id, { data: { ...editingItem.value.data, ...form.value } })
    } else {
      await api.create('navigation', form.value)
    }
    editing.value = null
    load()
  } catch (e) { notifyError($t('navigation_menu.save_error'), e) }
}

async function remove(id) {
  if (!confirm($t('navigation_menu.delete_confirm'))) return
  try {
    await api.deleteContent('navigation', id)
    load()
  } catch (e) { notifyError($t('navigation_menu.delete'), e) }
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
