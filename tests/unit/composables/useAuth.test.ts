/**
 * Tests for the auth query/mutation composables. Mounted with a real Pinia
 * auth store and a per-test QueryClient; all HTTP goes through MSW against the
 * real backend paths, so the store → service → axios chain runs for real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'
import { setActivePinia, createPinia, type Pinia } from 'pinia'
import { server, http, HttpResponse } from '@/tests/msw/server'
import { apiOk, apiError } from '@/tests/msw/http'
import { makeUser } from '@/tests/utils/factories'
import { seedAuthStorage } from '@/tests/utils/authSeed'
import { installFakeSignalR } from '@/tests/utils/fakeSignalR'
import { useAuthStore } from '~/stores/auth'
import {
  authQueryKeys,
  useLogin,
  useLogout,
  useCurrentUser,
  useUserProfile,
  useRefreshToken,
  useForgottenPassword,
  useSetPassword,
} from '~/composables/useAuth'
import { AppError, InvalidCredentialsError } from '@/lib/errors/types'
import { AuthenticationMode } from '@/types/enums'
import type { LoginRequestDTO } from '@/types/api/schemas'

// ---------------------------------------------------------------------------
// Query key structure
// ---------------------------------------------------------------------------

describe('authQueryKeys — cache key structure', () => {
  it('all returns base key', () => {
    expect(authQueryKeys.all).toEqual(['auth'])
  })

  it('user returns scoped key', () => {
    expect(authQueryKeys.user()).toEqual(['auth', 'user'])
  })

  it('current is scoped under user', () => {
    expect(authQueryKeys.current()).toEqual(['auth', 'user', 'current'])
  })

  it('profile key includes email', () => {
    expect(authQueryKeys.profile('test@example.com')).toEqual(['auth', 'user', 'test@example.com'])
  })

  it('different emails produce different profile keys', () => {
    const key1 = authQueryKeys.profile('a@example.com')
    const key2 = authQueryKeys.profile('b@example.com')

    expect(key1).not.toEqual(key2)
  })
})

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

function createWrapper<T>(setupFn: () => T): {
  result: T
  queryClient: QueryClient
  pinia: Pinia
} {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const pinia = createPinia()
  setActivePinia(pinia)

  let result!: T
  const TestComponent = defineComponent({
    setup() {
      result = setupFn()
      return {}
    },
    template: '<div></div>',
  })

  mount(TestComponent, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient }], pinia],
    },
  })

  return { result, queryClient, pinia }
}

const credentials: LoginRequestDTO = {
  email: 'user@example.com',
  password: 'secret-password',
  mode: AuthenticationMode.Basic,
}

// ---------------------------------------------------------------------------
// useLogin
// ---------------------------------------------------------------------------

describe('useLogin', () => {
  beforeEach(() => {
    installFakeSignalR()
  })

  it('logs in through the store and seeds the current-user cache', async () => {
    const { result, queryClient } = createWrapper(() => useLogin())

    const user = await result.mutateAsync({ ...credentials })

    expect(queryClient.getQueryData(authQueryKeys.current())).toEqual(user)

    const authStore = useAuthStore()
    expect(authStore.user).toEqual(user)
    expect(authStore.isAuthenticated).toBe(true)
    expect(authStore.accessToken).toBe('access-token-1')
    expect(authStore.refreshToken).toBe('refresh-token-1')
  })

  it('rejects with an AppError and clears the cached user on HTTP failure', async () => {
    server.use(http.post('/api/authentication/login', () => apiError(401)))
    const { result, queryClient } = createWrapper(() => useLogin())

    await expect(result.mutateAsync({ ...credentials })).rejects.toBeInstanceOf(AppError)

    expect(queryClient.getQueryData(authQueryKeys.current())).toBeNull()
    expect(useAuthStore().isAuthenticated).toBe(false)
  })

  it('maps the backend invalid-credentials warning to InvalidCredentialsError', async () => {
    server.use(
      http.post('/api/authentication/login', () =>
        HttpResponse.json({
          data: null,
          success: null,
          warning: 'Hibás felhasználónév / jelszó',
          error: null,
        }),
      ),
    )
    const { result } = createWrapper(() => useLogin())

    await expect(result.mutateAsync({ ...credentials })).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    )
  })

  it('sends a hashed password, never the plaintext', async () => {
    let captured: { password?: string } | undefined
    server.use(
      http.post('/api/authentication/login', async ({ request }) => {
        captured = (await request.json()) as { password?: string }
        return apiOk({ user: makeUser(), accessToken: 'a', refreshToken: 'r' })
      }),
    )
    const { result } = createWrapper(() => useLogin())

    await result.mutateAsync({ ...credentials })

    expect(captured?.password).toBeDefined()
    expect(captured?.password).not.toBe('secret-password')
    expect(captured?.password).toMatch(/^[0-9a-f]{128}$/)
  })
})

// ---------------------------------------------------------------------------
// useLogout
// ---------------------------------------------------------------------------

describe('useLogout', () => {
  it('clears the auth store, persisted state and the query cache', async () => {
    seedAuthStorage()
    const { result, queryClient } = createWrapper(() => useLogout())
    const authStore = useAuthStore()
    expect(authStore.isAuthenticated).toBe(true)
    queryClient.setQueryData(authQueryKeys.current(), authStore.user)

    await result.mutateAsync()

    expect(authStore.isAuthenticated).toBe(false)
    expect(authStore.accessToken).toBeNull()
    expect(queryClient.getQueryData(authQueryKeys.current())).toBeUndefined()
    expect(localStorage.getItem('innochat-auth')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// useCurrentUser
// ---------------------------------------------------------------------------

describe('useCurrentUser', () => {
  it('resolves the store user when authenticated', async () => {
    seedAuthStorage({ user: makeUser({ id: 42, email: 'me@example.com' }) })
    const { result } = createWrapper(() => useCurrentUser())

    await vi.waitFor(() => expect(result.isSuccess.value).toBe(true))

    expect(result.data.value?.email).toBe('me@example.com')
  })

  it('stays idle when not authenticated', () => {
    const { result } = createWrapper(() => useCurrentUser())

    expect(result.fetchStatus.value).toBe('idle')
    expect(result.data.value).toBeUndefined()
  })

  it('resolves null when force-enabled without a user', async () => {
    const { result } = createWrapper(() => useCurrentUser({ enabled: true }))

    await vi.waitFor(() => expect(result.isSuccess.value).toBe(true))

    expect(result.data.value).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// useUserProfile
// ---------------------------------------------------------------------------

describe('useUserProfile', () => {
  it('serves the store user without a network round-trip when emails match', async () => {
    seedAuthStorage({ user: makeUser({ email: 'cached@example.com' }) })
    let hits = 0
    server.use(
      http.get('/api/authentication/profile', () => {
        hits++
        return apiOk(makeUser())
      }),
    )
    const { result } = createWrapper(() => useUserProfile('cached@example.com'))

    await vi.waitFor(() => expect(result.isSuccess.value).toBe(true))

    expect(result.data.value?.email).toBe('cached@example.com')
    expect(hits).toBe(0)
  })

  it('fetches the profile from the API for a different email', async () => {
    seedAuthStorage({ user: makeUser({ email: 'me@example.com' }) })
    server.use(
      http.get('/api/authentication/profile', () =>
        apiOk(makeUser({ email: 'other@example.com' })),
      ),
    )
    const { result } = createWrapper(() => useUserProfile('other@example.com'))

    await vi.waitFor(() => expect(result.isSuccess.value).toBe(true))

    expect(result.data.value?.email).toBe('other@example.com')
  })

  it('is disabled for an empty email', () => {
    const { result } = createWrapper(() => useUserProfile(''))

    expect(result.fetchStatus.value).toBe('idle')
  })

  it('surfaces an AppError when the profile request fails', async () => {
    seedAuthStorage({ user: makeUser({ email: 'me@example.com' }) })
    server.use(http.get('/api/authentication/profile', () => apiError(404)))
    const { result } = createWrapper(() => useUserProfile('ghost@example.com'))

    await vi.waitFor(() => expect(result.isError.value).toBe(true))

    expect(result.error.value).toBeInstanceOf(AppError)
  })
})

// ---------------------------------------------------------------------------
// useRefreshToken
// ---------------------------------------------------------------------------

describe('useRefreshToken', () => {
  it('stores the new token pair on success', async () => {
    seedAuthStorage()
    const { result } = createWrapper(() => useRefreshToken())

    await result.mutateAsync()

    const authStore = useAuthStore()
    expect(authStore.accessToken).toBe('access-token-2')
    expect(authStore.refreshToken).toBe('refresh-token-2')
    expect(authStore.isAuthenticated).toBe(true)
  })

  it('clears auth state and the cached user when the refresh is rejected', async () => {
    seedAuthStorage()
    server.use(http.post('/api/authentication/refresh-token', () => apiError(401)))
    const { result, queryClient } = createWrapper(() => useRefreshToken())

    await expect(result.mutateAsync()).rejects.toBeInstanceOf(AppError)

    expect(useAuthStore().isAuthenticated).toBe(false)
    expect(queryClient.getQueryData(authQueryKeys.current())).toBeNull()
  })

  it('rejects without a network call when there is no user to refresh', async () => {
    const { result } = createWrapper(() => useRefreshToken())

    await expect(result.mutateAsync()).rejects.toBeInstanceOf(AppError)
  })
})

// ---------------------------------------------------------------------------
// useForgottenPassword / useSetPassword
// ---------------------------------------------------------------------------

describe('useForgottenPassword', () => {
  it('sends the email to the forgotten-password endpoint', async () => {
    let captured: unknown
    server.use(
      http.patch('/api/authentication/forgotten-password', async ({ request }) => {
        captured = await request.json()
        return apiOk(null)
      }),
    )
    const { result } = createWrapper(() => useForgottenPassword())

    await expect(result.mutateAsync('reset@example.com')).resolves.toBeUndefined()

    expect(captured).toEqual({ email: 'reset@example.com' })
  })

  it('rejects with an AppError on server failure', async () => {
    server.use(http.patch('/api/authentication/forgotten-password', () => apiError(500)))
    const { result } = createWrapper(() => useForgottenPassword())

    await expect(result.mutateAsync('reset@example.com')).rejects.toBeInstanceOf(AppError)
  })
})

describe('useSetPassword', () => {
  it('sends token and new password to the set-password endpoint', async () => {
    let captured: unknown
    server.use(
      http.patch('/api/authentication/set-password', async ({ request }) => {
        captured = await request.json()
        return apiOk(null)
      }),
    )
    const { result } = createWrapper(() => useSetPassword())

    await expect(
      result.mutateAsync({ token: 'reset-token-1', newPassword: 'NewPw1!' }),
    ).resolves.toBeUndefined()

    expect(captured).toEqual({ token: 'reset-token-1', newPassword: 'NewPw1!' })
  })

  it('rejects with an AppError on server failure', async () => {
    server.use(http.patch('/api/authentication/set-password', () => apiError(400)))
    const { result } = createWrapper(() => useSetPassword())

    await expect(
      result.mutateAsync({ token: 'bad-token', newPassword: 'NewPw1!' }),
    ).rejects.toBeInstanceOf(AppError)
  })
})
