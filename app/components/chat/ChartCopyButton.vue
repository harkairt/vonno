<template>
  <button
    v-show="!hidden"
    type="button"
    class="chart-copy-btn"
    :class="visible ? 'chart-copy-btn--visible' : 'chart-copy-btn--hidden'"
    :aria-label="t('chat.messages.copyImage')"
    @click.stop="handleCopy"
  >
    <UIcon
      :name="copied ? 'i-heroicons-check-20-solid' : 'i-heroicons-clipboard-document'"
      class="size-3.5"
      aria-hidden="true"
    />
  </button>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { breakpointsTailwind, useBreakpoints, useElementHover } from '@vueuse/core'

const props = defineProps<{
  containerRef: HTMLElement | null
  hoverRef?: HTMLElement | null
  hidden?: boolean
  captureOverride?: () => Promise<Blob | null>
}>()

const { t } = useI18n()
const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('md')
const hoverTarget = computed(() => props.hoverRef ?? props.containerRef)
const isHovered = useElementHover(hoverTarget)
const copied = ref(false)

const visible = computed(() => isMobile.value || isHovered.value || copied.value)

function canvasWithWhiteBg(source: HTMLCanvasElement): Promise<Blob | null> {
  const c = document.createElement('canvas')
  c.width = source.width
  c.height = source.height
  const ctx = c.getContext('2d')
  if (!ctx) return Promise.resolve(null)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(source, 0, 0)
  return new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/png'))
}

async function captureAsPng(el: HTMLElement): Promise<Blob | null> {
  const canvas = el.querySelector('canvas') as HTMLCanvasElement | null
  if (canvas && canvas.width > 0 && canvas.height > 0) {
    return canvasWithWhiteBg(canvas)
  }

  const img = el.querySelector('img[src^="data:image/svg+xml"]') as HTMLImageElement | null
  if (img?.src) {
    return svgDataUrlToBlob(img.src, img.naturalWidth || 800, img.naturalHeight || 600)
  }

  const video = el.querySelector('video') as HTMLVideoElement | null
  if (video && video.readyState >= 2) {
    return videoFrameToBlob(video)
  }

  return null
}

function svgDataUrlToBlob(svgDataUrl: string, width: number, height: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      const c = document.createElement('canvas')
      const scale = 2
      c.width = width * scale
      c.height = height * scale
      const ctx = c.getContext('2d')
      if (!ctx) {
        resolve(null)
        return
      }
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.scale(scale, scale)
      ctx.drawImage(image, 0, 0, width, height)
      c.toBlob((b) => resolve(b), 'image/png')
    }
    image.onerror = () => resolve(null)
    image.src = svgDataUrl
  })
}

function videoFrameToBlob(video: HTMLVideoElement): Promise<Blob | null> {
  const c = document.createElement('canvas')
  c.width = video.videoWidth || video.clientWidth
  c.height = video.videoHeight || video.clientHeight
  const ctx = c.getContext('2d')
  if (!ctx) return Promise.resolve(null)
  ctx.drawImage(video, 0, 0, c.width, c.height)
  return new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/png'))
}

async function handleCopy() {
  if (!props.containerRef) return

  const blob = props.captureOverride
    ? await props.captureOverride()
    : await captureAsPng(props.containerRef)
  if (!blob) return

  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 1500)
  } catch {
    /* clipboard write not supported */
  }
}
</script>

<style scoped>
.chart-copy-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  background: hsl(var(--card) / 0.85);
  backdrop-filter: blur(4px);
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  transition:
    opacity 150ms ease,
    color 150ms ease,
    background-color 150ms ease;
}

.chart-copy-btn:hover {
  color: hsl(var(--foreground));
  background: hsl(var(--card));
}

.chart-copy-btn:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}

.chart-copy-btn--visible {
  opacity: 0.7;
}

.chart-copy-btn--hidden {
  opacity: 0;
  pointer-events: none;
}
</style>
