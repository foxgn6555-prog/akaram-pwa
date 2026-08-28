/** بيانات اختبار مشتركة */
import type { Employee } from '@features/employees/types'

export const employeeFixture: Employee = {
  id: 'e1e1e1e1-1111-4111-8111-111111111111',
  user_id: 'u1u1u1u1-1111-4111-8111-111111111111',
  employee_number: 'EMP-001',
  full_name: 'أحمد علي حسن',
  email: 'ahmed@municipal.example.iq',
  phone: '07701234567',
  department_id: 'd1d1d1d1-1111-4111-8111-111111111111',
  manager_id: null,
  job_title: 'موظف إداري',
  hire_date: '2024-01-15',
  employment_status: 'active',
  version: 1,
  created_at: '2024-01-15T08:00:00Z',
  updated_at: '2024-01-15T08:00:00Z',
  department: { id: 'd1d1d1d1-1111-4111-8111-111111111111', name: 'الموارد البشرية', code: 'HR' },
}
