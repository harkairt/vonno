import { describe, it, expect } from 'vitest'

describe('chats page', () => {
  it('exports a valid Vue component', async () => {
    const mod: { default: unknown } = await import('@/app/pages/chats.vue')

    expect(typeof mod.default).toBe('object')
    expect(mod.default).toBeDefined()
  })
})
