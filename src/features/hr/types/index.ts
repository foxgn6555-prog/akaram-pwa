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
  job_title_id?: string | null
  is_driver?: boolean
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
  /** 00153: المسمى من الهيكل التنظيمي — لا نص حر */
  job_title_id?: string | null
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
  /** 00144: نقص الدقائق والاستقطاع المقترح */
  required_minutes: number
  permit_minutes: number
  shortfall_minutes: number
  overtime_minutes: number
  proposed_deduction_minutes: number
  proposed_deduction_days: number
  deduction_reason: string | null
  deduction_waived: boolean
  waive_reason: string | null
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
  /** 00170/00185 — استقطاع ناتج عن كشف معتمد (لا يُحذف من الحضوريات) */
  source_disclosure_id?: string | null
  employees?: { full_name: string; employee_number: string } | null
  disclosure?: { ref_no: string | null } | null
}

/** 00185 — حالة آخر تصدير للشهر والتغييرات بعده */
export interface MonthExportStatus {
  export_id: string | null
  version?: number
  status: 'exported' | 'approved' | null
  exported_at?: string
  changes_after: number
  deductions_after: number
  disclosure_deductions_after: number
  needs_reexport: boolean
  /** 00186 — أيام مجدولة ماضية بلا احتساب (الشهر الحالي/غير المعتمد) */
  unevaluated_days?: number
  unevaluated_employees?: number
}

/** 00193 — خلية يوم في شبكة الشهر (غرفة العمليات) */
export type AttendanceGridStatus = AttendanceStatus | 'pending' | 'future' | 'none' | 'rest'
export interface AttendanceGridCell {
  d: string
  s: AttendanceGridStatus
  rest: boolean
  src: 'auto' | 'manual' | null
  in: string | null
  out: string | null
  w: number
  late: number
  early: number
  short: number
  ot: number
  permit: number
  pm: number
  pd: number
  waived: boolean
  note: string | null
}
export interface AttendanceGridRow {
  employee_id: string
  employee_number: string
  full_name: string
  job_title: string | null
  department_id: string | null
  department_name: string | null
  branch_name: string | null
  contract_type: string | null
  days: AttendanceGridCell[]
  present_days: number
  late_days: number
  early_days: number
  incomplete_days: number
  absent_days: number
  leave_days: number
  rest_days: number
  unevaluated_days: number
  worked_minutes: number
  late_minutes: number
  early_minutes: number
  shortfall_minutes: number
  overtime_minutes: number
  permit_minutes: number
  proposed_minutes: number
  proposed_days: number
}
/** 00193 — حالة اعتماد حضورية الشهر (المرحلة 1 → 2) */
export interface AttendanceConfirmation {
  month: string
  status: 'open' | 'confirmed' | 'reopened'
  confirmed: boolean
  confirmed_at: string | null
  confirmed_by_name: string | null
  confirm_count: number
  reopened_at: string | null
  reopened_by_name: string | null
  reopen_reason: string | null
  pending_auto: number
  pending_days: Array<{ employee_id: string; full_name: string; work_date: string; would_be: string | null }>
  deductions_after: number
  unevaluated_days: number
  employees: number
  locked: boolean
  required: boolean
  export: MonthExportStatus
  snapshot: Record<string, number>
  can_export: boolean
}

/** 00185 — تفاصيل استقطاعات موظف في شهر (مع مرجع الكشف) */
export interface EmployeeMonthDeduction {
  id: string
  amount: number
  days: number
  reason: string
  created_at: string
  created_by_name: string | null
  source_disclosure_id: string | null
  disclosure_ref: string | null
  disclosure_type: string | null
  disclosure_date: string | null
}

export interface AttendanceAudit {
  id: string
  employee_id: string
  work_date: string
  action: 'edit' | 'deduction_add' | 'deduction_delete' | 'export' | 'approve' | 'reset_auto' | 'waive' | 'unwaive' | 'confirm' | 'reopen' | 'auto_blocked'
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  reason: string
  actor: string | null
  created_at: string
}

/** يوم من أيام الموظف في الشهر (hr_employee_month_days) — لتفاصيل كشف المالية */
export interface EmployeeMonthDay {
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
  edit_reason: string | null
  permit_minutes: number
  shortfall_minutes: number
  overtime_minutes: number
  proposed_deduction_minutes: number
  proposed_deduction_days: number
  deduction_waived: boolean
  waive_reason: string | null
}

/** صف سجل التدقيق بأسماء (hr_attendance_audit_list) */
export interface AttendanceAuditRow extends AttendanceAudit {
  employee_number: string
  full_name: string
  department_name: string | null
  actor_name: string | null
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
  auto_deduction_minutes: number
  auto_deduction_days: number
  overtime_minutes: number
  shortfall_minutes: number
  /** 00184 — تفصيل الإجازات وأيام الاستقطاع التلقائي حسب مصدرها */
  days_leave_paid?: number
  days_leave_unpaid?: number
  auto_absence_days?: number
  auto_shortfall_days?: number
}

export interface PayrollSheetRow extends OpsExportRow {
  auto_deduction_amount: number
  /** 00184 — مبلغ أيام استقطاع العمليات، الأيام المدفوعة (يومي)، الإجمالي قبل الاستقطاع، إجمالي الاستقطاعات */
  ops_deduction_days_amount?: number | null
  payable_days?: number | null
  gross_amount?: number | null
  deductions_total?: number | null
  /** 00186 — الأيام المجدولة في الشهر، وغير المحتسبة منها (يجب أن تكون 0 بعد التصدير)، ودقائق الشفت لمعادلة الدقيقة */
  scheduled_days?: number
  unevaluated_days?: number
  shift_minutes?: number
  /** 00187 — الفترة المشمولة بالتصدير وأجر اليوم ونسبة التناسب (1 = شهر مكتمل) وهل قُيّد الاستقطاع التلقائي بالسقف */
  period_from?: string | null
  period_to?: string | null
  covered_days?: number | null
  days_in_month?: number | null
  day_rate?: number | null
  proration_ratio?: number | null
  auto_deduction_capped?: boolean
  /** 00188 — أساس مبلغ الاستقطاع التلقائي (salary | fixed | disabled) وهل قُيّدت أيامه بالسقف الشهري */
  auto_deduction_basis?: 'salary' | 'fixed' | 'disabled' | null
  /** 00195: اسم قاعدة الاستقطاع التلقائي التي طُبّقت على الموظف («مستثنى» إن كان مستثنى) */
  auto_deduction_rule?: string | null
  auto_deduction_days_capped?: boolean
  /** 00191 — قسط السلفة المستقطع تلقائياً هذا الشهر (ضمن إجمالي الاستقطاعات) */
  advance_installment?: number | null
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

/** 00194 — صف التحقق الحسابي لكشف الرواتب (المالية) */
export type PayrollReconcileIssue = 'SALARY_MISSING' | 'GROSS_MISMATCH' | 'DEDUCTIONS_MISMATCH' | 'NET_MISMATCH' | 'FINAL_NEGATIVE' | 'NET_NOT_FLOORED' | 'DAYS_UNCLASSIFIED' | 'UNEVALUATED_DAYS' | 'ATTENDANCE_CHANGED' | 'AUTO_DEDUCTION_CHANGED' | 'OPS_DEDUCTIONS_CHANGED'
export interface PayrollReconcileRow {
  row_id: string
  employee_id: string
  employee_number: string | null
  full_name: string | null
  department_name: string | null
  branch_name: string | null
  pay_type: ContractType | null
  gross_stored: number | null
  gross_expected: number | null
  deductions_stored: number | null
  deductions_expected: number | null
  net_stored: number | null
  net_expected: number | null
  final_net: number | null
  components: Record<string, number | string | null>
  live: Record<string, number | null>
  issues: PayrollReconcileIssue[]
  money_ok: boolean
  attendance_ok: boolean
  ok: boolean
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
  /** 00153: تحذيرات لا تمنع الاستيراد (مثل مسمى غير معرَّف) */
  warnings?: string[]
}
export interface ImportResult { dry_run: boolean; total: number; ok: number; failed: number; warned?: number; rows: ImportRowResult[] }

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
  /** 00153: عقدة مسمى وظيفي (لا قسم) */
  is_job_title: boolean
  /** 00153: هذا المسمى يقود آليات الشركة */
  drives_vehicles: boolean
  /** 00156: تخصص صيانة (المسمى فني) أو null */
  maintenance_specialty?: string | null
}

/** 00153: مسمى وظيفي للاختيار (hr_job_titles) */
export interface HrJobTitle {
  id: string
  name: string
  code: string
  department_id: string
  department_name: string
  drives_vehicles: boolean
  is_active: boolean
  employees_active: number
  maintenance_specialty?: string | null
}

// ─────────── 00144: السياسة والإجازات والأرصدة ───────────
export interface DeductionTier { from: number; to: number | null; minutes?: number | null; day_fraction?: number | null }
export interface HrPolicy {
  /** 00191 — سياسة السلف: أقصى نسبة للقسط الشهري من الراتب (0.1–1) وهل تُمنع سلفة جديدة ما دامت سلفة مفتوحة */
  advance_max_installment_ratio?: number
  advance_block_if_open?: boolean
  annual_leave_days_default: number
  balance_mode: 'annual_upfront' | 'monthly_accrual'
  carry_over: boolean
  carry_over_max_days: number
  permits_per_leave_day: number
  permit_max_minutes: number
  permits_max_per_month: number | null
  grace_minutes_default: number
  deduction_basis: 'shortfall'
  deduction_tiers: DeductionTier[]
  absent_day_deduction_days: number
  incomplete_punch_as_absent: boolean
  overtime_enabled: boolean
  overtime_min_block_minutes: number
  overtime_minutes_per_leave_day: number | null
  alert_late_days_per_month: number
  alert_shortfall_minutes_per_month: number
  alert_absent_days_per_month: number
  alert_balance_low_days: number
  /** 00179: محرك البصمة */
  punch_window_hours?: number
  auto_evaluate_enabled?: boolean
  evaluate_lookback_days?: number
  /** 00187: احتساب الراتب الشهري */
  salary_day_basis?: 'fixed_30' | 'calendar_days'
  prorate_partial_month?: boolean
  prorate_allowances?: boolean
  auto_deduction_cap_ratio?: number
  /** 00188: تحكم الاستقطاع التلقائي */
  auto_deduction_enabled?: boolean
  deduct_absence_enabled?: boolean
  deduct_shortfall_enabled?: boolean
  deduct_unpaid_leave_enabled?: boolean
  auto_deduction_amount_mode?: 'salary' | 'fixed'
  fixed_absent_day_amount?: number
  fixed_shortfall_minute_amount?: number
  max_auto_deduction_days_per_month?: number
  /** 00193 — لا تصدير للمالية قبل اعتماد حضورية الشهر في غرفة العمليات */
  require_attendance_confirmation?: boolean
}
export interface LeaveType {
  id: string
  code: string
  name: string
  kind: 'leave' | 'time_permit'
  is_paid: boolean
  consumes_balance: boolean
  deduction_days_per_day: number
  requires_attachment: boolean
  max_days_per_request: number | null
  max_minutes: number | null
  sort_order: number
  is_active: boolean
}
export interface LeaveBalance {
  year: number
  granted: number
  accrued: number
  carried: number
  adjusted: number
  used_leave_days: number
  used_permit_days: number
  permits_count: number
  overtime_days: number
  reversed: number
  remaining: number
  permits_per_leave_day: number
}
export interface LeaveLedgerEntry {
  id: string
  employee_id: string
  year: number
  kind: 'grant' | 'adjust' | 'consume' | 'permit' | 'overtime' | 'carry_over' | 'reversal'
  days: number
  leave_id: string | null
  period_month: string | null
  note: string | null
  created_at: string
}
export type LeaveScope = 'mine' | 'team' | 'all'
export interface LeaveRequestRow {
  id: string
  employee_id: string
  employee_number: string
  full_name: string
  department_name: string | null
  kind: 'leave' | 'time_permit'
  type_code: string | null
  type_name: string | null
  is_paid: boolean | null
  consumes_balance: boolean | null
  start_date: string
  end_date: string
  start_time: string | null
  end_time: string | null
  days: number
  minutes: number
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  notes: string | null
  attachment_path: string | null
  manager_id: string | null
  manager_name: string | null
  requested_by: string | null
  decided_at: string | null
  decision_note: string | null
  cancelled_reason: string | null
  created_at: string
  can_decide: boolean
}
export interface LeaveRequestInput {
  employeeId: string
  typeId: string
  start: string
  end: string
  startTime?: string | null
  endTime?: string | null
  notes?: string | null
  attachment?: string | null
}
export interface HrAlert {
  id: string
  employee_id: string
  employee_number: string
  full_name: string
  department_name: string | null
  manager_name: string | null
  period_month: string
  kind: 'late_repeat' | 'shortfall' | 'absent_repeat' | 'balance_low'
  value: number
  threshold: number
  details: string | null
  acknowledged_at: string | null
  created_at: string
}
export interface LeavesDashboard { pending: number; approved_today: number; open_alerts: number; permits_this_month: number }
export interface MyEmployee {
  id: string
  full_name: string
  employee_number: string
  job_title: string | null
  department_id: string | null
  department_name: string | null
  manager_id: string | null
  manager_name: string | null
  has_biometric: boolean
  reports_count: number
}

/** 00195 — وحدة الاستقطاعات التلقائية (التطوير المركزية) */
export type DeductionRuleSettings = Pick<HrPolicy, 'grace_minutes_default' | 'deduction_tiers' | 'absent_day_deduction_days' | 'incomplete_punch_as_absent' | 'auto_deduction_enabled' | 'deduct_absence_enabled' | 'deduct_shortfall_enabled' | 'deduct_unpaid_leave_enabled' | 'auto_deduction_amount_mode' | 'fixed_absent_day_amount' | 'fixed_shortfall_minute_amount' | 'max_auto_deduction_days_per_month' | 'auto_deduction_cap_ratio'>
export type DeductionTargetType = 'branch' | 'department' | 'employee'
export interface DeductionRuleTarget { id: string; target_type: DeductionTargetType; target_id: string; name: string | null }
export interface DeductionRule {
  id: string
  name: string
  description: string | null
  is_default: boolean
  is_active: boolean
  settings: DeductionRuleSettings
  updated_at: string
  targets: DeductionRuleTarget[]
  employees_count: number
}
export interface DeductionExemption {
  id: string; target_type: DeductionTargetType; target_id: string; name: string | null; reason: string; from_date: string; to_date: string | null; created_at: string; active: boolean
}
export type DeductionRuleSource = 'exempt' | 'employee' | 'department' | 'branch' | 'default'
export interface DeductionEmployeeRow {
  employee_id: string; employee_number: string; full_name: string; job_title: string | null; department_id: string | null; department_name: string | null; branch_id: string | null; branch_name: string | null; contract_type: string | null
  rule_id: string | null; rule_name: string | null; source: DeductionRuleSource; exempt: boolean; exempt_reason: string | null; exempt_until: string | null; enabled: boolean; amount_mode: 'salary' | 'fixed'
  month_minutes: number; month_days: number; month_absent: number; month_shortfall: number; month_waived: number
}
export interface DeductionSimulation { enabled: boolean; minutes: number; days: number; shortfall_days: number; absent_days: number; incomplete_days: number; amount_mode: 'salary' | 'fixed'; day_rate: number; minute_rate: number; amount: number }
export interface DeductionAuditRow { id: number; action: 'rule_save' | 'rule_delete' | 'target_set' | 'exemption_add' | 'exemption_remove'; rule_id: string | null; rule_name: string | null; before: Record<string, unknown> | null; after: Record<string, unknown> | null; actor: string | null; actor_name: string | null; created_at: string }
