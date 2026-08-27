import { describe, it, expect, afterEach } from 'vitest'
import { useFilePreview } from '~/composables/useFilePreview'
import { useFakeTimersSafe, freezeClock, useRealTimers } from '@/tests/utils/timers'
import type { ReceivedFile } from '@/types/api/schemas'
import type { PreviewedFile } from '@/types/filePreview'

const KEY = 'innochat-previewed-files:session-1'

function makeReceivedFile(id: string, overrides: Partial<ReceivedFile> = {}): ReceivedFile {
  return {
    id,
    fileName: `${id}.pdf`,
    mimeType: 'application/pdf',
    url: `https://files.example.com/${id}`,
    ...overrides,
  }
}

function storedFiles(): PreviewedFile[] {
  const raw = localStorage.getItem(KEY)
  return raw ? (JSON.parse(raw) as { files: PreviewedFile[] }).files : []
}

afterEach(() => {
  useRealTimers()
})

describe('useFilePreview — previewFile', () => {
  it('records the file, opens the panel and persists the entry', () => {
    const preview = useFilePreview('session-1')

    preview.previewFile(makeReceivedFile('file-a'), 'msg-1', '2026-01-01T00:00:00Z')

    expect(preview.isOpen.value).toBe(true)
    expect(preview.activeFile.value?.fileId).toBe('file-a')
    expect(preview.previewedFiles.value).toHaveLength(1)
    expect(preview.hasPreviewedFiles.value).toBe(true)

    const entry = preview.previewedFiles.value[0]!
    expect(entry).toMatchObject({
      fileId: 'file-a',
      fileName: 'file-a.pdf',
      mimeType: 'application/pdf',
      messageId: 'msg-1',
      messageDate: '2026-01-01T00:00:00Z',
    })
    expect(typeof entry.previewedAt).toBe('number')
    expect(storedFiles()).toHaveLength(1)
  })

  it('deduplicates by fileId and moves the re-previewed file to the front', () => {
    useFakeTimersSafe()
    const preview = useFilePreview('session-1')

    freezeClock('2026-01-01T00:00:00Z')
    preview.previewFile(makeReceivedFile('file-a'), 'msg-1', 'd1')
    freezeClock('2026-01-01T00:00:01Z')
    preview.previewFile(makeReceivedFile('file-b'), 'msg-2', 'd2')
    freezeClock('2026-01-01T00:00:02Z')
    preview.previewFile(makeReceivedFile('file-a'), 'msg-3', 'd3')

    expect(preview.previewedFiles.value.map((f) => f.fileId)).toEqual(['file-a', 'file-b'])
    expect(preview.previewedFiles.value[0]?.messageId).toBe('msg-3')
  })

  it('caps the history at 25 entries, dropping the oldest', () => {
    const preview = useFilePreview('session-1')

    for (let i = 0; i < 26; i++) {
      preview.previewFile(makeReceivedFile(`file-${i}`), `msg-${i}`, 'd')
    }

    expect(preview.previewedFiles.value).toHaveLength(25)
    expect(preview.previewedFiles.value[0]?.fileId).toBe('file-25')
    expect(preview.previewedFiles.value.some((f) => f.fileId === 'file-0')).toBe(false)
    expect(storedFiles()).toHaveLength(25)
  })
})

describe('useFilePreview — openFileDetail', () => {
  it('bumps a known file to the front and persists the new order', () => {
    useFakeTimersSafe()
    const preview = useFilePreview('session-1')

    freezeClock('2026-01-01T00:00:00Z')
    preview.previewFile(makeReceivedFile('file-a'), 'msg-1', 'd1')
    freezeClock('2026-01-01T00:00:01Z')
    preview.previewFile(makeReceivedFile('file-b'), 'msg-2', 'd2')
    expect(preview.previewedFiles.value.map((f) => f.fileId)).toEqual(['file-b', 'file-a'])

    freezeClock('2026-01-01T00:00:02Z')
    const entryA = { ...preview.previewedFiles.value[1]! }
    preview.openFileDetail(entryA)

    expect(preview.activeFile.value?.fileId).toBe('file-a')
    expect(preview.previewedFiles.value.map((f) => f.fileId)).toEqual(['file-a', 'file-b'])
    expect(storedFiles().map((f) => f.fileId)).toEqual(['file-a', 'file-b'])
  })

  it('only activates an unknown file without touching the history', () => {
    const preview = useFilePreview('session-1')
    preview.previewFile(makeReceivedFile('file-a'), 'msg-1', 'd1')

    const ghost: PreviewedFile = {
      fileId: 'ghost',
      fileName: 'ghost.pdf',
      mimeType: 'application/pdf',
      url: 'https://files.example.com/ghost',
      messageId: 'msg-x',
      messageDate: 'd',
      previewedAt: 1,
    }
    preview.openFileDetail(ghost)

    expect(preview.activeFile.value?.fileId).toBe('ghost')
    expect(preview.previewedFiles.value.map((f) => f.fileId)).toEqual(['file-a'])
  })
})

describe('useFilePreview — panel state', () => {
  it('goToList clears the active file but keeps the panel open', () => {
    const preview = useFilePreview('session-1')
    preview.previewFile(makeReceivedFile('file-a'), 'msg-1', 'd1')

    preview.goToList()

    expect(preview.activeFile.value).toBeNull()
    expect(preview.isOpen.value).toBe(true)
  })

  it('closePreview closes the panel and clears the active file', () => {
    const preview = useFilePreview('session-1')
    preview.previewFile(makeReceivedFile('file-a'), 'msg-1', 'd1')

    preview.closePreview()

    expect(preview.isOpen.value).toBe(false)
    expect(preview.activeFile.value).toBeNull()
  })

  it('toggleOpen opens to the list view and closes again', () => {
    const preview = useFilePreview('session-1')

    preview.toggleOpen()
    expect(preview.isOpen.value).toBe(true)
    expect(preview.activeFile.value).toBeNull()

    preview.toggleOpen()
    expect(preview.isOpen.value).toBe(false)
  })
})

describe('useFilePreview — persistence', () => {
  it('restores history for the same session', () => {
    const first = useFilePreview('session-1')
    first.previewFile(makeReceivedFile('file-a'), 'msg-1', 'd1')

    const second = useFilePreview('session-1')

    expect(second.previewedFiles.value.map((f) => f.fileId)).toEqual(['file-a'])
    expect(second.isOpen.value).toBe(false)
  })

  it('drops malformed entries and unknown storage versions', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        version: 1,
        files: [
          {
            fileId: 'valid',
            fileName: 'v.pdf',
            mimeType: 'application/pdf',
            url: 'u',
            messageId: 'm',
            messageDate: 'd',
            previewedAt: 1,
          },
          { fileId: 'missing-name', previewedAt: 2 },
          'not-an-object',
          null,
        ],
      }),
    )

    const preview = useFilePreview('session-1')
    expect(preview.previewedFiles.value.map((f) => f.fileId)).toEqual(['valid'])

    localStorage.setItem(KEY, JSON.stringify({ version: 99, files: [] }))
    expect(useFilePreview('session-1').previewedFiles.value).toEqual([])

    localStorage.setItem(KEY, 'not-json{')
    expect(useFilePreview('session-1').previewedFiles.value).toEqual([])
  })
})
