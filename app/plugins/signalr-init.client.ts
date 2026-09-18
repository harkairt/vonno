import type { QueryClient } from '@tanstack/vue-query'
import { z } from 'zod'
import type { GetUnreadMessagesDTO, SessionFormsResponse } from '@/types/api/schemas'
import { chatQueryKeys } from '@/app/composables/useChatQueries'
import { formQueryKeys } from '@/app/composables/useFormQueries'
import { createLogger } from '@/lib/utils/logger'

const logger = createLogger('SignalR')

const nonEmptyId = z.string().min(1)
const formUpdatedPayload = z.tuple([nonEmptyId, nonEmptyId])
const formSelectedPayload = z.tuple([nonEmptyId, nonEmptyId.nullable()])

export default defineNuxtPlugin(async (nuxtApp) => {
  const authStore = useAuthStore()
  let listenersRegistered = false
  let connectTimer: ReturnType<typeof setTimeout> | undefined
  const listenerUnsubscribers: Array<() => void> = []

  // Function to setup chat event listeners
  const setupChatEventListeners = (
    signalr: ReturnType<typeof useSignalR>,
    queryClient: QueryClient,
  ) => {
    if (listenersRegistered) {
      if (import.meta.dev) logger.debug('Chat event listeners already registered, skipping')
      return
    }

    // ReceiveMessage - invalidate queries to trigger refetch.
    // Only sessionId is needed to refetch; agentId is informational, so don't gate the
    // refetch on its type (a backend type drift must not silently drop the event).
    listenerUnsubscribers.push(
      signalr.onEvent('ReceiveMessage', (sessionId: unknown, agentId: unknown) => {
        if (typeof sessionId !== 'string' || !sessionId) {
          if (import.meta.dev)
            logger.warn('Invalid ReceiveMessage payload:', { sessionId, agentId })
          return
        }

        if (import.meta.dev) logger.debug('New message notification:', { sessionId, agentId })

        const chatStore = useChatStore()
        const isViewingSession = chatStore.activeSessionId === sessionId

        void queryClient.invalidateQueries({
          queryKey: chatQueryKeys.session(sessionId),
        })
        void queryClient.invalidateQueries({
          queryKey: chatQueryKeys.unread(),
          exact: true,
        })
        // Reorders the sidebar: the payload has no timestamp, so modifiedAt must be refetched.
        void queryClient.invalidateQueries({
          queryKey: chatQueryKeys.sessions(),
          exact: true,
        })
        void queryClient.invalidateQueries({ queryKey: formQueryKeys.list(sessionId) })

        if (isViewingSession) {
          queryClient.setQueryData<GetUnreadMessagesDTO[]>(chatQueryKeys.unread(), (old) =>
            old?.map((entry) =>
              entry.sessionId === sessionId ? { ...entry, unreadMessageCount: 0 } : entry,
            ),
          )
        }
      }),
    )

    listenerUnsubscribers.push(
      signalr.onEvent('FormUpdated', (...args: unknown[]) => {
        const parsed = formUpdatedPayload.safeParse(args)
        if (!parsed.success) {
          logger.warn('Invalid FormUpdated payload:', args)
          return
        }
        const [sessionId, instanceId] = parsed.data

        void queryClient.invalidateQueries({
          queryKey: formQueryKeys.instance(sessionId, instanceId),
        })
        void queryClient.invalidateQueries({ queryKey: formQueryKeys.list(sessionId) })
      }),
    )

    listenerUnsubscribers.push(
      signalr.onEvent('FormSelected', (...args: unknown[]) => {
        const parsed = formSelectedPayload.safeParse(args)
        if (!parsed.success) {
          logger.warn('Invalid FormSelected payload:', args)
          return
        }
        const [sessionId, instanceId] = parsed.data

        useFormsStore().setSelected(sessionId, instanceId)

        if (instanceId === null) return
        const list = queryClient.getQueryData<SessionFormsResponse>(formQueryKeys.list(sessionId))
        if (!list?.forms.some((form) => form.instanceId === instanceId)) {
          void queryClient.invalidateQueries({ queryKey: formQueryKeys.list(sessionId) })
        }
      }),
    )

    listenersRegistered = true
    if (import.meta.dev) logger.debug('Chat event listeners registered')
  }

  const signalr = useSignalR()
  const queryClient = nuxtApp.$queryClient as QueryClient

  // Register chat listeners whenever the hub becomes connected — whether from the
  // page-load auto-connect below or a later post-login connect (fresh SPA login,
  // public/iframe auto-login). The `listenersRegistered` guard keeps this idempotent.
  const stopConnectionWatch = watch(
    () => signalr.isConnected.value,
    (connected) => {
      if (connected) {
        setupChatEventListeners(signalr, queryClient)
      }
    },
    { immediate: true },
  )

  // Connect whenever auth becomes present — covers the page-refresh scenario (auth
  // already restored at setup, via `immediate`) AND fresh in-app login / public-mode
  // auto-login, where auth flips true only after this plugin has run.
  const stopAuthWatch = watch(
    () => authStore.isAuthenticated && !!authStore.accessToken,
    (authed) => {
      if (!authed) {
        if (import.meta.dev) logger.debug('No authenticated user, skipping auto-connect')
        return
      }

      if (import.meta.dev) logger.debug('User authenticated, initializing connection...')

      // Small delay to ensure all stores and plugins are fully initialized
      clearTimeout(connectTimer)
      connectTimer = setTimeout(() => {
        void (async () => {
          try {
            await signalr.connect(authStore.accessToken ?? undefined)
            if (signalr.isConnected.value) {
              setupChatEventListeners(signalr, queryClient)
            }
            if (import.meta.dev) logger.debug('Auto-connected on app initialization')
          } catch (error) {
            logger.error('Failed to auto-connect:', error)
          }
        })()
      }, 500)
    },
    { immediate: true },
  )

  const cleanup = () => {
    clearTimeout(connectTimer)
    stopConnectionWatch()
    stopAuthWatch()
    listenerUnsubscribers.splice(0).forEach((unsubscribe) => unsubscribe())
    listenersRegistered = false
  }

  nuxtApp.vueApp?.onUnmount(cleanup)
  import.meta.hot?.dispose(cleanup)
})
