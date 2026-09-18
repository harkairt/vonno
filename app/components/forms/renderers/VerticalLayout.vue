<template>
  <div
    v-if="layout.visible"
    class="flex flex-col gap-4"
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

export const tester = rankWith(5, uiTypeIs('VerticalLayout'))
</script>

<script setup lang="ts">
const props = defineProps(rendererProps<Layout>())

const { layout } = useJsonFormsLayout(props)
</script>
