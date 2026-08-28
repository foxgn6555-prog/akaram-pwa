/**
 * SDK الموظفين — النموذج المرجعي لكتابة أي SDK آخر:
 *  1) استيراد { sdkGuard, supabase } من './client' — لا شيء آخر يلمس Supabase
 *  2) دوال موسومة الأنواع ترمي SDKError عبر sdkGuard
 *  3) الحد التوجيهي 300 سطر — انقسم departments.sdk.ts عن هذا الملف عمداً
 */
import { sdkGuard, supabase } from './client'
import type {
  Employee,
  EmployeeFilters,
  CreateEmployeeInput,
  UpdateEmployeeInput,
} from '@features/employees/types'

const SELECT_WITH_DEPT =
  '*, department:departments(id, name, code)' as const

export const employees = {
  async list(filters: EmployeeFilters = {}): Promise<Employee[]> {
    let query = supabase
      .from('employees')
      .select(SELECT_WITH_DEPT)
      .order('created_at', { ascending: false })

    if (filters.departmentId) query = query.eq('department_id', filters.departmentId)
    if (filters.status) query = query.eq('employment_status', filters.status)
    if (filters.search) query = query.ilike('full_name', `%${filters.search}%`)
    if (filters.limit) query = query.limit(filters.limit)

    return sdkGuard(query) as Promise<Employee[]>
  },

  async getById(id: string): Promise<Employee> {
    const rows = await sdkGuard(
      supabase
        .from('employees')
        .select(SELECT_WITH_DEPT)
        .eq('id', id)
        .limit(1),
    ) as Employee[]
    if (rows.length === 0) {
      const { SDKError } = await import('@lib/errors/SDKError')
      throw new SDKError('الموظف غير موجود', 'NOT_FOUND')
    }
    return rows[0] as Employee
  },

  async create(input: CreateEmployeeInput): Promise<Employee> {
    return sdkGuard(
      supabase.from('employees').insert(input as never).select(SELECT_WITH_DEPT).single(),
    ) as Promise<Employee>
  },

  async update(id: string, input: UpdateEmployeeInput): Promise<Employee> {
    return sdkGuard(
      supabase
        .from('employees')
        .update(input as never)
        .eq('id', id)
        .select(SELECT_WITH_DEPT)
        .single(),
    ) as Promise<Employee>
  },
}
