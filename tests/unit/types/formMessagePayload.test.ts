import { describe, it, expect, vi } from 'vitest'
import { parseFormMessagePayload } from '@/types/api/schemas'

const envelope = {
  text: 'Kérlek, töltsd ki a cégadatokat:',
  formName: 'Partner rögzítés',
  instanceId: '3f2a1c4e-5b60-4c31-9a77-1d2e3f4a5b6c',
}

describe('parseFormMessagePayload', () => {
  it('parses a complete envelope', () => {
    expect(parseFormMessagePayload(JSON.stringify(envelope))).toEqual(envelope)
  })

  it('keeps a null formName for an ad hoc form', () => {
    const payload = parseFormMessagePayload(JSON.stringify({ ...envelope, formName: null }))

    expect(payload?.formName).toBeNull()
  })

  it('parses an empty text', () => {
    const payload = parseFormMessagePayload(JSON.stringify({ ...envelope, text: '' }))

    expect(payload?.text).toBe('')
  })

  it('defaults a missing text and formName', () => {
    const payload = parseFormMessagePayload(JSON.stringify({ instanceId: 'inst-1' }))

    expect(payload).toEqual({ text: '', formName: null, instanceId: 'inst-1' })
  })

  it('unwraps double-encoded JSON', () => {
    expect(parseFormMessagePayload(JSON.stringify(JSON.stringify(envelope)))).toEqual(envelope)
  })

  it.each([
    ['a missing instanceId', JSON.stringify({ text: 'hi', formName: null })],
    ['an empty instanceId', JSON.stringify({ ...envelope, instanceId: '' })],
    ['a non-string instanceId', JSON.stringify({ ...envelope, instanceId: 42 })],
    ['a non-string text', JSON.stringify({ ...envelope, text: 42 })],
    ['malformed JSON', '{ not json'],
    ['a JSON array', JSON.stringify([envelope])],
    ['a JSON primitive', JSON.stringify(7)],
    ['plain markdown', 'Please fill in the form.'],
  ])('returns null for %s', (_case, input) => {
    expect(parseFormMessagePayload(input)).toBeNull()
  })

  it.each([null, undefined, ''])('returns null for %s input', (input) => {
    expect(parseFormMessagePayload(input)).toBeNull()
  })

  it('never throws on deeply nested string encoding', () => {
    let encoded = JSON.stringify(envelope)
    for (let i = 0; i < 10; i++) encoded = JSON.stringify(encoded)

    expect(() => parseFormMessagePayload(encoded)).not.toThrow()
    expect(parseFormMessagePayload(encoded)).toBeNull()
  })

  it('logs a warning with the Zod issues when the payload fails schema validation', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const payload = parseFormMessagePayload(JSON.stringify({ text: 'hi', formName: null }))

    expect(payload).toBeNull()
    expect(warnSpy).toHaveBeenCalledTimes(1)
    const [, issues] = warnSpy.mock.calls[0] as [string, unknown]
    expect(Array.isArray(issues)).toBe(true)
    expect((issues as { path: unknown[] }[])[0]?.path).toEqual(['instanceId'])

    warnSpy.mockRestore()
  })

  it('logs a warning when the raw text is not valid JSON at all', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const payload = parseFormMessagePayload('{ not json')

    expect(payload).toBeNull()
    expect(warnSpy).toHaveBeenCalledTimes(1)

    warnSpy.mockRestore()
  })
})
