/**
 * تفعيلاتي للحضور اليدوي — مخزن zustand صغير (كنمط portal-visibility) يُحمَّل من AppShell ويُحدَّث بعد كل حفظ/تفعيل.
 *  · الخادم يعيد فقط التفعيلات التي يحق للحساب الحالي تسجيلها؛ هذه القائمة وحدها تتحكم بظهور الوحدة.
 *  · غرفة العمليات (ops_room) مخوّلة تلقائياً، وبقية الحسابات تحتاج تفويضاً صريحاً من التطوير المركزية لكل تفعيل.
 *  · فشل التحميل لا يُخفي ما كان ظاهراً (نُبقي آخر قائمة معروفة)؛ وتبقى صلاحية قاعدة البيانات هي الحكم النهائي.
 */
import { create } from 'zustand'
import { attendanceManual, type ManualMyActivation } from '@sdk/attendance-manual.sdk'
import { isManualAttendancePath, type SidebarUnit } from '@config/portals.config'

/** البوابة الوحيدة التي ترى كل التفعيلات افتراضياً؛ الحسابات الأخرى ترى ما فُوّضت به فقط */
export const MANUAL_SENIOR_PORTALS: readonly string[] = ['ops-room']

interface ManualActivationsState {
  loaded: boolean
  items: readonly ManualMyActivation[]
  set: (items: readonly ManualMyActivation[]) => void
  markLoaded: () => void
  reset: () => void
}
export const useManualActivationsStore = create<ManualActivationsState>((set) => ({
  loaded: false, items: [],
  set: (items) => set({ items, loaded: true }),
  markLoaded: () => set({ loaded: true }),
  reset: () => set({ items: [], loaded: false }),
}))

let inflight: Promise<void> | null = null
/** يُحمِّل تفعيلاتي (آمن للاستدعاء المتكرر؛ force يعيد التحميل). الفشل ⇒ تبقى آخر قائمة معروفة */
export function loadMyManualActivations(force = false): Promise<void> {
  const st = useManualActivationsStore.getState()
  if (st.loaded && !force) return Promise.resolve()
  if (inflight) return inflight
  inflight = attendanceManual.myActivations()
    .then((items) => useManualActivationsStore.getState().set(Array.isArray(items) ? items : []))
    .catch(() => useManualActivationsStore.getState().markLoaded())
    .finally(() => { inflight = null })
  return inflight
}

/** هل تظهر وحدة الحضور اليدوي؟ لبوابة التفعيل المفوّض نفسه، أو لغرفة العمليات إذا كان لها أي تفعيل مسموح */
export function manualAttendanceVisible(portal: string, items: readonly Pick<ManualMyActivation, 'portal'>[]): boolean {
  if (items.some((a) => a.portal === portal)) return true
  return MANUAL_SENIOR_PORTALS.includes(portal) && items.length > 0
}

/** يُخفي وحدة الحضور اليدوي العامة (`/<portal>/manual-attendance`) ما لم يكن لها تفعيل — بقية الوحدات كما هي */
export function filterManualAttendanceUnit(portal: string, units: readonly SidebarUnit[], items: readonly Pick<ManualMyActivation, 'portal'>[]): readonly SidebarUnit[] {
  if (manualAttendanceVisible(portal, items)) return units
  return units
    .filter((u) => !isManualAttendancePath(u.path))
    .map((u) => (u.children ? { ...u, children: u.children.filter((c) => !isManualAttendancePath(c.path)) } : u))
}
