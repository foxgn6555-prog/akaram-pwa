/**
 * تصنيف فشل تحميل التصميم (بوابة الإعلام ← «التصاميم»).
 *
 * قبل الإصلاح كان أي خطأ تحميل يُعامَل كأنه «تصميم غير موجود»: إشعار أصفر + إغلاق الرابط، حتى لو كان السبب
 * انقطاع شبكة أو 503 أو تصميماً موجوداً بلا صور. التصنيف هنا يحصر التحذير الأصفر بخطأ الخادم الحقيقي
 * MEDIA_DESIGN_NOT_FOUND، ويعطي كل سبب آخر رسالته الصحيحة مع «إعادة المحاولة».
 */
export type DesignLoadFailure = 'not-found' | 'forbidden' | 'network' | 'other'

const NOT_FOUND = /MEDIA_DESIGN_NOT_FOUND/
const FORBIDDEN = /MEDIA_FORBIDDEN/
/**
 * صيغ رسالة فشل الجلب في المتصفحات. عند انقطاع الشبكة لا يرمي supabase-js استثناء TypeError بل يُرجع كائن خطأ
 * رسالته «TypeError: Failed to fetch» وكوده فارغ، فيحوّله sdkGuard إلى SDKError كوده فارغ (لا NETWORK)؛
 * لذلك لا يكفي فحص الكود أو نوع الاستثناء وحدهما.
 * Chrome: Failed to fetch · Firefox: NetworkError when attempting to fetch resource · Safari: Load failed.
 */
const NETWORK_TEXT = /Failed to fetch|NetworkError|Load failed|Network request failed|fetch failed|تعذر الاتصال|تعذّر الاتصال/i

export function classifyDesignLoadError(error: unknown): DesignLoadFailure {
  const e = error as { message?: unknown; code?: unknown } | null | undefined
  const message = error instanceof Error ? error.message : typeof e?.message === 'string' ? e.message : String(error ?? '')
  const code = typeof e?.code === 'string' ? e.code : ''
  if (code === 'NOT_FOUND' || NOT_FOUND.test(message)) return 'not-found'
  if (code === '42501' || code === 'PGRST301' || FORBIDDEN.test(message)) return 'forbidden'
  if (code === 'NETWORK' || error instanceof TypeError || NETWORK_TEXT.test(message)) return 'network'
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'network' // المتصفح نفسه يعلن انقطاع الاتصال
  return 'other'
}

/** التحذير الأصفر الوحيد: الخادم أكّد أن التصميم غير موجود فعلاً */
export const DESIGN_GONE_MESSAGE = 'هذا التصميم غير موجود أو حُذف — أُغلق الرابط القديم'

/** رسالة اللوحة لكل سبب فشل آخر (الذي ليس «غير موجود») */
export const DESIGN_LOAD_MESSAGE: Record<Exclude<DesignLoadFailure, 'not-found'>, string> = {
  forbidden: 'ليست لديك صلاحية فتح هذا التصميم.',
  network: 'تعذّر الاتصال بالخادم — تحقق من الشبكة ثم أعد المحاولة.',
  other: 'تعذّر تحميل التصميم لسبب غير متوقع — أعد المحاولة، وإن تكرر الخطأ فبلّغ الدعم الفني.',
}

/** أخطاء لا فائدة من إعادة محاولتها آلياً (محذوف / بلا صلاحية) — يستعملها retry في استعلام التفاصيل */
export const isDesignLoadPermanent = (error: unknown): boolean => {
  const k = classifyDesignLoadError(error)
  return k === 'not-found' || k === 'forbidden'
}
