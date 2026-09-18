import { describe, it, expect, vi, beforeEach } from 'vitest'

beforeEach(() => {
  vi.resetModules()
})

async function importLoader() {
  const { useJsonForms } = await import('~/composables/useJsonForms')
  return useJsonForms()
}

const stringSchema = { type: 'object', properties: { name: { type: 'string' } } }
const testerContext = { rootSchema: stringSchema, config: {} }

describe('useJsonForms.loadJsonForms', () => {
  it('returns the same cached promise on repeated calls', async () => {
    const loader = await importLoader()

    const first = loader.loadJsonForms()
    const second = loader.loadJsonForms()

    expect(first).toBe(second)
    expect(await first).toBe(await second)
  })

  it('resolves the JsonForms component, the renderer set and one shared ajv', async () => {
    const loader = await importLoader()

    const bundle = await loader.loadJsonForms()

    expect(bundle.JsonForms).toBeTruthy()
    expect(typeof bundle.ajv.validate).toBe('function')
    expect(bundle.renderers.length).toBeGreaterThan(3)

    const stringControl = { type: 'Control', scope: '#/properties/name' }
    expect(bundle.renderers[0]!.tester(stringControl, stringSchema, testerContext)).toBe(10)

    const fallback = bundle.renderers.at(-1)!
    expect(fallback.tester({ type: 'Bogus' }, stringSchema, testerContext)).toBe(1)
  })
})
