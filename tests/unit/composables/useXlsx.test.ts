/**
 * useXlsx caches the dynamically-imported xlsx module in module-level
 * singletons, so every test re-imports a fresh composable module via
 * vi.resetModules + vi.doMock to control that state.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

function makeXlsxMocks() {
  const worksheet = { kind: 'worksheet' }
  const workbook = { kind: 'workbook' }
  return {
    worksheet,
    workbook,
    utils: {
      aoa_to_sheet: vi.fn(() => worksheet),
      book_new: vi.fn(() => workbook),
      book_append_sheet: vi.fn(),
    },
    writeFile: vi.fn(),
  }
}

async function loadUseXlsx(factory: () => unknown) {
  vi.resetModules()
  vi.doMock('xlsx', factory)
  const mod = await import('~/composables/useXlsx')
  return mod.useXlsx()
}

afterEach(() => {
  vi.doUnmock('xlsx')
  vi.resetModules()
})

describe('useXlsx.exportToXlsx', () => {
  it('builds a single-sheet workbook from headers and rows and writes it', async () => {
    const mocks = makeXlsxMocks()
    const { exportToXlsx, isLoading } = await loadUseXlsx(() => mocks)

    const ok = await exportToXlsx(
      ['Name', 'Score'],
      [
        ['Alice', '10'],
        ['Bob', '7'],
      ],
    )

    expect(ok).toBe(true)
    expect(mocks.utils.aoa_to_sheet).toHaveBeenCalledWith([
      ['Name', 'Score'],
      ['Alice', '10'],
      ['Bob', '7'],
    ])
    expect(mocks.utils.book_append_sheet).toHaveBeenCalledWith(
      mocks.workbook,
      mocks.worksheet,
      'Sheet1',
    )
    expect(mocks.writeFile).toHaveBeenCalledWith(mocks.workbook, 'export.xlsx')
    expect(isLoading.value).toBe(false)
  })

  it('reuses the already-loaded module on subsequent exports', async () => {
    const mocks = makeXlsxMocks()
    const { exportToXlsx } = await loadUseXlsx(() => mocks)

    await exportToXlsx(['h'], [['a']])
    const ok = await exportToXlsx(['h'], [['b']], 'second.xlsx')

    expect(ok).toBe(true)
    expect(mocks.writeFile).toHaveBeenCalledTimes(2)
    expect(mocks.writeFile).toHaveBeenLastCalledWith(mocks.workbook, 'second.xlsx')
  })

  it('shares one in-flight load between concurrent exports', async () => {
    const mocks = makeXlsxMocks()
    const { exportToXlsx } = await loadUseXlsx(() => mocks)

    const [first, second] = await Promise.all([
      exportToXlsx(['h'], [['a']]),
      exportToXlsx(['h'], [['b']]),
    ])

    expect(first).toBe(true)
    expect(second).toBe(true)
    expect(mocks.writeFile).toHaveBeenCalledTimes(2)
  })

  it('returns false when writing the file throws', async () => {
    const mocks = makeXlsxMocks()
    mocks.writeFile.mockImplementation(() => {
      throw new Error('disk full')
    })
    const { exportToXlsx } = await loadUseXlsx(() => mocks)

    await expect(exportToXlsx(['h'], [['a']])).resolves.toBe(false)
  })

  it('returns false when the xlsx module fails to load', async () => {
    const { exportToXlsx, isLoading } = await loadUseXlsx(() => {
      throw new Error('chunk load error')
    })

    await expect(exportToXlsx(['h'], [['a']])).resolves.toBe(false)
    expect(isLoading.value).toBe(false)
  })
})
