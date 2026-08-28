import { describe, it, expect } from 'vitest'
import { hasRole, hasAllRoles } from '@lib/utils/permissions.utils'
import { ROLES } from '@lib/constants/roles.constants'

describe('permissions.utils', () => {
  const roles = [ROLES.EMPLOYEE, ROLES.DEPARTMENT_MANAGER] as const

  it('hasRole: يصادق دوراً موجوداً', () => {
    expect(hasRole(roles, ROLES.DEPARTMENT_MANAGER)).toBe(true)
  })

  it('hasRole: يرفض دوراً غائباً', () => {
    expect(hasRole(roles, ROLES.SUPER_ADMIN)).toBe(false)
  })

  it('hasRole: ينجح إذا تحقق أي دور من المطلوبين', () => {
    expect(hasRole(roles, ROLES.SUPER_ADMIN, ROLES.EMPLOYEE)).toBe(true)
  })

  it('hasAllRoles: يتطلب كل الأدوار', () => {
    expect(hasAllRoles(roles, ROLES.EMPLOYEE, ROLES.DEPARTMENT_MANAGER)).toBe(true)
    expect(hasAllRoles(roles, ROLES.EMPLOYEE, ROLES.SUPER_ADMIN)).toBe(false)
  })
})
