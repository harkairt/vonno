/**
 * The composable's module-level `loadedFonts` Set persists across tests in
 * this file ('nunito' is preloaded), so each test that asserts font-link
 * injection uses a font family no earlier test has touched.
 */
import { describe, it, expect, afterEach } from 'vitest'
import {
  useUiPreferences,
  serverConfigFontSizeToPreset,
  type FontSize,
} from '~/composables/useUiPreferences'
import { useAuthStore } from '~/stores/auth'
import { seedAuthStorage } from '@/tests/utils/authSeed'
import { makeUser } from '@/tests/utils/factories'
import { installBlockedStorage } from '@/tests/utils/storage'

function fontLinks(family: string): NodeListOf<HTMLLinkElement> {
  return document.head.querySelectorAll(`link[href*="${family}"]`)
}

describe('serverConfigFontSizeToPreset', () => {
  it.each<[number, FontSize]>([
    [12, 'small'],
    [13, 'small'],
    [14, 'medium'],
    [15, 'medium'],
    [16, 'large'],
    [20, 'large'],
  ])('maps %spx to %s', (px, preset) => {
    expect(serverConfigFontSizeToPreset(px)).toBe(preset)
  })
})

describe('useUiPreferences — no authenticated user', () => {
  it('exposes null preferences and keeps changes in memory only', () => {
    const prefs = useUiPreferences()

    expect(prefs.fontFace.value).toBeNull()
    expect(prefs.fontSize.value).toBeNull()

    prefs.setFontFace('lexend')
    prefs.setFontSize('large')

    expect(prefs.fontFace.value).toBe('lexend')
    expect(prefs.fontSize.value).toBe('large')
    expect(localStorage.length).toBe(0)
  })

  it('injects the Google Fonts link exactly once per font', () => {
    const prefs = useUiPreferences()

    prefs.setFontFace('lexend')
    prefs.setFontFace('lexend')

    expect(fontLinks('Lexend')).toHaveLength(1)
  })
})

describe('useUiPreferences — authenticated user', () => {
  it('persists preferences under per-user keys', () => {
    seedAuthStorage({ user: makeUser({ id: 7 }) })
    const prefs = useUiPreferences()

    prefs.setFontFace('rubik')
    prefs.setFontSize('large')

    expect(localStorage.getItem('innochat_ui_preferred_font_face_7')).toBe('rubik')
    expect(localStorage.getItem('innochat_ui_preferred_font_size_7')).toBe('large')
  })

  it('loads stored preferences and injects the stored font', () => {
    seedAuthStorage({ user: makeUser({ id: 3 }) })
    localStorage.setItem('innochat_ui_preferred_font_face_3', 'ibm-plex-sans')
    localStorage.setItem('innochat_ui_preferred_font_size_3', 'small')

    const prefs = useUiPreferences()

    expect(prefs.fontFace.value).toBe('ibm-plex-sans')
    expect(prefs.fontSize.value).toBe('small')
    expect(fontLinks('IBM+Plex+Sans')).toHaveLength(1)
  })

  it('treats invalid stored values as unset', () => {
    seedAuthStorage({ user: makeUser({ id: 4 }) })
    localStorage.setItem('innochat_ui_preferred_font_face_4', 'comic-sans')
    localStorage.setItem('innochat_ui_preferred_font_size_4', 'huge')

    const prefs = useUiPreferences()

    expect(prefs.fontFace.value).toBeNull()
    expect(prefs.fontSize.value).toBeNull()
  })

  it('does not preload nunito — it ships with the app CSS', () => {
    seedAuthStorage({ user: makeUser({ id: 5 }) })
    localStorage.setItem('innochat_ui_preferred_font_face_5', 'nunito')

    const prefs = useUiPreferences()

    expect(prefs.fontFace.value).toBe('nunito')
    expect(fontLinks('Nunito')).toHaveLength(0)
  })
})

describe('useUiPreferences — blocked storage (public iframe)', () => {
  let restore: (() => void) | undefined

  afterEach(() => {
    restore?.()
    restore = undefined
  })

  it('survives a throwing localStorage with a logged-in user', () => {
    seedAuthStorage({ user: makeUser({ id: 9 }) })
    useAuthStore()
    restore = installBlockedStorage()

    let prefs!: ReturnType<typeof useUiPreferences>
    expect(() => {
      prefs = useUiPreferences()
    }).not.toThrow()

    expect(prefs.fontFace.value).toBeNull()
    expect(prefs.fontSize.value).toBeNull()

    expect(() => prefs.setFontSize('small')).not.toThrow()
    expect(prefs.fontSize.value).toBe('small')
  })
})
