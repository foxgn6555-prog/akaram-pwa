/**
 * إعادة تهيئة التطبيق (الجولة ٣-هـ) — المخرج الأخير من أي حالة عالقة.
 *
 * تُستدعى في حالتين:
 *  ① زر «إصلاح التطبيق» في شريط التحديث (المستخدم يقرّر).
 *  ② حارس الإقلاع (public/boot-watchdog.js) إن لم يُركَّب التطبيق أصلًا.
 *
 * ما تفعله: مسح كل مخازن الكاش + إلغاء تسجيل عمال الخدمة + مسح سياسة التحديث المعلّقة،
 * ثم إعادة تحميل واحدة تُنزّل القشرة والأصول من الشبكة. لا تمسّ بيانات المستخدم
 * (الرموز في localStorage لا تُمسّ إلا مفتاح سياسة التحديث)، فالجلسة تبقى قائمة.
 */
import { clearPendingUpdate } from './update-policy'

export interface HardResetDeps {
  cachesApi?: CacheStorage | null
  registrations?: () => Promise<readonly ServiceWorkerRegistration[]>
  reload?: () => void
}

/** يمسح كل الكاشات ويعيد التحميل — آمن الفشل: أي خطوة تفشل تُتجاهل */
export async function hardResetApp(deps: HardResetDeps = {}): Promise<void> {
  const cachesApi = deps.cachesApi === undefined ? (typeof caches === 'undefined' ? null : caches) : deps.cachesApi
  const getRegs = deps.registrations
    ?? (async () => (typeof navigator !== 'undefined' && 'serviceWorker' in navigator
      ? navigator.serviceWorker.getRegistrations()
      : []))
  const reload = deps.reload ?? (() => window.location.reload())

  clearPendingUpdate()

  try {
    const keys = cachesApi ? await cachesApi.keys() : []
    await Promise.all(keys.map((key) => cachesApi!.delete(key).catch(() => false)))
  } catch { /* كاش محجوب — نكمل */ }

  try {
    const regs = await getRegs()
    await Promise.all(regs.map((reg) => reg.unregister().catch(() => false)))
  } catch { /* لا تسجيل — نكمل */ }

  try {
    sessionStorage.removeItem(BOOT_RECOVERY_KEY)
  } catch { /* تخزين محجوب */ }

  reload()
}

/** مفتاح «جرت محاولة استرداد في هذه الجلسة» — يمنع حلقة إعادة تحميل لا نهائية */
export const BOOT_RECOVERY_KEY = 'akaram.boot.recoveryAt'
