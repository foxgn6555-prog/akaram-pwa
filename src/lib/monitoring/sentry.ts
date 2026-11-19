/**
 * Sentry — يُفعَّل فقط عند توفر DSN (اختياري بالكامل — ADR 007).
 * dev: معطّل إلا إذا ضُبط VITE_SENTRY_DSN صراحة.
 */
import * as Sentry from '@sentry/react'
import { APP_VERSION } from '@config/build-info'

export function initMonitoring(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined
  if (!dsn) return

  Sentry.init({
    dsn,
    environment: (import.meta.env.VITE_APP_ENV as string) ?? 'development',
    // بصمة البناء: تجعل كل خطأ منسوباً لنسخة محدّدة (4.0.0+sha) بدل «الإنتاج» المبهم
    release: APP_VERSION,
    // أخطاء الشبكة المتوقعة (offline) لا تُهِمّ
    ignoreErrors: ['Failed to fetch', 'NetworkError', 'Load failed'],
    beforeSend(event) {
      // تنقية بيانات حساسة
      if (event.request?.data) delete event.request.data
      return event
    },
  })
}

export { Sentry }
