/** عقود Query Keys: لا تصادم + بنية هرمية سليمة (TanStack Best Practices) */
import { describe, it, expect } from 'vitest'
import { employeesKeys, requestsKeys } from '@lib/query-keys'

describe('query keys factories', () => {
  it('employees: البنية all < lists < list(filters)', () => {
    expect(employeesKeys.all).toEqual(['employees'])
    expect(employeesKeys.lists()).toEqual(['employees', 'list'])
    expect(employeesKeys.list({ status: 'active' })).toEqual(['employees', 'list', { status: 'active' }])
  })

  it('detail يندرج تحت details', () => {
    const detail = employeesKeys.detail('abc')
    expect(detail.slice(0, 2)).toEqual(employeesKeys.details())
    expect(detail).toContain('abc')
  })

  it('لا تصادم بين domains', () => {
    expect(employeesKeys.all[0]).not.toBe(requestsKeys.all[0])
  })

  it('مفاتيح متسقة اللاحقة القابلة للإبطال (invalidateQueries prefix matching)', () => {
    // إبطال lists() يجب أن يطابق list(filters) لأنها بادئة لها
    const prefix = employeesKeys.lists()
    const full = employeesKeys.list({ status: 'active' })
    expect(full.slice(0, prefix.length)).toEqual(prefix)
  })
})
