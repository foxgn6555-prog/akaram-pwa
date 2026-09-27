/**
 * تحميل كسول ذاتي الإصلاح — يحل جذرياً خطأ «Failed to fetch dynamically imported module»:
 *   · في التطوير: عندما يعيد Vite تحسين الاعتماديات (504 Outdated Optimize Dep) تصبح القطع المفتوحة قديمة
 *   · في الإنتاج: بعد كل نشر تختفي القطع القديمة (hash جديد) فتفشل التبويبات المفتوحة
 * الحل: إعادة تحميل الصفحة مرة واحدة فقط لكل قطعة (حارس في sessionStorage يمنع الحلقة)، وإلا يُرمى الخطأ للحدود.
 */
import { lazy as reactLazy, type ComponentType, type LazyExoticComponent } from 'react'

const GUARD = 'lazy-reload:'
const CHUNK_ERROR = /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk|Outdated Optimize Dep|error loading dynamically imported module/i

export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return CHUNK_ERROR.test(msg)
}

/** يعيد التحميل مرة واحدة لكل مفتاح؛ يرجع false إن سبقت المحاولة */
export function reloadOnce(key: string): boolean {
  try {
    const k = GUARD + key
    if (sessionStorage.getItem(k)) return false
    sessionStorage.setItem(k, String(Date.now()))
  } catch { /* تخزين معطّل: أعد التحميل مرة على الأقل */ }
  window.location.reload()
  return true
}

/** يمسح حرّاس الإعادة بعد نجاح التحميل كي تعمل الحماية مجدداً في النشر التالي */
function clearGuards(): void {
  try { for (let i = sessionStorage.length - 1; i >= 0; i--) { const k = sessionStorage.key(i); if (k?.startsWith(GUARD)) sessionStorage.removeItem(k) } } catch { /* لا شيء */ }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazy<T extends ComponentType<any>>(importer: () => Promise<{ default: T }>): LazyExoticComponent<T> {
  const key = importer.toString().replace(/\s+/g, '')
  return reactLazy(async () => {
    try {
      const mod = await importer()
      clearGuards()
      return mod
    } catch (err) {
      if (isChunkLoadError(err) && reloadOnce(key)) return new Promise<never>(() => undefined) // الصفحة تُعاد الآن
      throw err
    }
  })
}
