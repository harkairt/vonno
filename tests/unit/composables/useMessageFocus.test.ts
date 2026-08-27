import { describe, it, expect, afterEach } from 'vitest'
import { useMessageFocus } from '~/composables/useMessageFocus'
import { installBlockedStorage } from '@/tests/utils/storage'

const KEY = 'innochat-focused-messages:session-1'

function stored(): unknown {
  const raw = localStorage.getItem(KEY)
  return raw ? JSON.parse(raw) : null
}

describe('useMessageFocus', () => {
  it('starts empty when nothing is stored', () => {
    const focus = useMessageFocus('session-1')

    expect(focus.focusedIds.value).toEqual([])
    expect(focus.focusedCount.value).toBe(0)
    expect(focus.hasFocusedMessages.value).toBe(false)
    expect(focus.isFocused('m1')).toBe(false)
  })

  it('toggling focuses a message and persists it', () => {
    const focus = useMessageFocus('session-1')

    focus.toggleFocus('m1')

    expect(focus.isFocused('m1')).toBe(true)
    expect(focus.focusedCount.value).toBe(1)
    expect(focus.hasFocusedMessages.value).toBe(true)
    expect(stored()).toEqual({ version: 1, messageIds: ['m1'] })
  })

  it('toggling again unfocuses and persists the removal', () => {
    const focus = useMessageFocus('session-1')
    focus.toggleFocus('m1')
    focus.toggleFocus('m2')

    focus.toggleFocus('m1')

    expect(focus.focusedIds.value).toEqual(['m2'])
    expect(stored()).toEqual({ version: 1, messageIds: ['m2'] })
  })

  it('clearAll removes every focused message and persists', () => {
    const focus = useMessageFocus('session-1')
    focus.toggleFocus('m1')
    focus.toggleFocus('m2')

    focus.clearAll()

    expect(focus.focusedIds.value).toEqual([])
    expect(focus.hasFocusedMessages.value).toBe(false)
    expect(stored()).toEqual({ version: 1, messageIds: [] })
  })

  it('restores persisted ids, deduplicated and filtered to non-empty strings', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ version: 1, messageIds: ['a', 'a', '', 'b', 42, null] }),
    )

    const focus = useMessageFocus('session-1')

    expect(focus.focusedIds.value).toEqual(['a', 'b'])
  })

  it.each([
    ['a future storage version', JSON.stringify({ version: 2, messageIds: ['a'] })],
    ['a non-array messageIds field', JSON.stringify({ version: 1, messageIds: 'a' })],
    ['malformed JSON', 'not-json{'],
    ['a JSON null', 'null'],
  ])('ignores %s in storage', (_label, raw) => {
    localStorage.setItem(KEY, raw)

    const focus = useMessageFocus('session-1')

    expect(focus.focusedIds.value).toEqual([])
  })

  it('keeps sessions isolated by key', () => {
    const first = useMessageFocus('session-1')
    first.toggleFocus('m1')

    const second = useMessageFocus('session-2')

    expect(second.focusedIds.value).toEqual([])
    expect(localStorage.getItem('innochat-focused-messages:session-2')).toBeNull()
  })
})

describe('useMessageFocus — blocked storage', () => {
  let restore: (() => void) | undefined

  afterEach(() => {
    restore?.()
    restore = undefined
  })

  it('works in memory when localStorage throws', () => {
    restore = installBlockedStorage()

    let focus!: ReturnType<typeof useMessageFocus>
    expect(() => {
      focus = useMessageFocus('session-1')
    }).not.toThrow()

    expect(() => focus.toggleFocus('m1')).not.toThrow()
    expect(focus.isFocused('m1')).toBe(true)
  })
})
