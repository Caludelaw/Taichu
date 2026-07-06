<template>
  <div class="editor-wrapper" v-if="editor">
    <div class="toolbar">
      <button @click="editor.chain().focus().toggleBold().run()" :class="{ active: editor.isActive('bold') }" :title="$t('richEditor.bold')"><b>B</b></button>
      <button @click="editor.chain().focus().toggleItalic().run()" :class="{ active: editor.isActive('italic') }" :title="$t('richEditor.italic')"><i>I</i></button>
      <button @click="editor.chain().focus().toggleStrike().run()" :class="{ active: editor.isActive('strike') }" :title="$t('richEditor.strikethrough')"><s>S</s></button>
      <button @click="editor.chain().focus().toggleCode().run()" :class="{ active: editor.isActive('code') }" :title="$t('richEditor.code')">&lt;/&gt;</button>
      <span class="sep"></span>
      <button @click="editor.chain().focus().toggleHeading({ level: 1 }).run()" :class="{ active: editor.isActive('heading', { level: 1 }) }">H1</button>
      <button @click="editor.chain().focus().toggleHeading({ level: 2 }).run()" :class="{ active: editor.isActive('heading', { level: 2 }) }">H2</button>
      <button @click="editor.chain().focus().toggleHeading({ level: 3 }).run()" :class="{ active: editor.isActive('heading', { level: 3 }) }">H3</button>
      <span class="sep"></span>
      <button @click="editor.chain().focus().toggleBulletList().run()" :class="{ active: editor.isActive('bulletList') }" :title="$t('richEditor.ul')">•</button>
      <button @click="editor.chain().focus().toggleOrderedList().run()" :class="{ active: editor.isActive('orderedList') }" :title="$t('richEditor.ol')">1.</button>
      <button @click="editor.chain().focus().toggleBlockquote().run()" :class="{ active: editor.isActive('blockquote') }" :title="$t('richEditor.blockquote')"><Icon name="blockquote" :size="14" /></button>
      <button @click="editor.chain().focus().toggleCodeBlock().run()" :class="{ active: editor.isActive('codeBlock') }" :title="$t('richEditor.code_block')"><Icon name="code-block" :size="14" /></button>
      <span class="sep"></span>
      <button @click="openMediaBrowser" :title="$t('richEditor.media')"><Icon name="image" :size="14" /></button>
      <button @click="addImageByUrl" :title="$t('richEditor.image_url')"><Icon name="link" :size="14" /></button>
      <button @click="editor.chain().focus().setHorizontalRule().run()" title="—"><Icon name="bars-horizontal" :size="14" /></button>
      <button @click="editor.chain().focus().undo().run()" title="Undo (Ctrl+Z)"><Icon name="undo" :size="14" /></button>
      <button @click="editor.chain().focus().redo().run()" title="Redo (Ctrl+Y)"><Icon name="redo" :size="14" /></button>
    </div>
    <editor-content :editor="editor" class="editor-content" />

    <!-- Media Browser Modal -->
    <div v-if="showMediaBrowser" class="modal-overlay" @click.self="showMediaBrowser = false">
      <div class="media-browser">
        <div class="mb-header">
          <h3>{{ $t('richEditor.media_title') }}</h3>
          <button class="btn-close" @click="showMediaBrowser = false">{{ $t('richEditor.close') }}</button>
        </div>
        <div v-if="mediaLoading" class="mb-loading">{{ $t('contentList.loading') }}</div>
        <div v-else-if="mediaError" class="mb-error">{{ mediaError }}</div>
        <div v-else class="mb-grid">
          <div v-for="m in mediaItems" :key="m.id" class="mb-item" @click="insertMedia(m)">
            <img :src="m.thumbnails?.small || m.url" :alt="m.originalName" loading="lazy" />
            <span class="mb-name">{{ m.originalName || m.filename }}</span>
          </div>
          <div v-if="!mediaItems.length" class="mb-empty">{{ $t('richEditor.empty') }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { useI18n } from '../i18n.js'
import Icon from './Icon.vue'

const { t: $t } = useI18n()

const props = defineProps({
  modelValue: { type: Object, default: () => ({}) },
  placeholder: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue'])

const showMediaBrowser = ref(false)
const mediaItems = ref([])
const mediaLoading = ref(false)
const mediaError = ref('')

const editor = useEditor({
  content: props.modelValue,
  extensions: [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] }
    }),
    Image.configure({ inline: false, allowBase64: true }),
    Link.configure({ openOnClick: false }),
    Placeholder.configure({ placeholder: props.placeholder })
  ],
  onUpdate: ({ editor }) => {
    emit('update:modelValue', editor.getJSON())
  }
})

watch(() => props.modelValue, (val) => {
  if (editor.value && val) {
    const current = JSON.stringify(editor.value.getJSON())
    const incoming = JSON.stringify(val)
    if (current !== incoming) {
      editor.value.commands.setContent(val)
    }
  }
})

function addImageByUrl() {
  const url = prompt($t('richEditor.url_placeholder'))
  if (url) {
    insertImage(url)
  }
}

function openMediaBrowser() {
  showMediaBrowser.value = true
  mediaLoading.value = true
  mediaError.value = ''
  fetch('/api/media?limit=100')
    .then(r => r.json())
    .then(data => {
      mediaItems.value = (data.files || []).filter(f => f.mimetype?.startsWith('image/'))
      mediaLoading.value = false
    })
    .catch(e => {
      mediaError.value = $t('common.loading') + ': ' + e.message
      mediaLoading.value = false
    })
}

function insertMedia(media) {
  insertImage(media.url)
  showMediaBrowser.value = false
}

function insertImage(src) {
  editor.value?.chain().focus().setImage({ src }).run()
}

onBeforeUnmount(() => {
  editor.value?.destroy()
})
</script>

<style scoped>
.editor-wrapper {
  border: 1px solid var(--border); border-radius: var(--radius);
  background: var(--surface); overflow: hidden;
}
.toolbar {
  display: flex; flex-wrap: wrap; gap: 2px; padding: 6px 8px;
  background: var(--bg); border-bottom: 1px solid var(--border);
}
.toolbar button {
  padding: 4px 8px; border: 1px solid transparent; border-radius: 4px;
  background: transparent; cursor: pointer; font-size: 13px; color: var(--text-secondary);
  white-space: nowrap; min-width: 28px; text-align: center;
}
.toolbar button:hover { background: var(--surface); border-color: var(--border); color: var(--text-primary); }
.toolbar button.active { background: var(--primary); color: white; border-color: var(--primary); }
.sep { width: 1px; background: var(--border); margin: 0 4px; align-self: stretch; }
.editor-content {
  padding: 16px; min-height: 300px; outline: none;
}
.editor-content :deep(p) { margin: 0 0 8px; line-height: 1.7; }
.editor-content :deep(h1) { font-size: 24px; margin: 16px 0 8px; }
.editor-content :deep(h2) { font-size: 20px; margin: 14px 0 6px; }
.editor-content :deep(h3) { font-size: 16px; margin: 12px 0 4px; }
.editor-content :deep(blockquote) {
  border-left: 3px solid var(--primary); padding: 4px 12px; margin: 8px 0;
  color: var(--text-secondary); background: var(--bg);
}
.editor-content :deep(code) {
  background: #F1F5F9; padding: 2px 4px; border-radius: 3px; font-size: 13px;
}
.editor-content :deep(pre) {
  background: #1E293B; color: #E2E8F0; padding: 12px 16px; border-radius: 6px;
  overflow-x: auto; margin: 8px 0;
}
.editor-content :deep(pre code) { background: none; padding: 0; color: inherit; }
.editor-content :deep(ul), .editor-content :deep(ol) { padding-left: 24px; margin: 8px 0; }
.editor-content :deep(li) { margin-bottom: 4px; }
.editor-content :deep(img) { max-width: 100%; border-radius: 6px; margin: 8px 0; }
.editor-content :deep(hr) { border: none; border-top: 1px solid var(--border); margin: 16px 0; }

.editor-content :deep(.is-editor-empty:first-child::before) {
  content: attr(data-placeholder); float: left; color: #94A3B8;
  pointer-events: none; height: 0;
}

.modal-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.4); z-index: 1000;
  display: flex; align-items: center; justify-content: center;
}
.media-browser {
  background: var(--surface); border-radius: 12px;
  width: 90vw; max-width: 680px; max-height: 80vh; overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0,0,0,0.15);
}
.mb-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 20px; border-bottom: 1px solid var(--border);
  position: sticky; top: 0; background: var(--surface); z-index: 1;
}
.mb-header h3 { font-size: 16px; margin: 0; }
.btn-close { background: none; border: none; font-size: 18px; cursor: pointer; color: var(--text-secondary); padding: 4px 8px; }
.btn-close:hover { color: var(--text-primary); }
.mb-loading, .mb-error, .mb-empty { padding: 40px; text-align: center; color: var(--text-secondary); font-size: 14px; }
.mb-error { color: var(--danger); }
.mb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px; padding: 20px; }
.mb-item {
  cursor: pointer; border: 2px solid var(--border); border-radius: 8px;
  overflow: hidden; transition: border-color 0.15s; background: var(--bg);
}
.mb-item:hover { border-color: var(--primary); }
.mb-item img {
  width: 100%; height: 100px; object-fit: cover; display: block;
}
.mb-name {
  display: block; padding: 4px 8px; font-size: 11px; color: var(--text-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
</style>
