<template>
  <div
    ref="wrapperRef"
    class="map-container"
    @click.stop
  >
    <ChartCopyButton
      :container-ref="wrapperRef"
      :hidden="showLoading || !!error"
      :capture-override="captureMap"
    />
    <div
      v-if="showLoading"
      class="map-loading"
    >
      {{ t('chat.map.loading') }}
    </div>
    <div
      v-else-if="error"
      class="map-error"
    >
      {{ error }}
    </div>
    <div
      v-show="!showLoading && !error"
      ref="containerRef"
      class="map-canvas"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useResizeObserver } from '@vueuse/core'
import { useLeaflet, type LeafletMapInstance } from '~/composables/useLeaflet'
import ChartCopyButton from '~/components/chat/ChartCopyButton.vue'
import type { LeafletMapData } from '@/lib/validation/leaflet'

interface Props {
  data: LeafletMapData
  blockIndex: number
  source: string
}

const props = defineProps<Props>()

const { t } = useI18n()
const { isLoaded, loadLeaflet, createMap } = useLeaflet()

const wrapperRef = ref<HTMLElement | null>(null)
const containerRef = ref<HTMLElement | null>(null)
const error = ref<string | null>(null)
let instance: LeafletMapInstance | null = null

const showLoading = computed(() => !isLoaded.value && !error.value)

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function drawSafe(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  try {
    ctx.drawImage(source, x, y, w, h)
  } catch (_) {
    void _
  }
}

function drawImages(
  ctx: CanvasRenderingContext2D,
  images: NodeListOf<HTMLImageElement>,
  origin: DOMRect,
) {
  for (const img of images) {
    if (!img.complete || !img.naturalWidth) continue
    const r = img.getBoundingClientRect()
    drawSafe(ctx, img, r.left - origin.left, r.top - origin.top, r.width, r.height)
  }
}

async function drawSvgOverlays(
  ctx: CanvasRenderingContext2D,
  svgs: NodeListOf<SVGSVGElement>,
  origin: DOMRect,
) {
  for (const svg of svgs) {
    const r = svg.getBoundingClientRect()
    const url = URL.createObjectURL(
      new Blob([new XMLSerializer().serializeToString(svg)], {
        type: 'image/svg+xml;charset=utf-8',
      }),
    )
    try {
      drawSafe(
        ctx,
        await loadImage(url),
        r.left - origin.left,
        r.top - origin.top,
        r.width,
        r.height,
      )
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

const captureMap = async (): Promise<Blob | null> => {
  if (!containerRef.value) return null
  const mapEl = containerRef.value
  const w = mapEl.offsetWidth
  const h = mapEl.offsetHeight
  if (!w || !h) return null

  const scale = 2
  const c = document.createElement('canvas')
  c.width = w * scale
  c.height = h * scale
  const ctx = c.getContext('2d')
  if (!ctx) return null

  ctx.scale(scale, scale)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)

  const origin = mapEl.getBoundingClientRect()

  drawImages(ctx, mapEl.querySelectorAll<HTMLImageElement>('.leaflet-tile'), origin)
  await drawSvgOverlays(
    ctx,
    mapEl.querySelectorAll<SVGSVGElement>('.leaflet-overlay-pane svg'),
    origin,
  )

  const markerPane = mapEl.querySelector<HTMLElement>('.leaflet-marker-pane')
  if (markerPane) drawImages(ctx, markerPane.querySelectorAll<HTMLImageElement>('img'), origin)

  return new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/png'))
}

const destroyMap = () => {
  if (!instance) return
  instance.remove()
  instance = null
}

const render = async () => {
  destroyMap()

  if (!containerRef.value || !isLoaded.value) return
  if (!containerRef.value.offsetWidth) return

  instance = await createMap(containerRef.value, props.data)
  if (!instance) {
    error.value = t('chat.map.renderFailed')
  } else {
    error.value = null
  }
}

watch(
  isLoaded,
  (loaded) => {
    if (loaded) void render()
  },
  { flush: 'post' },
)

watch(
  () => props.source,
  () => void render(),
)

useResizeObserver(containerRef, () => {
  if (instance) instance.invalidateSize()
  else void render()
})

onMounted(async () => {
  if (isLoaded.value) {
    void render()
    return
  }

  const loaded = await loadLeaflet()
  if (!loaded) error.value = t('chat.map.renderFailed')
})

onBeforeUnmount(() => {
  destroyMap()
})
</script>

<style scoped>
.map-container {
  position: relative;
  width: 100%;
  margin: 1rem 0;
}

.map-canvas {
  width: 100%;
  height: 400px;
  border-radius: 0.5rem;
  z-index: 0;
}

@media (max-width: 640px) {
  .map-canvas {
    height: 300px;
  }
}

.map-loading,
.map-error {
  padding: 1rem;
  font-size: 0.875rem;
  color: hsl(var(--muted-foreground));
}

:deep(.leaflet-tile-pane) {
  .dark & {
    filter: brightness(0.6) invert(1) contrast(3) hue-rotate(200deg) saturate(0.3) brightness(0.7);
  }
}
</style>
