/**
 * ⚑ عقود البوابة التقنية — نمط Kyvzon Contract Tests
 * يتحقق من اتساق: الوحدات ↔ المسارات ↔ الصفحات ↔ الـ RPC
 */
import { describe, it, expect } from 'vitest'
import { PORTAL_UNITS } from '@config/portals.config'
import { PORTALS } from '@lib/constants/portals.constants'
import { customRoutes } from '@portals/it/routes'
import { UNIT_LIBRARY } from '@features/portals/types'

// اجمع المسارات الفعلية
// اجمع مسارات customRoutes كاملة
const allRoutes = customRoutes.map((r) => r.path).filter(Boolean) as string[]

describe('⚓ عقد البوابة التقنية', () => {
  it('الوحدات الثماني مسجلة بالترتيب الصحيح', () => {
    expect(PORTAL_UNITS[PORTALS.IT]).toHaveLength(8)
    const labels = PORTAL_UNITS[PORTALS.IT].map((u) => u.labelKey)
    expect(labels).toEqual([
      'nav.dashboard', 'nav.user_management', 'nav.database',
      'nav.branches', 'nav.page_permissions', 'nav.integrations',
      'nav.updates', 'nav.archive',
    ])
  })

  it('كل وحدة لها route في customRoutes', () => {
    const expectedPaths = PORTAL_UNITS[PORTALS.IT]
      .filter((u) => u.path !== '/it')
      .map((u) => u.path.replace('/it/', ''))
    for (const expected of expectedPaths) {
      expect(allRoutes, `الوحدة ${expected} بلا route`).toContain(expected)
    }
  })

  it('لا مسار يتيم خارج الوحدات', () => {
    const sidebarPaths = new Set(
      PORTAL_UNITS[PORTALS.IT].flatMap((u) =>
        u.path !== '/it' ? [u.path.replace('/it/', '')] : []
      ).concat(
        PORTAL_UNITS[PORTALS.IT].flatMap((u) =>
          (u.children ?? []).map((c) => c.path.replace('/it/', ''))
        )
      ).concat(['user-management/:userId', 'database/tables/:tableName'])
    )
    for (const route of allRoutes) {
      expect(sidebarPaths.has(route), `مسار يتيم: ${route}`).toBe(true)
    }
  })
})

describe('⚓ عقد مكتبة الوحدات الديناميكية', () => {
  it('UNIT_LIBRARY غير فارغة وكل وحدة معرّفة', () => {
    expect(UNIT_LIBRARY.length).toBeGreaterThan(0)
    for (const u of UNIT_LIBRARY) {
      expect(u.unit_key).toMatch(/^[a-z-]+$/)
      expect(u.label.length).toBeGreaterThan(2)
      expect(u.page_keys.length).toBeGreaterThan(0)
    }
  })

  it('لا مفاتيح وحدات مكررة', () => {
    const keys = UNIT_LIBRARY.map((u) => u.unit_key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('كل صفحة بصيغة p_ (دليل البوابات الديناميكية)', () => {
    for (const u of UNIT_LIBRARY) {
      for (const pk of u.page_keys) {
        expect(pk).toMatch(/^p_/)
      }
    }
  })
})
