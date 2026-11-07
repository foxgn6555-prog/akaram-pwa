/** خريطة البوابات: صلاحيات الدخول منفصلة عن البوابات الظاهرة في المبدّل */
import { describe, it, expect } from 'vitest'
import { accessiblePortals, portalsVisibleInSwitcher, PORTAL_DEFINITIONS } from '@lib/constants/portals.constants'

describe('accessiblePortals', () => {
  it('المدير المفوض يرى بوابته فقط', () => {
    expect(portalsVisibleInSwitcher(['super_admin']).map((p) => p.id)).toEqual(['admin'])
    expect(accessiblePortals(['super_admin']).map((p) => p.id)).toEqual(['admin'])
  })

  it('مبدّل تقنية المعلومات يعرض كل البوابات، مع بقاء بوابة IT الافتراضية', () => {
    expect(portalsVisibleInSwitcher(['it_admin'])).toEqual([...PORTAL_DEFINITIONS])
    expect(accessiblePortals(['it_admin'])).toEqual([...PORTAL_DEFINITIONS])
  })

  it('إذا كان الحساب تقنياً ومديراً مفوضاً، صلاحية تقنية المعلومات تعرض كل البوابات', () => {
    expect(portalsVisibleInSwitcher(['super_admin', 'it_admin'])).toEqual([...PORTAL_DEFINITIONS])
  })

  it('super_admin محصور ببوابة المدير المفوض، وIT وحدها ترى جميع البوابات', () => {
    expect(accessiblePortals(['super_admin']).map((p) => p.id)).toEqual(['admin'])
    expect(accessiblePortals(['it_admin'])).toHaveLength(PORTAL_DEFINITIONS.length)
  })

  it('دور الكراج المركزي يرى بوابته فقط', () => {
    const portals = accessiblePortals(['central_garage_officer'])
    expect(portals).toHaveLength(1)
    expect(portals[0]?.id).toBe('central-garage')
  })

  it('00259: دور المتابعة يرى بوابة المتابعة فقط', () => {
    const portals = accessiblePortals(['follow_up'])
    expect(portals).toHaveLength(1)
    expect(portals[0]?.id).toBe('follow-up')
  })

  it('دور الإعلام يرى بوابة الإعلام فقط', () => {
    const portals = accessiblePortals(['media_officer'])
    expect(portals).toHaveLength(1)
    expect(portals[0]?.id).toBe('media')
  })

  it('دور الشكاوى يرى بوابة الشكاوى فقط', () => {
    const portals = accessiblePortals(['complaints_officer'])
    expect(portals).toHaveLength(1)
    expect(portals[0]?.id).toBe('complaints')
  })

  it('it_admin يمكنه فتح كل البوابات عبر الحارس', () => {
    expect(accessiblePortals(['it_admin'])).toHaveLength(PORTAL_DEFINITIONS.length)
    expect(portalsVisibleInSwitcher(['it_admin']).map((p) => p.id)).toContain('it')
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
