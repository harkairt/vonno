import { http } from 'msw'
import { apiOk, apiError } from '../http'
import type { FormInstance, SessionFormSummary, SessionFormsResponse } from '@/types/api/schemas'

export const FORM_FIXTURE_AGENT_ID = 1
export const FORM_FIXTURE_SESSION_ID = 'session-1'
export const OPEN_FORM_INSTANCE_ID = 'form-inst-open'
export const SUBMITTED_FORM_INSTANCE_ID = 'form-inst-submitted'
export const CANCELLED_FORM_INSTANCE_ID = 'form-inst-cancelled'
export const DELETED_FORM_INSTANCE_ID = 'form-inst-deleted'
export const COMPUTED_COMPANY_NAME = 'Acme Kft. (computed)'

export const openFormSchema: Record<string, unknown> = {
  type: 'object',
  required: ['company', 'industry', 'priority'],
  properties: {
    company: {
      type: 'object',
      required: ['taxId'],
      properties: {
        name: { type: 'string', description: 'Filled by the agent from the tax id.' },
        taxId: { type: 'string', minLength: 13, maxLength: 13 },
        email: { type: 'string', format: 'email' },
        website: { type: 'string', format: 'uri' },
      },
    },
    notes: { type: 'string' },
    headcount: { type: 'integer', minimum: 0, maximum: 10000 },
    revenue: { type: 'number', minimum: 0 },
    active: { type: 'boolean' },
    newsletter: { type: 'boolean' },
    industry: { type: 'string', enum: ['IT', 'Retail', 'Manufacturing'] },
    priority: {
      type: 'string',
      oneOf: [
        { const: 'low', title: 'Low' },
        { const: 'normal', title: 'Normal' },
        { const: 'high', title: 'High' },
      ],
    },
    foundedOn: { type: 'string', format: 'date' },
    openingTime: { type: 'string', format: 'time' },
    kickoff: { type: 'string', format: 'date-time' },
    contacts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          phone: { type: 'string' },
        },
      },
    },
  },
}

export const openFormUiSchema: Record<string, unknown> = {
  type: 'Categorization',
  elements: [
    {
      type: 'Category',
      label: 'Company',
      elements: [
        {
          type: 'Group',
          label: 'Identification',
          elements: [
            {
              type: 'HorizontalLayout',
              elements: [
                { type: 'Control', scope: '#/properties/company/properties/name' },
                { type: 'Control', scope: '#/properties/company/properties/taxId' },
              ],
            },
            { type: 'Control', scope: '#/properties/company/properties/email' },
            { type: 'Control', scope: '#/properties/company/properties/website' },
          ],
        },
        {
          type: 'VerticalLayout',
          elements: [
            { type: 'Control', scope: '#/properties/notes', options: { multi: true } },
            {
              type: 'HorizontalLayout',
              elements: [
                { type: 'Control', scope: '#/properties/headcount' },
                { type: 'Control', scope: '#/properties/revenue' },
              ],
            },
            { type: 'Control', scope: '#/properties/active' },
            { type: 'Control', scope: '#/properties/newsletter', options: { toggle: true } },
            { type: 'Control', scope: '#/properties/industry' },
            { type: 'Control', scope: '#/properties/priority', options: { format: 'radio' } },
          ],
        },
      ],
    },
    {
      type: 'Category',
      label: 'Schedule',
      elements: [
        {
          type: 'HorizontalLayout',
          elements: [
            { type: 'Control', scope: '#/properties/foundedOn' },
            { type: 'Control', scope: '#/properties/openingTime' },
            { type: 'Control', scope: '#/properties/kickoff' },
          ],
        },
        { type: 'Control', scope: '#/properties/contacts' },
      ],
    },
  ],
}

export const openFormInstance: FormInstance = {
  instanceId: OPEN_FORM_INSTANCE_ID,
  formInstId: 42,
  formId: 7,
  agentName: 'Partner agent',
  sessionId: FORM_FIXTURE_SESSION_ID,
  schema: openFormSchema,
  uischema: openFormUiSchema,
  data: { company: { taxId: '12345678-2-42' }, active: true, contacts: [] },
  status: 'Open',
  insertdate: '2026-09-15T10:12:03',
  insertUser: 'agent',
  modDate: null,
  modUser: null,
}

export const submittedFormInstance: FormInstance = {
  instanceId: SUBMITTED_FORM_INSTANCE_ID,
  formInstId: 43,
  formId: 8,
  agentName: 'Partner agent',
  sessionId: FORM_FIXTURE_SESSION_ID,
  schema: {
    type: 'object',
    properties: { subject: { type: 'string' }, amount: { type: 'number' } },
  },
  uischema: null,
  data: { subject: 'Ajánlatkérés', amount: 1500 },
  status: 'Submitted',
  insertdate: '2026-09-14T09:00:00',
  insertUser: 'agent',
  modDate: '2026-09-14T09:30:00',
  modUser: 'testuser',
}

export const cancelledFormInstance: FormInstance = {
  instanceId: CANCELLED_FORM_INSTANCE_ID,
  formInstId: 44,
  formId: null,
  agentName: 'Partner agent',
  sessionId: FORM_FIXTURE_SESSION_ID,
  schema: { type: 'object', properties: { reason: { type: 'string' } } },
  uischema: null,
  data: null,
  status: 'Cancelled',
  insertdate: '2026-09-13T08:00:00',
  insertUser: 'agent',
  modDate: '2026-09-13T08:05:00',
  modUser: 'testuser',
}

export const formInstancesById: Record<string, FormInstance | undefined> = {
  [OPEN_FORM_INSTANCE_ID]: openFormInstance,
  [SUBMITTED_FORM_INSTANCE_ID]: submittedFormInstance,
  [CANCELLED_FORM_INSTANCE_ID]: cancelledFormInstance,
}

export const sessionFormSummaries: SessionFormSummary[] = [
  { instanceId: OPEN_FORM_INSTANCE_ID, formId: 7, formName: 'Partner rögzítés', status: 'Open' },
  {
    instanceId: SUBMITTED_FORM_INSTANCE_ID,
    formId: 8,
    formName: 'Ajánlatkérés',
    status: 'Submitted',
  },
  { instanceId: CANCELLED_FORM_INSTANCE_ID, formId: null, formName: null, status: 'Cancelled' },
]

export const sessionFormsResponse: SessionFormsResponse = {
  forms: sessionFormSummaries,
  selectedInstanceId: DELETED_FORM_INSTANCE_ID,
}

interface FormRequestBody {
  instanceId?: string
  data?: Record<string, unknown>
  status?: string
}

function findInstance(instanceId?: string): FormInstance | undefined {
  return instanceId === undefined ? undefined : formInstancesById[instanceId]
}

function findWritableInstance(instanceId?: string): FormInstance | undefined {
  const instance = findInstance(instanceId)
  return instance?.status === 'Open' ? instance : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const notWritable = () => apiError(400, 'VALIDATION_ERROR', 'Form not found or not open')

export const formHandlers = [
  http.post('/api/Form/GetSessionForms', () => apiOk(sessionFormsResponse)),
  http.post('/api/Form/GetFormInst', async ({ request }) => {
    const body = (await request.json()) as FormRequestBody
    const instance = findInstance(body.instanceId)
    return instance ? apiOk(instance) : apiError(400, 'VALIDATION_ERROR', 'Form not found')
  }),
  http.post('/api/Form/SaveFormInst', async ({ request }) => {
    const body = (await request.json()) as FormRequestBody
    const instance = findWritableInstance(body.instanceId)
    if (!instance || body.status === 'Open') return notWritable()
    const data = body.data ?? {}
    const company = isRecord(data.company) ? data.company : {}
    return apiOk({
      ...instance,
      data: { ...data, company: { ...company, name: COMPUTED_COMPANY_NAME } },
      status: body.status ?? instance.status,
      modDate: '2026-09-16T12:00:00',
      modUser: 'testuser',
    })
  }),
  http.post('/api/Form/DeleteFormInst', async ({ request }) => {
    const body = (await request.json()) as FormRequestBody
    const instance = findWritableInstance(body.instanceId)
    return instance ? apiOk({ instanceId: instance.instanceId, deleted: true }) : notWritable()
  }),
]
