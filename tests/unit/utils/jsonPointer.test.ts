import { describe, it, expect } from 'vitest'
import {
  appendJsonPointerSegment,
  diffToJsonPointer,
  diffToJsonPointers,
  parseJsonPointer,
  toJsonPointer,
  type JsonPointer,
} from '~/utils/jsonPointer'

const asPointer = (value: string): JsonPointer => value as JsonPointer

describe('toJsonPointer', () => {
  it('converts a JSON Forms dotted path to a JSON Pointer', () => {
    expect(toJsonPointer('company.taxId')).toBe('/company/taxId')
    expect(toJsonPointer('contacts.0.name')).toBe('/contacts/0/name')
    expect(toJsonPointer('name')).toBe('/name')
  })

  it('returns the root pointer for an empty path', () => {
    expect(toJsonPointer('')).toBe('')
  })

  it('escapes ~ and / inside segments', () => {
    expect(toJsonPointer('a~b.c/d')).toBe('/a~0b/c~1d')
  })
})

describe('parseJsonPointer', () => {
  it('splits a pointer into unescaped segments', () => {
    expect(parseJsonPointer(asPointer('/company/taxId'))).toEqual(['company', 'taxId'])
    expect(parseJsonPointer(asPointer('/contacts/0/name'))).toEqual(['contacts', '0', 'name'])
    expect(parseJsonPointer(asPointer('/a~0b/c~1d'))).toEqual(['a~b', 'c/d'])
    expect(parseJsonPointer(asPointer(''))).toEqual([])
  })

  it('rejects a non-empty value with no leading slash instead of silently dropping a character', () => {
    expect(() => parseJsonPointer(asPointer('company.taxId'))).toThrow(/leading/i)
    expect(() => parseJsonPointer(asPointer('company/taxId'))).toThrow(/leading/i)
  })
})

describe('appendJsonPointerSegment', () => {
  it('appends a plain segment', () => {
    expect(appendJsonPointerSegment(asPointer('/company'), 'taxId')).toBe('/company/taxId')
    expect(appendJsonPointerSegment(asPointer(''), 'notes')).toBe('/notes')
  })

  it('escapes ~ and / in the appended segment', () => {
    expect(appendJsonPointerSegment(asPointer(''), 'a~b')).toBe('/a~0b')
    expect(appendJsonPointerSegment(asPointer(''), 'a/b')).toBe('/a~1b')
    expect(appendJsonPointerSegment(asPointer('/company'), 'tax/id')).toBe('/company/tax~1id')
  })
})

describe('diffToJsonPointer', () => {
  it('returns undefined when nothing differs', () => {
    const value = { company: { taxId: '1' }, contacts: [{ name: 'a' }], active: true }
    expect(diffToJsonPointer(value, structuredClone(value))).toBeUndefined()
    expect(diffToJsonPointer({}, {})).toBeUndefined()
  })

  it('returns the pointer of a changed primitive', () => {
    expect(diffToJsonPointer({ notes: 'a' }, { notes: 'b' })).toBe('/notes')
    expect(diffToJsonPointer({ active: true }, { active: false })).toBe('/active')
    expect(diffToJsonPointer({ headcount: 1 }, { headcount: null })).toBe('/headcount')
  })

  it('returns the pointer of a nested leaf', () => {
    expect(
      diffToJsonPointer(
        { company: { taxId: '1', name: 'x' } },
        { company: { taxId: '2', name: 'x' } },
      ),
    ).toBe('/company/taxId')
  })

  it('walks into a new nested object down to its leaf', () => {
    expect(diffToJsonPointer({}, { company: { taxId: '1' } })).toBe('/company/taxId')
  })

  it('returns the array pointer when the length changed', () => {
    expect(diffToJsonPointer({ contacts: [] }, { contacts: [{ name: 'a' }] })).toBe('/contacts')
    expect(diffToJsonPointer({ contacts: [{}, {}] }, { contacts: [{}] })).toBe('/contacts')
    expect(diffToJsonPointer({}, { contacts: [] })).toBe('/contacts')
  })

  it('returns the element leaf when an array element changed', () => {
    expect(
      diffToJsonPointer(
        { contacts: [{ name: 'a' }, { name: 'b' }] },
        { contacts: [{ name: 'a' }, { name: 'c' }] },
      ),
    ).toBe('/contacts/1/name')
    expect(diffToJsonPointer({ tags: ['x', 'y'] }, { tags: ['x', 'z'] })).toBe('/tags/1')
  })

  it('returns the pointer of a new key', () => {
    expect(diffToJsonPointer({ a: 1 }, { a: 1, b: 2 })).toBe('/b')
  })

  it('returns the pointer of a removed key', () => {
    expect(diffToJsonPointer({ a: 1, b: 2 }, { a: 1 })).toBe('/b')
    expect(diffToJsonPointer({ a: 1, b: 2 }, { a: 1, b: undefined })).toBe('/b')
  })

  it('escapes special characters in the pointer', () => {
    expect(diffToJsonPointer({ 'a/b': 1 }, { 'a/b': 2 })).toBe('/a~1b')
  })
})

describe('diffToJsonPointers', () => {
  it('returns an empty list when nothing differs', () => {
    const value = { company: { taxId: '1' }, contacts: [{ name: 'a' }], active: true }
    expect(diffToJsonPointers(value, structuredClone(value))).toEqual([])
    expect(diffToJsonPointers({}, {})).toEqual([])
  })

  it('collects every differing pointer instead of the first one', () => {
    expect(
      diffToJsonPointers(
        { notes: 'a', company: { taxId: '1', name: 'x' }, active: true },
        { notes: 'b', company: { taxId: '2', name: 'y' }, active: true },
      ),
    ).toEqual(['/notes', '/company/taxId', '/company/name'])
  })

  it('collects added and removed keys', () => {
    expect(diffToJsonPointers({ a: 1, b: 2 }, { a: 9, c: 3 })).toEqual(['/a', '/b', '/c'])
  })

  it('collects each changed array element and stops at a changed length', () => {
    expect(diffToJsonPointers({ tags: ['x', 'y'] }, { tags: ['a', 'b'] })).toEqual([
      '/tags/0',
      '/tags/1',
    ])
    expect(diffToJsonPointers({ contacts: [{}, {}] }, { contacts: [{}] })).toEqual(['/contacts'])
  })

  it('escapes ~ and / in the collected pointers', () => {
    expect(diffToJsonPointers({ 'a/b': 1, 'c~d': 1 }, { 'a/b': 2, 'c~d': 2 })).toEqual([
      '/a~1b',
      '/c~0d',
    ])
  })

  it('walks into a new nested object down to its leaves', () => {
    expect(diffToJsonPointers({}, { company: { taxId: '1', name: 'x' } })).toEqual([
      '/company/taxId',
      '/company/name',
    ])
  })
})
