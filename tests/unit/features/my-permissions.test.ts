/** 00350-B — منطق الإنفاذ المرئي: ترشيح القائمة، السماح بالمسار، fail-open قبل التحميل، والتحميل لكل مستخدم */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('@sdk/client', () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a) },
  sdkGuard: async (p: Promise<{ data: unknown; error: unknown }>) => { const r = await p; if (r.error) throw r.error; return r.data },
}))

import { canWith, filterUnitsByPermissions, loadMyPermissions, routeAllowed, useMyPermissionsStore } from '@features/permissions/my-permissions'
import { useVisibleUnits } from '@features/portal-visibility'
import { renderHook } from '@testing-library/react'
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
