import type { Component } from 'vue'
import type { JsonFormsRendererRegistryEntry, createAjv } from '@jsonforms/core'

export interface JsonFormsBundle {
  JsonForms: Component
  renderers: JsonFormsRendererRegistryEntry[]
  ajv: ReturnType<typeof createAjv>
}

let loadingPromise: Promise<JsonFormsBundle> | null = null

export const useJsonForms = () => {
  const loadJsonForms = (): Promise<JsonFormsBundle> => {
    if (loadingPromise) return loadingPromise

    loadingPromise = (async () => {
      const [core, vue, vanilla] = await Promise.all([
        import('@jsonforms/core'),
        import('@jsonforms/vue'),
        import('@jsonforms/vue-vanilla'),
      ])
      const { customRenderers, fallbackRenderer } = await import('@/app/components/forms/renderers')
      return {
        JsonForms: vue.JsonForms,
        // Ties resolve to the first entry, so the rank-1 fallback must come
        // after the vanilla set, whose own testers also bottom out at rank 1.
        renderers: [...customRenderers, ...vanilla.vanillaRenderers, fallbackRenderer],
        ajv: core.createAjv({ useDefaults: true }),
      }
    })().catch((error: unknown) => {
      loadingPromise = null
      throw error
    })

    return loadingPromise
  }

  return { loadJsonForms }
}
