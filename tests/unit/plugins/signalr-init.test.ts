/**
 * Tests for the signalr-init client plugin. Drives the plugin's setup function
 * with a mocked nuxtApp carrying a real QueryClient, the fake SignalR singleton,
 * and a real auth store (seeded via storage).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { installFakeSignalR } from '@/tests/utils/fakeSignalR'
import { seedAuthStorage } from '@/tests/utils/authSeed'
import { makeUser } from '@/tests/utils/factories'
import { createTestQueryClient } from '@/tests/utils/render'
import { useFakeTimersSafe, advance, useRealTimers } from '@/tests/utils/timers'
import { chatQueryKeys } from '@/app/composables/useChatQueries'
import { formQueryKeys } from '@/app/composables/useFormQueries'
import { useFormsStore } from '@/app/stores/forms'
import { sessionFormsResponse, OPEN_FORM_INSTANCE_ID } from '@/tests/msw/handlers/form'
import { useAuthStore } from '@/app/stores/auth'
import { useChatStore } from '@/app/stores/chat'
import { useSignalR } from '@/app/composables/useSignalR'
import signalrInitPlugin from '@/app/plugins/signalr-init.client'

beforeEach(() => {
  vi.stubGlobal('useAuthStore', useAuthStore)
  vi.stubGlobal('useSignalR', useSignalR)
  vi.stubGlobal('useChatStore', useChatStore)
  vi.stubGlobal('useFormsStore', useFormsStore)
})

afterEach(() => {
  vi.unstubAllGlobals()
  useRealTimers()
})

function runPlugin(
  queryClient = createTestQueryClient(),
  onUnmount: (cleanup: () => void) => void = vi.fn(),
) {
  return signalrInitPlugin({
    $queryClient: queryClient,
    vueApp: { onUnmount },
  } as unknown as Parameters<typeof signalrInitPlugin>[0])
}

describe('signalr-init plugin', () => {
  it('auto-connects after the 500ms delay when authenticated', async () => {
    seedAuthStorage({ accessToken: 'seeded-access-token' })
    const fake = installFakeSignalR()
    useFakeTimersSafe()

    await runPlugin()
    await advance(500)

    expect(fake.connect).toHaveBeenCalledWith('seeded-access-token')
  })

  it('does not auto-connect when unauthenticated', async () => {
    const fake = installFakeSignalR()
    useFakeTimersSafe()

    await runPlugin()
    await advance(500)

    expect(fake.connect).not.toHaveBeenCalled()
  })

  // Regression for the fresh-in-app-login hole: the plugin runs once at app load
  // while unauthenticated (login page has no persisted token). Auth flips true only
  // AFTER the plugin ran, so the old one-shot `if (isAuthenticated)` gate never wired
  // the ReceiveMessage listener. The auth watch must connect + register listeners
  // when auth becomes present post-init.
  it('wires ReceiveMessage when the user logs in after the plugin already ran (fresh login)', async () => {
    // Unauthenticated at plugin init — no seeded storage.
    const fake = installFakeSignalR()
    useFakeTimersSafe()
    const queryClient = createTestQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    await runPlugin(queryClient)
    await advance(500)
    expect(fake.connect).not.toHaveBeenCalled()

    // User logs in: auth store flips to authenticated after the plugin has run.
    const authStore = useAuthStore()
    authStore.user = makeUser()
    authStore.accessToken = 'fresh-login-token'
    await nextTick() // let the auth watcher fire
    await advance(500) // delayed connect + listener registration

    expect(fake.connect).toHaveBeenCalledWith('fresh-login-token')

    fake.emitFromServer('ReceiveMessage', 'sess-1', 5)

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: chatQueryKeys.session('sess-1') })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: chatQueryKeys.unread(), exact: true })
  })

  it('invalidates the session and unread queries on ReceiveMessage', async () => {
    seedAuthStorage({ accessToken: 'seeded-access-token' })
    const fake = installFakeSignalR()
    useFakeTimersSafe()
    const queryClient = createTestQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    await runPlugin(queryClient)
    await advance(500)

    fake.emitFromServer('ReceiveMessage', 'sess-1', 5)

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: chatQueryKeys.session('sess-1') })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: chatQueryKeys.unread(), exact: true })
  })

  it('invalidates the sessions list on ReceiveMessage so the sidebar reorders', async () => {
    seedAuthStorage({ accessToken: 'seeded-access-token' })
    const fake = installFakeSignalR()
    useFakeTimersSafe()
    const queryClient = createTestQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    await runPlugin(queryClient)
    await advance(500)

    fake.emitFromServer('ReceiveMessage', 'sess-1', 5)

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: chatQueryKeys.sessions(), exact: true })
  })

  it('ignores ReceiveMessage payloads with the wrong types', async () => {
    seedAuthStorage({ accessToken: 'seeded-access-token' })
    const fake = installFakeSignalR()
    useFakeTimersSafe()
    const queryClient = createTestQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    await runPlugin(queryClient)
    await advance(500)

    fake.emitFromServer('ReceiveMessage', 42, 'not-a-number')

    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  // Regression guard for the commit's actual fix: a valid sessionId must still
  // trigger the refetch even when the backend drifts agentId off `number`. The
  // old guard (`typeof agentId !== 'number'`) silently dropped these events.
  it('still invalidates when sessionId is valid but agentId is not a number', async () => {
    seedAuthStorage({ accessToken: 'seeded-access-token' })
    const fake = installFakeSignalR()
    useFakeTimersSafe()
    const queryClient = createTestQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    await runPlugin(queryClient)
    await advance(500)

    // agentId arrives as a string (type drift) — sessionId is the only field the
    // refetch needs, so the event must NOT be dropped.
    fake.emitFromServer('ReceiveMessage', 'sess-1', 'agent-as-string')

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: chatQueryKeys.session('sess-1') })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: chatQueryKeys.unread(), exact: true })
  })

  it('still invalidates when agentId is missing (undefined) but sessionId is valid', async () => {
    seedAuthStorage({ accessToken: 'seeded-access-token' })
    const fake = installFakeSignalR()
    useFakeTimersSafe()
    const queryClient = createTestQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    await runPlugin(queryClient)
    await advance(500)

    fake.emitFromServer('ReceiveMessage', 'sess-1')

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: chatQueryKeys.session('sess-1') })
  })

  // The new `!sessionId` guard rejects an empty string. The old type-only guard
  // (`typeof sessionId !== 'string'`) let '' through and invalidated a garbage key.
  it('drops a ReceiveMessage with an empty-string sessionId', async () => {
    seedAuthStorage({ accessToken: 'seeded-access-token' })
    const fake = installFakeSignalR()
    useFakeTimersSafe()
    const queryClient = createTestQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    await runPlugin(queryClient)
    await advance(500)

    fake.emitFromServer('ReceiveMessage', '', 5)

    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it('registers the ReceiveMessage listener only once (dedupe guard)', async () => {
    seedAuthStorage({ accessToken: 'seeded-access-token' })
    const fake = installFakeSignalR()
    useFakeTimersSafe()
    const queryClient = createTestQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    await runPlugin(queryClient)
    await advance(500) // connect + direct listener registration

    // Force the isConnected watcher to fire again — the guard must block re-registration.
    fake.setState('reconnecting')
    await nextTick()
    fake.setState('connected')
    await nextTick()

    fake.emitFromServer('ReceiveMessage', 'sess-1', 5)

    const sessionKey = JSON.stringify(chatQueryKeys.session('sess-1'))
    const sessionInvalidations = invalidateSpy.mock.calls.filter(
      (call) => JSON.stringify((call[0] as { queryKey: unknown }).queryKey) === sessionKey,
    )
    expect(sessionInvalidations).toHaveLength(1)
  })

  it('unregisters event listeners when the app instance is disposed', async () => {
    seedAuthStorage({ accessToken: 'seeded-access-token' })
    const fake = installFakeSignalR()
    useFakeTimersSafe()
    const queryClient = createTestQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    let cleanup: (() => void) | undefined

    await runPlugin(queryClient, (registeredCleanup) => {
      cleanup = registeredCleanup
    })
    await advance(500)
    expect(cleanup).toBeTypeOf('function')

    invalidateSpy.mockClear()
    cleanup?.()
    fake.emitFromServer('FormUpdated', 'sess-1', 'form-1')

    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it('zeroes unread cache when the user is viewing the session that received a message', async () => {
    seedAuthStorage({ accessToken: 'seeded-access-token' })
    const fake = installFakeSignalR()
    useFakeTimersSafe()
    const queryClient = createTestQueryClient()

    queryClient.setQueryData(chatQueryKeys.unread(), [
      { sessionId: 'sess-1', unreadMessageCount: 3 },
      { sessionId: 'sess-2', unreadMessageCount: 1 },
    ])

    const chatStore = useChatStore()
    chatStore.setActiveSession('sess-1')

    await runPlugin(queryClient)
    await advance(500)

    fake.emitFromServer('ReceiveMessage', 'sess-1', 5)

    const unread = queryClient.getQueryData<{ sessionId: string; unreadMessageCount: number }[]>(
      chatQueryKeys.unread(),
    )
    expect(unread).toEqual([
      { sessionId: 'sess-1', unreadMessageCount: 0 },
      { sessionId: 'sess-2', unreadMessageCount: 1 },
    ])
  })

  it('does not zero unread cache when the user is viewing a different session', async () => {
    seedAuthStorage({ accessToken: 'seeded-access-token' })
    const fake = installFakeSignalR()
    useFakeTimersSafe()
    const queryClient = createTestQueryClient()

    queryClient.setQueryData(chatQueryKeys.unread(), [
      { sessionId: 'sess-1', unreadMessageCount: 3 },
    ])

    const chatStore = useChatStore()
    chatStore.setActiveSession('sess-other')

    await runPlugin(queryClient)
    await advance(500)

    fake.emitFromServer('ReceiveMessage', 'sess-1', 5)

    const unread = queryClient.getQueryData<{ sessionId: string; unreadMessageCount: number }[]>(
      chatQueryKeys.unread(),
    )
    expect(unread).toEqual([{ sessionId: 'sess-1', unreadMessageCount: 3 }])
  })

  describe('forms events', () => {
    async function connected() {
      seedAuthStorage({ accessToken: 'seeded-access-token' })
      const fake = installFakeSignalR()
      useFakeTimersSafe()
      const queryClient = createTestQueryClient()
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      await runPlugin(queryClient)
      await advance(500)
      return { fake, queryClient, invalidateSpy, warnSpy }
    }

    const invalidationsOf = (spy: ReturnType<typeof vi.spyOn>, key: readonly unknown[]) =>
      spy.mock.calls.filter(
        (call) =>
          JSON.stringify((call[0] as { queryKey: unknown }).queryKey) === JSON.stringify(key),
      )

    it('ReceiveMessage also invalidates the forms list of the session', async () => {
      const { fake, invalidateSpy } = await connected()

      fake.emitFromServer('ReceiveMessage', 'sess-1', 5)

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: chatQueryKeys.session('sess-1') })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: chatQueryKeys.unread(), exact: true })
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: chatQueryKeys.sessions(),
        exact: true,
      })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: formQueryKeys.list('sess-1') })
    })

    it('FormUpdated invalidates the instance and the list', async () => {
      const { fake, invalidateSpy } = await connected()

      fake.emitFromServer('FormUpdated', 'sess-1', 'inst-1')

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: formQueryKeys.instance('sess-1', 'inst-1'),
      })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: formQueryKeys.list('sess-1') })
    })

    it.each([
      ['non-string sessionId', [42, 'inst-1']],
      ['empty sessionId', ['', 'inst-1']],
      ['non-string instanceId', ['sess-1', 7]],
      ['empty instanceId', ['sess-1', '']],
      ['null instanceId', ['sess-1', null]],
    ])('FormUpdated with %s warns and returns', async (_label, args) => {
      const { fake, invalidateSpy, warnSpy } = await connected()

      fake.emitFromServer('FormUpdated', ...args)

      expect(invalidateSpy).not.toHaveBeenCalled()
      expect(warnSpy).toHaveBeenCalledTimes(1)
    })

    it('FormSelected sets the marker without touching expandedIds or the scroll request', async () => {
      const { fake, queryClient, invalidateSpy } = await connected()
      queryClient.setQueryData(formQueryKeys.list('sess-1'), sessionFormsResponse)
      const store = useFormsStore()
      store.toggleExpanded('sess-1', 'other')
      const focusSeqBefore = store.lastFocusSeq

      fake.emitFromServer('FormSelected', 'sess-1', OPEN_FORM_INSTANCE_ID)

      expect(store.sessions['sess-1']?.selectedInstanceId).toBe(OPEN_FORM_INSTANCE_ID)
      expect(store.sessions['sess-1']?.expandedIds).toEqual(['other'])
      expect(store.lastFocusSeq).toBe(focusSeqBefore)
      expect(invalidateSpy).not.toHaveBeenCalled()
    })

    it('FormSelected(null) clears the marker', async () => {
      const { fake, invalidateSpy } = await connected()
      const store = useFormsStore()
      store.setSelected('sess-1', OPEN_FORM_INSTANCE_ID)

      fake.emitFromServer('FormSelected', 'sess-1', null)

      expect(store.sessions['sess-1']?.selectedInstanceId).toBeNull()
      expect(invalidateSpy).not.toHaveBeenCalled()
    })

    it('FormSelected for an id missing from the cached list invalidates the list once', async () => {
      const { fake, queryClient, invalidateSpy } = await connected()
      queryClient.setQueryData(formQueryKeys.list('sess-1'), sessionFormsResponse)

      fake.emitFromServer('FormSelected', 'sess-1', 'brand-new')

      expect(useFormsStore().sessions['sess-1']?.selectedInstanceId).toBe('brand-new')
      expect(invalidationsOf(invalidateSpy, formQueryKeys.list('sess-1'))).toHaveLength(1)
    })

    it('FormSelected with no cached list invalidates the list once', async () => {
      const { fake, invalidateSpy } = await connected()

      fake.emitFromServer('FormSelected', 'sess-1', 'inst-1')

      expect(invalidationsOf(invalidateSpy, formQueryKeys.list('sess-1'))).toHaveLength(1)
    })

    it.each([
      ['non-string sessionId', [42, 'inst-1']],
      ['empty sessionId', ['', 'inst-1']],
      ['non-string instanceId', ['sess-1', 7]],
      ['empty instanceId', ['sess-1', '']],
    ])('FormSelected with %s warns and returns', async (_label, args) => {
      const { fake, invalidateSpy, warnSpy } = await connected()

      fake.emitFromServer('FormSelected', ...args)

      expect(invalidateSpy).not.toHaveBeenCalled()
      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(useFormsStore().sessions['sess-1']).toBeUndefined()
    })

    it('registers the form listeners only once (dedupe guard)', async () => {
      const { fake, invalidateSpy } = await connected()

      fake.setState('reconnecting')
      await nextTick()
      fake.setState('connected')
      await nextTick()

      fake.emitFromServer('FormUpdated', 'sess-1', 'inst-1')

      expect(
        invalidationsOf(invalidateSpy, formQueryKeys.instance('sess-1', 'inst-1')),
      ).toHaveLength(1)
    })
  })
})
