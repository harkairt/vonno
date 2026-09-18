<template>
  <section
    v-if="layout.visible"
    class="flex flex-col gap-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3"
    data-testid="group-layout"
  >
    <h3
      v-if="uischema.label"
      class="text-sm font-medium"
    >
      {{ uischema.label }}
    </h3>
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
  </section>
</template>

<script lang="ts">
import { rankWith, uiTypeIs, type GroupLayout } from '@jsonforms/core'
import { DispatchRenderer, rendererProps, useJsonFormsLayout } from '@jsonforms/vue'

export const tester = rankWith(5, uiTypeIs('Group'))
</script>

<script setup lang="ts">
const props = defineProps(rendererProps<GroupLayout>())

const { layout } = useJsonFormsLayout(props)
</script>
