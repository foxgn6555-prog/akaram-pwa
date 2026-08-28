import { AppError } from './AppError'

/** أخطاء طبقة الخدمات (شبكة / RLS / قيود DB) */
export class SDKError extends AppError {
  constructor(message: string, code: string, cause?: unknown) {
    super(message, code, cause)
    this.name = 'SDKError'
  }

  /** هل الخطأ "المورد غير موجود"؟ */
  get isNotFound(): boolean {
    return this.code === 'PGRST116' || this.code === 'NOT_FOUND'
  }

  /** هل الخطأ رفض صلاحية (RLS)؟ */
  get isForbidden(): boolean {
    return this.code === '42501' || this.code === 'PGRST301'
  }
}
