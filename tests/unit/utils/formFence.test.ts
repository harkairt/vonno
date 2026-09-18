import { describe, it, expect } from 'vitest'
import { hasFormFence, splitFormFences } from '@/app/utils/formFence'

const fence = (body: string) => '```form\n' + body + '\n```'
const withId = (id: string) => fence(JSON.stringify({ instanceId: id }))

describe('hasFormFence', () => {
  it('is false for empty input and text without a form fence opener', () => {
    expect(hasFormFence(null)).toBe(false)
    expect(hasFormFence('')).toBe(false)
    expect(hasFormFence('plain text')).toBe(false)
    expect(hasFormFence('```json\n{}\n```')).toBe(false)
    expect(hasFormFence('```formula\n1\n```')).toBe(false)
  })

  it('is true for closed, invalid and unclosed form fences', () => {
    expect(hasFormFence(withId('a1'))).toBe(true)
    expect(hasFormFence(`Intro\n${fence('{ not json')}`)).toBe(true)
    expect(hasFormFence('Intro\n\n```form')).toBe(true)
    expect(hasFormFence('Intro\n\n```form  \n{ "inst')).toBe(true)
  })
})

describe('splitFormFences', () => {
  it('returns empty output for null, undefined and empty input', () => {
    expect(splitFormFences(null)).toEqual({ markdown: '', instanceIds: [] })
    expect(splitFormFences(undefined)).toEqual({ markdown: '', instanceIds: [] })
    expect(splitFormFences('')).toEqual({ markdown: '', instanceIds: [] })
  })

  it('returns the trimmed text untouched when there is no fence', () => {
    expect(splitFormFences('Hello **world**\n')).toEqual({
      markdown: 'Hello **world**',
      instanceIds: [],
    })
  })

  it('extracts one fence and removes it from the markdown', () => {
    expect(splitFormFences(`Please fill this in.\n\n${withId('a1')}`)).toEqual({
      markdown: 'Please fill this in.',
      instanceIds: ['a1'],
    })
  })

  it('extracts two fences in document order', () => {
    expect(splitFormFences(`${withId('a1')}\n\nand\n\n${withId('b2')}`)).toEqual({
      markdown: 'and',
      instanceIds: ['a1', 'b2'],
    })
  })

  it('ignores duplicate ids', () => {
    expect(splitFormFences(`${withId('a1')}\n${withId('a1')}`).instanceIds).toEqual(['a1'])
  })

  it('removes a fence with invalid JSON without throwing', () => {
    expect(splitFormFences(`Text\n${fence('{ not json')}`)).toEqual({
      markdown: 'Text',
      instanceIds: [],
    })
  })

  it('removes a fence whose body is not a plain object', () => {
    expect(splitFormFences(fence('"a1"'))).toEqual({ markdown: '', instanceIds: [] })
    expect(splitFormFences(fence('["a1"]'))).toEqual({ markdown: '', instanceIds: [] })
    expect(splitFormFences(fence('null'))).toEqual({ markdown: '', instanceIds: [] })
  })

  it('removes a fence without a non-empty string instanceId', () => {
    expect(splitFormFences(fence('{ "id": "a1" }'))).toEqual({
      markdown: '',
      instanceIds: [],
    })
    expect(splitFormFences(fence('{ "instanceId": "" }'))).toEqual({
      markdown: '',
      instanceIds: [],
    })
    expect(splitFormFences(fence('{ "instanceId": 5 }'))).toEqual({
      markdown: '',
      instanceIds: [],
    })
  })

  it('removes an unclosed form fence at the end of the text (streaming)', () => {
    expect(splitFormFences('Working on it.\n\n```form\n{ "instanceId": "a')).toEqual({
      markdown: 'Working on it.',
      instanceIds: [],
    })
    expect(splitFormFences('Working on it.\n\n```form')).toEqual({
      markdown: 'Working on it.',
      instanceIds: [],
    })
  })

  it('keeps text that follows an unclosed form fence visible', () => {
    expect(splitFormFences('Before\n\n```form\n{ "instanceId": "a\n\nAfter')).toEqual({
      markdown: 'Before\n\nAfter',
      instanceIds: [],
    })
  })

  it('removes a fence in the middle of the text and keeps both sides', () => {
    expect(splitFormFences(`Before\n\n${withId('a1')}\n\nAfter`)).toEqual({
      markdown: 'Before\n\nAfter',
      instanceIds: ['a1'],
    })
  })

  it('collapses three or more line breaks left by the removal into two', () => {
    expect(splitFormFences(`Before\n\n\n${withId('a1')}\n\n\n\nAfter`).markdown).toBe(
      'Before\n\nAfter',
    )
  })

  it('leaves other fence types untouched', () => {
    const other = '```json\n{ "instanceId": "x" }\n```'
    expect(splitFormFences(`${other}\n\n${withId('a1')}`)).toEqual({
      markdown: other,
      instanceIds: ['a1'],
    })
    expect(splitFormFences('```formula\n1+1\n```')).toEqual({
      markdown: '```formula\n1+1\n```',
      instanceIds: [],
    })
  })

  it('accepts trailing spaces after the opening fence and CRLF line endings', () => {
    expect(splitFormFences('```form  \r\n{ "instanceId": "a1" }\r\n```')).toEqual({
      markdown: '',
      instanceIds: ['a1'],
    })
  })
})
