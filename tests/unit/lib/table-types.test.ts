import { describe, it, expect } from 'vitest'
import { typeRules } from '@/lib/table-types'

describe('typeRules.number.format', () => {
  it.each([
    [null, ''],
    ['', ''],
  ])('renders %s as empty', (value, expected) => {
    expect(typeRules.number.format(value, 'en-US')).toBe(expected)
  })

  it('localizes numeric values', () => {
    expect(typeRules.number.format(1234567.5, 'en-US')).toBe('1,234,567.5')
    expect(typeRules.number.format('42', 'en-US')).toBe('42')
  })

  it('passes non-numeric strings through unchanged', () => {
    expect(typeRules.number.format('n/a', 'en-US')).toBe('n/a')
  })
})

describe('typeRules.date.format', () => {
  it('renders null and empty as empty', () => {
    expect(typeRules.date.format(null, 'en-US')).toBe('')
    expect(typeRules.date.format('', 'en-US')).toBe('')
  })

  it('formats a parseable timestamp with date and time parts', () => {
    const formatted = typeRules.date.format('2026-07-08T12:30:00Z', 'en-US')

    expect(formatted).toContain('2026')
    expect(formatted).toContain('Jul')
  })

  it('passes unparseable values through unchanged', () => {
    expect(typeRules.date.format('yesterday-ish', 'en-US')).toBe('yesterday-ish')
  })
})

describe('typeRules.boolean.format', () => {
  it.each([
    [null, ''],
    [true, '✓'],
    [false, '—'],
  ])('renders %s as %s', (value, expected) => {
    expect(typeRules.boolean.format(value, 'en-US')).toBe(expected)
  })
})

describe('typeRules.string.format', () => {
  it('renders null as empty and stringifies everything else', () => {
    expect(typeRules.string.format(null, 'en-US')).toBe('')
    expect(typeRules.string.format(123, 'en-US')).toBe('123')
  })
})

describe('typeRules column behavior', () => {
  it('right-aligns numbers and disables sorting only for booleans', () => {
    expect(typeRules.number.align).toBe('right')
    expect(typeRules.boolean.align).toBe('center')
    expect(typeRules.number.sortable).toBe(true)
    expect(typeRules.boolean.sortable).toBe(false)
    expect(typeRules.boolean.filterable).toBe(false)
  })
})
