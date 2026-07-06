<template>
  <div>
    <h2 class="page-title">{{ $t('workflow.title') }}</h2>

    <table v-if="items.length" class="table">
      <thead><tr><th>{{ $t('contentList.col_title') }}</th><th>{{ $t('audit.col_actor') }}</th><th>{{ $t('contentList.col_actions') }}</th></tr></thead>
      <tbody>
        <tr v-for="item in items" :key="item.id">
          <td>{{ item.data?.title || item.id }}</td>
          <td>{{ item.data?.author || '-' }}</td>
          <td>
            <button class="btn-sm" style="color:#065F46" @click="action(item.id, 'approve')"><Icon name="check-small" :size="12" /> {{ $t('workflow.approve') }}</button>
            <button class="btn-sm btn-danger" @click="action(item.id, 'reject')"><Icon name="x-small" :size="12" /> {{ $t('workflow.reject') }}</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else class="empty">{{ $t('workflow.no_items') }}</p>
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

async function load() {
  try {
    const { docs } = await api.listContent('article', { limit: 200, status: 'pending' })
    items.value = docs || []
  } catch (e) { console.error(e) }
}

async function action(id, type) {
  try {
    await api.updateContent('article', id, { status: type === 'approve' ? 'published' : 'draft' })
    load()
  } catch (e) { notifyError(type === 'approve' ? $t('workflow.approve_error') : $t('workflow.reject_error'), e) }
}

onMounted(load)
</script>
