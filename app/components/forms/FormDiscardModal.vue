<template>
  <UModal
    :open="open"
    :title="t('chat.forms.discardConfirmTitle')"
    :dismissible="!pending"
    @update:open="emit('update:open', $event)"
  >
    <template #content>
      <div class="p-4">
        <p class="mb-4 text-sm text-[hsl(var(--muted-foreground))]">
          {{ t('chat.forms.discardConfirmBody') }}
        </p>
        <div class="flex justify-end gap-2">
          <UButton
            type="button"
            variant="ghost"
            color="neutral"
            :disabled="pending"
            @click="emit('update:open', false)"
          >
            {{ t('chat.forms.cancel') }}
          </UButton>
          <UButton
            type="button"
            color="error"
            :loading="pending"
            :disabled="pending"
            @click="emit('confirm')"
          >
            {{ t('chat.forms.discardConfirm') }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
defineProps<{
  open: boolean
  pending: boolean
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
  confirm: []
}>()

const { t } = useI18n()
</script>
