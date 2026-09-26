/** mirror لـ 00142 — منظومة الموارد البشرية (الشفتات/الموظف الكامل/الحضور/التدقيق/التصدير/الرواتب) */

export interface HrShift {
  id: string
  name: string
  start_time: string   // 'HH:MM:SS'
  end_time: string
  grace_minutes: number
  work_days: number[]  // 0=الأحد … 6=السبت
  is_active: boolean
}

export interface ShiftAssignment {
  id: string
  employee_id: string
  shift_id: string
  effective_from: string
  start_override: string | null
  end_override: string | null
  grace_override: number | null
  days_override: number[] | null
  note: string | null
  created_at: string
}

export type ContractType = 'monthly' | 'daily'
export type EmploymentStatus = 'active' | 'on_leave' | 'suspended' | 'terminated'
export type TerminationType = 'resignation' | 'dismissal' | 'contract_end' | 'retirement' | 'death'
export type DocType = 'photo' | 'national_id_front' | 'national_id_back' | 'residence_front' | 'residence_back' | 'other'

export interface HrEmployeeRow {
  id: string
  employee_number: string
  full_name: string
  job_title: string | null
  phone: string | null
  department_id: string | null
  department_name: string | null
  branch_id: string | null
  branch_name: string | null
  employment_status: EmploymentStatus
  contract_type: ContractType
  hire_date: string
  terminated_at: string | null
  biometric_pin: string | null
  photo_path: string | null
  shift_id: string | null
  shift_name: string | null
  /** حالة الراتب فقط — الأرقام للمالية حصراً */
  salary_status: 'pending' | 'defined'
}

export interface HrEmployeeFull extends HrEmployeeRow {
  email: string | null
  phone2: string | null
  manager_id: string | null
  mother_name: string | null
  gender: 'male' | 'female' | null
  birth_date: string | null
  birth_place: string | null
  marital_status: 'single' | 'married' | 'divorced' | 'widowed' | null
  education: string | null
  national_id_number: string | null
  residence_card_number: string | null
  governorate: string | null
  address: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  blood_type: string | null
  termination_type: TerminationType | null
  termination_reason: string | null
  termination_attachment_path: string | null
}

export interface EmployeeDocument {
  id: string
  employee_id: string
  doc_type: DocType
  title: string | null
  storage_path: string
  mime_type: string | null
  size_bytes: number | null
  created_at: string
}

export interface CreateEmployeeInput {
  employee_number: string
  full_name: string
  contract_type: ContractType
  hire_date: string
  department_id?: string | null
  branch_id?: string | null
  manager_id?: string | null
  job_title?: string
  phone?: string
  phone2?: string
  email?: string
  mother_name?: string
  gender?: 'male' | 'female' | ''
  birth_date?: string
  birth_place?: string
  marital_status?: string
  education?: string
  national_id_number?: string
  residence_card_number?: string
  governorate?: string
  address?: string
  emergency_contact_name?: string
  emergency_contact_phone?: string
  blood_type?: string
  biometric_pin?: string
  shift_id?: string | null
  shift_start_override?: string
  shift_end_override?: string
  shift_grace_override?: number | null
}

export type AttendanceStatus = 'present' | 'late' | 'early_leave' | 'absent' | 'incomplete' | 'leave' | 'time_permit'

export interface AttendanceDayRow {
  id: string
  employee_id: string
  employee_number: string
  full_name: string
  department_id: string | null
  department_name: string | null
  branch_id: string | null
  branch_name: string | null
  job_title: string | null
  work_date: string
  shift_name: string | null
  expected_in: string | null
  expected_out: string | null
  check_in: string | null
  check_out: string | null
  late_minutes: number
  early_minutes: number
  worked_minutes: number
  is_rest_day: boolean
  status: AttendanceStatus
  source: 'auto' | 'manual'
  edited_by: string | null
  edited_at: string | null
  edit_reason: string | null
}

export interface AttendanceFilters {
  from: string
  to: string
  branchId?: string | null
  departmentId?: string | null
  status?: AttendanceStatus | null
  search?: string
  limit?: number
}

export interface HrLeave {
  id: string
  employee_id: string
  kind: 'leave' | 'time_permit'
  leave_type: string
  start_date: string
  end_date: string
  start_time: string | null
  end_time: string | null
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  approved_at: string | null
  notes: string | null
  employees?: { full_name: string; employee_number: string; department_id: string | null } | null
}

export interface AttendanceDeduction {
  id: string
  employee_id: string
  period_month: string
  amount: number
  days: number
  reason: string
  created_at: string
  employees?: { full_name: string; employee_number: string } | null
}

export interface AttendanceAudit {
  id: string
  employee_id: string
  work_date: string
  action: 'edit' | 'deduction_add' | 'deduction_delete' | 'export' | 'approve' | 'reset_auto'
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  reason: string
  actor: string | null
  created_at: string
}

export interface MonthExport {
  id: string
  period_month: string
  version: number
  status: 'exported' | 'superseded' | 'approved'
  rows_count: number
  exported_at: string
  approved_at: string | null
}

export interface OpsExportRow {
  id: string
  employee_id: string
  employee_number: string | null
  full_name: string | null
  department_name: string | null
  branch_name: string | null
  job_title: string | null
  contract_type: string | null
  working_days: number
  days_present: number
  days_late: number
  days_absent: number
  days_incomplete: number
  days_leave: number
  late_minutes: number
  early_minutes: number
  ops_deduction_amount: number
  ops_deduction_days: number
  ops_deduction_reasons: string | null
}

export interface PayrollSheetRow extends OpsExportRow {
  export_id: string
  export_version: number
  export_status: 'exported' | 'approved'
  exported_at: string
  row_id: string
  pay_type: ContractType | null
  base_salary: number | null
  daily_rate: number | null
  allowances_total: number | null
  fixed_deductions_total: number | null
  proposed_net: number | null
  final_net: number | null
  finance_note: string | null
}

export interface SalaryProfile {
  employee_id: string
  status: 'pending' | 'defined'
  pay_type: ContractType
  base_salary: number
  daily_rate: number
  allowances: Record<string, number>
  fixed_deductions: Record<string, number>
  currency: string
  notes: string | null
  set_at: string | null
}

export interface FinanceNotice {
  id: string
  employee_id: string
  kind: 'salary_pending' | 'termination_settlement'
  payload: Record<string, unknown>
  is_done: boolean
  created_at: string
  employees?: { full_name: string; employee_number: string; contract_type: ContractType } | null
}

export interface HrDashboardStats {
  employees_active: number
  employees_terminated: number
  hired_this_month: number
  terminated_this_month: number
  by_department: Array<{ name: string; count: number }>
  by_branch: Array<{ name: string; count: number }>
  today: { present: number; late: number; absent: number; incomplete: number; leave: number }
  leaves_today: number
  salary_pending: number
  unmatched_punches: number
  shifts: Array<{ name: string; count: number }>
}

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: 'حاضر', late: 'متأخر', early_leave: 'خروج مبكر', absent: 'غائب', incomplete: 'بصمة ناقصة', leave: 'إجازة', time_permit: 'زمنية',
}
export const ATTENDANCE_STATUS_ORDER: AttendanceStatus[] = ['late', 'absent', 'incomplete', 'early_leave', 'present', 'leave', 'time_permit']
export const TERMINATION_LABELS: Record<TerminationType, string> = {
  resignation: 'استقالة', dismissal: 'فصل', contract_end: 'انتهاء عقد', retirement: 'تقاعد', death: 'وفاة',
}
export const DOC_TYPE_LABELS: Record<DocType, string> = {
  photo: 'الصورة الشخصية', national_id_front: 'البطاقة الموحدة — وجه', national_id_back: 'البطاقة الموحدة — ظهر',
  residence_front: 'بطاقة السكن — وجه', residence_back: 'بطاقة السكن — ظهر', other: 'مستمسك آخر',
}
export const CONTRACT_LABELS: Record<ContractType, string> = { monthly: 'راتب شهري', daily: 'أجر يومي' }
export const WEEKDAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
export const GOVERNORATES_IQ = ['بغداد', 'البصرة', 'نينوى', 'أربيل', 'النجف', 'كربلاء', 'كركوك', 'الأنبار', 'ديالى', 'ذي قار', 'بابل', 'واسط', 'ميسان', 'المثنى', 'القادسية', 'صلاح الدين', 'السليمانية', 'دهوك']

// ─── 00143: الاستيراد والهيكل التنظيمي ───
export interface ImportEmployeeRow {
  employee_number: string
  full_name: string
  department?: string
  branch?: string
  shift?: string
  contract_type?: ContractType
  hire_date?: string
  job_title?: string
  phone?: string
  phone2?: string
  email?: string
  mother_name?: string
  gender?: 'male' | 'female'
  birth_date?: string
  birth_place?: string
  marital_status?: string
  education?: string
  national_id_number?: string
  residence_card_number?: string
  governorate?: string
  address?: string
  emergency_contact_name?: string
  emergency_contact_phone?: string
  blood_type?: string
  biometric_pin?: string
}
export interface ImportRowResult {
  row: number
  employee_number: string | null
  full_name: string | null
  ok: boolean
  id: string | null
  errors: string[]
}
export interface ImportResult { dry_run: boolean; total: number; ok: number; failed: number; rows: ImportRowResult[] }

export interface HrDepartment {
  id: string
  name: string
  code: string
  parent_id: string | null
  is_active: boolean
  manager_id: string | null
  manager_name: string | null
  employees_active: number
  employees_total: number
  children: number
  created_at: string
}
