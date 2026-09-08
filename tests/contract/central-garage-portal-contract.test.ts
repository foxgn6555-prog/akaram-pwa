/** عقد بوابة الكراج المركزي: الوحدات والصفحات والدور متسقة دون فتح وصول بيانات مبكر. */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PORTAL_UNITS } from '@config/portals.config'
import { PORTALS } from '@lib/constants/portals.constants'
import { customRoutes } from '@portals/central-garage/routes'
import { PORTAL_ROUTES } from '@router/routes.config'

const migration = readFileSync('supabase/migrations/00073_central_garage_portal_role.sql', 'utf8')
const adminUsers = readFileSync('supabase/functions/admin-users/index.ts', 'utf8')
const sidebar = JSON.parse(readFileSync('src/i18n/ar/sidebar.json', 'utf8')) as { nav: Record<string, string> }

describe('بوابة الكراج المركزي', () => {
  it('تسجل وحدات التشغيل والتقارير بالترتيب', () => {
    const units = PORTAL_UNITS[PORTALS.CENTRAL_GARAGE]
    expect(units).toHaveLength(6)
    expect(units.map((unit) => unit.path)).toEqual([
      '/central-garage',
      '/central-garage/drivers-dispatch',
      '/central-garage/vehicles-database',
      '/central-garage/fuel',
      '/central-garage/reports',
      '/central-garage/archive',
    ])
  })

  it('تحتوي وحدة الوقود الصفحات الأربع المعتمدة', () => {
    const fuel = PORTAL_UNITS[PORTALS.CENTRAL_GARAGE].find((unit) => unit.path.endsWith('/fuel'))
    expect(fuel?.children?.map((page) => page.path)).toEqual([
      '/central-garage/fuel/gas-oil',
      '/central-garage/fuel/hydraulic',
      '/central-garage/fuel/grease',
      '/central-garage/fuel/c-oil',
    ])
    expect([
      sidebar.nav.garage_gas_oil,
      sidebar.nav.garage_hydraulic,
      sidebar.nav.garage_grease,
      sidebar.nav.garage_c_oil,
    ]).toEqual(['الكاز', 'الهيدروليك', 'الدهن', 'C-Oil'])
  })

  it('لكل وحدة وصفحة وقود مسار فعلي', () => {
    expect(customRoutes.map((route) => route.path)).toEqual([
      '', 'drivers-dispatch', 'vehicles-database', 'vehicles-database/:vehicleId', 'fuel',
      'fuel/gas-oil', 'fuel/hydraulic', 'fuel/grease', 'fuel/c-oil', 'reports', 'archive',
    ])
  })

  it('الحارس يسمح لمسؤول الكراج والمدير المفوض فقط', () => {
    const route = PORTAL_ROUTES.find((item) => item.portal === PORTALS.CENTRAL_GARAGE)
    expect(route?.allowedRoles).toEqual(['central_garage_officer', 'super_admin'])
  })

  it('تسجل migration الدور في القيد وJWT وRPC دون فتح RLS', () => {
    expect(migration).toContain("'central_garage_officer'")
    expect(migration).toContain('app.custom_access_token_hook')
    expect(migration).toContain('app.set_user_role')
    expect(migration).not.toMatch(/create\s+policy/i)
    expect(migration).not.toMatch(/disable\s+row\s+level\s+security/i)
    expect(adminUsers).toContain("'central_garage_officer'")
  })
})
