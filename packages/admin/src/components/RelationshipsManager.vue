<template>
  <div class="rel-panel" v-if="docId && docType">
    <div class="rel-header">
      <h3>{{ $t('relationships.title') }}</h3>
      <button @click="load" class="btn-sm" :disabled="loading">{{ loading ? $t('contentList.loading') : $t('common.search') }}</button>
    </div>

    <div class="rel-add">
      <input v-model="newTarget" :placeholder="$t('relationships.target_id')" class="input-sm" />
      <select v-model="newType" class="input-sm select-sm">
        <option value="related_to">{{ $t('relationships.type_related') }}</option>
        <option value="parent_of">{{ $t('relationships.type_parent') }}</option>
        <option value="references">{{ $t('relationships.type_reference') }}</option>
      </select>
      <button @click="addRel" class="btn-sm btn-primary-sm" :disabled="!newTarget || adding">{{ $t('relationships.add') }}</button>
    </div>
    <p v-if="addError" class="add-error">{{ addError }}</p>

    <div class="rel-sections">
      <div class="rel-group">
        <h4>{{ $t('relationships.outbound') }} ({{ outgoing.length }})</h4>
        <div v-if="!outgoing.length" class="rel-empty">{{ $t('relationships.no_items') }}</div>
        <div v-for="r in outgoing" :key="r.targetId + r.type" class="rel-item">
          <span class="rel-type" :class="'type-' + r.type">{{ typeLabel(r.type) }}</span>
          <span class="rel-title">{{ r.targetTitle || r.targetId }}</span>
          <button @click="removeRel(r.targetId, r.type)" class="btn-del" :title="$t('relationships.remove')"><Icon name="close" :size="12" /> {{ $t('relationships.remove') }}</button>
        </div>
      </div>

      <div class="rel-group">
        <h4>{{ $t('relationships.inbound') }} ({{ incoming.length }})</h4>
        <div v-if="!incoming.length" class="rel-empty">{{ $t('relationships.no_items') }}</div>
        <div v-for="r in incoming" :key="r.sourceId + r.type" class="rel-item">
          <span class="rel-type" :class="'type-' + r.type">{{ typeLabel(r.type) }}</span>
          <span class="rel-title">{{ r.sourceTitle || r.sourceId }}</span>
        </div>
      </div>
    </div>

    <div v-if="graph.nodes.length > 0" class="rel-graph">
      <h4>{{ $t('relationships.graph') }}</h4>
      <svg :viewBox="'0 0 ' + graphW + ' ' + graphH" class="graph-svg">
        <line v-for="(e, i) in graph.edges" :key="'e'+i"
          :x1="nodePos[e.from]?.x" :y1="nodePos[e.from]?.y"
          :x2="nodePos[e.to]?.x" :y2="nodePos[e.to]?.y"
          class="graph-edge" />
        <g v-for="n in graph.nodes" :key="n.id">
          <circle :cx="nodePos[n.id]?.x" :cy="nodePos[n.id]?.y" r="22"
            :class="n.id === docId ? 'graph-node-self' : 'graph-node'" />
          <text :x="nodePos[n.id]?.x" :y="nodePos[n.id]?.y + 5"
            class="graph-label" text-anchor="middle">{{ (n.title||n.id).substring(0, 8) }}</text>
        </g>
      </svg>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch, onMounted } from 'vue'
import { api } from '../api/index.js'
import { useI18n } from '../i18n.js'
import Icon from './Icon.vue'

const { t: $t } = useI18n()
const props = defineProps({ docId: String, docType: String })

const outgoing = ref([])
const incoming = ref([])
const graph = reactive({ nodes: [], edges: [] })
const nodePos = reactive({})
const graphW = ref(400)
const graphH = ref(250)
const loading = ref(false)

const newTarget = ref('')
const newType = ref('related_to')
const adding = ref(false)
const addError = ref('')

const TYPE_MAP = {
  related_to: $t('relationships.type_related'),
  parent_of: $t('relationships.type_parent'),
  child_of: $t('relationships.type_parent'),
  references: $t('relationships.type_reference'),
  translated_from: $t('relationships.type_reference')
}

function typeLabel(t) { return TYPE_MAP[t] || t }

async function load() {
  if (!props.docId) return
  loading.value = true
  try {
    const data = await api.request('/content/' + props.docType + '/' + props.docId + '/relationships')
    outgoing.value = data.outgoing || []
    incoming.value = data.incoming || []

    const graphData = await api.request('/content/' + props.docType + '/' + props.docId + '/graph?depth=2')
    graph.nodes = graphData.nodes || []
    graph.edges = graphData.edges || []

    layoutNodes()
  } catch (e) {
    console.error('Failed to load relationships', e)
  } finally {
    loading.value = false
  }
}

function layoutNodes() {
  const nodes = graph.nodes
  if (!nodes.length) return
  const cx = 200, cy = 120, r = 80
  const count = nodes.length
  graphW.value = Math.max(400, count * 90)
  graphH.value = 250

  const positions = {}
  nodes.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2
    positions[n.id] = {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle)
    }
  })
  Object.assign(nodePos, positions)
}

async function addRel() {
  if (!newTarget.value) return
  adding.value = true
  addError.value = ''
  try {
    await api.request('/content/' + props.docType + '/' + props.docId + '/relationships', {
      method: 'POST',
      body: JSON.stringify({ targetId: newTarget.value, type: newType.value })
    })
    newTarget.value = ''
    await load()
  } catch (e) {
    addError.value = e.message
  } finally {
    adding.value = false
  }
}

async function removeRel(targetId, type) {
  if (!confirm($t('contentList.delete_confirm'))) return
  try {
    await api.request('/content/' + props.docType + '/' + props.docId + '/relationships/' + targetId + '?type=' + type, {
      method: 'DELETE'
    })
    await load()
  } catch (e) {
    addError.value = e.message
  }
}

watch(() => props.docId, load)
onMounted(load)
</script>

<style scoped>
.rel-panel {
  margin-top: 32px; padding: 20px;
  background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
}
.rel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.rel-header h3 { font-size: 15px; margin: 0; }

.rel-add { display: flex; gap: 8px; margin-bottom: 16px; }
.input-sm {
  padding: 6px 10px; border: 1px solid var(--border); border-radius: 4px;
  font-size: 13px; color: var(--text-primary); background: var(--surface);
}
.select-sm { width: 90px; }
.btn-sm { padding: 4px 12px; font-size: 12px; border: 1px solid var(--border); background: var(--surface); border-radius: 4px; cursor: pointer; }
.btn-primary-sm { background: var(--primary); color: white; border-color: var(--primary); }
.add-error { color: var(--danger); font-size: 12px; margin-bottom: 8px; }

.rel-sections { display: flex; gap: 24px; }
.rel-group { flex: 1; }
.rel-group h4 { font-size: 13px; color: var(--text-secondary); margin-bottom: 8px; }
.rel-empty { font-size: 12px; color: var(--text-muted); padding: 8px 0; }
.rel-item { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
.rel-type { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 11px; background: #F3F4F6; color: var(--text-secondary); }
.rel-type.type-parent_of, .rel-type.type-child_of { background: #FEF3C7; color: #92400E; }
.rel-type.type-references { background: #D1FAE5; color: #065F46; }
.rel-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.btn-del { background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 13px; padding: 2px 6px; }
.btn-del:hover { color: var(--danger); }

.rel-graph { margin-top: 20px; }
.rel-graph h4 { font-size: 13px; color: var(--text-secondary); margin-bottom: 12px; }
.graph-svg { width: 100%; height: auto; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); }
.graph-edge { stroke: #D1D5DB; stroke-width: 1.5; }
.graph-node { fill: #E0E7FF; stroke: #6366F1; stroke-width: 2; }
.graph-node-self { fill: #6366F1; stroke: #4338CA; stroke-width: 3; }
.graph-label { font-size: 9px; fill: var(--text-primary); }
</style>
