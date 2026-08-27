import { describe, it, expect } from 'vitest'
import { loadGeoJSON, isRegisteredMap } from '@/lib/geo/registry'

describe('isRegisteredMap', () => {
  it('knows the bundled maps', () => {
    expect(isRegisteredMap('hungary')).toBe(true)
    expect(isRegisteredMap('hungary-regions')).toBe(true)
  })

  it('rejects unknown map names', () => {
    expect(isRegisteredMap('atlantis')).toBe(false)
  })
})

describe('loadGeoJSON', () => {
  it('returns null for an unregistered map', async () => {
    await expect(loadGeoJSON('atlantis')).resolves.toBeNull()
  })

  it('loads a registered GeoJSON payload', async () => {
    const geo = (await loadGeoJSON('hungary')) as { type: string; features: unknown[] }

    expect(geo.type).toBe('FeatureCollection')
    expect(geo.features.length).toBeGreaterThan(0)
  })

  it('serves repeat loads from the cache (same reference)', async () => {
    const first = await loadGeoJSON('hungary-regions')
    const second = await loadGeoJSON('hungary-regions')

    expect(first).not.toBeNull()
    expect(second).toBe(first)
  })
})
