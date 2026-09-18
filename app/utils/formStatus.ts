import type { FormStatus } from '@/types/api/schemas'

export const FORM_STATUS_COLOR: Record<FormStatus, 'primary' | 'success' | 'neutral'> = {
  Open: 'primary',
  Submitted: 'success',
  Cancelled: 'neutral',
}

export const FORM_STATUS_KEY: Record<FormStatus, string> = {
  Open: 'chat.forms.status.open',
  Submitted: 'chat.forms.status.submitted',
  Cancelled: 'chat.forms.status.cancelled',
}
