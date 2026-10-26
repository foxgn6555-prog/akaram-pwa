/** 00350-B — منطق الإنفاذ المرئي: ترشيح القائمة، السماح بالمسار، fail-open قبل التحميل، والتحميل لكل مستخدم */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('@sdk/client', () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a) },
  sdkGuard: async (p: Promise<{ data: unknown; error: unknown }>) => { const r = await p; if (r.error) throw r.error; return r.data },
}))

import { PERMISSION_DENIED_TITLE, canCallWith, canWith, filterUnitsByPermissions, loadMyPermissions, routeAllowed, useCanCall, useMyPermissionsStore } from '@features/permissions/my-permissions'
import { useVisibleUnits } from '@features/portal-visibility'
import { act, renderHook } from '@testing-library/react'
import type { SidebarUnit } from '@config/portals.config'

const units: SidebarUnit[] = [
  { path: '/hr', labelKey: 'nav.home', icon: 'home' },
  { path: '/hr/employees', labelKey: 'nav.employees', icon: 'users' },
  { path: '/hr/leaves', labelKey: 'nav.leaves', icon: 'calendar' },
] as unknown as SidebarUnit[]

describe('⚓ صلاحياتي — الإنفاذ المرئي', () => {
  beforeEach(() => { useMyPermissionsStore.getState().reset(); rpc.mockReset() })

  it('قبل التحميل أو عند الفشل: لا حجب (fail-open)', () => {
    expect(canWith(null, 'hr.employees', 'edit')).toBe(true)
    expect(filterUnitsByPermissions('hr', units, null)).toHaveLength(3)
    expect(routeAllowed('/hr/leaves', null)).toBe(true)
  })

  it('الترشيح: الوحدة الممنوعة تختفي، الرئيسية تبقى دائماً، والمسار الممنوع ⇒ غير مسموح', () => {
    const perms = { 'hr.employees': ['view', 'edit'] }
    const out = filterUnitsByPermissions('hr', units, perms)
    expect(out.map((u) => u.path)).toEqual(['/hr', '/hr/employees'])
    expect(routeAllowed('/hr/leaves', perms)).toBe(false)
    expect(routeAllowed('/hr/employees/123/edit', perms)).toBe(true)
    expect(canWith(perms, 'hr.employees', 'delete')).toBe(false)
    // مسار بلا وحدة في الكتالوج (صفحة عامة) لا يُحجب
    expect(routeAllowed('/unknown/page', perms)).toBe(true)
  })

  it('التحميل: مرة لكل مستخدم عبر my_permissions، وتغيّر المستخدم يعيد التحميل، والفشل ⇒ null', async () => {
    rpc.mockResolvedValueOnce({ data: { hr: ['view'] }, error: null })
    await loadMyPermissions('u1')
    expect(rpc).toHaveBeenCalledWith('my_permissions')
    expect(useMyPermissionsStore.getState().perms).toEqual({ hr: ['view'] })
    await loadMyPermissions('u1')
    expect(rpc).toHaveBeenCalledTimes(1)
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    await loadMyPermissions('u2')
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(useMyPermissionsStore.getState()).toMatchObject({ userId: 'u2', perms: null, loaded: true })
  })

  it('useVisibleUnits يجمع إخفاء 00170 مع صلاحيات 00350', () => {
    useMyPermissionsStore.getState().set('u1', { hr: ['view'], 'hr.leaves': ['view'] })
    const { result } = renderHook(() => useVisibleUnits('hr', units))
    expect(result.current.map((u) => u.path)).toEqual(['/hr', '/hr/leaves'])
  })
})

describe('⚓ 00350-D — useCanCall: تعطيل أزرار الكتابة حسب ربط الدالة', () => {
  beforeEach(() => { useMyPermissionsStore.getState().reset() })

  it('قبل التحميل: مسموح بلا عنوان (fail-open كالقائمة)', () => {
    expect(canCallWith(null, 'finance_payroll_approve')).toBe(true)
    const { result } = renderHook(() => useCanCall('finance_payroll_approve'))
    expect(result.current).toEqual({ allowed: true, title: undefined })
  })

  it('بعد التحميل: الدالة المربوطة تُفحص على وحدتها وإجرائها؛ وغير المربوطة مسموحة دائماً', () => {
    useMyPermissionsStore.getState().set('u1', { 'finance.payroll': ['view', 'edit'], 'finance.advances': ['view'] })
    expect(canCallWith(useMyPermissionsStore.getState().perms, 'finance_payroll_adjust')).toBe(true)   // edit ✓
    expect(canCallWith(useMyPermissionsStore.getState().perms, 'finance_payroll_approve')).toBe(false) // decide ✗
    expect(canCallWith(useMyPermissionsStore.getState().perms, 'advance_deliver')).toBe(false)         // execute ✗
    expect(canCallWith(useMyPermissionsStore.getState().perms, 'some_unbound_fn')).toBe(true)
    const { result } = renderHook(() => useCanCall('finance_payroll_approve'))
    expect(result.current.allowed).toBe(false)
    expect(result.current.title).toBe(PERMISSION_DENIED_TITLE)
  })

  it('تغيير الصلاحيات في المخزن يعيد تقييم الزر فوراً', () => {
    useMyPermissionsStore.getState().set('u1', { 'ops-room.attendance': ['view'] })
    const { result } = renderHook(() => useCanCall('ops_attendance_confirm'))
    expect(result.current.allowed).toBe(false)
    act(() => useMyPermissionsStore.getState().set('u1', { 'ops-room.attendance': ['view', 'decide'] }))
    expect(result.current.allowed).toBe(true)
  })
})
