/** الخطأ الأساسي — كل أخطاء التطبيق ترث منه */
export class AppError extends Error {
  readonly code: string
  readonly cause?: unknown

  constructor(message: string, code: string, cause?: unknown) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.cause = cause
  }
}
