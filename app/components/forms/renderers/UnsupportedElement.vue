<template>
  <p class="text-sm text-[hsl(var(--muted-foreground))]">
    {{ t('chat.forms.unsupportedElement') }}
  </p>
</template>

<script lang="ts">
import { rankWith } from '@jsonforms/core'
import { rendererProps } from '@jsonforms/vue'

export const tester = rankWith(1, () => true)
</script>

<script setup lang="ts">
defineProps(rendererProps())

const { t } = useI18n()
</script>
