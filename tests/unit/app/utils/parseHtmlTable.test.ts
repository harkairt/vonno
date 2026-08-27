import { describe, it, expect } from 'vitest'
import { parseHtmlTable } from '~/utils/parseHtmlTable'

describe('parseHtmlTable', () => {
  it('extracts trimmed headers and rows', () => {
    const html = `
      <table>
        <thead><tr><th> Name </th><th>Score</th></tr></thead>
        <tbody>
          <tr><td>Alice</td><td> 10 </td></tr>
          <tr><td>Bob</td><td>7</td></tr>
        </tbody>
      </table>`

    expect(parseHtmlTable(html)).toEqual({
      headers: ['Name', 'Score'],
      rows: [
        ['Alice', '10'],
        ['Bob', '7'],
      ],
    })
  })

  it('flattens nested markup to text content', () => {
    const html = `
      <table>
        <thead><tr><th><strong>Bold</strong> header</th></tr></thead>
        <tbody><tr><td><a href="#">link</a> text</td></tr></tbody>
      </table>`

    expect(parseHtmlTable(html)).toEqual({ headers: ['Bold header'], rows: [['link text']] })
  })

  it('returns empty structures when there is no table', () => {
    expect(parseHtmlTable('<p>no table here</p>')).toEqual({ headers: [], rows: [] })
  })

  it('yields no headers for a table without an explicit thead', () => {
    expect(parseHtmlTable('<table><tr><th>H</th></tr></table>')).toEqual({
      headers: [],
      rows: [[]],
    })
  })
})
