/** مناطق التشغيل ضمن القطاعات — 00394: من السجل الحيّ للقطاعات (قاعدة البيانات) بدل القائمة الثابتة */
import { getSectorsRegistrySnapshot, PARENT_SECTOR_LABELS_LIVE } from '@sdk/sectors.sdk'

/** «قاطع …» لكل رمز قطاع (حيّ) */
export const GBS_PARENT_LABELS: Record<string, string> = new Proxy({} as Record<string, string>, {
  get: (_t, k) => (typeof k === 'string' && PARENT_SECTOR_LABELS_LIVE[k] ? `قاطع ${PARENT_SECTOR_LABELS_LIVE[k]}` : undefined),
})

export interface GbsSectorOption { id: number; name: string; parent: string }
/** المناطق الفعّالة (حيّة) */
export const gbsSectorOptions = (): GbsSectorOption[] =>
  getSectorsRegistrySnapshot().filter((p) => p.is_active).flatMap((p) => p.areas.filter((a) => a.is_active).map((a) => ({ id: a.id, name: a.name, parent: p.code })))
/** قائمة حيّة بواجهة المصفوفة (للتوافق مع الاستخدامات القديمة) */
export const GBS_SECTOR_OPTIONS: GbsSectorOption[] = new Proxy([] as GbsSectorOption[], {
  get: (_t, k) => { const arr = gbsSectorOptions(); const v = (arr as unknown as Record<string | symbol, unknown>)[k]; return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(arr) : v },
})
