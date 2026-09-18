<template>
  <div
    v-if="layout.visible"
    class="grid grid-cols-1 gap-4 @min-[480px]:grid-cols-(--form-columns)"
    :style="{ '--form-columns': `repeat(${layout.uischema.elements.length}, minmax(0, 1fr))` }"
    data-testid="horizontal-layout"
  >
    <DispatchRenderer
      v-for="(element, index) in layout.uischema.elements"
      :key="`${layout.path}-${index}`"
      :schema="layout.schema"
      :uischema="element"
      :path="layout.path"
      :enabled="layout.enabled"
      :renderers="layout.renderers"
      :cells="layout.cells"
    />
  </div>
</template>

<script lang="ts">
import { rankWith, uiTypeIs, type Layout } from '@jsonforms/core'
import { DispatchRenderer, rendererProps, useJsonFormsLayout } from '@jsonforms/vue'

export const tester = rankWith(5, uiTypeIs('HorizontalLayout'))
</script>

<script setup lang="ts">
const props = defineProps(rendererProps<Layout>())

const { layout } = useJsonFormsLayout(props)
</script>
