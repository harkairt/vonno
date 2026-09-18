/**
 * An RFC 6901 JSON Pointer, e.g. "/company/taxId". JSON Forms dotted paths
 * ("company.taxId") and UI schema scopes ("#/properties/company/properties/taxId")
 * are different string encodings of the same location; the brand keeps them from
 * reaching a function that expects an actual pointer. The only producers are the
 * conversion helpers below (`toJsonPointer`, `diffToJsonPointer(s)`) and
 * `scopeToJsonPointer` in `~/utils/formRendererContext`.
 */
export type JsonPointer = string & { readonly __jsonPointerBrand: unique symbol }

const escapeSegment = (segment: string): string => segment.replace(/~/g, '~0').replace(/\//g, '~1')

const unescapeSegment = (segment: string): string => segment.replace(/~1/g, '/').replace(/~0/g, '~')

export const toJsonPointer = (path: string): JsonPointer =>
  (path === '' ? '' : `/${path.split('.').map(escapeSegment).join('/')}`) as JsonPointer

export const parseJsonPointer = (pointer: JsonPointer): string[] => {
  if (pointer === '') return []
  if (!pointer.startsWith('/')) {
    throw new Error(`Invalid JSON pointer "${pointer}": expected the empty string or a leading "/"`)
  }
  return pointer.slice(1).split('/').map(unescapeSegment)
}

export const appendJsonPointerSegment = (pointer: JsonPointer, segment: string): JsonPointer =>
  `${pointer}/${escapeSegment(segment)}` as JsonPointer

/**
 * Trusts a plain string as an already-valid JSON Pointer. Reserved for the two
 * boundaries where a pointer arrives from outside our own conversion helpers:
 * ajv's `instancePath` (already RFC 6901-escaped by ajv) and a `data-form-path`
 * DOM attribute read back after a renderer wrote it there with `toJsonPointer`.
 */
export const asJsonPointer = (pointer: string): JsonPointer => pointer as JsonPointer

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// A missing key and an empty object are the same thing for a JSON Forms edit, so
// a newly created nested object is walked down to the leaf that was actually typed.
function asObject(value: unknown): Record<string, unknown> | undefined {
  if (isPlainObject(value)) return value
  return value === undefined ? {} : undefined
}

interface Diff {
  firstOnly: boolean
  pointers: string[]
}

function walkArrays(prev: unknown, next: unknown, pointer: string, out: Diff): void {
  if (!Array.isArray(prev) || !Array.isArray(next) || prev.length !== next.length) {
    out.pointers.push(pointer)
    return
  }
  for (let i = 0; i < next.length; i++) {
    walk(prev[i], next[i], `${pointer}/${i}`, out)
    if (out.firstOnly && out.pointers.length > 0) return
  }
}

function walk(prev: unknown, next: unknown, pointer: string, out: Diff): void {
  if (Array.isArray(prev) || Array.isArray(next)) return walkArrays(prev, next, pointer, out)

  const prevObject = asObject(prev)
  const nextObject = asObject(next)
  if (prevObject && nextObject && (isPlainObject(prev) || isPlainObject(next))) {
    for (const key of new Set([...Object.keys(prevObject), ...Object.keys(nextObject)])) {
      walk(prevObject[key], nextObject[key], `${pointer}/${escapeSegment(key)}`, out)
      if (out.firstOnly && out.pointers.length > 0) return
    }
    return
  }

  if (!Object.is(prev, next)) out.pointers.push(pointer)
}

export const diffToJsonPointer = (prev: unknown, next: unknown): JsonPointer | undefined => {
  const out: Diff = { firstOnly: true, pointers: [] }
  walk(prev, next, '', out)
  return out.pointers[0] as JsonPointer | undefined
}

export const diffToJsonPointers = (prev: unknown, next: unknown): JsonPointer[] => {
  const out: Diff = { firstOnly: false, pointers: [] }
  walk(prev, next, '', out)
  return out.pointers as JsonPointer[]
}
