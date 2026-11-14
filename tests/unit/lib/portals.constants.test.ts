/** خريطة البوابات: صلاحيات الدخول منفصلة عن البوابات الظاهرة في المبدّل */
import { describe, it, expect } from 'vitest'
import { accessiblePortals, portalsVisibleInSwitcher, PORTAL_DEFINITIONS } from '@lib/constants/portals.constants'

describe('accessiblePortals', () => {
  it('المدير المفوض يرى بوابته فقط', () => {
    expect(portalsVisibleInSwitcher(['super_admin']).map((p) => p.id)).toEqual(['admin'])
    expect(accessiblePortals(['super_admin']).map((p) => p.id)).toEqual(['admin'])
  })

  it('V-32 · مبدّل تقنية المعلومات يعرض بوابة التطوير وحدها', () => {
    expect(portalsVisibleInSwitcher(['it_admin']).map((p) => p.id)).toEqual(['it'])
    expect(accessiblePortals(['it_admin']).map((p) => p.id)).toEqual(['it'])
  })

  it('V-32 · حساب تقني + مدير مفوض يرى بوابتيه فقط (it وadmin)', () => {
    expect(portalsVisibleInSwitcher(['super_admin', 'it_admin']).map((p) => p.id).sort()).toEqual(['admin', 'it'])
  })

  it('super_admin محصور ببوابة المدير المفوض، وIT ببوابتها', () => {
    expect(accessiblePortals(['super_admin']).map((p) => p.id)).toEqual(['admin'])
    expect(accessiblePortals(['it_admin']).map((p) => p.id)).toEqual(['it'])
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

  it('V-32 · it_admin بوابة واحدة فقط وليست كل البوابات', () => {
    expect(accessiblePortals(['it_admin'])).toHaveLength(1)
    expect(portalsVisibleInSwitcher(['it_admin']).map((p) => p.id)).toEqual(['it'])
    expect(PORTAL_DEFINITIONS.length).toBeGreaterThan(1)
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
