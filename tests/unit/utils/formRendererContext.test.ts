import { describe, it, expect } from 'vitest'
import { scopeToJsonPointer } from '~/utils/formRendererContext'

describe('scopeToJsonPointer', () => {
  it('converts a top-level scope to a pointer', () => {
    expect(scopeToJsonPointer('#/properties/notes')).toBe('/notes')
  })

  it('converts a nested scope to a pointer', () => {
    expect(scopeToJsonPointer('#/properties/company/properties/taxId')).toBe('/company/taxId')
  })

  it('handles a schema property literally named "properties"', () => {
    expect(scopeToJsonPointer('#/properties/properties')).toBe('/properties')
    expect(scopeToJsonPointer('#/properties/properties/properties/city')).toBe('/properties/city')
  })

  it('handles a property named "properties" nested inside another object', () => {
    expect(scopeToJsonPointer('#/properties/company/properties/properties')).toBe(
      '/company/properties',
    )
  })

  it('handles several levels of nesting, some of them named "properties"', () => {
    expect(
      scopeToJsonPointer('#/properties/properties/properties/properties/properties/child'),
    ).toBe('/properties/properties/child')
  })
})
