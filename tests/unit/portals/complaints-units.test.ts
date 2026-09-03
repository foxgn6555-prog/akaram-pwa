import { describe, expect, it } from 'vitest'
import { PORTAL_UNITS } from '@config/portals.config'
import { PORTALS } from '@lib/constants/portals.constants'
import { buildPortalRoutes } from '@router/unit-routes'
import { customRoutes } from '@portals/complaints/routes'

describe('بوابة الشكاوى', () => {
  it('تسجل وحدات الدورة بالترتيب المطلوب', () => {
    const units = PORTAL_UNITS[PORTALS.COMPLAINTS]
    expect(units).toHaveLength(10)
    expect(units.map((unit) => unit.labelKey)).toEqual([
      'nav.dashboard',
      'nav.complaints_karrada',
      'nav.complaints_zaafaraniya',
      'nav.complaints_assignment',
      'nav.complaints_processing',
      'nav.complaints_templates',
      'nav.complaints_data',
      'nav.complaints_pages_contact',
      'nav.complaints_archive',
      'nav.complaints_support',
    ])
  })

  it('ينشئ مسارات الوحدات ومسارات التفاصيل التابعة لها', () => {
    const routes = buildPortalRoutes(PORTALS.COMPLAINTS, customRoutes)
    const paths = new Set(routes.map((route) => route.path).filter(Boolean))
    expect(routes.some((route) => route.index)).toBe(true)
    expect(paths).toEqual(new Set([
      'karrada-sector', 'zaafaraniya-sector', 'assignment', 'processing', 'templates',
      'data', 'pages-contact-settings', 'archive', 'technical-support', 'items/:id', 'reports/:id',
    ]))
  })
})
