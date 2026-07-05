<template>
  <div>
    <div class="header">
      <h2 class="page-title">{{ $t('media.title') }}</h2>
      <label class="upload-btn">
        {{ $t('media.upload') }}
        <input type="file" multiple @change="upload" hidden />
      </label>
    </div>

    <div v-if="uploading" class="uploading">{{ $t('media.uploading') }}</div>

    <div v-if="files.length" class="media-grid">
      <div v-for="f in files" :key="f.id" class="media-card">
        <div class="media-preview">
          <img v-if="f.mimetype?.startsWith('image/')" :src="f.url" :alt="f.originalName" loading="lazy" />
          <span v-else class="file-icon">{{ fileIcon(f) }}</span>
        </div>
        <div class="media-info">
          <span class="media-name">{{ f.originalName || f.filename }}</span>
          <span class="media-size">{{ formatSize(f.size) }}</span>
          <div class="media-actions">
            <button class="btn-sm" @click="copyUrl(f)">{{ $t('media.copy_url') }}</button>
            <button class="btn-sm btn-danger" @click="remove(f.id)">{{ $t('media.delete') }}</button>
          </div>
        </div>
      </div>
    </div>
    <p v-else class="empty">{{ $t('media.no_items') }}</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api/index.js'
import { useI18n } from '../i18n.js'

const { t: $t } = useI18n()
const files = ref([])
const uploading = ref(false)

async function load() {
  try {
    const { files: list } = await api.listMedia()
    files.value = list || []
  } catch (e) { console.error(e) }
}

async function upload(e) {
  const fileList = e.target.files
  if (!fileList.length) return
  uploading.value = true
  try {
    for (const file of fileList) {
      const formData = new FormData()
      formData.append('file', file)
      await fetch('/api/media/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('taichu_token')}` },
        body: formData
      })
    }
    await load()
  } catch (e) { console.error(e) }
  uploading.value = false
  e.target.value = ''
}

async function remove(id) {
  try {
    await api.deleteMedia(id)
    load()
  } catch (e) { console.error(e) }
}

async function copyUrl(f) {
  try {
    await navigator.clipboard.writeText(f.url)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = f.url; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
  }
}

function fileIcon(f) {
  if (f.mimetype?.startsWith('video/')) return $t('media.file_icon_video')
  if (f.mimetype === 'application/pdf') return $t('media.file_icon_pdf')
  return $t('media.file_icon_default')
}

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

onMounted(load)
</script>

<style scoped>
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-title { font-size: 22px; }
.upload-btn {
  padding: 8px 20px; background: var(--primary); color: white; border: none;
  border-radius: var(--radius); font-size: 14px; cursor: pointer; font-weight: 600;
}
.upload-btn:hover { background: var(--primary-dark); }
.uploading { font-size: 14px; color: var(--text-secondary); margin-bottom: 16px; }
.media-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
.media-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.media-preview { height: 150px; display: flex; align-items: center; justify-content: center; background: var(--bg); overflow: hidden; }
.media-preview img { width: 100%; height: 100%; object-fit: cover; }
.file-icon { font-size: 48px; }
.media-info { padding: 12px; }
.media-name { display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.media-size { font-size: 12px; color: var(--text-muted); }
.media-actions { margin-top: 8px; display: flex; gap: 4px; }
.btn-sm { padding: 4px 10px; font-size: 12px; border: 1px solid var(--border); background: var(--surface); border-radius: 4px; cursor: pointer; }
.btn-danger { color: var(--danger); }
.empty { color: var(--text-secondary); font-size: 14px; margin-top: 40px; text-align: center; }
</style>
