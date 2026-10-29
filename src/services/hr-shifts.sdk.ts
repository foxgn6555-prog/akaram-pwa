/**
 * 00376: شفتات الموارد البشرية في كل المنصة — قائمة واحدة (hr_shifts) لكل مستخدم مسجَّل.
 * الرمز `code` ثابت ويُخزَّن في أعمدة shift عبر المنصة؛ الاسم من HR ويتحدث فور إضافة/تعديل شفت.
 * السجل الحيّ (registry) مخزن خفيف خارج React: تقرأه الخرائط القديمة (SHIFT_AR/SHIFT_LABELS) والمكوّنات عبر useSyncExternalStore.
 */
import { sdkGuard, supabase } from './client'

export interface ShiftOption {
  code: string
  name: string
  start_time: string
  end_time: string
  grace_minutes: number
  is_active: boolean
  sort_order: number
}

/** الشفتات الأساسية الاحتياطية (قبل وصول القائمة من الخادم) */
export const SHIFT_FALLBACK_OPTIONS: ShiftOption[] = [
  { code: 'morning', name: 'صباحي', start_time: '08:00:00', end_time: '16:00:00', grace_minutes: 10, is_active: true, sort_order: 1 },
  { code: 'evening', name: 'مسائي', start_time: '16:00:00', end_time: '00:00:00', grace_minutes: 10, is_active: true, sort_order: 2 },
  { code: 'night', name: 'ليلي', start_time: '00:00:00', end_time: '08:00:00', grace_minutes: 10, is_active: true, sort_order: 3 },
]
export const SHIFT_FALLBACK_LABELS: Record<string, string> = Object.fromEntries(SHIFT_FALLBACK_OPTIONS.map((o) => [o.code, o.name]))

let snapshot: readonly ShiftOption[] = SHIFT_FALLBACK_OPTIONS
let loaded = false
const listeners = new Set<() => void>()
const labels = new Map<string, string>(Object.entries(SHIFT_FALLBACK_LABELS))

/** تحديث السجل الحيّ بقائمة الخادم (كل الشفتات بما فيها الموقوفة) */
export const registerShiftOptions = (options: readonly ShiftOption[]) => {
  options.forEach((o) => labels.set(o.code, o.name))
  if (options.length) { snapshot = [...options]; loaded = true }
  listeners.forEach((l) => l())
}
export const subscribeShiftRegistry = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export const getShiftRegistrySnapshot = () => snapshot
export const isShiftRegistryLoaded = () => loaded
/** للاختبارات */
export const resetShiftRegistry = () => { snapshot = SHIFT_FALLBACK_OPTIONS; loaded = false; labels.clear(); Object.entries(SHIFT_FALLBACK_LABELS).forEach(([k, v]) => labels.set(k, v)); listeners.forEach((l) => l()) }

/** خريطة حيّة: `SHIFT_LABELS[code]` يعطي اسم الشفت من HR (أو الاحتياطي) */
export const SHIFT_LABELS_LIVE: Record<string, string> = new Proxy({} as Record<string, string>, {
  get: (_t, k) => (typeof k === 'string' ? labels.get(k) : undefined),
  has: (_t, k) => typeof k === 'string' && labels.has(k),
  ownKeys: () => [...labels.keys()],
  getOwnPropertyDescriptor: (_t, k) => (typeof k === 'string' && labels.has(k) ? { enumerable: true, configurable: true, value: labels.get(k) } : undefined),
})

export const shiftLabel = (code: string | null | undefined, options?: readonly Pick<ShiftOption, 'code' | 'name'>[] | null): string => {
  if (!code) return '—'
  return options?.find((o) => o.code === code)?.name ?? labels.get(code) ?? code
}

/** خريطة رمز → اسم (للتصدير والجداول) */
export const shiftLabelMap = (options?: readonly Pick<ShiftOption, 'code' | 'name'>[] | null): Record<string, string> =>
  ({ ...Object.fromEntries(labels), ...Object.fromEntries((options ?? []).map((o) => [o.code, o.name])) })

export const hrShifts = {
  /** قائمة الشفتات من الخادم؛ تُحدّث السجل الحيّ تلقائياً */
  options: async (includeInactive = false) => {
    const rows = ((await sdkGuard(supabase.rpc('shift_options' as never, { p_include_inactive: includeInactive } as never))) ?? []) as ShiftOption[]
    if (includeInactive) registerShiftOptions(rows)
    else registerShiftOptions([...rows, ...snapshot.filter((s) => !s.is_active && !rows.some((r) => r.code === s.code))])
    return rows
  },
}
