import { describe, it, expect } from 'vitest'
import { mergeServerData } from '~/utils/formMerge'

const server = {
  company: { taxId: '12345678-2-42', name: 'Acme Kft. (computed)' },
  contacts: [{ name: 'Server' }],
  active: true,
}

describe('mergeServerData', () => {
  it('returns the server data when no field is focused', () => {
    const local = { company: { taxId: 'local', name: 'local' }, active: false }

    expect(mergeServerData(local, server, [undefined])).toEqual(server)
  })

  it('keeps the local value of the focused field when the server differs', () => {
    const local = { company: { taxId: 'typing…', name: 'local' }, active: false }

    expect(mergeServerData(local, server, ['/company/taxId'])).toEqual({
      ...server,
      company: { taxId: 'typing…', name: 'Acme Kft. (computed)' },
    })
  })

  it('keeps a focused array element from local', () => {
    const local = { contacts: [{ name: 'Local' }] }

    expect(mergeServerData(local, server, ['/contacts/0/name'])).toEqual({
      ...server,
      contacts: [{ name: 'Local' }],
    })
  })

  it('keeps an explicitly cleared focused field from local', () => {
    const local = { company: { taxId: undefined } }

    expect(mergeServerData(local, server, ['/company/taxId'])).toEqual({
      ...server,
      company: { taxId: undefined, name: 'Acme Kft. (computed)' },
    })
  })

  it('creates the focused path in the clone when the server lacks it', () => {
    const local = { extra: { note: 'mine' } }

    expect(mergeServerData(local, { active: true }, ['/extra/note'])).toEqual({
      active: true,
      extra: { note: 'mine' },
    })
  })

  it('uses the server value when the focused field is missing in local', () => {
    const local = { active: false }

    expect(mergeServerData(local, server, ['/company/taxId'])).toEqual(server)
    expect(mergeServerData({}, server, ['/contacts/3/name'])).toEqual(server)
  })

  it('keeps every listed pointer when several differ from the server', () => {
    const local = {
      company: { taxId: 'mine', name: 'mine' },
      contacts: [{ name: 'Local' }],
      active: false,
    }

    expect(
      mergeServerData(local, server, ['/company/taxId', '/contacts/0/name', '/active']),
    ).toEqual({
      company: { taxId: 'mine', name: 'Acme Kft. (computed)' },
      contacts: [{ name: 'Local' }],
      active: false,
    })
  })

  it('takes the server value for pointers that were not listed', () => {
    const local = { company: { taxId: 'mine', name: 'mine' }, active: false }

    expect(mergeServerData(local, server, ['/company/taxId'])).toEqual({
      ...server,
      company: { taxId: 'mine', name: 'Acme Kft. (computed)' },
    })
  })

  it('returns the server data for an empty pointer list', () => {
    const local = { company: { taxId: 'mine', name: 'mine' } }

    expect(mergeServerData(local, server, [])).toEqual(server)
  })

  it('ignores undefined and root pointers mixed into the list', () => {
    const local = { company: { taxId: 'mine', name: 'mine' } }

    expect(mergeServerData(local, server, [undefined, '', '/company/taxId'])).toEqual({
      ...server,
      company: { taxId: 'mine', name: 'Acme Kft. (computed)' },
    })
  })

  it('keeps a pointer whose property name needs RFC 6901 escaping', () => {
    const local = { 'a/b': 'mine', 'c~d': 'mine' }

    expect(mergeServerData(local, { 'a/b': 'server', 'c~d': 'server' }, ['/a~1b'])).toEqual({
      'a/b': 'mine',
      'c~d': 'server',
    })
  })

  it('returns a deep clone that shares nothing with server or local', () => {
    const local = { company: { taxId: 'mine', name: 'x' } }
    const result = mergeServerData(local, server, ['/company/taxId'])

    expect(result).not.toBe(server)
    expect(result.company).not.toBe(server.company)
    expect(result.contacts).not.toBe(server.contacts)
    expect(result.company).not.toBe(local.company)
    ;(result.company as Record<string, unknown>).taxId = 'changed'
    ;(result.contacts as unknown[]).push('x')
    expect(server.company.taxId).toBe('12345678-2-42')
    expect(server.contacts).toHaveLength(1)
    expect(local.company.taxId).toBe('mine')
  })
})
