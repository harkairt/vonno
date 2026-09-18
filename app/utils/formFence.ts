export interface FormFenceSplit {
  markdown: string
  instanceIds: string[]
}

const OPENING_FENCE = /^```form[ \t]*$/m
const CLOSED_FENCE = /^```form[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm
const CLOSED_FENCE_DETECT = /^```form[ \t]*\r?\n[\s\S]*?^```[ \t]*$/m
const UNCLOSED_FENCE = /^```form[ \t]*(?:\r?\n[\s\S]*?)?(?=\r?\n\r?\n|$)/m

export function hasFormFence(text: string | null | undefined): boolean {
  return !!text && OPENING_FENCE.test(text)
}

export function hasClosedFormFence(text: string | null | undefined): boolean {
  return !!text && CLOSED_FENCE_DETECT.test(text)
}

function parseInstanceId(body: string): string | undefined {
  try {
    const value: unknown = JSON.parse(body)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
    const id = (value as Record<string, unknown>).instanceId
    return typeof id === 'string' && id !== '' ? id : undefined
  } catch {
    return undefined
  }
}

export function splitFormFences(text: string | null | undefined): FormFenceSplit {
  if (!text) return { markdown: '', instanceIds: [] }

  const instanceIds: string[] = []
  const withoutClosed = text.replace(CLOSED_FENCE, (_match, body: string) => {
    const id = parseInstanceId(body)
    if (id && !instanceIds.includes(id)) instanceIds.push(id)
    return ''
  })

  const markdown = withoutClosed
    .replace(UNCLOSED_FENCE, '')
    .replace(/(?:\r?\n){3,}/g, '\n\n')
    .trim()

  return { markdown, instanceIds }
}
