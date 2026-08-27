/**
 * profile.vue page tests.
 *
 * Renders the real profile view against the REAL auth store (hydrated from
 * seeded storage) and a fake SignalR singleton. The SignalR status section is
 * driven by useSignalRConnectionMonitor → useSignalR, whose reactive state
 * mirrors the fake's connection state. Logout runs the real store action
 * (no network) and redirects via the global navigateTo stub.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/vue'
import { reactive } from 'vue'
import type { Component } from 'vue'
import { renderWithProviders } from '@/tests/utils/render'
import { installFakeSignalR } from '@/tests/utils/fakeSignalR'
import { makeUser } from '@/tests/utils/factories'
import { seedAuthStorage } from '@/tests/utils/authSeed'
import ProfilePage from '@/app/pages/profile.vue'

// useColorMode is NOT a global stub — provide a reactive object with the
// `.value` (resolved) and `.preference` (setting) fields the page reads.
beforeEach(() => {
  vi.stubGlobal('useColorMode', () => reactive({ value: 'light', preference: 'light' }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const stubs = {
  UserAvatar: { template: '<div data-testid="user-avatar" />' },
  UIcon: { template: '<i />' },
  USelect: { props: ['modelValue', 'items'], template: '<select v-bind="$attrs" />' },
  UButton: {
    props: ['loading'],
    template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
  },
  UTabs: {
    props: ['modelValue', 'items'],
    emits: ['update:modelValue'],
    template: `
      <div>
        <button
          v-for="item in items"
          :key="item.value"
          type="button"
          :data-testid="'font-face-option-' + item.value"
          @click="$emit('update:modelValue', item.value)"
        >
          {{ item.label }}
        </button>
      </div>
    `,
  },
}

function renderPage() {
  return renderWithProviders(ProfilePage as Component, { global: { stubs } })
}

describe('profile page', () => {
  it('displays the authenticated user name and email', async () => {
    seedAuthStorage({ user: makeUser({ name: 'Ada Lovelace', email: 'ada@example.com' }) })
    installFakeSignalR()

    renderPage()

    const info = await screen.findByTestId('profile-user-info')
    expect(info.textContent).toContain('Ada Lovelace')
    expect(info.textContent).toContain('ada@example.com')
  })

  it('shows Connected in the SignalR status section when the hub is connected', async () => {
    seedAuthStorage({ user: makeUser() })
    const fake = installFakeSignalR()
    fake.setState('connected')

    renderPage()

    const status = await screen.findByTestId('profile-signalr-status')
    expect(status.textContent).toContain('Connected')
  })

  it('shows Disconnected in the SignalR status section when the hub is down', async () => {
    seedAuthStorage({ user: makeUser() })
    const fake = installFakeSignalR()
    fake.setState('disconnected')

    renderPage()

    const status = await screen.findByTestId('profile-signalr-status')
    expect(status.textContent).toContain('Disconnected')
  })

  it('reactively updates the status when the connection starts reconnecting', async () => {
    seedAuthStorage({ user: makeUser() })
    const fake = installFakeSignalR()
    fake.setState('connected')

    renderPage()

    const status = await screen.findByTestId('profile-signalr-status')
    expect(status.textContent).toContain('Connected')

    // Driving a server-side state change should flow through to the DOM.
    fake.setState('reconnecting')

    await waitFor(() => expect(status.textContent).toContain('Reconnecting'))
  })

  it('persists the chosen chat font face under the per-user storage key', async () => {
    seedAuthStorage({ user: makeUser({ id: 501 }) })
    installFakeSignalR()

    renderPage()

    await fireEvent.click(await screen.findByTestId('font-face-option-rubik'))

    expect(localStorage.getItem('innochat_ui_preferred_font_face_501')).toBe('rubik')
  })

  it('persists the chosen chat font size under the per-user storage key', async () => {
    seedAuthStorage({ user: makeUser({ id: 501 }) })
    installFakeSignalR()

    renderPage()

    const sizeRow = await screen.findByTestId('profile-font-size')
    const [, , large] = within(sizeRow).getAllByRole('button')
    await fireEvent.click(large!)

    expect(localStorage.getItem('innochat_ui_preferred_font_size_501')).toBe('large')
  })

  it('renders the build version and a formatted build timestamp', async () => {
    seedAuthStorage({ user: makeUser() })
    installFakeSignalR()
    vi.mocked(useRuntimeConfig).mockReturnValue({
      public: { buildVersion: '1.4.2', buildTimestamp: '2026-08-26T09:30:00' },
    } as unknown as ReturnType<typeof useRuntimeConfig>)

    renderPage()

    const buildInfo = await screen.findByTestId('profile-build-info')
    expect(buildInfo.textContent).toContain('1.4.2')
    expect(buildInfo.textContent).toContain('2026-08-26, 09:30')
  })

  it('logs out and redirects to /login when the logout button is clicked', async () => {
    seedAuthStorage({ user: makeUser({ email: 'ada@example.com' }) })
    installFakeSignalR()

    const { authStore } = renderPage()
    expect(authStore.isAuthenticated).toBe(true)

    await fireEvent.click(await screen.findByTestId('profile-logout-button'))

    await waitFor(() => expect(authStore.isAuthenticated).toBe(false))
    await waitFor(() =>
      expect(vi.mocked(navigateTo)).toHaveBeenCalledWith('/login', { replace: true }),
    )
  })
})
