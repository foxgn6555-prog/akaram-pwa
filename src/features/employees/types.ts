/** أنواع الموظفين — mirror لـ 00005_employees.sql */
export interface Employee {
  id: string
  user_id: string | null
  employee_number: string
  full_name: string
  email: string | null
  phone: string | null
  department_id: string | null
  manager_id: string | null
  job_title: string | null
  hire_date: string
  employment_status: 'active' | 'on_leave' | 'suspended' | 'terminated'
  version: number
  created_at: string
  updated_at: string
  department?: { id: string; name: string; code: string } | null
}

export interface EmployeeFilters {
  departmentId?: string
  status?: Employee['employment_status']
  search?: string
  limit?: number
}

export type CreateEmployeeInput = Pick<Employee, 'full_name' | 'employee_number'> &
  Partial<Pick<Employee, 'email' | 'phone' | 'department_id' | 'manager_id' | 'job_title' | 'hire_date'>>

export type UpdateEmployeeInput = Partial<CreateEmployeeInput>
