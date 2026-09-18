import type { Result } from 'neverthrow'
import { safePost } from './safeRequest'
import type { AppError } from '@/lib/errors/types'
import type {
  DeleteFormResponse,
  FormInstance,
  FormInstanceRequestDTO,
  FormSessionRequestDTO,
  SaveFormRequestDTO,
  SessionFormsResponse,
} from '@/types/api/schemas'
import {
  DeleteFormResponseSchema,
  FormInstanceSchema,
  SessionFormsResponseSchema,
} from '@/types/api/schemas'
import { ErrorCode } from '@/types/enums'

class FormService {
  getSessionForms(request: FormSessionRequestDTO): Promise<Result<SessionFormsResponse, AppError>> {
    return safePost({
      url: '/api/Form/GetSessionForms',
      body: request,
      schema: SessionFormsResponseSchema,
      errorCode: ErrorCode.EMPTY_RESPONSE,
      errorMessage: 'No session forms returned',
    })
  }

  getFormInst(request: FormInstanceRequestDTO): Promise<Result<FormInstance, AppError>> {
    return safePost({
      url: '/api/Form/GetFormInst',
      body: request,
      schema: FormInstanceSchema,
      errorCode: ErrorCode.NOT_FOUND,
      errorMessage: 'Form not found',
    })
  }

  saveFormInst(request: SaveFormRequestDTO): Promise<Result<FormInstance, AppError>> {
    return safePost({
      url: '/api/Form/SaveFormInst',
      body: request,
      schema: FormInstanceSchema,
      errorCode: ErrorCode.EMPTY_RESPONSE,
      errorMessage: 'No form instance returned',
    })
  }

  deleteFormInst(request: FormInstanceRequestDTO): Promise<Result<DeleteFormResponse, AppError>> {
    return safePost({
      url: '/api/Form/DeleteFormInst',
      body: request,
      schema: DeleteFormResponseSchema,
      errorCode: ErrorCode.EMPTY_RESPONSE,
      errorMessage: 'No delete confirmation returned',
    })
  }
}

export const formService = new FormService()
