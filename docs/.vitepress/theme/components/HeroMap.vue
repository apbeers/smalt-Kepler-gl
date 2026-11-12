<script setup lang="ts">
// The home page's map: 3,000 flights between the world's busiest airports, flowing along great circles.
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { SmaltMap } from '@smaltworks/smaltgl'

const host = ref<HTMLElement>()
const note = ref('')
let map: SmaltMap | undefined

onMounted(async () => {
  try {
    const gl = await import('@smaltworks/smaltgl')
    const { generate } = await import('@smaltworks/smaltgl/datasets')
    map = await gl.createMap(host.value!, { center: [25, 30], zoom: 1.2, basemap: gl.basemap({ theme: 'dark' }), tooltip: false })
    const { dataset } = await generate('flights', 3_000)
    map.setLayers([
      gl.arcs({ data: dataset.columns, greatCircle: true, animate: true, color: '#5CBDE8', targetColor: '#E5622F', width: 1.2, opacity: 0.55, additive: true }),
      gl.scatter({ data: { lng: dataset.places!.lng, lat: dataset.places!.lat }, color: '#FFFFFF', radius: 1.5, size: { values: dataset.places!.weight }, radiusMax: 5 }),
    ])
  } catch (e) {
    note.value = (e as Error)?.name === 'GpuUnavailableError' ? 'This map needs WebGPU: Chrome or Edge 113+, Safari 26+, or Firefox 141+ on Windows.' : String(e)
  }
})
onBeforeUnmount(() => map?.destroy())
</script>

<template>
  <div class="hero-map">
    <div ref="host" class="map" />
    <p v-if="note" class="note">{{ note }}</p>
    <a class="go" href="./demo">Open the tech demo →</a>
  </div>
</template>

<style scoped>
.hero-map { position: relative; height: 440px; margin: 8px 0 32px; border-radius: 12px; overflow: hidden; border: 1px solid var(--vp-c-divider); background: #14171F; }
.map { position: absolute; inset: 0; }
.note { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; padding: 24px; color: #B9BEC9; text-align: center; }
.go { position: absolute; left: 12px; top: 12px; z-index: 3; padding: 4px 12px; border-radius: 6px; background: var(--vp-c-brand-1); color: var(--vp-c-white) !important; text-decoration: none !important; font-weight: 500; font-size: 14px; }
</style>
