import { describe, it, expect } from 'vitest'
import { buildPlainText, buildHtmlFromParts } from '@/lib/clipboard/messageCopy'

describe('buildPlainText', () => {
  it('returns text unchanged when no fence blocks', () => {
    const raw = 'Hello world\n\nSome **bold** text'
    expect(buildPlainText(raw)).toBe(raw)
  })

  it('replaces echarts block with [Chart]', () => {
    const raw = 'Before\n```echarts\n{"xAxis":{}}\n```\nAfter'
    expect(buildPlainText(raw)).toBe('Before\n[Chart]\nAfter')
  })

  it('replaces chart.js block with [Chart]', () => {
    const raw = 'Text\n```chart.js\n{"type":"bar"}\n```\nEnd'
    expect(buildPlainText(raw)).toBe('Text\n[Chart]\nEnd')
  })

  it('replaces bar-race block with [Chart]', () => {
    const raw = '```bar-race\n{"data":[]}\n```'
    expect(buildPlainText(raw)).toBe('[Chart]')
  })

  it('replaces mermaid block with [Diagram]', () => {
    const raw = '```mermaid\ngraph TD\nA-->B\n```'
    expect(buildPlainText(raw)).toBe('[Diagram]')
  })

  it('replaces cytoscape block with [Diagram]', () => {
    const raw = '```cytoscape\n{"elements":[]}\n```'
    expect(buildPlainText(raw)).toBe('[Diagram]')
  })

  it('replaces svg block with [Diagram]', () => {
    const raw = '```svg\n<svg></svg>\n```'
    expect(buildPlainText(raw)).toBe('[Diagram]')
  })

  it('replaces leaflet block with [Map]', () => {
    const raw = '```leaflet\n{"center":[0,0]}\n```'
    expect(buildPlainText(raw)).toBe('[Map]')
  })

  it('replaces video block with [Video]', () => {
    const raw = '```video\n{"src":"test.mp4"}\n```'
    expect(buildPlainText(raw)).toBe('[Video]')
  })

  it('converts rows block to TSV', () => {
    const data = JSON.stringify([
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ])
    const raw = `Before\n\`\`\`rows\n${data}\n\`\`\`\nAfter`
    const result = buildPlainText(raw)
    expect(result).toContain('name\tage')
    expect(result).toContain('Alice\t30')
    expect(result).toContain('Bob\t25')
    expect(result).toContain('Before')
    expect(result).toContain('After')
  })

  it('handles multiple fence blocks in one message', () => {
    const raw =
      'Here is a chart:\n```echarts\n{"xAxis":{}}\n```\nAnd a diagram:\n```mermaid\ngraph TD\n```\nDone.'
    const result = buildPlainText(raw)
    expect(result).toBe('Here is a chart:\n[Chart]\nAnd a diagram:\n[Diagram]\nDone.')
  })

  it('preserves regular code blocks', () => {
    const raw = '```javascript\nconsole.log("hi")\n```'
    expect(buildPlainText(raw)).toBe(raw)
  })
})

describe('buildHtmlFromParts', () => {
  const identity = (md: string) => `<p>${md.trim()}</p>`

  it('renders prose-only messages through mdToHtml', () => {
    const result = buildHtmlFromParts('Hello world', identity, [])
    expect(result).toBe('<p>Hello world</p>')
  })

  it('replaces chart blocks with img tags', () => {
    const raw = 'Before\n```echarts\n{}\n```\nAfter'
    const result = buildHtmlFromParts(raw, identity, ['data:image/png;base64,ABC'])
    expect(result).toContain('<img src="data:image/png;base64,ABC"')
    expect(result).toContain('<p>Before</p>')
    expect(result).toContain('<p>After</p>')
  })

  it('replaces table blocks with HTML tables', () => {
    const data = JSON.stringify([
      { city: 'NYC', pop: 8 },
      { city: 'LA', pop: 4 },
    ])
    const raw = `\`\`\`rows\n${data}\n\`\`\``
    const result = buildHtmlFromParts(raw, identity, [])
    expect(result).toContain('<table>')
    expect(result).toContain('<th>city</th>')
    expect(result).toContain('<td>NYC</td>')
  })

  it('skips chart img when PNG is empty', () => {
    const raw = '```echarts\n{}\n```'
    const result = buildHtmlFromParts(raw, identity, [''])
    expect(result).not.toContain('<img')
  })

  it('handles mixed chart and table blocks in order', () => {
    const tableJson = JSON.stringify([{ a: 1 }])
    const raw = `Intro\n\`\`\`echarts\n{}\n\`\`\`\nMiddle\n\`\`\`rows\n${tableJson}\n\`\`\`\nEnd`
    const result = buildHtmlFromParts(raw, identity, ['data:image/png;base64,X'])
    expect(result).toContain('<p>Intro</p>')
    expect(result).toContain('<img src="data:image/png;base64,X"')
    expect(result).toContain('<p>Middle</p>')
    expect(result).toContain('<table>')
    expect(result).toContain('<p>End</p>')
  })

  it('appends file image PNGs after the message content', () => {
    const result = buildHtmlFromParts('Caption', identity, [], ['data:image/png;base64,IMG'])
    expect(result).toBe(
      '<p>Caption</p><img src="data:image/png;base64,IMG" style="max-width:100%;" />',
    )
  })

  it('renders file images alone when the message has no text', () => {
    const result = buildHtmlFromParts(
      '',
      identity,
      [],
      ['data:image/png;base64,A', 'data:image/png;base64,B'],
    )
    expect(result).toBe(
      '<img src="data:image/png;base64,A" style="max-width:100%;" /><img src="data:image/png;base64,B" style="max-width:100%;" />',
    )
  })
})
