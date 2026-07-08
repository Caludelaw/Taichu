<template>
  <div class="diff-viewer">
    <div v-if="!diffs.length" class="diff-empty">
      <Icon name="check-circle" :size="18" />
      <span>{{ $t('revisions.no_changes') }}</span>
    </div>

    <div v-for="d in diffs" :key="d.field" class="diff-field">
      <div class="diff-field-name">{{ d.field }}</div>
      <div class="diff-values">
        <div v-if="hasOld(d)" class="diff-old">
          <span class="diff-marker">-</span>
          <span class="diff-text">{{ fmtVal(d.from) }}</span>
        </div>
        <div v-if="hasNew(d)" class="diff-new">
          <span class="diff-marker">+</span>
          <span class="diff-text">{{ fmtVal(d.to) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import Icon from './Icon.vue'
import { useI18n } from '../i18n.js'

const { t: $t } = useI18n()

const props = defineProps({
  diffs: { type: Array, default: () => [] }
})

function hasOld(d) { return d.from !== undefined && d.from !== null }
function hasNew(d) { return d.to !== undefined && d.to !== null }

function fmtVal(v) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') {
    try { return JSON.stringify(v, null, 2) } catch { return String(v) }
  }
  const s = String(v)
  return s.length > 280 ? s.slice(0, 280) + ' ...' : s
}
</script>

<style scoped>
.diff-viewer {
  font-family: var(--font-mono, 'SF Mono', 'Consolas', 'Monaco', monospace);
  font-size: 13px;
}

.diff-empty {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  color: var(--text-muted);
  font-size: 13px;
}

.diff-field {
  margin-bottom: 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}

.diff-field-name {
  padding: 4px 10px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.diff-values {
  padding: 6px 0;
}

.diff-old,
.diff-new {
  display: flex;
  gap: 8px;
  padding: 4px 10px;
  line-height: 1.5;
}

.diff-old {
  background: rgba(239, 68, 68, 0.08);
}

.diff-new {
  background: rgba(16, 185, 129, 0.08);
}

.diff-marker {
  flex-shrink: 0;
  width: 16px;
  font-weight: 700;
  font-size: 13px;
  text-align: center;
}

.diff-old .diff-marker { color: #ef4444; }
.diff-new .diff-marker { color: #10b981; }

.diff-text {
  white-space: pre-wrap;
  word-break: break-all;
  min-width: 0;
}

.diff-old .diff-text {
  color: #dc2626;
  text-decoration: line-through;
  text-decoration-color: rgba(220, 38, 38, 0.4);
}

.diff-new .diff-text { color: #059669; }
</style>
