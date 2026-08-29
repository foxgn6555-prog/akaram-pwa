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
  it('ثماني وحدات: الرئيسية + المستخدمون + قاعدة البيانات + الفروع + الصلاحيات + التكاملات + التحديثات + الأرشيف', () => {
    expect(PORTAL_UNITS[PORTALS.IT]).toHaveLength(8)
    expect(PORTAL_UNITS[PORTALS.IT].map((u) => u.labelKey)).toEqual([
      'nav.dashboard',
      'nav.user_management',
      'nav.database',
      'nav.branches',
      'nav.page_permissions',
      'nav.integrations',
      'nav.updates',
      'nav.archive',
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
    expect(paths).toContain('user-management')      // Hub
    expect(paths).toContain('user-management/list') // الصفحة نقلت لمسارها
    expect(paths).toContain('database')             // Hub
    expect(paths).toContain('database/tables')      // الجداول صفحة فرعية
  })

  it('صفحة الهيكل التنظيمي مسجلة كصفحة فرعية لإدارة المستخدمين', () => {
    const unit = PORTAL_UNITS[PORTALS.IT].find((u) => u.labelKey === 'nav.user_management')
    expect(unit?.children?.some((c) => c.labelKey === 'nav.org_structure')).toBe(true)
    expect(allPaths).toContain('user-management/departments')
  })

  it('صفحة التفاصيل :userId محفوظة رغم أنها ليست في الشريط', () => {
    expect(allPaths).toContain('user-management/:userId')
  })

  it('سبع مسارات مخصصة: لوحة + ثلاث للمستخدمين + ثلاث لقاعدة البيانات', () => {
    const itPaths = [...allPaths].filter((p) => p !== '')
    expect(itPaths).toHaveLength(16)
    expect(itPaths).toContain('database/tables/:tableName')
  })
})
