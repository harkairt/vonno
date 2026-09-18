import type { UserDTO } from '@/types/api/schemas'

export function resolveSessionAgents(
  members: string[] | undefined,
  selectableUsers: UserDTO[] | undefined,
): UserDTO[] {
  if (!members || !selectableUsers) return []
  return selectableUsers.filter((user) => user.isVirtual && members.includes(user.email))
}

/**
 * The agent id to address the session with. With several agents the lowest id is an
 * arbitrary but stable pick — no form is tracked back to the agent that opened it.
 */
export function resolveSessionAgentId(
  members: string[] | undefined,
  selectableUsers: UserDTO[] | undefined,
): number | undefined {
  const ids = resolveSessionAgents(members, selectableUsers).map((agent) => agent.id)
  return ids.length > 0 ? Math.min(...ids) : undefined
}
