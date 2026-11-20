export type ForgeErrorCode =
  | 'INVALID_ARGUMENT'
  | 'NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'APPROVAL_REQUIRED'
  | 'CONFLICT'
  | 'TIMEOUT'
  | 'PROVIDER_ERROR'
  | 'INTERNAL'

export interface ForgeError {
  code: ForgeErrorCode
  message: string
  details?: Record<string, unknown>
}

export class ForgeErrorImpl extends Error implements ForgeError {
  readonly code: ForgeErrorCode
  readonly details?: Record<string, unknown>

  constructor(code: ForgeErrorCode, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'ForgeError'
    this.code = code
    this.details = details
  }
}
