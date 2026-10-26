/**
 * صلاحياتي الفعلية (00350-B) — من `my_permissions()`: {unit_key: [actions...]} (المسموح فقط).
 *  · الحكم النهائي دائماً في قاعدة البيانات (`app.require_can` داخل دوال الكتابة)؛ هنا الإنفاذ المرئي: القائمة + المسار (403) + الأزرار لاحقاً.
 *  · قبل اكتمال التحميل أو عند فشله: لا حجب (fail-open في الواجهة — لا نقفل أحداً خارج بوابته بسبب الشبكة؛ الخادم يرفض الكتابة على أي حال).
 *  · مخزن zustand صغير مثل portal-visibility — يُحمَّل من AppShell مرة لكل مستخدم ويُعاد تحميله عند طلب force.
 */
import { create } from 'zustand'
import { sdkGuard, supabase } from '@sdk/client'
import type { SidebarUnit } from '@config/portals.config'
import { PERMISSION_UNIT_KEYS, unitKeyForRoute, unitKeyFromPath, type PermissionAction } from '@config/permission-catalog'

export type MyPermissions = Readonly<Record<string, readonly string[]>>

interface PermState {
  userId: string | null
  loaded: boolean
  perms: MyPermissions | null
  set: (userId: string, perms: MyPermissions | null) => void
  reset: () => void
}
export const useMyPermissionsStore = create<PermState>((set) => ({
  userId: null, loaded: false, perms: null,
  set: (userId, perms) => set({ userId, perms, loaded: true }),
  reset: () => set({ userId: null, perms: null, loaded: false }),
}))

let inflight: Promise<void> | null = null
/** يُحمِّل صلاحيات المستخدم الحالي (آمن للاستدعاء المتكرر؛ يعيد التحميل إن تغيّر المستخدم أو force) */
export function loadMyPermissions(userId: string, force = false): Promise<void> {
  const st = useMyPermissionsStore.getState()
  if (st.loaded && st.userId === userId && !force) return Promise.resolve()
  if (inflight && !force) return inflight
  inflight = (sdkGuard(supabase.rpc('my_permissions')) as Promise<MyPermissions | null>)
    .then((p) => useMyPermissionsStore.getState().set(userId, p ?? null))
    .catch(() => useMyPermissionsStore.getState().set(userId, null)) // فشل = لا حجب في الواجهة
    .finally(() => { inflight = null })
  return inflight
}

/** هل يملك الإجراء؟ perms=null (غير محمّل/فشل) ⇒ true (الخادم يحكم) */
export function canWith(perms: MyPermissions | null, unit: string, action: PermissionAction = 'view'): boolean {
  if (perms === null) return true
  return perms[unit]?.includes(action) ?? false
}

export function useCanI(unit: string, action: PermissionAction = 'view'): boolean {
  const perms = useMyPermissionsStore((s) => s.perms)
  return canWith(perms, unit, action)
}

/** الوحدات المسموح عرضها (الرئيسية تبقى دائماً — الخادم يضمنها لصاحب الدور) */
export function filterUnitsByPermissions(portal: string, units: readonly SidebarUnit[], perms: MyPermissions | null): readonly SidebarUnit[] {
  if (perms === null) return units
  const home = `/${portal}`
  const ok = (path: string): boolean => path === home || canWith(perms, unitKeyFromPath(path), 'view')
  return units
    .filter((u) => ok(u.path))
    .map((u) => (u.children ? { ...u, children: u.children.filter((c) => ok(c.path)) } : u))
}

/** هل المسار الحالي مسموح؟ مسار بلا وحدة في الكتالوج (صفحات تفصيلية/عامة) ⇒ مسموح — الحجب للوحدات المعرّفة فقط */
export function routeAllowed(pathname: string, perms: MyPermissions | null): boolean {
  if (perms === null) return true
  const key = unitKeyForRoute(pathname, PERMISSION_UNIT_KEYS)
  if (key === null) return true
  return canWith(perms, key, 'view')
}
