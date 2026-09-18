<template>
  <UTabs
    v-if="layout.visible"
    v-model="activeTab"
    :items="tabs"
    variant="link"
    color="neutral"
    class="w-full gap-4"
    :ui="{ trigger: 'min-h-11' }"
    data-testid="categorization-layout"
  >
    <template #content="{ item }">
      <div class="flex flex-col gap-4">
        <DispatchRenderer
          v-for="(element, index) in item.elements"
          :key="`${item.path}-${index}`"
          :schema="layout.schema"
          :uischema="element"
          :path="item.path"
          :enabled="item.enabled"
          :renderers="layout.renderers"
          :cells="layout.cells"
        />
      </div>
    </template>
  </UTabs>
</template>

<script lang="ts">
import { computed, inject, ref, watch } from 'vue'
import {
  rankWith,
  uiTypeIs,
  type Categorization,
  type Category,
  type UISchemaElement,
} from '@jsonforms/core'
import { DispatchRenderer, rendererProps, useJsonFormsCategorization } from '@jsonforms/vue'
import { FORM_FOCUS_REQUEST_KEY, scopeToJsonPointer } from '~/utils/formRendererContext'

export const tester = rankWith(5, uiTypeIs('Categorization'))

type ElementWithChildren = UISchemaElement & { scope?: string; elements?: UISchemaElement[] }

const containsPointer = (elements: UISchemaElement[], pointer: string): boolean =>
  elements.some((element) => {
    const { scope, elements: children } = element as ElementWithChildren
    if (scope) {
      const controlPointer = scopeToJsonPointer(scope)
      return pointer === controlPointer || pointer.startsWith(`${controlPointer}/`)
    }
    return children ? containsPointer(children, pointer) : false
  })
</script>

<script setup lang="ts">
type CategoryTab = {
  value: string
  label: string
  path: string
  enabled: boolean
  elements: UISchemaElement[]
}

const props = defineProps(rendererProps<Categorization>())

const { layout, categories } = useJsonFormsCategorization(props)

const tabs = computed<CategoryTab[]>(() =>
  categories
    .map((category) => category.value)
    .filter((category) => category.visible)
    .map((category, index) => ({
      value: String(index),
      label: (category.uischema as Category).label ?? '',
      path: category.path,
      enabled: category.enabled,
      elements: category.uischema.elements,
    })),
)

const activeTab = ref<string | number>('0')
const focusRequest = inject(FORM_FOCUS_REQUEST_KEY, ref())

watch(focusRequest, (request) => {
  if (!request) return
  const tab = tabs.value.find((candidate) => containsPointer(candidate.elements, request.pointer))
  if (tab) activeTab.value = tab.value
})
</script>
