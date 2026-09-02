/**
 * بوابة المحطة التحويلية — التأكد من إلغاء وحدة «الحضورية»:
 *  · لا تظهر في وحدات الشريط الجانبي (PORTAL_UNITS)
 *  · لا يوجد لها مسار في customRoutes
 */
import { describe, it, expect } from 'vitest'
import { PORTAL_UNITS } from '@config/portals.config'
import { PORTALS } from '@lib/constants/portals.constants'
import { customRoutes } from '@portals/transfer-station/routes'

describe('بوابة المحطة التحويلية — إلغاء الحضورية', () => {
  it('لا تعرض «الحضورية» في وحدات الشريط الجانبي', () => {
    const units = PORTAL_UNITS[PORTALS.TRANSFER_STATION]
    const paths = units.flatMap((u) => [u.path, ...(u.children ?? []).map((c) => c.path)])
    expect(paths.some((p) => p.includes('/attendance'))).toBe(false)
    // الوحدات الأساسية ما تزال موجودة
    expect(paths).toContain('/transfer-station/weights')
    expect(paths).toContain('/transfer-station/saksat')
    expect(paths).toContain('/transfer-station/trips')
  })

  it('لا تعرّف مسار attendance في customRoutes', () => {
    const paths = customRoutes.map((r) => r.path)
    expect(paths).not.toContain('attendance')
    // المسارات الأساسية موجودة
    expect(paths).toContain('weights')
    expect(paths).toContain('saksat')
    expect(paths).toContain('trips')
    expect(paths).toContain('fines')
    expect(paths).toContain('archive')
  })
})
