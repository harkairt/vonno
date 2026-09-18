import type { InjectionKey, Ref } from 'vue'
import type { JsonPointer } from '@/app/utils/jsonPointer'

export const FORM_SHOW_ERRORS_KEY: InjectionKey<Ref<boolean>> = Symbol('formShowErrors')

export interface FormFocusRequest {
  pointer: JsonPointer
  seq: number
}

export const FORM_FOCUS_REQUEST_KEY: InjectionKey<Ref<FormFocusRequest | undefined>> =
  Symbol('formFocusRequest')

export const scopeToJsonPointer = (scope: string): JsonPointer =>
  scope.replace(/^#/, '').replaceAll('/properties/', '/') as JsonPointer
