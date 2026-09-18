import { describe, it, expect } from 'vitest'
import { resolveSessionAgents, resolveSessionAgentId } from '@/app/utils/sessionAgents'
import { makeUser } from '@/tests/utils/factories'

describe('resolveSessionAgents', () => {
  const human = makeUser({ id: 3, email: 'human@example.com', isVirtual: false })
  const agent = makeUser({ id: 42, email: 'agent@example.com', isVirtual: true })
  const outsider = makeUser({ id: 7, email: 'outsider@example.com', isVirtual: true })
  const selectableUsers = [human, agent, outsider]

  it('keeps only the virtual members of the session', () => {
    const result = resolveSessionAgents([human.email, agent.email], selectableUsers)
    expect(result).toEqual([agent])
  })

  it('returns nothing while members or selectable users are unknown', () => {
    expect(resolveSessionAgents(undefined, selectableUsers)).toEqual([])
    expect(resolveSessionAgents([human.email, agent.email], undefined)).toEqual([])
  })
})

describe('resolveSessionAgentId', () => {
  const human = makeUser({ id: 3, email: 'human@example.com', isVirtual: false })
  const agent = makeUser({ id: 42, email: 'agent@example.com', isVirtual: true })
  const otherAgent = makeUser({ id: 8, email: 'other-agent@example.com', isVirtual: true })

  it('resolves the agent of a 1:1 agent session', () => {
    expect(resolveSessionAgentId([human.email, agent.email], [human, agent])).toBe(42)
  })

  it('picks the lowest id when several agents are in the session', () => {
    expect(
      resolveSessionAgentId(
        [human.email, agent.email, otherAgent.email],
        [human, agent, otherAgent],
      ),
    ).toBe(8)
  })

  it('is undefined for a session with no agent, so callers can stay disabled', () => {
    expect(resolveSessionAgentId([human.email], [human, agent])).toBeUndefined()
    expect(resolveSessionAgentId(undefined, undefined)).toBeUndefined()
  })
})
