/**
 * SDK الموارد البشرية (00142):
 *   · HR: الشفتات، الموظفون (إنشاء/تحديث/إنهاء)، المستمسكات، الإجازات المعتمدة، اللوحة.
 *   · غرفة العمليات: الحضوريات (قائمة/تعديل/خصومات/تصدير الشهر).
 *   · المالية: ملفات الرواتب (حصراً) + كشف الشهر + تعديل/اعتماد.
 */
import { sdkGuard, sdkVoid, supabase } from './client'
import type {
  AttendanceAudit, AttendanceDayRow, AttendanceDeduction, AttendanceFilters, CreateEmployeeInput, DocType, EmployeeDocument,
  FinanceNotice, HrDashboardStats, HrEmployeeFull, HrEmployeeRow, HrLeave, HrShift, MonthExport, OpsExportRow, PayrollSheetRow,
  SalaryProfile, ShiftAssignment, TerminationType, HrDepartment, ImportEmployeeRow, ImportResult,
} from '@features/hr/types'

const EMPLOYEE_FULL_COLUMNS = `id, employee_number, full_name, email, phone, phone2, department_id, branch_id, manager_id, job_title, hire_date,
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
  HR_RANGE_INVALID: 'النطاق غير صالح (حتى 62 يوماً)',
  HR_STATUS_INVALID: 'حالة الحضور غير صالحة',
  HR_TIMES_INVALID: 'وقت الخروج يجب أن يكون بعد الدخول',
  HR_DEDUCTION_INVALID: 'الخصم يحتاج مبلغاً أو أياماً',
  HR_EXPORT_NOT_EDITABLE: 'هذا الكشف لم يعد قابلاً للتعديل (مُعتمد أو مُستبدل)',
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
  HR_DEPT_NAME_REQUIRED: 'اسم القسم مطلوب',
  HR_DEPT_CODE_REQUIRED: 'رمز القسم مطلوب',
  HR_DEPT_CODE_TAKEN: 'رمز القسم مستخدم لقسم آخر',
  HR_DEPT_CYCLE: 'لا يمكن جعل القسم تابعاً لنفسه أو لأحد أقسامه الفرعية',
  HR_DEPT_PARENT_INVALID: 'القسم الأب غير موجود',
  HR_DEPT_MANAGER_INVALID: 'مدير القسم غير موجود أو منتهية خدمته',
  HR_DEPT_HAS_EMPLOYEES: 'لا يمكن تعطيل قسم فيه موظفون نشطون — انقلهم أولاً',
  HR_DEPT_HAS_CHILDREN: 'لا يمكن تعطيل قسم له أقسام فرعية نشطة',
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
      .select('*, employees(full_name, employee_number, department_id)')
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
    let q = supabase.from('hr_attendance_deductions').select('*, employees(full_name, employee_number)').eq('period_month', month).order('created_at', { ascending: false })
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
  async listExports(month?: string): Promise<MonthExport[]> {
    let q = supabase.from('hr_month_exports').select('*').order('period_month', { ascending: false }).order('version', { ascending: false })
    if (month) q = q.eq('period_month', month)
    return (await sdkGuard(q)) as MonthExport[]
  },
  exportMonth(month: string) { return rpc<string>('ops_month_export', { p_month: month }) },
  exportRows(exportId: string) { return rpc<OpsExportRow[]>('ops_month_export_rows', { p_export: exportId }) },

  // ─────────── المالية ───────────
  payrollSheet(month: string) { return rpc<PayrollSheetRow[]>('finance_payroll_sheet', { p_month: month }) },
  adjustPayroll(rowId: string, finalNet: number, note: string) {
    return sdkVoid(supabase.rpc('finance_payroll_adjust', { p_row: rowId, p_final_net: finalNet, p_note: note } as never))
  },
  approvePayroll(exportId: string) { return sdkVoid(supabase.rpc('finance_payroll_approve', { p_export: exportId } as never)) },
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
  saveDepartment(v: { id?: string | null; name: string; code: string; parentId?: string | null; isActive?: boolean; managerId?: string | null }) {
    return rpc<string>('hr_department_save', { p_id: v.id ?? null, p_name: v.name, p_code: v.code, p_parent: v.parentId || null, p_is_active: v.isActive ?? true, p_manager: v.managerId || null })
  },
  markNoticeDone(id: string) {
    return sdkVoid(supabase.from('finance_hr_notices').update({ is_done: true, done_at: new Date().toISOString() } as never).eq('id', id))
  },
}
