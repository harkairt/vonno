/**
 * Tests for the viewer plugin. Runs setup() with a mocked nuxtApp (vueApp.use
 * spy) and asserts the v-viewer plugin is installed with the expected
 * single-image default options.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import VueViewer from 'v-viewer'
import viewerPlugin from '@/app/plugins/viewer.client'

function runPlugin() {
  const use = vi.fn()
  const nuxtApp = { vueApp: { use } }
  ;(viewerPlugin as unknown as { setup: (app: unknown) => void }).setup(nuxtApp)
  return { use }
}

function getReadyHook(use: ReturnType<typeof vi.fn>): () => void {
  const [, options] = use.mock.calls[0] as [unknown, { defaultOptions: { ready: () => void } }]
  return options.defaultOptions.ready
}

describe('viewer plugin', () => {
  it('installs v-viewer with single-image default options', () => {
    const { use } = runPlugin()

    expect(use).toHaveBeenCalledTimes(1)
    const [plugin, options] = use.mock.calls[0] as [
      unknown,
      { defaultOptions: Record<string, unknown> & { toolbar: Record<string, unknown> } },
    ]
    expect(plugin).toBe(VueViewer)
    expect(options.defaultOptions.initialCoverage).toBe(0.8)
    expect(options.defaultOptions.navbar).toBe(false)
    expect(options.defaultOptions.rotatable).toBe(false)
    expect(options.defaultOptions.toolbar.zoomIn).toBe(1)
    expect(options.defaultOptions.toolbar.next).toBe(false)
    // A ready hook is wired to inject the download button.
    expect(typeof options.defaultOptions.ready).toBe('function')
  })
})

describe('download button injection (ready hook)', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('injects a single accessible download button into the toolbar', () => {
    document.body.innerHTML = '<div class="viewer-toolbar"><ul></ul></div>'
    const { use } = runPlugin()
    const ready = getReadyHook(use)

    ready()
    ready()

    const buttons = document.querySelectorAll('.viewer-toolbar ul .viewer-download')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]?.getAttribute('role')).toBe('button')
    expect(buttons[0]?.getAttribute('aria-label')).toBe('Download image')
  })

  it('does nothing when no toolbar is rendered', () => {
    const { use } = runPlugin()

    expect(() => getReadyHook(use)()).not.toThrow()
    expect(document.querySelector('.viewer-download')).toBeNull()
  })

  it('downloads the displayed image as a blob link', async () => {
    document.body.innerHTML =
      '<div class="viewer-toolbar"><ul></ul></div>' +
      '<div class="viewer-canvas"><img src="https://cdn.example.com/pic.png"></div>'
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ blob: async () => new Blob(['img']) } as Response)
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    const { use } = runPlugin()
    getReadyHook(use)()
    document.querySelector<HTMLElement>('.viewer-download')!.click()

    await vi.waitFor(() => expect(revokeSpy).toHaveBeenCalledWith('blob:mock-url'))
    expect(fetchSpy).toHaveBeenCalledWith('https://cdn.example.com/pic.png')
    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(document.querySelector('a')).toBeNull()
  })

  it('falls back to opening the image in a new tab when fetch is blocked', async () => {
    document.body.innerHTML =
      '<div class="viewer-toolbar"><ul></ul></div>' +
      '<div class="viewer-canvas"><img src="https://cdn.example.com/pic.png"></div>'
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('CORS blocked'))
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)

    const { use } = runPlugin()
    getReadyHook(use)()
    document.querySelector<HTMLElement>('.viewer-download')!.click()

    await vi.waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith(
        'https://cdn.example.com/pic.png',
        '_blank',
        'noopener,noreferrer',
      ),
    )
  })

  it('ignores clicks while no image is displayed', () => {
    document.body.innerHTML = '<div class="viewer-toolbar"><ul></ul></div>'
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const { use } = runPlugin()
    getReadyHook(use)()
    document.querySelector<HTMLElement>('.viewer-download')!.click()

    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
