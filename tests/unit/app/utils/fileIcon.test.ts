import { describe, it, expect } from 'vitest'
import { fileTypeIcon } from '~/utils/fileIcon'

describe('fileTypeIcon', () => {
  it.each([
    ['application/pdf', 'report.pdf', 'i-vscode-icons-file-type-pdf2'],
    ['application/octet-stream', 'report.pdf', 'i-vscode-icons-file-type-pdf2'],
    [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'letter.docx',
      'i-vscode-icons-file-type-word',
    ],
    ['application/octet-stream', 'letter.doc', 'i-vscode-icons-file-type-word'],
    [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'data.xlsx',
      'i-vscode-icons-file-type-excel',
    ],
    ['application/vnd.ms-excel', 'data.xls', 'i-vscode-icons-file-type-excel'],
    [
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'deck.pptx',
      'i-vscode-icons-file-type-powerpoint',
    ],
    ['application/octet-stream', 'deck.ppt', 'i-vscode-icons-file-type-powerpoint'],
    ['text/csv', 'export.csv', 'i-vscode-icons-file-type-excel'],
    ['application/zip', 'bundle.zip', 'i-vscode-icons-file-type-zip'],
    ['application/x-rar-compressed', 'bundle.rar', 'i-vscode-icons-file-type-zip'],
    ['text/plain', 'notes.txt', 'i-vscode-icons-file-type-text'],
    ['audio/mpeg', 'song.mp3', 'i-vscode-icons-file-type-audio'],
    ['video/mp4', 'clip.mp4', 'i-vscode-icons-file-type-video'],
    ['image/png', 'photo.png', 'i-vscode-icons-file-type-image'],
    ['application/octet-stream', 'mystery.bin', 'i-vscode-icons-default-file'],
  ])('%s / %s → %s', (mimeType, fileName, expected) => {
    expect(fileTypeIcon({ mimeType, fileName })).toBe(expected)
  })

  it('matches extensions case-insensitively', () => {
    expect(fileTypeIcon({ mimeType: 'application/octet-stream', fileName: 'REPORT.PDF' })).toBe(
      'i-vscode-icons-file-type-pdf2',
    )
  })
})
