export type { PlatformUser, CreateUserInput, UpdateEmployeeProfileInput } from '@sdk/users.sdk'
import type { Role } from '@lib/constants/roles.constants'

/** أدوار قابلة للتعيين عبر الواجهة (super_admin يتطلب حذراً — يُعرض بتأكيد إضافي) */
export const ASSIGNABLE_ROLES: readonly Role[] = [
  'employee',
  'hr_officer',
  'department_manager',
  'finance_officer',
  'it_admin',
  'super_admin',
  'field_ops',
  'admin_ops',
  'maintenance',
  'transfer_station',
  'executive_director',
  'deputy_director',
  'ops_room',
] as const
