import { describe, it, expect } from 'vitest'
import { parseBarRaceData } from '@/lib/validation/barRace'

const validInput = {
  categories: ['Alpha', 'Beta'],
  start: 2000,
  end: 2002,
  step: 1,
  frames: [
    { Alpha: 1, Beta: 2 },
    { Alpha: 3, Beta: 4 },
    { Alpha: 5, Beta: 6 },
  ],
}

function reasonOf(json: string): string | undefined {
  const result = parseBarRaceData(json)
  return result.isErr() ? result.error.reason : undefined
}

describe('parseBarRaceData — valid definitions', () => {
  it('accepts a full definition and applies optional-field defaults', () => {
    const result = parseBarRaceData(JSON.stringify(validInput))

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toEqual({
      categories: ['Alpha', 'Beta'],
      start: 2000,
      end: 2002,
      step: 1,
      sort: 'desc',
      maxBars: null,
      stepDuration: null,
      frames: validInput.frames,
    })
  })

  it('accepts explicit sort, maxBars and stepDuration', () => {
    const result = parseBarRaceData(
      JSON.stringify({ ...validInput, sort: 'asc', maxBars: 5, stepDuration: 250 }),
    )

    expect(result.isOk()).toBe(true)
    const data = result._unsafeUnwrap()
    expect(data.sort).toBe('asc')
    expect(data.maxBars).toBe(5)
    expect(data.stepDuration).toBe(250)
  })

  it('treats explicit null maxBars/stepDuration like omitted', () => {
    const result = parseBarRaceData(
      JSON.stringify({ ...validInput, maxBars: null, stepDuration: null }),
    )

    expect(result.isOk()).toBe(true)
    const data = result._unsafeUnwrap()
    expect(data.maxBars).toBeNull()
    expect(data.stepDuration).toBeNull()
  })

  it('allows frames with missing category keys (sparse frames)', () => {
    const result = parseBarRaceData(
      JSON.stringify({ ...validInput, frames: [{ Alpha: 1 }, {}, { Beta: 2 }] }),
    )

    expect(result.isOk()).toBe(true)
  })
})

describe('parseBarRaceData — size and shape guards', () => {
  it('rejects a body over 500 000 characters as oversize', () => {
    expect(reasonOf('x'.repeat(500_001))).toBe('oversize')
  })

  it('rejects truncated JSON as unparseable', () => {
    expect(reasonOf('{"categories": ["a"')).toBe('unparseable')
  })

  it.each([['{}'], ['[]'], ['null'], ['3'], ['""']])('rejects %s as not-an-object', (json) => {
    expect(reasonOf(json)).toBe('not-an-object')
  })
})

describe('parseBarRaceData — categories', () => {
  it.each([
    ['missing', { ...validInput, categories: undefined }],
    ['empty array', { ...validInput, categories: [] }],
    ['non-string item', { ...validInput, categories: ['a', 2] }],
    ['blank item', { ...validInput, categories: ['a', '  '] }],
    ['duplicate item', { ...validInput, categories: ['a', 'a'] }],
  ])('rejects %s categories', (_label, input) => {
    expect(reasonOf(JSON.stringify(input))).toBe('invalid-categories')
  })
})

describe('parseBarRaceData — range', () => {
  it.each([
    ['missing step', { ...validInput, step: undefined }],
    ['non-numeric start', { ...validInput, start: '2000' }],
    ['zero step', { ...validInput, step: 0 }],
    ['negative step', { ...validInput, step: -1 }],
    ['end before start', { ...validInput, start: 2002, end: 2000 }],
  ])('rejects %s', (_label, input) => {
    expect(reasonOf(JSON.stringify(input))).toBe('invalid-range')
  })
})

describe('parseBarRaceData — optional fields', () => {
  it('rejects an unknown sort value', () => {
    expect(reasonOf(JSON.stringify({ ...validInput, sort: 'up' }))).toBe('invalid-sort')
  })

  it.each([
    ['zero', 0],
    ['fractional', 1.5],
    ['string', '3'],
  ])('rejects %s maxBars', (_label, maxBars) => {
    expect(reasonOf(JSON.stringify({ ...validInput, maxBars }))).toBe('invalid-max-bars')
  })

  it.each([
    ['zero', 0],
    ['negative', -100],
    ['string', 'fast'],
  ])('rejects %s stepDuration', (_label, stepDuration) => {
    expect(reasonOf(JSON.stringify({ ...validInput, stepDuration }))).toBe('invalid-step-duration')
  })
})

describe('parseBarRaceData — frames', () => {
  it.each([
    ['missing frames', { ...validInput, frames: undefined }],
    ['empty frames', { ...validInput, frames: [] }],
    ['non-object frame', { ...validInput, frames: [1, 2, 3] }],
    ['unknown category key', { ...validInput, frames: [{ Gamma: 1 }, {}, {}] }],
    ['non-finite value', { ...validInput, frames: [{ Alpha: 'high' }, {}, {}] }],
  ])('rejects %s', (_label, input) => {
    expect(reasonOf(JSON.stringify(input))).toBe('invalid-frames')
  })

  it('rejects a frame count that does not match the range', () => {
    expect(reasonOf(JSON.stringify({ ...validInput, frames: [{ Alpha: 1 }, { Beta: 2 }] }))).toBe(
      'frame-count-mismatch',
    )
  })
})
