import { Sentry } from './sentry'

/**
 * Logger موحّد — console في dev، Sentry في production،
 * + مستمع اختياري يوصّل الأخطاء إلى سجل app_errors (main.tsx).
 */
type ErrorListener = (error: unknown, context?: Record<string, unknown>) => void
const errorListeners = new Set<ErrorListener>()

/** يسجّل مستمعاً يُنادى عند كل logger.error — يعيد دالة الإلغاء */
export function onErrorReport(listener: ErrorListener): () => void {
  errorListeners.add(listener)
  return () => errorListeners.delete(listener)
}

export const logger = {
  debug(message: string, context?: Record<string, unknown>): void {
    if (import.meta.env.DEV) console.debug(`[debug] ${message}`, context ?? '')
  },

  warn(message: string, context?: Record<string, unknown>): void {
    console.warn(`[warn] ${message}`, context ?? '')
    Sentry.withScope((scope) => {
      if (context) scope.setContext('details', context)
      scope.setLevel('warning')
      Sentry.captureMessage(message)
    })
  },

  error(error: unknown, context?: Record<string, unknown>): void {
    console.error('[error]', error, context ?? '')
    Sentry.captureException(error, {
      contexts: context ? { details: context } : undefined,
    })
    for (const listener of errorListeners) {
      try {
        listener(error, context)
      } catch {
        // مستمع معطوب لا يكسر التطبيق
      }
    }
  },
}
