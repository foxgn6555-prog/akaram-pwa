import { AppError } from '@lib/errors/AppError'

/** أخطاء Push المعروفة سواء جاءت من المتصفح أو من RPC/Edge (قد تصل داخل SDKError). */
const KNOWN = [
  'PUSH_PUBLIC_KEY_MISSING',
  'PUSH_SERVER_NOT_CONFIGURED',
  'PUSH_UNAUTHENTICATED',
  'PUSH_SUBSCRIPTION_INVALID',
  'PUSH_KEYS_MISSING',
  'PUSH_REGISTRATION_FAILED',
  'PUSH_PERMISSION_DENIED',
  'PUSH_WORKER_NOT_READY',
  'PUSH_IOS_INSTALL_REQUIRED',
  'PUSH_NOT_SUPPORTED',
  'PUSH_INSECURE_CONTEXT',
] as const

export type PushErrorCode = (typeof KNOWN)[number] | 'NETWORK' | 'UNKNOWN'

export function pushErrorCode(error: unknown): PushErrorCode {
  const code = error instanceof AppError ? error.code : ''
  const message = error instanceof Error ? error.message : ''
  const known = KNOWN.find((candidate) => candidate === code || message.includes(candidate))
  if (known) return known
  if (code === 'NETWORK' || /fetch|network|اتصال/i.test(message)) return 'NETWORK'
  return 'UNKNOWN'
}

/** رسالة واحدة صادقة لكل سبب — لا تخلط بين مفتاح الواجهة وخادم الإرسال. */
export function pushErrorMessage(error: unknown): string {
  switch (pushErrorCode(error)) {
    case 'PUSH_PUBLIC_KEY_MISSING':
      return 'مفتاح إشعارات الهاتف غير مضبوط في هذه النسخة؛ راجع تقنية المعلومات'
    case 'PUSH_SERVER_NOT_CONFIGURED':
      return 'خادم إرسال الإشعارات غير مهيأ؛ راجع تقنية المعلومات'
    case 'PUSH_UNAUTHENTICATED':
      return 'انتهت جلسة الدخول؛ سجّل الدخول ثم فعّل الإشعارات'
    case 'PUSH_SUBSCRIPTION_INVALID':
    case 'PUSH_KEYS_MISSING':
      return 'تعذر إنشاء اشتراك إشعارات صالح؛ أعد المحاولة'
    case 'PUSH_REGISTRATION_FAILED':
      return 'تعذر تسجيل الجهاز في الخادم؛ تحقق من الشبكة وأعد المحاولة'
    case 'PUSH_PERMISSION_DENIED':
      return 'لم يمنح المتصفح إذن الإشعارات — اسمح به من إعدادات الموقع'
    case 'PUSH_WORKER_NOT_READY':
      return 'لم يكتمل تسجيل التطبيق للعمل دون اتصال بعد — أعد تحميل الصفحة ثم فعّل الإشعارات'
    case 'PUSH_IOS_INSTALL_REQUIRED':
      return 'على iPhone وiPad: أضف التطبيق إلى الشاشة الرئيسية أولاً، ثم فعّل الإشعارات'
    case 'PUSH_NOT_SUPPORTED':
      return 'هذا المتصفح لا يدعم إشعارات الهاتف'
    case 'PUSH_INSECURE_CONTEXT':
      return 'إشعارات الهاتف تحتاج اتصال HTTPS آمن'
    case 'NETWORK':
      return 'تعذر الاتصال بخادم الإشعارات؛ تحقق من الشبكة ثم أعد المحاولة'
    default:
      return 'تعذر تفعيل إشعارات الهاتف؛ حاول مرة أخرى'
  }
}
