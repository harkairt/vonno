<template>
  <Transition
    :css="false"
    @before-enter="onBeforeEnter"
    @enter="onEnter"
    @before-leave="onBeforeLeave"
    @leave="onLeave"
  >
    <div
      v-if="text"
      data-testid="error-response-notice"
    >
      <div
        class="max-w-(--container-chat) mx-auto w-full px-4 md:px-[26px] py-1"
        role="alert"
      >
        <div
          class="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200/50 dark:border-red-800/30 max-w-[95%] md:max-w-[85%]"
        >
          <UIcon
            name="i-heroicons-exclamation-triangle-20-solid"
            class="size-4 text-red-500 dark:text-red-400 flex-shrink-0"
          />
          <span class="text-sm text-red-700 dark:text-red-300 min-w-0">
            {{ text }}
          </span>
          <button
            class="text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-300 transition-colors flex-shrink-0 p-0.5 rounded -mr-1 flex items-center justify-center"
            :aria-label="t('chat.errorResponse.dismiss')"
            @click="emit('dismiss')"
          >
            <UIcon
              name="i-heroicons-x-mark-20-solid"
              class="size-3.5"
            />
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
const { t } = useI18n()

const props = defineProps<{
  text?: string
  scrollContainer?: HTMLElement | null
}>()

const emit = defineEmits<{
  dismiss: []
}>()

const ENTER_MS = 200
const LEAVE_MS = 150

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t)
}

function easeIn(t: number): number {
  return t * t
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function onBeforeEnter(el: Element) {
  if (prefersReducedMotion()) return
  const h = el as HTMLElement
  h.style.overflow = 'hidden'
  h.style.height = '0px'
}

function onEnter(el: Element, done: () => void) {
  if (prefersReducedMotion()) {
    done()
    return
  }
  const h = el as HTMLElement
  const targetHeight = h.scrollHeight
  const container = props.scrollContainer
  const startScroll = container ? container.scrollTop : 0
  const start = performance.now()

  function tick() {
    const progress = Math.min((performance.now() - start) / ENTER_MS, 1)
    const eased = easeOut(progress)

    h.style.height = `${targetHeight * eased}px`
    if (container) {
      container.scrollTop = startScroll + targetHeight * eased
    }

    if (progress < 1) {
      requestAnimationFrame(tick)
    } else {
      h.style.height = ''
      h.style.overflow = ''
      done()
    }
  }

  requestAnimationFrame(tick)
}

function onBeforeLeave(el: Element) {
  if (prefersReducedMotion()) return
  const h = el as HTMLElement
  h.style.overflow = 'hidden'
  h.style.height = `${h.scrollHeight}px`
}

function onLeave(el: Element, done: () => void) {
  if (prefersReducedMotion()) {
    done()
    return
  }
  const h = el as HTMLElement
  const fullHeight = h.scrollHeight
  const start = performance.now()

  function tick() {
    const progress = Math.min((performance.now() - start) / LEAVE_MS, 1)
    const eased = easeIn(progress)

    h.style.height = `${fullHeight * (1 - eased)}px`

    if (progress < 1) {
      requestAnimationFrame(tick)
    } else {
      done()
    }
  }

  requestAnimationFrame(tick)
}
</script>
