import { AppError } from './AppError'

/** أخطاء المصادقة والجلسة */
export class AuthError extends AppError {
  constructor(message: string, code: string, cause?: unknown) {
    super(message, code, cause)
    this.name = 'AuthError'
  }

  get isSessionExpired(): boolean {
    return this.code === 'SESSION_EXPIRED'
  }
}
