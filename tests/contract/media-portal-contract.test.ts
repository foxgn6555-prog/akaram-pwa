/** عقد بوابة الإعلام: الوحدات والمسارات والدور وقاعدة البيانات متسقة بلا صلاحيات بيانات مبكرة. */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PORTAL_UNITS } from '@config/portals.config'
import { PORTALS } from '@lib/constants/portals.constants'
import { customRoutes } from '@portals/media/routes'
import { PORTAL_ROUTES } from '@router/routes.config'

const migration = readFileSync('supabase/migrations/00072_media_portal_role.sql', 'utf8')
const adminUsers = readFileSync('supabase/functions/admin-users/index.ts', 'utf8')
const sidebar = JSON.parse(readFileSync('src/i18n/ar/sidebar.json', 'utf8')) as { nav: Record<string, string> }

describe('بوابة الإعلام', () => {
  it('تسجل الوحدات السبع المطلوبة بالترتيب', () => {
    const units = PORTAL_UNITS[PORTALS.MEDIA]
    expect(units).toHaveLength(7)
    expect(units.map((unit) => unit.path)).toEqual([
      '/media',
      '/media/karrada-sector',
      '/media/zaafaraniya-sector',
      '/media/zaafaraniya-folder',
      '/media/karrada-folder',
      '/media/design-templates',
      '/media/archive',
    ])
  })

  it('تظهر التسميات العربية المطلوبة حرفياً', () => {
    expect([
      sidebar.nav.dashboard,
      sidebar.nav.media_karrada_sector,
      sidebar.nav.media_zaafaraniya_sector,
      sidebar.nav.media_zaafaraniya_folder,
      sidebar.nav.media_karrada_folder,
      sidebar.nav.media_design_templates,
      sidebar.nav.archive,
    ]).toEqual([
      'الرئيسية', 'قاطع الكرادة', 'الزعفرانية', 'فولدر الزعفرانية',
      'فولدر الكرادة', 'قوالب التصميم', 'الأرشيف',
    ])
  })

  it('لكل رابط جانبي مسار فعلي مخصص', () => {
    const routePaths = customRoutes.map((route) => route.path)
    expect(routePaths).toEqual([
      '', 'karrada-sector', 'zaafaraniya-sector', 'zaafaraniya-folder',
      'karrada-folder', 'design-templates', 'archive',
    ])
  })

  it('الحارس يسمح لمسؤول الإعلام والمدير المفوض فقط', () => {
    const route = PORTAL_ROUTES.find((item) => item.portal === PORTALS.MEDIA)
    expect(route?.allowedRoles).toEqual(['media_officer', 'super_admin'])
  })

  it('تسجل migration الدور في القيد وJWT وRPC دون فتح RLS', () => {
    expect(migration).toContain("'media_officer'")
    expect(migration).toContain('app.custom_access_token_hook')
    expect(migration).toContain('app.set_user_role')
    expect(migration).not.toMatch(/create\s+policy/i)
    expect(migration).not.toMatch(/disable\s+row\s+level\s+security/i)
    expect(adminUsers).toContain("'media_officer'")
  })
})
