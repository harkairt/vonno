import { asJsonPointer, parseJsonPointer } from '~/utils/jsonPointer'

type FormData = Record<string, unknown>

const isContainer = (value: unknown): value is Record<string, unknown> | unknown[] =>
  typeof value === 'object' && value !== null

function readAtPointer(root: FormData, segments: string[]): { found: boolean; value?: unknown } {
  let current: unknown = root
  for (const segment of segments) {
    if (!isContainer(current) || !Object.hasOwn(current, segment)) return { found: false }
    current = (current as Record<string, unknown>)[segment]
  }
  return { found: true, value: current }
}

function writeAtPointer(root: FormData, segments: string[], value: unknown): void {
  let current: Record<string, unknown> = root
  segments.slice(0, -1).forEach((segment) => {
    if (!isContainer(current[segment])) current[segment] = {}
    current = current[segment] as Record<string, unknown>
  })
  const last = segments.at(-1)
  if (last !== undefined) current[last] = value
}

export function mergeServerData(
  local: FormData,
  server: FormData,
  preservedPointers: ReadonlyArray<JsonPointer | string | undefined>,
): FormData {
  const merged = structuredClone(server)

  for (const pointer of preservedPointers) {
    if (pointer === undefined) continue
    const segments = parseJsonPointer(asJsonPointer(pointer))
    if (segments.length === 0) continue

    const localValue = readAtPointer(local, segments)
    if (localValue.found) writeAtPointer(merged, segments, structuredClone(localValue.value))
  }
  return merged
}
