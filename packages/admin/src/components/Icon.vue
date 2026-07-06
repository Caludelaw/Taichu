<template>
  <svg
    :class="['taichu-icon', { 'taichu-icon--narrow': data?.narrow }]"
    :viewBox="data?.viewBox || '0 0 24 24'"
    :width="size"
    :height="size"
    :fill="data?.rect ? 'none' : 'none'"
    :stroke="data?.fillPaths?.length && !data?.paths?.length ? 'currentColor' : 'currentColor'"
    :stroke-width="strokeWidth"
    :stroke-linecap="strokeLinecap"
    :stroke-linejoin="strokeLinejoin"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <!-- Main stroke paths -->
    <path
      v-for="(d, i) in data?.paths || []"
      :key="'p-' + i"
      :d="d"
      fill="none"
      stroke="currentColor"
      :stroke-width="strokeWidth"
      :stroke-linecap="strokeLinecap"
      :stroke-linejoin="strokeLinejoin"
    />
    <!-- Secondary stroke paths (thinner) -->
    <path
      v-for="(d, i) in data?.paths2 || []"
      :key="'p2-' + i"
      :d="d"
      fill="none"
      stroke="currentColor"
      :stroke-width="strokeWidth"
      :stroke-linecap="strokeLinecap"
      :stroke-linejoin="strokeLinejoin"
    />
    <!-- Filled paths -->
    <path
      v-for="(d, i) in data?.fillPaths || []"
      :key="'fp-' + i"
      :d="d"
      fill="currentColor"
      stroke="none"
    />
    <!-- Circle elements (small dots) -->
    <circle
      v-for="(c, i) in data?.circlePaths || []"
      :key="'c-' + i"
      :cx="c.cx"
      :cy="c.cy"
      :r="c.r"
      fill="currentColor"
      stroke="none"
    />
  </svg>
</template>

<script setup>
import { getIcon } from '../icons.js'

const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 16 },
  strokeWidth: { type: [Number, String], default: 2 }
})

const strokeLinecap = 'round'
const strokeLinejoin = 'round'

const data = getIcon(props.name)
</script>

<style>
.taichu-icon {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
}
.taichu-icon--narrow {
  stroke-width: 1.5;
}
</style>
