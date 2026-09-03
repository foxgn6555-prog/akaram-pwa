/** خريطة البوابات: super_admin يرى الكل · الأدوار الأخرى بحسب صلاحيتها */
import { describe, it, expect } from 'vitest'
import { accessiblePortals, PORTAL_DEFINITIONS } from '@lib/constants/portals.constants'

describe('accessiblePortals', () => {
  it('super_admin يرى كل البوابات (13 بوابة)', () => {
    const portals = accessiblePortals(['super_admin'])
    expect(portals).toHaveLength(PORTAL_DEFINITIONS.length)
    expect(portals.map((p) => p.id)).toContain('it')
    expect(portals.map((p) => p.id)).toContain('hr')
    // البوابات السبع الجديدة ظاهرة أيضاً
    expect(portals.map((p) => p.id)).toEqual(
      expect.arrayContaining([
        'field-ops',
        'admin-ops',
        'maintenance',
        'transfer-station',
        'executive',
        'deputy',
        'ops-room',
        'complaints',
      ]),
    )
  })

  it('دور الشكاوى يرى بوابة الشكاوى فقط', () => {
    const portals = accessiblePortals(['complaints_officer'])
    expect(portals).toHaveLength(1)
    expect(portals[0]?.id).toBe('complaints')
  })

  it('it_admin يرى بوابة IT فقط', () => {
    const portals = accessiblePortals(['it_admin'])
    expect(portals).toHaveLength(1)
    expect(portals[0]?.id).toBe('it')
  })

  it('موظف عادي يرى بوابة الموظف فقط', () => {
    const portals = accessiblePortals(['employee'])
    expect(portals).toHaveLength(1)
    expect(portals[0]?.id).toBe('employee')
  })

  it('أدوار مركبة تجمع البوابات', () => {
    const portals = accessiblePortals(['employee', 'department_manager'])
    expect(portals.map((p) => p.id).sort()).toEqual(['employee', 'manager'])
  })

  it('بلا أدوار → لا بوابات (مع الحارس الأدنى: الموظف الافتراضي يُعالج في auth.sdk)', () => {
    expect(accessiblePortals([])).toHaveLength(0)
  })
})
