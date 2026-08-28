import { AppError } from './AppError'
import { SDKError } from './SDKError'
import { AuthError } from './AuthError'
import { logger } from '@lib/monitoring/logger'

/**
 * المعالج المركزي للأخطاء — استدعِه من ErrorBoundary و onError hooks.
 * يرسل إلى Sentry ويحول الأخطاء الفنية إلى رسائل آمنة للعرض.
 */
export function handleAppError(error: unknown, context?: Record<string, unknown>): AppError {
  const appError = normalizeError(error)

  if (appError instanceof SDKError && appError.isForbidden) {
    logger.warn('RLS rejection', { code: appError.code, ...context })
  } else {
    logger.error(appError, context)
  }

  return appError
}

function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) return error
  if (error instanceof Error) return new AppError(error.message, 'UNEXPECTED', error)
  return new AppError('خطأ غير معروف', 'UNKNOWN', error)
}

/** رسالة آمنة للعرض للمستخدم النهائي */
export function toUserMessage(error: unknown): string {
  const e = normalizeError(error)
  if (e instanceof SDKError && e.isForbidden) return 'ليس لديك صلاحية لتنفيذ هذه العملية'
  if (e instanceof SDKError && e.isNotFound) return 'العنصر المطلوب غير موجود'
  if (e instanceof SDKError && e.code === 'NETWORK') return 'تعذر الاتصال — سيُعاد الإرسال تلقائياً عند توفر الشبكة'
  if (e instanceof AuthError) return 'انتهت الجلسة — يرجى تسجيل الدخول من جديد'
  return 'حدث خطأ غير متوقع — حاول مرة أخرى'
}
