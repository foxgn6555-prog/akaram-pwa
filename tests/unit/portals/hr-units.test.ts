/**
 * عقد بوابة الموارد البشرية: الوحدات الست المعتمدة بالترتيب — والفصل الصارم:
 *   · التقني (تسجيل الأجهزة/المصادر، السحب، سجل العمليات) في بوابة التطوير المركزية فقط.
 *   · البيانات (دفتر البصمة، الربط، اشتقاق الحضور) في بوابة الموارد البشرية فقط.
 */
import { describe, expect, it } from 'vitest'
import { PORTAL_UNITS } from '@config/portals.config'
import { PORTALS } from '@lib/constants/portals.constants'
import { buildPortalRoutes } from '@router/unit-routes'
import { customRoutes } from '@portals/hr/routes'
import sidebar from '../../../src/i18n/ar/sidebar.json'

const flat = (units: typeof PORTAL_UNITS[keyof typeof PORTAL_UNITS]) =>
  units.flatMap((u) => [u, ...(u.children ?? [])])

describe('بوابة الموارد البشرية — الوحدات الست', () => {
  it('تسجل الوحدات الست بالترتيب المعتمد', () => {
    const units = PORTAL_UNITS[PORTALS.HR]
    expect(units).toHaveLength(6)
    expect(units.map((u) => u.labelKey)).toEqual([
      'nav.dashboard',          // ① الرئيسية
      'nav.hr_recruitment',     // ② التوظيف وإنهاء الخدمات
      'nav.employees',          // ③ بيانات الموظفين
      'nav.attendance',         // ④ الحضور والانصراف
      'nav.hr_leaves',          // ⑤ الإجازات والزمنيات
      'nav.hr_biometric_ledger', // ⑥ دفتر البصمة (بيانات)
    ])
    expect(units.map((u) => u.path)).toEqual([
      '/hr', '/hr/recruitment', '/hr/employees', '/hr/attendance', '/hr/leaves', '/hr/biometric',
    ])
  })

  it('العناوين العربية المعتمدة موجودة في الترجمة', () => {
    const nav = (sidebar as { nav: Record<string, string> }).nav
    expect(nav.hr_recruitment).toBe('التوظيف وإنهاء الخدمات')
    expect(nav.employees).toBe('الموظفون')
    expect(nav.attendance).toBe('الحضور والانصراف')
    expect(nav.hr_leaves).toBe('الإجازات والزمنيات')
    expect(nav.hr_biometric_ledger).toBe('دفتر البصمة')
  })

  it('لكل وحدة مسار مسجل في routes', () => {
    const routes = buildPortalRoutes(PORTALS.HR, customRoutes)
    const paths = new Set(routes.map((r) => r.path).filter(Boolean))
    expect(routes.some((r) => r.index)).toBe(true)
    expect(paths).toEqual(new Set(['recruitment', 'employees', 'attendance', 'leaves', 'biometric']))
  })

  it('الفصل التقني/البياناتي: أجهزة البصمة في بوابة التطوير المركزية فقط، والدفتر في HR فقط', () => {
    const hr = flat(PORTAL_UNITS[PORTALS.HR]).map((u) => u.path)
    const it = flat(PORTAL_UNITS[PORTALS.IT]).map((u) => u.path)
    expect(it).toContain('/it/integrations/biometric')
    expect(hr.some((p) => p.includes('integrations') || p.includes('devices'))).toBe(false)
    expect(hr).toContain('/hr/biometric')
    expect(it.some((p) => p.startsWith('/it/') && p.endsWith('/biometric') && !p.includes('integrations'))).toBe(false)
  })
})
