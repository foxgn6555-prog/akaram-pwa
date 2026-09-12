/**
 * ⚑ Permission Integrity (نمط Kyvzon) — يتحقق أن الصلاحيات لا تنكسر
 */
import { describe, it, expect } from 'vitest'
import { PORTAL_UNITS } from '@config/portals.config'
import { PORTALS } from '@lib/constants/portals.constants'

describe('⚓ تكامل الصلاحيات', () => {
  it('كل بوابات النظام الثابتة مسجلة', () => {
    const portalIds = Object.keys(PORTAL_UNITS)
    expect(portalIds).toContain('employee')
    expect(portalIds).toContain('hr')
    expect(portalIds).toContain('manager')
    expect(portalIds).toContain('finance')
    expect(portalIds).toContain('it')
    expect(portalIds).toContain('admin')
  })

  it('بوابة IT بها 10 وحدات (الأكثر شمولية)', () => {
    expect(PORTAL_UNITS[PORTALS.IT]).toHaveLength(10)
  })

  it('كل بوابة لها على الأقل وحدة واحدة', () => {
    for (const [portalId, units] of Object.entries(PORTAL_UNITS)) {
      if (portalId === 'public') continue
      expect(units.length, `بوابة ${portalId}`).toBeGreaterThan(0)
    }
  })

  it('مفاتيح i18n موجودة لكل وحدة', () => {
    for (const [portalId, units] of Object.entries(PORTAL_UNITS)) {
      for (const unit of units) {
        expect(unit.labelKey, `وحدة في ${portalId}`).toMatch(/^nav\./)
        for (const child of unit.children ?? []) {
          expect(child.labelKey).toMatch(/^nav\./)
        }
      }
    }
  })
})
