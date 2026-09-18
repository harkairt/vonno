import { describe, it, expect } from 'vitest'
import { waitFor } from '@testing-library/vue'
import type { Component } from 'vue'
import { renderWithProviders } from '@/tests/utils/render'
import { apiOk } from '@/tests/msw/http'
import { seedAuthStorage } from '@/tests/utils/authSeed'
import { trackPostCalls } from '@/tests/utils/requestCounter'
import {
  FORM_FIXTURE_AGENT_ID,
  FORM_FIXTURE_SESSION_ID,
  OPEN_FORM_INSTANCE_ID,
  openFormInstance,
} from '@/tests/msw/handlers/form'
import { useFormsStore } from '@/app/stores/forms'
import FormsSlideover from '~/components/forms/FormsSlideover.vue'

const SAVE_FORM_INST = '/api/Form/SaveFormInst'

const stubs = {
  FormsPanel: { template: '<div data-testid="forms-panel" />' },
  USlideover: {
    props: ['open', 'title'],
    template: '<div v-if="open" data-testid="forms-slideover"><slot name="body" /></div>',
  },
}

function renderSlideover() {
  seedAuthStorage()
  return renderWithProviders(FormsSlideover as Component, {
    props: { open: true, sessionId: FORM_FIXTURE_SESSION_ID, agentId: FORM_FIXTURE_AGENT_ID },
    global: { stubs },
  })
}

function seedDirtyDraft() {
  const store = useFormsStore()
  store.createDraft(FORM_FIXTURE_SESSION_ID, OPEN_FORM_INSTANCE_ID, openFormInstance.data!)
  store.updateDraftData(FORM_FIXTURE_SESSION_ID, OPEN_FORM_INSTANCE_ID, {
    company: { name: 'edited' },
  })
  return store
}

describe('FormsSlideover', () => {
  it('saves every dirty draft of the session when it closes', async () => {
    const saves = trackPostCalls(SAVE_FORM_INST, () => apiOk(openFormInstance))
    const { rerender } = renderSlideover()
    const store = seedDirtyDraft()

    await rerender({
      open: false,
      sessionId: FORM_FIXTURE_SESSION_ID,
      agentId: FORM_FIXTURE_AGENT_ID,
    })

    await waitFor(() => expect(saves.count).toBe(1))
    await waitFor(() => expect(store.dirtyInstanceIds(FORM_FIXTURE_SESSION_ID)).toEqual([]))
  })

  it('sends nothing on close when no draft is dirty', async () => {
    const saves = trackPostCalls(SAVE_FORM_INST, () => apiOk(openFormInstance))
    const { rerender } = renderSlideover()

    await rerender({
      open: false,
      sessionId: FORM_FIXTURE_SESSION_ID,
      agentId: FORM_FIXTURE_AGENT_ID,
    })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(saves.count).toBe(0)
  })
})
