<template>
  <div>
    <div class="header">
      <h2 class="page-title">{{ $t('apikeys.title') }}</h2>
      <button class="btn" @click="showCreate = true">{{ $t('apikeys.generate') }}</button>
    </div>

    <div v-if="showCreate" class="create-box">
      <input v-model="newLabel" :placeholder="$t('apikeys.label')" />
      <div class="scope-section">
        <label class="scope-label">{{ $t('apikeys.scopes') }}:</label>
        <div class="scope-grid">
          <label v-for="s in availableScopes" :key="s.value" class="scope-chip">
            <input type="checkbox" :value="s.value" v-model="selectedScopes" />
            <span>{{ s.label }}</span>
          </label>
        </div>
        <p class="scope-hint">{{ $t('apikeys.scope_hint') }}</p>
      </div>
      <div class="create-actions">
        <button class="btn" @click="create">{{ $t('common.save') }}</button>
        <button class="btn btn-cancel" @click="showCreate = false">{{ $t('common.cancel') }}</button>
      </div>
      <div v-if="newKey" class="new-key-display">
        <p class="warn">{{ $t('apikeys.copy_warning') }}</p>
        <code>{{ newKey }}</code>
      </div>
    </div>

    <table v-if="keys.length" class="table">
      <thead>
        <tr><th>{{ $t('apikeys.prefix') }}</th><th>{{ $t('apikeys.label') }}</th><th>{{ $t('apikeys.scopes') }}</th><th>{{ $t('apikeys.created') }}</th><th>{{ $t('nav.logout') }}</th></tr>
      </thead>
      <tbody>
        <tr v-for="k in keys" :key="k.prefix">
          <td><code>{{ k.prefix }}...</code></td>
          <td>{{ k.label || '-' }}</td>
          <td><span class="scope-badge">{{ formatScopes(k.scopes) }}</span></td>
          <td class="date">{{ fmtDate(k.createdAt) }}</td>
          <td>
            <button class="btn-sm btn-danger" @click="revoke(k.prefix)">{{ $t('apikeys.revoke') }}</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else class="empty">{{ $t('apikeys.no_keys') }}</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api/index.js'
import { useI18n } from '../i18n.js'

const { t: $t } = useI18n()
const keys = ref([])
const showCreate = ref(false)
const newLabel = ref('')
const newKey = ref('')
const selectedScopes = ref(['*:read'])

const availableScopes = [
  { value: '*:*', label: $t('apikeys.scope_all') },
  { value: '*:read', label: $t('apikeys.scope_read') },
  { value: '*:write', label: $t('apikeys.scope_all') },
  { value: 'article:read', label: 'Article: Read' },
  { value: 'article:write', label: 'Article: Write' },
  { value: 'media:read', label: 'Media: Read' },
  { value: 'media:write', label: 'Media: Write' },
  { value: 'page:read', label: 'Page: Read' },
  { value: 'page:write', label: 'Page: Write' },
]

function formatScopes(scopes) {
  if (!scopes || scopes.length === 0) return '*:*'
  if (scopes.includes('*:*')) return $t('common.all')
  if (scopes.length === 1 && scopes[0] === '*:read') return $t('apikeys.scope_read')
  return scopes.slice(0, 3).join(', ') + (scopes.length > 3 ? '...' : '')
}

async function load() {
  try {
    const res = await api.listApiKeys()
    keys.value = res.keys || []
  } catch (e) {
    console.error(e)
  }
}

async function create() {
  try {
    const res = await api.createApiKey({ label: newLabel.value || 'Default', scopes: selectedScopes.value })
    newKey.value = res.key
    newLabel.value = ''
    selectedScopes.value = ['*:read']
    await load()
  } catch (e) {
    alert(e.message)
  }
}

async function revoke(prefix) {
  if (!confirm($t('apikeys.revoke_confirm'))) return
  try {
    await api.revokeApiKey(prefix)
    keys.value = keys.value.filter(k => k.prefix !== prefix)
  } catch (e) {
    alert(e.message)
  }
}

function fmtDate(d) {
  return d ? new Date(d).toLocaleString() : '-'
}

onMounted(load)
</script>

<style scoped>
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-title { font-size: 22px; }
.btn {
  padding: 8px 20px; background: var(--primary); color: white; border: none;
  border-radius: var(--radius); font-size: 14px; cursor: pointer; font-weight: 600;
}
.btn:hover { background: var(--primary-dark); }
.btn-cancel { background: var(--bg); color: var(--text-primary); border: 1px solid var(--border); }
.create-box {
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 20px; margin-bottom: 20px;
}
.create-box input {
  width: 100%; padding: 8px 12px; border: 1px solid var(--border);
  border-radius: var(--radius); font-size: 14px; outline: none; margin-bottom: 12px;
}
.create-actions { display: flex; gap: 8px; }
.new-key-display { margin-top: 16px; padding: 12px; background: #FEF3C7; border-radius: var(--radius); }
.warn { font-size: 13px; color: #92400E; margin-bottom: 8px; }
code { font-size: 12px; word-break: break-all; color: var(--text-primary); }
.table { width: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); border-collapse: collapse; }
.table th, .table td { padding: 10px 16px; text-align: left; font-size: 14px; border-bottom: 1px solid var(--border); }
.table th { font-weight: 600; color: var(--text-secondary); background: var(--bg); }
.date { color: var(--text-secondary); font-size: 13px; }
.btn-sm { padding: 4px 12px; font-size: 12px; border: 1px solid var(--border); background: var(--surface); border-radius: 4px; cursor: pointer; }
.btn-danger { color: var(--danger); }
.btn-danger:hover { border-color: var(--danger); background: var(--danger-bg); }
.empty { color: var(--text-secondary); font-size: 14px; margin-top: 40px; text-align: center; }
.scope-section { margin: 12px 0; }
.scope-label { font-size: 13px; font-weight: 600; color: var(--text-secondary); display: block; margin-bottom: 8px; }
.scope-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.scope-chip { display: flex; align-items: center; gap: 4px; padding: 4px 10px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 12px; cursor: pointer; }
.scope-chip:hover { border-color: var(--primary); }
.scope-chip input { margin: 0; }
.scope-hint { font-size: 11px; color: var(--text-secondary); margin-top: 8px; }
.scope-badge { font-size: 12px; background: var(--bg); padding: 2px 8px; border-radius: 4px; color: var(--text-secondary); }
</style>
