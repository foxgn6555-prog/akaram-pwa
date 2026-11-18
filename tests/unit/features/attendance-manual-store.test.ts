/**
 * الحضور اليدوي — ظهور وحدته في الشريط الجانبي: لبوابة التفعيل نفسها فقط (أو لغرفة العمليات/لوحة الإدارة متى وُجد أي تفعيل)،
 * وتحميل «تفعيلاتي» مرة واحدة مع إعادة قسرية، وفشل التحميل لا يمسح القائمة، ودمجه مع إخفاء 00170 وصلاحيات 00350.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

const rpc = vi.fn()
vi.mock('@sdk/client', () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a) },
  sdkGuard: async (p: Promise<{ data: unknown; error: unknown }>) => { const r = await p; if (r.error) throw r.error; return r.data },
}))

import { MANUAL_ATTENDANCE_PORTALS, MANUAL_ATTENDANCE_SEGMENT, PORTAL_UNITS, isManualAttendancePath, type SidebarUnit } from '@config/portals.config'
import { PORTALS } from '@lib/constants/portals.constants'
import { MANUAL_SENIOR_PORTALS, filterManualAttendanceUnit, loadMyManualActivations, manualAttendanceVisible, useManualActivationsStore } from '@features/attendance-manual/store'
import { useVisibleUnits, useHiddenUnitsStore } from '@features/portal-visibility'
import { useMyPermissionsStore } from '@features/permissions/my-permissions'
import type { ManualMyActivation } from '@sdk/attendance-manual.sdk'

const act = (portal: string, over: Partial<ManualMyActivation> = {}): ManualMyActivation => ({
  id: `a-${portal}`, portal, portal_label: portal, status: 'active', starts_on: '2026-11-10', ends_on: null, pending: 0, scope_label: 'قسم', ...over,
})
const units = (portal: string): SidebarUnit[] => [
  { path: `/${portal}`, labelKey: 'nav.home', icon: 'home' },
  { path: `/${portal}/employees`, labelKey: 'nav.employees', icon: 'users' },
  { path: `/${portal}/${MANUAL_ATTENDANCE_SEGMENT}`, labelKey: 'nav.manual_attendance', icon: 'fingerprint' },
] as unknown as SidebarUnit[]

beforeEach(() => {
  rpc.mockReset()
  useManualActivationsStore.getState().reset()
  useMyPermissionsStore.getState().reset()
  useHiddenUnitsStore.getState().reset()
})

describe('مَن يرى وحدة «الحضور اليدوي»', () => {
  it('بلا تفعيلات: مخفية في كل بوابة', () => {
    for (const p of MANUAL_ATTENDANCE_PORTALS) expect(manualAttendanceVisible(p, [])).toBe(false)
  })

  it('تفعيل بوابة ما يُظهرها لها وحدها', () => {
    const items = [act('transfer-station')]
    expect(manualAttendanceVisible('transfer-station', items)).toBe(true)
    for (const p of MANUAL_ATTENDANCE_PORTALS.filter((x) => x !== 'transfer-station' && !MANUAL_SENIOR_PORTALS.includes(x))) expect(manualAttendanceVisible(p, items), p).toBe(false)
  })

  it('غرفة العمليات ولوحة الإدارة تريانها متى وُجد أي تفعيل (للإكمال نيابةً)، ولا تريانها بلا تفعيل', () => {
    expect(MANUAL_SENIOR_PORTALS).toEqual(['ops-room', 'admin'])
    for (const p of MANUAL_SENIOR_PORTALS) {
      expect(manualAttendanceVisible(p, [act('hr')]), p).toBe(true)
      expect(manualAttendanceVisible(p, []), p).toBe(false)
    }
  })

  it('التفعيل المنتهي ذو المعلّق يبقى الوحدة ظاهرة (القائمة من الخادم تُرجعه فقط ما دام فيه معلّق)', () => {
    expect(manualAttendanceVisible('hr', [act('hr', { status: 'ended', pending: 4 })])).toBe(true)
  })

  it('filterManualAttendanceUnit: يحذف الوحدة العامة فقط ولا يمس بقية الوحدات، ويُبقي القائمة كما هي عند وجود تفعيل', () => {
    const list = units('hr')
    const hidden = filterManualAttendanceUnit('hr', list, [])
    expect(hidden.map((u) => u.path)).toEqual(['/hr', '/hr/employees'])
    expect(filterManualAttendanceUnit('hr', list, [act('hr')])).toBe(list)
    // وحدة عامة داخل children أيضاً تُحذف
    const nested = [{ path: '/hr', labelKey: 'x', icon: 'home', children: [{ path: '/hr/a', labelKey: 'a', icon: 'home' }, { path: '/hr/manual-attendance', labelKey: 'm', icon: 'home' }] }] as unknown as SidebarUnit[]
    expect(filterManualAttendanceUnit('hr', nested, [])[0]!.children!.map((c) => c.path)).toEqual(['/hr/a'])
  })
})

describe('الإعداد في portals.config', () => {
  it('كل بوابة من الـ17 فيها وحدة واحدة بالمسار /<portal>/manual-attendance، أخيرة، ولا وحدة لبقية البوابات', () => {
    expect(MANUAL_ATTENDANCE_PORTALS).toHaveLength(17)
    expect(MANUAL_ATTENDANCE_PORTALS).not.toContain(PORTALS.PUBLIC)
    expect(MANUAL_ATTENDANCE_PORTALS).not.toContain(PORTALS.EMPLOYEE)   // بوابة المتعهد: يُدفع بالأعداد لا بالكشف
    for (const p of MANUAL_ATTENDANCE_PORTALS) {
      const list = PORTAL_UNITS[p]
      const manual = list.filter((u) => isManualAttendancePath(u.path))
      expect(manual.map((u) => u.path), p).toEqual([`/${p}/${MANUAL_ATTENDANCE_SEGMENT}`])
      expect(list[list.length - 1]!.path, p).toBe(`/${p}/${MANUAL_ATTENDANCE_SEGMENT}`)
    }
    for (const p of [PORTALS.PUBLIC, PORTALS.EMPLOYEE]) expect(PORTAL_UNITS[p].some((u) => isManualAttendancePath(u.path)), p).toBe(false)
  })

  it('بوابة التطوير: صفحة التفعيل ضمن التكاملات (وليست وحدة عامة)', () => {
    const integrations = PORTAL_UNITS[PORTALS.IT].find((u) => u.path === '/it/integrations')
    expect(integrations?.children?.map((c) => c.path)).toContain('/it/integrations/attendance-manual')
  })
})

describe('تحميل «تفعيلاتي»', () => {
  it('مرة واحدة ما لم يُطلب قسراً؛ والقائمة تُخزَّن', async () => {
    rpc.mockResolvedValue({ data: [act('hr')], error: null })
    await loadMyManualActivations()
    await loadMyManualActivations()
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('manual_att_my_activations', {})
    expect(useManualActivationsStore.getState()).toMatchObject({ loaded: true, items: [expect.objectContaining({ portal: 'hr' })] })
    rpc.mockResolvedValue({ data: [], error: null })
    await loadMyManualActivations(true)
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(useManualActivationsStore.getState().items).toEqual([])
  })

  it('التحميلات المتزامنة تشارك طلباً واحداً حتى مع طلب إعادة تحميل قسري', async () => {
    let release: ((value: { data: unknown; error: unknown }) => void) | null = null
    rpc.mockImplementation(() => new Promise((resolve) => { release = resolve }))
    const first = loadMyManualActivations()
    const forced = loadMyManualActivations(true)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(release).not.toBeNull()
    release!({ data: [act('hr')], error: null })
    await Promise.all([first, forced])
    expect(useManualActivationsStore.getState()).toMatchObject({ loaded: true, items: [expect.objectContaining({ portal: 'hr' })] })
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('الفشل لا يمسح آخر قائمة معروفة ويعلّم التحميل منتهياً (لا شاشة تحميل أبدية)', async () => {
    rpc.mockResolvedValueOnce({ data: [act('hr')], error: null })
    await loadMyManualActivations(true)
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'network' } })
    await loadMyManualActivations(true)
    expect(useManualActivationsStore.getState()).toMatchObject({ loaded: true, items: [expect.objectContaining({ portal: 'hr' })] })
    useManualActivationsStore.getState().reset()
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'network' } })
    await loadMyManualActivations(true)
    expect(useManualActivationsStore.getState()).toMatchObject({ loaded: true, items: [] })
  })

  it('رد غير مصفوفة (وضع العرض بلا بيانات) ⇒ قائمة فارغة لا انهيار', async () => {
    rpc.mockResolvedValue({ data: { weird: true }, error: null })
    await loadMyManualActivations(true)
    expect(useManualActivationsStore.getState().items).toEqual([])
  })
})

describe('useVisibleUnits يجمع الإخفاء والصلاحيات والتفعيل', () => {
  const perms = { hr: ['view'], 'hr.employees': ['view'], 'hr.manual-attendance': ['view', 'create'] }

  it('بلا تفعيل: الوحدة مخفية ولو كانت الصلاحية موجودة', () => {
    useMyPermissionsStore.getState().set('u1', perms)
    const { result } = renderHook(() => useVisibleUnits('hr', units('hr')))
    expect(result.current.map((u) => u.path)).toEqual(['/hr', '/hr/employees'])
  })

  it('مع تفعيل لبوابتها وصلاحية العرض: تظهر', () => {
    useMyPermissionsStore.getState().set('u1', perms)
    useManualActivationsStore.getState().set([act('hr')])
    const { result } = renderHook(() => useVisibleUnits('hr', units('hr')))
    expect(result.current.map((u) => u.path)).toEqual(['/hr', '/hr/employees', '/hr/manual-attendance'])
  })

  it('مع تفعيل لكن بلا صلاحية العرض (يمنحها التطوير المركزية): تبقى مخفية', () => {
    useMyPermissionsStore.getState().set('u1', { hr: ['view'], 'hr.employees': ['view'] })
    useManualActivationsStore.getState().set([act('hr')])
    const { result } = renderHook(() => useVisibleUnits('hr', units('hr')))
    expect(result.current.map((u) => u.path)).not.toContain('/hr/manual-attendance')
  })

  it('وحدة أخفتها التطوير المركزية لهذا الحساب تبقى مخفية رغم التفعيل', () => {
    useMyPermissionsStore.getState().set('u1', perms)
    useManualActivationsStore.getState().set([act('hr')])
    useHiddenUnitsStore.getState().set({ hr: ['/hr/manual-attendance'] })
    const { result } = renderHook(() => useVisibleUnits('hr', units('hr')))
    expect(result.current.map((u) => u.path)).toEqual(['/hr', '/hr/employees'])
  })
})
