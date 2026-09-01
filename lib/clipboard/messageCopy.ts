import {
  parseRowsBlock,
  parseHRowsBlock,
  parsePivotBlock,
  pivotDataToTableData,
  type TableData,
} from '@/lib/validation/table'

const FENCE_BLOCK_RE =
  /```(echarts|chart\.js|bar-race|mermaid|cytoscape|leaflet|svg|rows|h-rows|pivot|video)\n([\s\S]*?)```/g

const PLAIN_TEXT_PLACEHOLDERS: Record<string, string> = {
  echarts: '[Chart]',
  'chart.js': '[Chart]',
  'bar-race': '[Chart]',
  mermaid: '[Diagram]',
  cytoscape: '[Diagram]',
  svg: '[Diagram]',
  leaflet: '[Map]',
  video: '[Video]',
}

const CHART_CONTAINER_SELECTORS = [
  '[data-echart-id]',
  '[data-chart-id]',
  '[data-bar-race-id]',
  '[data-mermaid-id]',
  '[data-cytoscape-id]',
  '[data-svg-id]',
  '[data-map-id]',
  '[data-video-id]',
].join(',')

function tableDataToTsv(data: TableData): string {
  const header = data.columns.map((c) => c.name).join('\t')
  const rows = data.rows.map((row) => data.columns.map((c) => row[c.name] ?? '').join('\t'))
  return [header, ...rows].join('\n')
}

function parseTableFenceToTsv(type: string, content: string): string | null {
  if (type === 'rows') {
    const data = parseRowsBlock(content)
    return data ? tableDataToTsv(data) : null
  }
  if (type === 'h-rows') {
    const data = parseHRowsBlock(content)
    return data ? tableDataToTsv(data) : null
  }
  if (type === 'pivot') {
    const parsed = parsePivotBlock(content)
    if (!parsed) return null
    const data = pivotDataToTableData(parsed.data, parsed.sourceKeyOrder)
    return tableDataToTsv(data)
  }
  return null
}

function tableDataToHtml(data: TableData): string {
  const ths = data.columns.map((c) => `<th>${escapeHtml(c.name)}</th>`).join('')
  const trs = data.rows
    .map((row) => {
      const tds = data.columns.map((c) => `<td>${escapeHtml(String(row[c.name] ?? ''))}</td>`)
      return `<tr>${tds.join('')}</tr>`
    })
    .join('')
  return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function buildPlainText(raw: string): string {
  return raw.replace(FENCE_BLOCK_RE, (_, type: string, content: string) => {
    if (type === 'rows' || type === 'h-rows' || type === 'pivot') {
      return parseTableFenceToTsv(type, content.trim()) ?? PLAIN_TEXT_PLACEHOLDERS[type] ?? ''
    }
    return PLAIN_TEXT_PLACEHOLDERS[type] ?? ''
  })
}

function canvasWithWhiteBg(source: HTMLCanvasElement): string {
  const c = document.createElement('canvas')
  c.width = source.width
  c.height = source.height
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(source, 0, 0)
  return c.toDataURL('image/png')
}

async function captureCytoscapeFromDom(el: HTMLElement): Promise<string | null> {
  const canvases = el.querySelectorAll('canvas')
  if (canvases.length < 2) return null

  const first = canvases[0]!
  const c = document.createElement('canvas')
  c.width = first.width
  c.height = first.height
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, c.width, c.height)
  for (const layer of canvases) {
    if (layer.width > 0 && layer.height > 0) ctx.drawImage(layer, 0, 0)
  }
  return c.toDataURL('image/png')
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function drawSafe(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  try {
    ctx.drawImage(source, x, y, w, h)
  } catch (_) {
    void _
  }
}

function drawImages(
  ctx: CanvasRenderingContext2D,
  images: NodeListOf<HTMLImageElement>,
  origin: DOMRect,
) {
  for (const img of images) {
    if (!img.complete || !img.naturalWidth) continue
    const r = img.getBoundingClientRect()
    drawSafe(ctx, img, r.left - origin.left, r.top - origin.top, r.width, r.height)
  }
}

async function drawSvgOverlays(
  ctx: CanvasRenderingContext2D,
  svgs: NodeListOf<SVGSVGElement>,
  origin: DOMRect,
) {
  for (const svg of svgs) {
    const r = svg.getBoundingClientRect()
    const url = URL.createObjectURL(
      new Blob([new XMLSerializer().serializeToString(svg)], {
        type: 'image/svg+xml;charset=utf-8',
      }),
    )
    try {
      drawSafe(
        ctx,
        await loadImage(url),
        r.left - origin.left,
        r.top - origin.top,
        r.width,
        r.height,
      )
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

async function captureLeafletFromDom(el: HTMLElement): Promise<string | null> {
  const mapEl = (el.querySelector('.map-canvas') ?? el) as HTMLElement
  const w = mapEl.offsetWidth
  const h = mapEl.offsetHeight
  if (!w || !h) return null

  const scale = 2
  const c = document.createElement('canvas')
  c.width = w * scale
  c.height = h * scale
  const ctx = c.getContext('2d')
  if (!ctx) return null

  ctx.scale(scale, scale)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)

  const origin = mapEl.getBoundingClientRect()

  drawImages(ctx, mapEl.querySelectorAll<HTMLImageElement>('.leaflet-tile'), origin)
  await drawSvgOverlays(
    ctx,
    mapEl.querySelectorAll<SVGSVGElement>('.leaflet-overlay-pane svg'),
    origin,
  )

  const markerPane = mapEl.querySelector<HTMLElement>('.leaflet-marker-pane')
  if (markerPane) drawImages(ctx, markerPane.querySelectorAll<HTMLImageElement>('img'), origin)

  return c.toDataURL('image/png')
}

async function captureElementAsPng(el: HTMLElement): Promise<string | null> {
  if (el.hasAttribute('data-cytoscape-id')) {
    const result = await captureCytoscapeFromDom(el)
    if (result) return result
  }

  if (el.hasAttribute('data-map-id')) {
    return captureLeafletFromDom(el)
  }

  const canvas = el.querySelector('canvas') as HTMLCanvasElement | null
  if (canvas && canvas.width > 0 && canvas.height > 0) {
    return canvasWithWhiteBg(canvas)
  }

  const img = el.querySelector('img[src^="data:image/svg+xml"]') as HTMLImageElement | null
  if (img?.src) {
    return svgDataUrlToPng(img.src, img.naturalWidth || 800, img.naturalHeight || 600)
  }

  const video = el.querySelector('video') as HTMLVideoElement | null
  if (video && video.readyState >= 2) {
    return captureVideoFrame(video)
  }

  return null
}

function svgDataUrlToPng(
  svgDataUrl: string,
  width: number,
  height: number,
): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      const scale = 2
      c.width = width * scale
      c.height = height * scale
      const ctx = c.getContext('2d')
      if (!ctx) {
        resolve(null)
        return
      }
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0, width, height)
      resolve(c.toDataURL('image/png'))
    }
    img.onerror = () => resolve(null)
    img.src = svgDataUrl
  })
}

function captureVideoFrame(video: HTMLVideoElement): string | null {
  const c = document.createElement('canvas')
  c.width = video.videoWidth || video.clientWidth
  c.height = video.videoHeight || video.clientHeight
  const ctx = c.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(video, 0, 0, c.width, c.height)
  return c.toDataURL('image/png')
}

async function captureChartsFromDom(messageEl: HTMLElement): Promise<string[]> {
  const containers = Array.from(messageEl.querySelectorAll(CHART_CONTAINER_SELECTORS))
  const results: string[] = []
  for (const container of containers) {
    const png = await captureElementAsPng(container as HTMLElement)
    if (png) results.push(png)
    else results.push('')
  }
  return results
}

function imageToPng(img: HTMLImageElement): string | null {
  if (!img.complete || !img.naturalWidth) return null
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const ctx = c.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(img, 0, 0)
  try {
    return c.toDataURL('image/png')
  } catch {
    return null
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const blob = await response.blob()
    if (!blob.type.startsWith('image/')) return null
    return await blobToDataUrl(blob)
  } catch {
    return null
  }
}

async function captureFileImage(img: HTMLImageElement): Promise<string | null> {
  const fromCanvas = imageToPng(img)
  if (fromCanvas) return fromCanvas
  const attr = img.getAttribute('data-file-image')
  const url = attr ?? img.currentSrc
  return url ? fetchImageAsDataUrl(url) : null
}

async function captureFileImagesFromDom(messageEl: HTMLElement): Promise<string[]> {
  const results: string[] = []
  for (const img of messageEl.querySelectorAll<HTMLImageElement>('img[data-file-image]')) {
    const png = await captureFileImage(img)
    if (png) results.push(png)
  }
  return results
}

const TABLE_TYPES = new Set(['rows', 'h-rows', 'pivot'])

function parseTableToHtml(type: string, content: string): string {
  let tableData: TableData | null = null
  if (type === 'rows') tableData = parseRowsBlock(content)
  else if (type === 'h-rows') tableData = parseHRowsBlock(content)
  else if (type === 'pivot') {
    const parsed = parsePivotBlock(content)
    if (parsed) tableData = pivotDataToTableData(parsed.data, parsed.sourceKeyOrder)
  }
  return tableData ? tableDataToHtml(tableData) : ''
}

export function buildHtmlFromParts(
  raw: string,
  mdToHtml: (md: string) => string,
  chartPngs: string[],
  imagePngs: string[] = [],
): string {
  let chartIndex = 0
  const segments: string[] = []
  let lastIndex = 0

  const re = new RegExp(FENCE_BLOCK_RE.source, 'g')
  let match: RegExpExecArray | null
  while ((match = re.exec(raw)) !== null) {
    const proseBeforeBlock = raw.slice(lastIndex, match.index)
    if (proseBeforeBlock.trim()) {
      segments.push(mdToHtml(proseBeforeBlock))
    }

    const type = match[1]!
    const content = match[2]!.trim()

    if (TABLE_TYPES.has(type)) {
      segments.push(parseTableToHtml(type, content))
    } else {
      const png = chartPngs[chartIndex++] ?? ''
      if (png) {
        segments.push(`<img src="${png}" style="max-width:100%;" />`)
      }
    }

    lastIndex = match.index + match[0].length
  }

  const trailing = raw.slice(lastIndex)
  if (trailing.trim()) {
    segments.push(mdToHtml(trailing))
  }

  for (const png of imagePngs) {
    segments.push(`<img src="${png}" style="max-width:100%;" />`)
  }

  return segments.join('')
}

function supportsClipboardItem(): boolean {
  return typeof ClipboardItem !== 'undefined' && typeof navigator?.clipboard?.write === 'function'
}

export async function copyMessageRich(
  messageId: string,
  raw: string,
  mdToHtml: (md: string) => string,
): Promise<void> {
  const plainText = buildPlainText(raw)

  if (!supportsClipboardItem()) {
    if (plainText) await navigator.clipboard.writeText(plainText)
    return
  }

  const messageEl = document.querySelector(
    `[data-testid="message-${messageId}"]`,
  ) as HTMLElement | null

  let chartPngs: string[] = []
  let imagePngs: string[] = []
  if (messageEl) {
    chartPngs = await captureChartsFromDom(messageEl)
    imagePngs = await captureFileImagesFromDom(messageEl)
  }

  const html = buildHtmlFromParts(raw, mdToHtml, chartPngs, imagePngs)
  if (!plainText && !html) return

  const parts: Record<string, Blob> = {
    'text/html': new Blob([html], { type: 'text/html' }),
  }
  if (plainText) parts['text/plain'] = new Blob([plainText], { type: 'text/plain' })

  await navigator.clipboard.write([new ClipboardItem(parts)])
}
