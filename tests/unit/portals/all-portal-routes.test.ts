/**
 * ⛔ اختبار الانحدار لثغرة «الضغط على صفحة يرجعك للدخول»:
 * كل مسار في الشريط الجانبي (وحدة أو صفحة فرعية) في كل البوابات
 * يجب أن يكون له Route فعلي — وإلا يسقط في wildcard ويعود لـ /login.
 */
import { describe, it, expect } from 'vitest'
import type { RouteObject } from 'react-router'
import { buildPortalRoutes } from '@router/unit-routes'
import { PORTAL_UNITS } from '@config/portals.config'
import { PORTALS } from '@lib/constants/portals.constants'
import { customRoutes as itCustomRoutes } from '@portals/it/routes'

function flattenPaths(routes: RouteObject[]): { paths: Set<string>; hasIndex: boolean } {
  const paths = new Set<string>()
  let hasIndex = false
  const walk = (rs: RouteObject[]): void => {
    for (const r of rs) {
      if (r.path !== undefined) paths.add(r.path)
      if (r.index === true) hasIndex = true
      if (r.children) walk(r.children)
    }
  }
  walk(routes)
  return { paths, hasIndex }
}

const ALL_PORTALS = [
  PORTALS.EMPLOYEE, PORTALS.HR, PORTALS.MANAGER,
  PORTALS.FINANCE, PORTALS.IT, PORTALS.ADMIN,
] as const

describe('⚓ الانحدار: كل روابط الشريط الجانبي لها صفحات', () => {
  for (const portal of ALL_PORTALS) {
    const custom = portal === PORTALS.IT ? itCustomRoutes : []

    it(`بوابة ${portal}: كل مسارات PORTAL_UNITS مغطاة`, () => {
      const routes = buildPortalRoutes(portal, custom)
      const { paths, hasIndex } = flattenPaths(routes)

      const portalPath = '/' + portal
      const sidebarPaths = (PORTAL_UNITS[portal] ?? []).flatMap((u) =>
        [u.path, ...(u.children ?? []).map((c) => c.path)].map((p) =>
          p === portalPath ? '' : p.slice(portalPath.length + 1),
        ),
      )

      for (const rel of sidebarPaths) {
        const covered = rel === '' ? hasIndex || paths.has('') : paths.has(rel)
        expect(covered, `الشريط يعلن /${portal}/${rel} بلا صفحة`).toBe(true)
      }
    })
  }

  it('بوابة IT: الصفحات الجاهزة الست موجودة (لا Placeholders)', () => {
    const routes = buildPortalRoutes(PORTALS.IT, itCustomRoutes)
    const { paths } = flattenPaths(routes)
    expect(paths).toContain('user-management')
    expect(paths).toContain('user-management/create')
    expect(paths).toContain('user-management/departments')
    expect(paths).toContain('user-management/:userId')
    expect(paths).toContain('database')
    expect(paths).toContain('database/errors')
  })

  it('كل البوابات: لا وحدة بلا تغطية حتى مع تعدد الصفحات الفرعية', () => {
    for (const portal of ALL_PORTALS) {
      const custom = portal === PORTALS.IT ? itCustomRoutes : []
      const units = (PORTAL_UNITS[portal] ?? []).flatMap((u) => [u, ...(u.children ?? [])])
      const routes = buildPortalRoutes(portal, custom)
      const { paths, hasIndex } = flattenPaths(routes)
      // عدد المسارات المبنية ≥ عدد وحدات الشريط (تغطية كاملة على الأقل)
      const totalUnits = units.length
      const totalBuilt = paths.size + (hasIndex ? 1 : 0)
      expect(totalBuilt, `بوابة ${portal}`).toBeGreaterThanOrEqual(totalUnits)
    }
  })
})
