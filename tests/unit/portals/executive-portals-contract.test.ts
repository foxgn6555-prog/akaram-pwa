/**
 * عقد بوابات الإدارة العليا (المدير المفوض / التنفيذي / المعاون / المالية):
 *   · كل بوابة: الرئيسية ← التقارير ← التبليغات (بهذا الترتيب) + وحداتها الخاصة
 *   · بوابة المدير المفوض بلا أي صفحة تقنية (لا تداخل مع التطوير المركزية)
 *   · وارد التبليغات وتفصيله متاحان في كل بوابة على مسار موحّد
 *   · super_admin يهبط في /admin
 */
import { describe, expect, it } from 'vitest'
import type { RouteObject } from 'react-router'
import { PORTAL_UNITS } from '@config/portals.config'
import { PORTALS } from '@lib/constants/portals.constants'
import { buildPortalRoutes, ANNOUNCEMENT_INBOX_PATH } from '@router/unit-routes'
import { resolvePortal } from '@router/portal.router'
import { customRoutes as adminRoutes } from '@portals/admin/routes'
import { customRoutes as executiveRoutes } from '@portals/executive/routes'
import { customRoutes as deputyRoutes } from '@portals/deputy/routes'
import { customRoutes as financeRoutes } from '@portals/finance/routes'
import sidebar from '@/i18n/ar/sidebar.json'

const paths = (routes: RouteObject[]) => new Set(routes.flatMap((r) => (r.path !== undefined ? [r.path] : [])))
const TECH = ['portals', 'roles', 'settings', 'audit-logs', 'backup', 'database', 'permissions', 'integrations', 'updates', 'console']

describe('بوابات الإدارة العليا', () => {
  const cases = [
    { portal: PORTALS.ADMIN, routes: adminRoutes, base: '/admin' },
    { portal: PORTALS.EXECUTIVE, routes: executiveRoutes, base: '/executive' },
    { portal: PORTALS.DEPUTY, routes: deputyRoutes, base: '/deputy' },
    { portal: PORTALS.FINANCE, routes: financeRoutes, base: '/finance' },
  ] as const

  for (const c of cases) {
    it(`${c.portal}: الشريط يبدأ بالرئيسية ثم التقارير، ويحوي التبليغات، وكل مسار له صفحة حقيقية`, () => {
      const units = PORTAL_UNITS[c.portal]
      expect(units[0]!.path).toBe(c.base)
      expect(units[1]!.path).toBe(`${c.base}/reports`)
      expect(units[1]!.labelKey).toBe('nav.exec_reports')
      expect(units.some((u) => u.path === `${c.base}/announcements` && u.labelKey === 'nav.announcements')).toBe(true)
      const custom = paths(c.routes)
      for (const u of units) {
        const rel = u.path === c.base ? '' : u.path.slice(c.base.length + 1)
        expect(custom.has(rel), `${u.path} يجب أن يكون صفحة حقيقية لا Placeholder`).toBe(true)
      }
    })
    it(`${c.portal}: وارد التبليغات + التفصيل مبنيان تلقائياً`, () => {
      const built = paths(buildPortalRoutes(c.portal, [...c.routes]))
      expect(built.has(ANNOUNCEMENT_INBOX_PATH)).toBe(true)
      expect(built.has(`${ANNOUNCEMENT_INBOX_PATH}/:announcementId`)).toBe(true)
    })
  }

  it('بوابة المدير المفوض: أعمال صافية — لا صفحات تقنية ولا نصوص تقنية في الشريط', () => {
    const rel = [...paths(adminRoutes)]
    expect(rel.sort()).toEqual(['', 'announcements', 'approvals', 'disclosures', 'procedures', 'reports'])
    for (const t of TECH) expect(rel).not.toContain(t)
    const labels = PORTAL_UNITS[PORTALS.ADMIN].map((u) => (sidebar.nav as Record<string, string>)[u.labelKey.replace('nav.', '')])
    expect(labels).toEqual(['الرئيسية', 'التقارير', 'التبليغات', 'طلبات الموافقة', 'الإجراءات', 'الكشوفات'])
  })

  it('المعاون يحتفظ بوحداته الميدانية (كشوفات/تجهيزات/فولدر المحطة/تحليل البيانات)', () => {
    const p = PORTAL_UNITS[PORTALS.DEPUTY].map((u) => u.path)
    for (const x of ['/deputy/statements', '/deputy/sector-supplies', '/deputy/station-folders', '/deputy/data-analysis']) expect(p).toContain(x)
  })

  it('المالية تحتفظ بالرواتب والمشتريات والموازنة ولا تحمل صفحة تدقيق فارغة', () => {
    const p = PORTAL_UNITS[PORTALS.FINANCE].map((u) => u.path)
    expect(p).toEqual(expect.arrayContaining(['/finance/payroll', '/finance/purchases', '/finance/budget']))
    expect(p).not.toContain('/finance/audit-report')
  })

  it('وارد التبليغات موجود في كل البوابات بلا استثناء (يستهدفه رابط الإشعار)', () => {
    for (const portal of Object.values(PORTALS)) {
      if (portal === PORTALS.PUBLIC) continue
      expect(paths(buildPortalRoutes(portal)).has(ANNOUNCEMENT_INBOX_PATH), portal).toBe(true)
    }
  })

  it('المدير المفوض (super_admin) يهبط في بوابته /admin ويبقى له الوصول لكل البوابات', () => {
    expect(resolvePortal(['super_admin'])).toEqual({ type: 'single', portal: 'admin', path: '/admin' })
    expect(resolvePortal(['executive_director'])).toEqual({ type: 'single', portal: 'executive', path: '/executive' })
    expect(resolvePortal(['deputy_director'])).toEqual({ type: 'single', portal: 'deputy', path: '/deputy' })
    expect(resolvePortal(['finance_officer'])).toEqual({ type: 'single', portal: 'finance', path: '/finance' })
  })
})
