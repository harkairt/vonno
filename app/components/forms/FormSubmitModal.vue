<template>
  <UModal
    :open="open"
    :title="t('chat.forms.submitConfirmTitle')"
    :dismissible="!pending"
    @update:open="emit('update:open', $event)"
  >
    <template #content>
      <div class="p-4">
        <p class="text-sm text-(--ui-text-muted) mb-4">
          {{ t('chat.forms.submitConfirmBody') }}
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
            color="primary"
            :loading="pending"
            :disabled="pending"
            @click="emit('confirm')"
          >
            {{ t('chat.forms.submitConfirm') }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ open: boolean; pending?: boolean }>(), { pending: false })

const emit = defineEmits<{ 'update:open': [open: boolean]; confirm: [] }>()

const { t } = useI18n()
</script>
