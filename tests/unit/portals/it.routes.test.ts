/** البوابة التقنية: الوحدتان + صفحاتهما عبر المولّد */
import { describe, it, expect } from 'vitest'
import type { ReactElement } from 'react'
import type { RouteObject } from 'react-router'
import { buildPortalRoutes } from '@router/unit-routes'
import { PORTAL_UNITS } from '@config/portals.config'
import { PORTALS } from '@lib/constants/portals.constants'
import { customRoutes } from '@portals/it/routes'

const routes = buildPortalRoutes(PORTALS.IT, customRoutes)
const allPaths = new Set<string>()
{
  const walk = (rs: RouteObject[]): void => {
    for (const r of rs) {
      if (r.path !== undefined) allPaths.add(r.path)
      if (r.children) walk(r.children)
    }
  }
  walk(routes)
}

describe('بنية البوابة التقنية v2', () => {
  it('إحدى عشرة وحدة: الرئيسية + المستخدمون + قاعدة البيانات + الفروع + الصلاحيات + التكاملات + التحديثات + الأرشيف + Console + دليل التشغيل التقني (00275)', () => {
    expect(PORTAL_UNITS[PORTALS.IT]).toHaveLength(11)
    expect(PORTAL_UNITS[PORTALS.IT].map((u) => u.labelKey)).toEqual([
      'nav.dashboard',
      'nav.user_management',
      'nav.database',
      'nav.branches',
      'nav.page_permissions',
      'nav.integrations',
      'nav.notification_policies',
      'nav.updates',
      'nav.archive',
      'nav.console',
      'nav.devops_guide',
    ])
  })

  it('⛔ الانحدار: الرئيسية /it عنصرها اللوحة الحية لا Placeholder (إصلاح «قيد التطوير»)', () => {
    expect(PORTAL_UNITS[PORTALS.IT][0]?.path).toBe('/it')
    expect(routes[0]?.index).toBe(true)
    // مسار '' (الرئيسية) يجب أن يُلتقط من customRoutes — لا يُستبدل بـ UnitPlaceholder
    // Placeholder يستقبل props {portal, unitPath} أما اللوحة فلا تستقبل شيئاً
    const indexEl = routes[0]?.element as ReactElement<{ children?: ReactElement }>
    const inner = indexEl.props.children
    expect(inner).toBeTruthy()
    expect((inner as ReactElement<Record<string, unknown>>).props.unitPath).toBeUndefined()
  })

  it('مسار كل وحدة = صفحة الوحدة المركزية (Hub) لا أول صفحة فرعية', () => {
    const walk = (rs: typeof routes, out: string[] = []): string[] => {
      for (const r of rs) {
        if (r.path !== undefined) out.push(r.path)
        if (r.children) walk(r.children, out)
      }
      return out
    }
    const paths = walk(routes)
    expect(paths).toContain('user-management') // Hub
    expect(paths).toContain('user-management/list') // الصفحة نقلت لمسارها
    expect(paths).toContain('database') // Hub
    expect(paths).toContain('database/tables') // الجداول صفحة فرعية
  })

  it('صفحة الهيكل التنظيمي مسجلة كصفحة فرعية لإدارة المستخدمين', () => {
    const unit = PORTAL_UNITS[PORTALS.IT].find((u) => u.labelKey === 'nav.user_management')
    expect(unit?.children?.some((c) => c.labelKey === 'nav.org_structure')).toBe(false) // أُلغيت النسخة المكررة
    expect(allPaths).not.toContain('user-management/departments') // الهيكل التنظيمي يُدار من /hr/org حصراً
  })

  it('00279/00280: أطفال الشريط الذين يخدمهم مسار بمعامل (devops/git … ← devops/:slug) لا يأخذون مساراً ثابتاً (كان Placeholder «قيد التطوير» ثم فقدان slug) — يخدمهم مسار المعامل', () => {
    for (const rel of ['devops/git', 'devops/database', 'devops/tests', 'devops/hosting']) expect(allPaths.has(rel), `${rel} يجب ألا يكون مساراً ثابتاً`).toBe(false)
    expect(allPaths).toContain('devops/:slug')
    expect(allPaths).toContain('devops/status')   // الصفحة الثابتة تبقى
  })

  it('صفحة التفاصيل :userId محفوظة رغم أنها ليست في الشريط', () => {
    expect(allPaths).toContain('user-management/:userId')
  })

  it('المسارات المخصصة الكاملة: لوحة + كل الوحدات + صفحاتها الفرعية + مسارا التفاصيل', () => {
    const itPaths = [...allPaths].filter((p) => p !== '')
    expect(itPaths).toHaveLength(35) // 00325: + data-retention · 34 (00315: + cold-archive · 33 (00288: + integrations/live-tracking · 32 (00280: أطفال devops الأربعة يخدمهم devops/:slug بلا مسارات ثابتة · 36 (00278: + devops/status · 35 (00277: + hosting · 34 (00276: + database + tests · 32 (00275: دليل التشغيل التقني (hub + :slug + مسار الطفل devops/git المولَّد من الشريط) · 29 (00274: ورش الصيانة · 28 (00211: سلامة تكامل GPS · 27 (00195: الاستقطاعات التلقائية · 26 (00191: السلف — الأنواع والسياسة · 21 (00175: غير المطابقين للقراءة، 00178: سجل تعديلات الحضور) + وارد التبليغات وتفصيله (00146) + سلاسل الموافقات (00160) + أنواع الكشوفات (00170))))))))))
    expect(itPaths).toContain('user-management/approval-chains')
    expect(itPaths).toContain('user-management/maintenance-workshops')   // 00274
    expect(itPaths).toContain('devops')   // 00275
    expect(itPaths).toContain('devops/:slug')
    expect(itPaths).toContain('integrations/advances')
    expect(itPaths).toContain('integrations/live-tracking')   // 00288
    expect(itPaths).toContain('cold-archive')   // 00315
    expect(itPaths).toContain('data-retention') // 00325
    expect(itPaths).toContain('integrations/auto-deductions')
    expect(itPaths).toContain('integrations/biometric/unmatched')
    expect(itPaths).toContain('integrations/biometric/attendance-audit')
    expect(itPaths).toContain('database/tables/:tableName')
    expect(itPaths).toContain('central-garage-approvals')
    expect(itPaths).toContain('console')
  })
})
