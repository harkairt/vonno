import { describe, it, expect } from 'vitest'
import { getUserFriendlyMessage } from '~/utils/error'

describe('getUserFriendlyMessage', () => {
  it('returns the message of a real Error', () => {
    expect(getUserFriendlyMessage(new Error('token expired'), 'fallback')).toBe('token expired')
  })

  it('falls back for an Error with an empty message', () => {
    expect(getUserFriendlyMessage(new Error(''), 'fallback')).toBe('fallback')
  })

  it.each([['plain string'], [{ message: 'object' }], [null], [undefined], [42]])(
    'falls back for non-Error value %s',
    (value) => {
      expect(getUserFriendlyMessage(value, 'fallback')).toBe('fallback')
    },
  )
})
