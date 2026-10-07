/**
 * SDK الموارد البشرية (00142):
 *   · HR: الشفتات، الموظفون (إنشاء/تحديث/إنهاء)، المستمسكات، الإجازات المعتمدة، اللوحة.
 *   · غرفة العمليات: الحضوريات (قائمة/تعديل/خصومات/تصدير الشهر).
 *   · المالية: ملفات الرواتب (حصراً) + كشف الشهر + تعديل/اعتماد.
 */
import { sdkGuard, sdkVoid, supabase } from './client'
import type {
  AttendanceAudit, AttendanceAuditRow, EmployeeMonthDay, AttendanceDayRow, AttendanceDeduction, AttendanceFilters, CreateEmployeeInput, DocType, EmployeeDocument,
  FinanceNotice, HrDashboardStats, HrEmployeeFull, HrEmployeeRow, HrLeave, HrShift, MonthExport, OpsExportRow, PayrollSheetRow,
  SalaryProfile, ShiftAssignment, TerminationType, HrDepartment, HrJobTitle, ImportEmployeeRow, ImportResult,
  HrPolicy, LeaveType, LeaveBalance, LeaveLedgerEntry, LeaveRequestRow, LeaveRequestInput, LeaveScope, HrAlert, LeavesDashboard, MyEmployee,
  MonthExportStatus, EmployeeMonthDeduction, AttendanceGridRow, AttendanceConfirmation,
} from '@features/hr/types'

const EMPLOYEE_FULL_COLUMNS = `id, employee_number, full_name, email, phone, phone2, department_id, branch_id, manager_id, job_title, job_title_id, is_driver, hire_date,
  employment_status, contract_type, mother_name, gender, birth_date, birth_place, marital_status, education, national_id_number,
  residence_card_number, governorate, address, emergency_contact_name, emergency_contact_phone, blood_type, biometric_pin, photo_path,
  terminated_at, termination_type, termination_reason, termination_attachment_path`

/** رسائل عربية ثابتة لرموز HR_* */
export const HR_ERROR_MESSAGES: Record<string, string> = {
  HR_FORBIDDEN: 'ليست لديك صلاحية هذا الإجراء',
  HR_NAME_REQUIRED: 'اسم الموظف مطلوب',
  HR_NUMBER_REQUIRED: 'الرقم الوظيفي مطلوب',
  HR_NUMBER_TAKEN: 'الرقم الوظيفي مستخدم لموظف آخر',
  BIO_PIN_TAKEN: 'رقم البصمة مرتبط بموظف آخر',
  HR_FIELD_NOT_ALLOWED: 'حقل غير مسموح بتعديله من هنا',
  HR_NOT_FOUND: 'السجل غير موجود',
  HR_REASON_REQUIRED: 'السبب مطلوب',
  HR_MONTH_LOCKED: 'هذا الشهر مقفول — اعتمدت المالية رواتبه ولا يمكن تعديله',
  HR_MONTH_FUTURE: 'لا يمكن تصدير شهر لم يبدأ',
  HR_ATTENDANCE_CONFIRMED: 'حضورية هذا الشهر معتمدة — أعد فتحها بسبب من المرحلة الثانية قبل أي تعديل',
  HR_ATTENDANCE_NOT_CONFIRMED: 'يجب اعتماد حضورية الشهر (المرحلة 1) قبل التصدير إلى المالية؛ وإن وُجدت تغييرات معلّقة فأعد الاعتماد',
  HR_ATTENDANCE_UNEVALUATED: 'توجد أيام غير محتسبة — أعد المحاولة بعد اكتمال الاحتساب',
  HR_RANGE_INVALID: 'النطاق غير صالح (حتى 62 يوماً)',
  HR_STATUS_INVALID: 'حالة الحضور غير صالحة',
  HR_TIMES_INVALID: 'وقت الخروج يجب أن يكون بعد الدخول',
  HR_DEDUCTION_INVALID: 'الخصم يحتاج مبلغاً أو أياماً',
  HR_EXPORT_NOT_EDITABLE: 'هذا الكشف لم يعد قابلاً للتعديل (مُعتمد أو مُستبدل)',
  HR_EXPORT_STALE: 'حدثت تغييرات في الحضورية بعد هذا التصدير — اطلب من غرفة العمليات إعادة التصدير أو أكّد الاعتماد صراحةً',
  HR_DEDUCTION_FROM_DISCLOSURE: 'هذا الاستقطاع ناتج عن كشف معتمد — يُدار من وحدة الكشوفات ولا يُحذف من هنا',
  HR_SALARY_MISSING: 'يوجد موظفون بلا راتب نهائي — عرّف رواتبهم أو أدخل مبلغاً نهائياً قبل الاعتماد',
  HR_AMOUNT_INVALID: 'المبلغ غير صالح',
  HR_PAY_TYPE_INVALID: 'نوع الأجر غير صالح',
  HR_TERMINATION_TYPE_INVALID: 'نوع الإنهاء غير صالح',
  HR_ALREADY_TERMINATED: 'خدمة هذا الموظف منتهية أصلاً',
  HR_DATE_INVALID: 'تاريخ غير صالح (الصيغة المطلوبة YYYY-MM-DD)',
  HR_CONTRACT_INVALID: 'نوع التعاقد يجب أن يكون شهري أو يومي',
  HR_GENDER_INVALID: 'الجنس يجب أن يكون ذكر أو أنثى',
  HR_MARITAL_INVALID: 'الحالة الاجتماعية غير صالحة',
  HR_IMPORT_EMPTY: 'الملف لا يحتوي صفوفاً',
  HR_IMPORT_TOO_LARGE: 'الحد الأقصى 2000 صف في الاستيراد الواحد',
  HR_IMPORT_DUP_IN_FILE: 'الرقم الوظيفي مكرر داخل الملف',
  HR_IMPORT_DUP_PIN_IN_FILE: 'رقم البصمة مكرر داخل الملف',
  HR_IMPORT_DUP_ID_IN_FILE: 'رقم البطاقة الموحدة مكرر داخل الملف',
  HR_IMPORT_DEPT_UNKNOWN: 'القسم غير موجود (اكتب الاسم أو الرمز كما في الهيكل التنظيمي)',
  HR_IMPORT_BRANCH_UNKNOWN: 'الفرع غير موجود',
  HR_IMPORT_SHIFT_UNKNOWN: 'الشفت غير موجود',
  HR_IMPORT_JOB_TITLE_UNKNOWN: 'المسمى الوظيفي غير معرَّف في الهيكل التنظيمي — استُورد الموظف بلا مسمى؛ عيّنه من ملفه',
  HR_JOB_TITLE_FREE_TEXT_FORBIDDEN: 'المسمى الوظيفي لا يُكتب نصاً — يُختار من الهيكل التنظيمي',
  HR_JOB_TITLE_INVALID: 'المسمى الوظيفي غير موجود أو معطّل في الهيكل التنظيمي',
  HR_JOB_TITLE_INACTIVE: 'هذا المسمى معطّل — فعّله من الهيكل أو اختر غيره',
  HR_JOB_TITLE_PARENT_REQUIRED: 'المسمى الوظيفي يجب أن يتفرع من قسم أب',
  HR_JOB_TITLE_NAME_TAKEN: 'يوجد مسمى بالاسم نفسه داخل هذا القسم',
  HR_JOB_TITLE_HAS_CHILDREN: 'لا يمكن تحويل قسم له فروع إلى مسمى وظيفي',
  HR_JOB_TITLE_IN_USE: 'لا يمكن تحويل مسمى عليه موظفون إلى قسم — انقلهم أولاً',
  HR_DEPT_PARENT_IS_JOB_TITLE: 'المسمى الوظيفي لا يكون أباً لأي قسم أو مسمى',
  FLEET_DRIVER_NOT_DRIVER_TITLE: 'هذا الموظف ليس على مسمى وظيفي «يقود آليات الشركة» — راجع الهيكل التنظيمي في الموارد البشرية',
  HR_DEPT_NAME_REQUIRED: 'اسم القسم مطلوب',
  HR_DEPT_CODE_REQUIRED: 'رمز القسم مطلوب',
  HR_DEPT_CODE_TAKEN: 'رمز القسم مستخدم لقسم آخر',
  HR_DEPT_CYCLE: 'لا يمكن جعل القسم تابعاً لنفسه أو لأحد أقسامه الفرعية',
  HR_DEPT_PARENT_INVALID: 'القسم الأب غير موجود',
  HR_DEPT_MANAGER_INVALID: 'مدير القسم غير موجود أو منتهية خدمته',
  HR_DEPT_HAS_EMPLOYEES: 'لا يمكن تعطيل قسم فيه موظفون نشطون — انقلهم أولاً',
  HR_DEPT_HAS_CHILDREN: 'لا يمكن تعطيل قسم له أقسام فرعية نشطة',
  HR_POLICY_INVALID: 'قيم السياسة غير صالحة (راجع الأرقام)',
  HR_TIERS_INVALID: 'شرائح الاستقطاع غير صالحة: يجب أن تكون متتالية بلا فجوات تبدأ من الدقيقة 1 وآخرها مفتوح، ولكل شريحة دقائق أو كسر يوم',
  HR_LEAVE_TYPE_INVALID: 'نوع الإجازة غير صالح أو معطّل',
  HR_NO_BIOMETRIC: 'لا يوجد رقم بصمة مسجّل لهذا الموظف — رصيد الإجازات والطلبات لموظفي البصمة (الموارد البشرية تستطيع الإدخال نيابةً)',
  HR_NO_MANAGER: 'لا يوجد مدير مباشر مسجّل لهذا الموظف — اطلب من الموارد البشرية تحديده',
  HR_ATTACHMENT_REQUIRED: 'هذا النوع يتطلب مرفقاً (مثل تقرير طبي)',
  HR_PERMIT_TIME_INVALID: 'الزمنية تحتاج يوماً واحداً ووقت بداية ونهاية صحيحين',
  HR_PERMIT_TOO_LONG: 'مدة الزمنية تتجاوز الحد المسموح',
  HR_PERMIT_MONTH_LIMIT: 'بلغت الحد الشهري للزمنيات',
  HR_LEAVE_TOO_LONG: 'عدد الأيام يتجاوز الحد المسموح لهذا النوع',
  HR_LEAVE_OVERLAP: 'يوجد طلب آخر (معلّق أو معتمد) يتداخل مع هذه الفترة',
  HR_BALANCE_INSUFFICIENT: 'الرصيد غير كافٍ لهذا الطلب',
  HR_LEAVE_NOT_PENDING: 'هذا الطلب لم يعد معلّقاً',
  HR_LEAVE_STARTED: 'لا يمكن إلغاء إجازة بدأت — راجع الموارد البشرية',
  employees_national_id_uq: 'رقم البطاقة الموحدة مسجل لموظف آخر',
  employees_employee_number_key: 'الرقم الوظيفي مستخدم لموظف آخر',
}
export function hrErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error ?? '')
  const code = Object.keys(HR_ERROR_MESSAGES).find((k) => text.includes(k))
  return (code && HR_ERROR_MESSAGES[code]) || text || 'خطأ غير معروف'
}

const rpc = <T,>(fn: string, args: Record<string, unknown>) => sdkGuard(supabase.rpc(fn, args as never)) as Promise<T>

export const hr = {
  // ─────────── الشفتات ───────────
  async listShifts(includeInactive = false): Promise<HrShift[]> {
    let q = supabase.from('hr_shifts').select('id, name, start_time, end_time, grace_minutes, work_days, is_active').order('start_time')
    if (!includeInactive) q = q.eq('is_active', true)
    return (await sdkGuard(q)) as HrShift[]
  },
  async saveShift(input: Partial<HrShift> & Pick<HrShift, 'name' | 'start_time' | 'end_time'>): Promise<HrShift> {
    const { id, ...rest } = input
    const q = id
      ? supabase.from('hr_shifts').update(rest as never).eq('id', id).select().single()
      : supabase.from('hr_shifts').insert(rest as never).select().single()
    return (await sdkGuard(q)) as HrShift
  },
  async listAssignments(employeeId: string): Promise<ShiftAssignment[]> {
    return (await sdkGuard(
      supabase.from('employee_shift_assignments').select('*').eq('employee_id', employeeId).order('effective_from', { ascending: false }),
    )) as ShiftAssignment[]
  },
  assignShift(v: { employeeId: string; shiftId: string; from: string; start?: string | null; end?: string | null; grace?: number | null; days?: number[] | null; note?: string }) {
    return rpc<string>('hr_employee_assign_shift', {
      p_employee: v.employeeId, p_shift: v.shiftId, p_from: v.from, p_start: v.start || null, p_end: v.end || null,
      p_grace: v.grace ?? null, p_days: v.days ?? null, p_note: v.note || null,
    })
  },

  // ─────────── الموظفون ───────────
  listEmployees(f: { search?: string; departmentId?: string | null; branchId?: string | null; status?: string | null; shiftId?: string | null } = {}) {
    return rpc<HrEmployeeRow[]>('hr_employees_list', {
      p_search: f.search?.trim() || null, p_department: f.departmentId || null, p_branch: f.branchId || null,
      p_status: f.status || null, p_shift: f.shiftId || null, p_limit: 2000,
    })
  },
  async getEmployee(id: string): Promise<HrEmployeeFull> {
    const [row, list] = await Promise.all([
      sdkGuard(supabase.from('employees').select(EMPLOYEE_FULL_COLUMNS).eq('id', id).single()),
      rpc<HrEmployeeRow[]>('hr_employees_list', { p_search: null, p_department: null, p_branch: null, p_status: null, p_shift: null, p_limit: 5000 }),
    ])
    const summary = list.find((e) => e.id === id)
    return { ...(row as unknown as HrEmployeeFull), ...(summary ?? {}) } as HrEmployeeFull
  },
  createEmployee(input: CreateEmployeeInput) {
    const clean = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== '' && v !== undefined))
    return rpc<string>('hr_employee_create', { p: clean })
  },
  updateEmployee(id: string, patch: Record<string, unknown>) {
    return sdkVoid(supabase.rpc('hr_employee_update', { p_id: id, p: patch } as never))
  },
  terminateEmployee(v: { id: string; type: TerminationType; lastDay: string; reason: string; attachmentPath?: string | null }) {
    return sdkVoid(supabase.rpc('hr_employee_terminate', {
      p_employee: v.id, p_type: v.type, p_last_day: v.lastDay, p_reason: v.reason, p_attachment: v.attachmentPath ?? null,
    } as never))
  },

  // ─────────── المستمسكات ───────────
  async listDocuments(employeeId: string): Promise<EmployeeDocument[]> {
    return (await sdkGuard(
      supabase.from('employee_documents').select('*').eq('employee_id', employeeId).order('created_at', { ascending: false }),
    )) as EmployeeDocument[]
  },
  async uploadDocument(employeeId: string, docType: DocType, file: File, title?: string): Promise<EmployeeDocument> {
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
    const path = `${employeeId}/${docType}-${Date.now()}.${ext}`
    await sdkGuard(supabase.storage.from('employee-documents').upload(path, file, { contentType: file.type, upsert: false }))
    const row = (await sdkGuard(
      supabase.from('employee_documents').insert({
        employee_id: employeeId, doc_type: docType, title: title || null, storage_path: path, mime_type: file.type, size_bytes: file.size,
      } as never).select().single(),
    )) as EmployeeDocument
    if (docType === 'photo') await hr.updateEmployee(employeeId, { photo_path: path })
    return row
  },
  async deleteDocument(doc: EmployeeDocument) {
    await supabase.storage.from('employee-documents').remove([doc.storage_path])
    await sdkVoid(supabase.from('employee_documents').delete().eq('id', doc.id))
  },
  async signedUrl(path: string, seconds = 600): Promise<string | null> {
    const { data } = await supabase.storage.from('employee-documents').createSignedUrl(path, seconds)
    return data?.signedUrl ?? null
  },

  // ─────────── الإجازات والزمنيات (عرض المعتمد) ───────────
  async listLeaves(f: { from: string; to: string; approvedOnly?: boolean; employeeId?: string | null } ): Promise<HrLeave[]> {
    let q = supabase.from('hr_leaves')
      .select('*, employees!hr_leaves_employee_id_fkey(full_name, employee_number, department_id)')  // علاقتان (employee_id + manager_id) → تحديد المفتاح وإلا PGRST201
      .lte('start_date', f.to).gte('end_date', f.from)
      .order('start_date', { ascending: false })
    if (f.approvedOnly !== false) q = q.eq('status', 'approved')
    if (f.employeeId) q = q.eq('employee_id', f.employeeId)
    return (await sdkGuard(q)) as HrLeave[]
  },

  // ─────────── الحضور ───────────
  listAttendance(f: AttendanceFilters) {
    return rpc<AttendanceDayRow[]>('ops_attendance_list', {
      p_from: f.from, p_to: f.to, p_branch: f.branchId || null, p_department: f.departmentId || null,
      p_status: f.status || null, p_search: f.search?.trim() || null, p_limit: f.limit ?? 3000,
    })
  },
  evaluateAttendance(from: string, to: string, employeeId?: string | null) {
    return rpc<number>('hr_attendance_evaluate', { p_from: from, p_to: to, p_employee: employeeId ?? null })
  },
  /** 00186 — احتساب كل أيام الشهر (حتى أمس) لكل الموظفين أصحاب البصمة */
  evaluateMonth(month: string) { return rpc<number>('hr_attendance_evaluate_month', { p_month: month }) },
  dashboard() { return rpc<HrDashboardStats | null>('hr_dashboard_stats', {}) },

  // ─────────── غرفة العمليات: التدقيق ───────────
  editAttendance(v: { employeeId: string; date: string; checkIn: string | null; checkOut: string | null; status: string; reason: string }) {
    return sdkVoid(supabase.rpc('ops_attendance_edit', {
      p_employee: v.employeeId, p_date: v.date, p_check_in: v.checkIn, p_check_out: v.checkOut, p_status: v.status, p_reason: v.reason,
    } as never))
  },
  resetAttendance(employeeId: string, date: string, reason: string) {
    return sdkVoid(supabase.rpc('ops_attendance_reset', { p_employee: employeeId, p_date: date, p_reason: reason } as never))
  },
  async listDeductions(month: string, employeeId?: string | null): Promise<AttendanceDeduction[]> {
    let q = supabase.from('hr_attendance_deductions').select('*, employees(full_name, employee_number), disclosure:disclosures!hr_attendance_deductions_source_disclosure_id_fkey(ref_no)').eq('period_month', month).order('created_at', { ascending: false })
    if (employeeId) q = q.eq('employee_id', employeeId)
    return (await sdkGuard(q)) as AttendanceDeduction[]
  },
  addDeduction(v: { employeeId: string; month: string; amount: number; days: number; reason: string }) {
    return rpc<string>('ops_deduction_add', { p_employee: v.employeeId, p_month: v.month, p_amount: v.amount, p_days: v.days, p_reason: v.reason })
  },
  deleteDeduction(id: string, reason: string) {
    return sdkVoid(supabase.rpc('ops_deduction_delete', { p_id: id, p_reason: reason } as never))
  },
  async listAudit(f: { employeeId?: string | null; from?: string; to?: string; limit?: number } = {}): Promise<AttendanceAudit[]> {
    let q = supabase.from('hr_attendance_audit').select('*').order('created_at', { ascending: false }).limit(f.limit ?? 200)
    if (f.employeeId) q = q.eq('employee_id', f.employeeId)
    if (f.from) q = q.gte('work_date', f.from)
    if (f.to) q = q.lte('work_date', f.to)
    return (await sdkGuard(q)) as AttendanceAudit[]
  },
  /** أيام موظف في شهر — لتفاصيل كشف المالية (المالية/العمليات/HR/التطوير) */
  employeeMonthDays(employeeId: string, month: string) {
    return rpc<EmployeeMonthDay[]>('hr_employee_month_days', { p_employee: employeeId, p_month: month })
  },
  /** سجل التدقيق بأسماء الموظف والمدقّق — لكل الجهات المخولة (غرفة العمليات/HR/المالية/التطوير المركزية) */
  listAuditNamed(f: { from?: string | null; to?: string | null; employeeId?: string | null; limit?: number } = {}) {
    return rpc<AttendanceAuditRow[]>('hr_attendance_audit_list', { p_from: f.from ?? null, p_to: f.to ?? null, p_employee: f.employeeId ?? null, p_limit: f.limit ?? 300 })
  },
  async listExports(month?: string): Promise<MonthExport[]> {
    let q = supabase.from('hr_month_exports').select('*').order('period_month', { ascending: false }).order('version', { ascending: false })
    if (month) q = q.eq('period_month', month)
    return (await sdkGuard(q)) as MonthExport[]
  },
  exportMonth(month: string) { return rpc<string>('ops_month_export', { p_month: month }) },
  /** 00193 — شبكة الشهر (موظف × أيام) للمرحلتين */
  monthGrid(f: { month: string; branchId?: string | null; departmentId?: string | null; search?: string | null }) {
    return rpc<AttendanceGridRow[]>('ops_attendance_month_grid', { p_month: f.month, p_branch: f.branchId || null, p_department: f.departmentId || null, p_search: f.search?.trim() || null })
  },
  /** 00193 — حالة اعتماد حضورية الشهر / اعتماد / إعادة فتح بسبب */
  attendanceConfirmation(month: string) { return rpc<AttendanceConfirmation>('ops_attendance_confirmation', { p_month: month }) },
  confirmAttendanceMonth(month: string) { return rpc<AttendanceConfirmation>('ops_attendance_confirm', { p_month: month }) },
  reopenAttendanceMonth(month: string, reason: string) { return rpc<AttendanceConfirmation>('ops_attendance_reopen', { p_month: month, p_reason: reason }) },
  exportRows(exportId: string) { return rpc<OpsExportRow[]>('ops_month_export_rows', { p_export: exportId }) },

  // ─────────── المالية ───────────
  payrollSheet(month: string) { return rpc<PayrollSheetRow[]>('finance_payroll_sheet', { p_month: month }) },
  adjustPayroll(rowId: string, finalNet: number, note: string) {
    return sdkVoid(supabase.rpc('finance_payroll_adjust', { p_row: rowId, p_final_net: finalNet, p_note: note } as never))
  },
  approvePayroll(exportId: string, force = false) { return sdkVoid(supabase.rpc('finance_payroll_approve', { p_export: exportId, p_force: force } as never)) },
  /** 00185 — حالة آخر تصدير للشهر والتغييرات بعده (العمليات/المالية/HR/التطوير) */
  monthExportStatus(month: string) { return rpc<MonthExportStatus>('hr_month_export_status', { p_month: month }) },
  /** 00185 — استقطاعات موظف في شهر مع مرجع الكشف */
  employeeMonthDeductions(employeeId: string, month: string) {
    return rpc<EmployeeMonthDeduction[]>('hr_employee_month_deductions', { p_employee: employeeId, p_month: month })
  },
  async getSalaryProfile(employeeId: string): Promise<SalaryProfile | null> {
    const rows = (await sdkGuard(supabase.from('employee_salary_profiles').select('*').eq('employee_id', employeeId))) as SalaryProfile[]
    return rows[0] ?? null
  },
  setSalary(v: { employeeId: string; payType: 'monthly' | 'daily'; base: number; daily: number; allowances: Record<string, number>; fixedDeductions: Record<string, number>; notes?: string }) {
    return sdkVoid(supabase.rpc('finance_salary_set', {
      p_employee: v.employeeId, p_pay_type: v.payType, p_base: v.base, p_daily: v.daily,
      p_allowances: v.allowances, p_fixed_deductions: v.fixedDeductions, p_notes: v.notes || null,
    } as never))
  },
  async listNotices(): Promise<FinanceNotice[]> {
    return (await sdkGuard(
      supabase.from('finance_hr_notices').select('*, employees(full_name, employee_number, contract_type)').eq('is_done', false).order('created_at', { ascending: false }),
    )) as FinanceNotice[]
  },
  // ─────────── الاستيراد والهيكل التنظيمي (00143) ───────────
  importEmployees(rows: ImportEmployeeRow[], dryRun: boolean) {
    return rpc<ImportResult>('hr_employees_import', { p_rows: rows, p_dry_run: dryRun })
  },
  listDepartments() { return rpc<HrDepartment[]>('hr_departments_overview', {}) },
  saveDepartment(v: { id?: string | null; name: string; code: string; parentId?: string | null; isActive?: boolean; managerId?: string | null; isJobTitle?: boolean; drivesVehicles?: boolean; maintenanceSpecialty?: string | null }) {
    return rpc<string>('hr_department_save', {
      p_id: v.id ?? null, p_name: v.name, p_code: v.code, p_parent: v.parentId || null, p_is_active: v.isActive ?? true, p_manager: v.managerId || null,
      p_is_job_title: v.isJobTitle ?? false, p_drives_vehicles: (v.isJobTitle ?? false) && (v.drivesVehicles ?? false),
      p_maintenance_specialty: (v.isJobTitle ?? false) ? v.maintenanceSpecialty || null : null,
    })
  },
  /** 00153: المسميات الوظيفية من الهيكل (للاختيار في التوظيف/ملف الموظف/الاستيراد) */
  listJobTitles(includeInactive = false) { return rpc<HrJobTitle[]>('hr_job_titles', { p_include_inactive: includeInactive }) },
  // ─────────── 00144: السياسة · أنواع الإجازات · الأرصدة · الطلبات · التنبيهات ───────────
  policy() { return rpc<HrPolicy>('hr_policy_get', {}) },
  setPolicy(patch: Partial<HrPolicy>) { return rpc<HrPolicy>('hr_policy_set', { p_patch: patch }) },
  async listLeaveTypes(includeInactive = false): Promise<LeaveType[]> {
    let q = supabase.from('hr_leave_types').select('*').order('sort_order').order('name')
    if (!includeInactive) q = q.eq('is_active', true)
    return (await sdkGuard(q)) as LeaveType[]
  },
  saveLeaveType(v: Partial<LeaveType>) { return rpc<string>('hr_leave_type_save', { p: v }) },
  balance(employeeId: string, year?: number | null) { return rpc<LeaveBalance>('hr_leave_balance', { p_employee: employeeId, p_year: year ?? null }) },
  async ledger(employeeId: string, year?: number | null): Promise<LeaveLedgerEntry[]> {
    let q = supabase.from('hr_leave_ledger').select('*').eq('employee_id', employeeId).order('created_at', { ascending: false })
    if (year) q = q.eq('year', year)
    return (await sdkGuard(q)) as LeaveLedgerEntry[]
  },
  setGrant(employeeId: string, year: number, days: number, note?: string | null) {
    return sdkVoid(supabase.rpc('hr_balance_set_grant', { p_employee: employeeId, p_year: year, p_days: days, p_note: note || null } as never))
  },
  adjustBalance(employeeId: string, year: number, days: number, reason: string) {
    return rpc<string>('hr_balance_adjust', { p_employee: employeeId, p_year: year, p_days: days, p_reason: reason })
  },
  requestLeave(v: LeaveRequestInput) {
    return rpc<string>('hr_leave_request', {
      p_employee: v.employeeId, p_type: v.typeId, p_start: v.start, p_end: v.end, p_start_time: v.startTime || null, p_end_time: v.endTime || null,
      p_notes: v.notes || null, p_attachment: v.attachment || null,
    })
  },
  decideLeave(id: string, approve: boolean, note?: string | null) {
    return sdkVoid(supabase.rpc('hr_leave_decide', { p_leave: id, p_approve: approve, p_note: note || null } as never))
  },
  cancelLeave(id: string, reason?: string | null) { return sdkVoid(supabase.rpc('hr_leave_cancel', { p_leave: id, p_reason: reason || null } as never)) },
  listLeaveRequests(f: { scope: LeaveScope; from?: string | null; to?: string | null; status?: string | null; departmentId?: string | null; search?: string | null; limit?: number }) {
    return rpc<LeaveRequestRow[]>('hr_leaves_list', {
      p_scope: f.scope, p_from: f.from || null, p_to: f.to || null, p_status: f.status || null, p_department: f.departmentId || null,
      p_search: f.search?.trim() || null, p_limit: f.limit ?? 500,
    })
  },
  waiveDeduction(employeeId: string, date: string, waive: boolean, reason: string) {
    return sdkVoid(supabase.rpc('ops_deduction_waive', { p_employee: employeeId, p_date: date, p_waive: waive, p_reason: reason } as never))
  },
  listAlerts(month?: string | null, onlyOpen = true) { return rpc<HrAlert[]>('hr_alerts_list', { p_month: month || null, p_only_open: onlyOpen }) },
  ackAlert(id: string) { return sdkVoid(supabase.rpc('hr_alert_ack', { p_alert: id } as never)) },
  myEmployee() { return rpc<MyEmployee | null>('hr_my_employee', {}) },
  leavesDashboard() { return rpc<LeavesDashboard | null>('hr_leaves_dashboard', {}) },
  async uploadLeaveAttachment(employeeId: string, file: File): Promise<string> {
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
    const path = `${employeeId}/leave-${Date.now()}.${ext}`
    await sdkGuard(supabase.storage.from('employee-documents').upload(path, file, { contentType: file.type, upsert: false }))
    return path
  },
  markNoticeDone(id: string) {
    return sdkVoid(supabase.from('finance_hr_notices').update({ is_done: true, done_at: new Date().toISOString() } as never).eq('id', id))
  },
}
