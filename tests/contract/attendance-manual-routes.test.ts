/**
 * عقد «الحضور اليدوي البديل عند تعطل البصمة» — التوصيل بين الإعداد والمسارات والصلاحيات والإشعارات:
 *   · وحدة عامة واحدة /<portal>/manual-attendance في كل بوابة تملك موظفين (17) — لا في العامة ولا بوابة المتعهد
 *   · buildPortalRoutes يسجّل لها صفحة حقيقية (لا Placeholder) تستلم بوابتها الصحيحة
 *   · صفحة التفعيل في التطوير وحدها (وحدة فرعية + مسار + ربط دوال الكتابة)
 *   · كتالوج الصلاحيات: «إنشاء» = تسجيل الكشف · «تنفيذ» التفعيل للتطوير فقط · الحجب بالمسار
 *   · روابط الإشعارات التي يكتبها الترحيل تشير إلى مسارات مسجّلة فعلاً.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement, isValidElement, type ReactElement } from 'react'
import type { RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'
import {
  MANUAL_ATTENDANCE_PORTALS, MANUAL_ATTENDANCE_SEGMENT, PORTAL_UNITS, isManualAttendancePath, type SidebarUnit,
} from '@config/portals.config'
import { PERMISSION_CATALOG, PERMISSION_UNIT_KEYS, PORTAL_ROLE, WRITE_BINDINGS, unitKeyFromPath } from '@config/permission-catalog'
import { PORTALS, type PortalId } from '@lib/constants/portals.constants'
import { buildPortalRoutes } from '@router/unit-routes'
import { customRoutes as itRoutes } from '@portals/it/routes'
import { canWith, routeAllowed } from '@features/permissions/my-permissions'
import sidebar from '../../src/i18n/ar/sidebar.json'

const MIGRATION = readFileSync(join(process.cwd(), 'supabase/migrations/20261118130000_attendance_manual_mode.sql'), 'utf8')
const nav = sidebar.nav as Record<string, string>

const collect = (routes: RouteObject[], out: RouteObject[] = []): RouteObject[] => {
  for (const r of routes) { out.push(r); if (r.children) collect(r.children, out) }
  return out
}
const flat = (units: readonly SidebarUnit[]): SidebarUnit[] => units.flatMap((u) => [u, ...(u.children ?? [])])
const NOT_COVERED: PortalId[] = [PORTALS.PUBLIC, PORTALS.EMPLOYEE]

describe('الوحدة العامة /<portal>/manual-attendance', () => {
  it('17 بوابة بلا تكرار، تستثني العامة وبوابة المتعهد (يُدفع بالأعداد لا بالكشف)', () => {
    expect(MANUAL_ATTENDANCE_PORTALS).toHaveLength(17)
    expect(new Set(MANUAL_ATTENDANCE_PORTALS).size).toBe(17)
    for (const p of NOT_COVERED) expect(MANUAL_ATTENDANCE_PORTALS).not.toContain(p)
    // كل بوابة ذات دور فعلي (غير العامة) ما عدا بوابة المتعهد مشمولة — بوابة جديدة تُنسى هنا ستُكتشف
    const expected = (Object.keys(PORTAL_ROLE) as Array<keyof typeof PORTAL_ROLE>).filter((p) => p !== PORTALS.EMPLOYEE)
    expect([...MANUAL_ATTENDANCE_PORTALS].sort()).toEqual([...expected].sort())
  })

  it('كل بوابة مشمولة فيها وحدة واحدة آخر القائمة بمسار وتسمية عربية؛ وغير المشمولة بلا وحدة', () => {
    for (const p of MANUAL_ATTENDANCE_PORTALS) {
      const list = PORTAL_UNITS[p]
      const manual = list.filter((u) => isManualAttendancePath(u.path))
      expect(manual.map((u) => u.path), p).toEqual([`/${p}/${MANUAL_ATTENDANCE_SEGMENT}`])
      expect(list[list.length - 1], p).toBe(manual[0])
      expect(manual[0]!.labelKey).toBe('nav.manual_attendance')
      expect(manual[0]!.children).toBeUndefined()
    }
    for (const p of NOT_COVERED) expect(flat(PORTAL_UNITS[p]).some((u) => isManualAttendancePath(u.path)), p).toBe(false)
    expect(nav.manual_attendance).toBe('الحضور اليدوي')
    expect(nav.it_attendance_manual).toBe('الحضور اليدوي (تعطل البصمة)')
  })

  it('لا تعارض أيقونات: الوحدة تحمل أيقونة معروفة ولا تكرّر أيقونة وحدة أخرى في الإدارة العليا (اختبار 00220)', () => {
    for (const portal of [PORTALS.ADMIN, PORTALS.EXECUTIVE, PORTALS.DEPUTY]) {
      const icons = PORTAL_UNITS[portal].map((u) => u.icon)
      expect(new Set(icons).size, `أيقونات ${portal}`).toBe(icons.length)
    }
  })

  it('isManualAttendancePath: مسار الوحدة العامة فقط', () => {
    for (const p of MANUAL_ATTENDANCE_PORTALS) expect(isManualAttendancePath(`/${p}/manual-attendance`)).toBe(true)
    for (const no of ['/it/integrations/attendance-manual', '/hr/attendance', '/hr/manual-attendance/x', '/hr/manual-attendances', '/manual-attendance-x', '/hr/attendance-edits']) {
      expect(isManualAttendancePath(no), no).toBe(false)
    }
  })

  it('buildPortalRoutes يسجّل صفحة حقيقية مرة واحدة لكل بوابة مشمولة تستلم بوابتها (لا Placeholder ولا بوابة أخرى)', () => {
    for (const p of MANUAL_ATTENDANCE_PORTALS) {
      const found = collect(buildPortalRoutes(p, p === PORTALS.IT ? itRoutes : [])).filter((r) => r.path === MANUAL_ATTENDANCE_SEGMENT)
      expect(found, p).toHaveLength(1)
      const el = found[0]!.element
      expect(isValidElement(el), p).toBe(true)
      // suspense(<ManualAttendancePage portal={p} />)
      const inner = (el as ReactElement<{ children?: ReactElement<{ portal?: string; unitPath?: string }> }>).props.children
      expect(inner?.props.portal, `البوابة الممرَّرة للصفحة في ${p}`).toBe(p)
      expect(inner?.props.unitPath, `${p} يجب ألا يكون Placeholder`).toBeUndefined()
    }
  })

  it('لا مسار للكشف في العامة وبوابة المتعهد', () => {
    for (const p of NOT_COVERED) {
      const found = collect(buildPortalRoutes(p, [])).filter((r) => r.path === MANUAL_ATTENDANCE_SEGMENT)
      expect(found, p).toHaveLength(0)
    }
  })

  it('مسار مخصص في بوابة يسبق العام: لا يُستبدل (buildPortalRoutes يسجّل العام إن غاب فقط)', () => {
    const custom: RouteObject = { path: MANUAL_ATTENDANCE_SEGMENT, element: createElement('div', { 'data-testid': 'custom' }) }
    const found = collect(buildPortalRoutes(PORTALS.HR, [custom])).filter((r) => r.path === MANUAL_ATTENDANCE_SEGMENT)
    expect(found).toHaveLength(1)
    expect(found[0]!.element).toBe(custom.element)
  })
})

describe('صفحة التفعيل (التطوير المركزية وحدها)', () => {
  const itIntegrations = PORTAL_UNITS[PORTALS.IT].find((u) => u.path === '/it/integrations')

  it('وحدة فرعية تحت «التكاملات» بمسار ومسار مخصص مطابقين وتسمية عربية', () => {
    const child = itIntegrations?.children?.find((c) => c.path === '/it/integrations/attendance-manual')
    expect(child?.labelKey).toBe('nav.it_attendance_manual')
    expect(collect(itRoutes).some((r) => r.path === 'integrations/attendance-manual')).toBe(true)
  })

  it('لا وحدة تفعيل في أي بوابة غير التطوير', () => {
    for (const [portal, units] of Object.entries(PORTAL_UNITS)) {
      if (portal === PORTALS.IT) continue
      expect(flat(units).some((u) => u.path.endsWith('/attendance-manual')), portal).toBe(false)
    }
  })

  it('دوال التفعيل والإيقاف مربوطة بوحدة التطوير وإجراء «تنفيذ» حصراً؛ والكشف مفوَّض داخل الدالة (لا ربط ثابت)', () => {
    expect(WRITE_BINDINGS.attendance_manual_activate).toEqual(['it.integrations.attendance-manual', 'execute'])
    expect(WRITE_BINDINGS.attendance_manual_deactivate).toEqual(['it.integrations.attendance-manual', 'execute'])
    expect(WRITE_BINDINGS.manual_att_sheet_save).toBeUndefined()
  })

  it('الخادم يشترط دور it_admin مباشرةً للتفعيل والإيقاف؛ استثناء الوحدة الفردي لا يكفي', () => {
    for (const fn of ['attendance_manual_activate__raw', 'attendance_manual_deactivate__raw']) {
      const start = MIGRATION.indexOf(`create or replace function app.${fn}`)
      const end = MIGRATION.indexOf('$$;', start)
      expect(start, fn).toBeGreaterThanOrEqual(0)
      expect(MIGRATION.slice(start, end)).toContain("if not app.has_role(array['it_admin']) then raise exception 'PERMISSION_DENIED'; end if;")
    }
  })
})

describe('كتالوج الصلاحيات والحجب', () => {
  it('كل وحدة كشف تتيح «عرض» و«إنشاء» فقط؛ ووحدة التفعيل «عرض» و«تنفيذ» فقط', () => {
    for (const p of MANUAL_ATTENDANCE_PORTALS) {
      const u = PERMISSION_CATALOG.find((x) => x.key === `${p}.manual-attendance`)
      expect(u, p).toBeDefined()
      expect(u!.actions, p).toEqual(['view', 'create'])
      expect(u!.portal).toBe(p)
    }
    const it = PERMISSION_CATALOG.find((x) => x.key === 'it.integrations.attendance-manual')
    expect(it?.actions).toEqual(['view', 'execute'])
    expect(it?.parentKey).toBe('it.integrations')
  })

  it('مفاتيح الوحدات = مسارها (unitKeyFromPath) وموجودة في الكتالوج', () => {
    for (const p of MANUAL_ATTENDANCE_PORTALS) {
      const key = unitKeyFromPath(`/${p}/manual-attendance`)
      expect(key).toBe(`${p}.manual-attendance`)
      expect(PERMISSION_UNIT_KEYS.has(key)).toBe(true)
    }
  })

  it('الحجب بالمسار: من لا يملك «عرض» وحدة الكشف يُحجب عنها، ومن يملكها يدخلها؛ وبلا معلومات (null) لا حجب', () => {
    expect(routeAllowed('/hr/manual-attendance', { hr: ['view'] })).toBe(false)
    expect(routeAllowed('/hr/manual-attendance', { hr: ['view'], 'hr.manual-attendance': ['view', 'create'] })).toBe(true)
    expect(routeAllowed('/hr/manual-attendance', null)).toBe(true)
    expect(canWith({ 'hr.manual-attendance': ['view'] }, 'hr.manual-attendance', 'create')).toBe(false)
    expect(routeAllowed('/it/integrations/attendance-manual', { it: ['view'] })).toBe(false)
    expect(routeAllowed('/it/integrations/attendance-manual', { 'it.integrations.attendance-manual': ['view'] })).toBe(true)
  })
})

describe('روابط الإشعارات في الترحيل تشير إلى مسارات مسجّلة', () => {
  const linkLiterals = [...new Set([...MIGRATION.matchAll(/'(\/[a-z-]+\/[a-z/-]*(?:manual-attendance|attendance-manual))'/g)].map((m) => m[1]!))]

  it('وُجدت روابط ثابتة في الترحيل (ops-room + التفعيل)', () => {
    expect(linkLiterals).toEqual(expect.arrayContaining(['/ops-room/manual-attendance', '/it/integrations/attendance-manual']))
  })

  it('كل رابط ثابت = وحدة مسجّلة في PORTAL_UNITS (فتح الإشعار لا يهبط على 404)', () => {
    const allPaths = new Set(Object.values(PORTAL_UNITS).flatMap((units) => flat(units).map((u) => u.path)))
    for (const l of linkLiterals) expect(allPaths.has(l), l).toBe(true)
  })

  it('الرابط المبني ديناميكياً \'/\' || portal || \'/manual-attendance\' يطابق الوحدة العامة لكل بوابة', () => {
    expect(MIGRATION).toContain("'/' || a.portal || '/manual-attendance'")
    const allPaths = new Set(Object.values(PORTAL_UNITS).flatMap((units) => flat(units).map((u) => u.path)))
    for (const p of MANUAL_ATTENDANCE_PORTALS) expect(allPaths.has(`/${p}/manual-attendance`), p).toBe(true)
  })
})
