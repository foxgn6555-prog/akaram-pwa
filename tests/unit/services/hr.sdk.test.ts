/** عقد SDK الموارد البشرية (00142): RPC/الجداول/المخزن الصحيحة، وفصل الرواتب عن HR. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Result = { data: unknown; error: { message: string; code?: string } | null }
const h = vi.hoisted(() => {
  const state = { result: { data: [], error: null } as Result }
  const chain = () => {
    const c: Record<string, unknown> = {}
    const self = () => c
    for (const m of ['select', 'eq', 'lte', 'gte', 'order', 'limit', 'insert', 'update', 'delete']) c[m] = vi.fn(self)
    c.single = vi.fn(async () => state.result)
    c.then = (res: (v: Result) => void) => Promise.resolve(state.result).then(res)
    return c
  }
  const bucket = { upload: vi.fn(async () => ({ data: { path: 'ok' }, error: null })), remove: vi.fn(async () => ({ data: null, error: null })), createSignedUrl: vi.fn(async (p: string) => ({ data: { signedUrl: `https://signed/${p}` }, error: null })) }
  return { state, bucket, rpc: vi.fn(async () => state.result), fromCalls: [] as string[], storageBuckets: [] as string[], chains: [] as ReturnType<typeof chain>[], chain,
    from: vi.fn((t: string) => { h.fromCalls.push(t); const c = chain(); h.chains.push(c); return c }),
    storageFrom: vi.fn((b: string) => { h.storageBuckets.push(b); return bucket }) }
})
vi.mock('@sdk/client', async (orig) => ({ ...(await orig<Record<string, unknown>>()), supabase: { rpc: h.rpc, from: h.from, storage: { from: h.storageFrom } } }))

import { hr, hrErrorMessage, HR_ERROR_MESSAGES } from '@sdk/hr.sdk'

beforeEach(() => { h.state.result = { data: [], error: null }; h.rpc.mockClear(); h.fromCalls.length = 0; h.storageBuckets.length = 0; h.chains.length = 0 })

describe('hr.sdk — الشفتات والموظفون', () => {
  it('قائمة الموظفين عبر RPC hr_employees_list بكل الفلاتر (بلا مبالغ رواتب)', async () => {
    await hr.listEmployees({ search: ' علي ', departmentId: 'd1', branchId: 'b1', status: 'active', shiftId: 's1' })
    expect(h.rpc).toHaveBeenCalledWith('hr_employees_list', { p_search: 'علي', p_department: 'd1', p_branch: 'b1', p_status: 'active', p_shift: 's1', p_limit: 2000 })
  })
  it('إنشاء موظف يمرر jsonb نظيفاً بلا حقول فارغة ولا يحتوي أي حقل راتب', async () => {
    h.state.result = { data: 'emp-1', error: null }
    const id = await hr.createEmployee({ employee_number: 'E1', full_name: 'أحمد', mother_name: '', contract_type: 'monthly' } as never)
    expect(id).toBe('emp-1')
    const payload = (h.rpc.mock.calls[0] as unknown as [string, { p: Record<string, unknown> }])[1].p
    expect(payload).toEqual({ employee_number: 'E1', full_name: 'أحمد', contract_type: 'monthly' })
    expect(Object.keys(payload).some((k) => /salary|wage|rate|allowance/.test(k))).toBe(false)
  })
  it('إسناد الشفت يمرر التجاوزات الاختيارية كـ null', async () => {
    await hr.assignShift({ employeeId: 'e', shiftId: 's', from: '2026-09-01', start: '', grace: undefined, days: null })
    expect(h.rpc).toHaveBeenCalledWith('hr_employee_assign_shift', { p_employee: 'e', p_shift: 's', p_from: '2026-09-01', p_start: null, p_end: null, p_grace: null, p_days: null, p_note: null })
  })
  it('إنهاء الخدمة يستدعي hr_employee_terminate بالنوع/آخر يوم/السبب/المرفق', async () => {
    await hr.terminateEmployee({ id: 'e', type: 'resignation', lastDay: '2026-09-30', reason: 'استقالة', attachmentPath: 'e/x.pdf' })
    expect(h.rpc).toHaveBeenCalledWith('hr_employee_terminate', { p_employee: 'e', p_type: 'resignation', p_last_day: '2026-09-30', p_reason: 'استقالة', p_attachment: 'e/x.pdf' })
  })
  it('المستمسكات تُرفع إلى مخزن employee-documents الخاص وتُسجَّل في employee_documents', async () => {
    h.state.result = { data: { id: 'doc' }, error: null }
    const file = new File(['x'], 'id.PNG', { type: 'image/png' })
    await hr.uploadDocument('emp', 'national_id_front', file)
    expect(h.storageBuckets).toEqual(['employee-documents'])
    const [path] = (h.bucket.upload.mock.calls[0] as unknown as [string])
    expect(path).toMatch(/^emp\/national_id_front-\d+\.png$/)
    expect(h.fromCalls).toContain('employee_documents')
  })
  it('صورة الموظف الشخصية تحدّث photo_path عبر hr_employee_update', async () => {
    h.state.result = { data: { id: 'doc' }, error: null }
    await hr.uploadDocument('emp', 'photo', new File(['x'], 'p.jpg', { type: 'image/jpeg' }))
    expect(h.rpc).toHaveBeenCalledWith('hr_employee_update', expect.objectContaining({ p_id: 'emp', p: { photo_path: expect.stringMatching(/^emp\/photo-/) } }))
  })
})

describe('hr.sdk — الحضوريات (غرفة العمليات)', () => {
  it('قائمة الحضور عبر ops_attendance_list', async () => {
    await hr.listAttendance({ from: '2026-09-01', to: '2026-09-30', departmentId: 'd', status: 'late', search: 'x' })
    expect(h.rpc).toHaveBeenCalledWith('ops_attendance_list', { p_from: '2026-09-01', p_to: '2026-09-30', p_branch: null, p_department: 'd', p_status: 'late', p_search: 'x', p_limit: 3000 })
  })
  it('تعديل الصف يتطلب السبب ويُمرَّر إلى ops_attendance_edit', async () => {
    await hr.editAttendance({ employeeId: 'e', date: '2026-09-05', checkIn: 'A', checkOut: 'B', status: 'present', reason: 'عطل جهاز' })
    expect(h.rpc).toHaveBeenCalledWith('ops_attendance_edit', { p_employee: 'e', p_date: '2026-09-05', p_check_in: 'A', p_check_out: 'B', p_status: 'present', p_reason: 'عطل جهاز' })
  })
  it('الاستقطاع اليدوي (مبلغ أو أيام) عبر ops_deduction_add، والحذف بسبب', async () => {
    await hr.addDeduction({ employeeId: 'e', month: '2026-09-01', amount: 0, days: 2, reason: 'غياب بلا عذر' })
    expect(h.rpc).toHaveBeenCalledWith('ops_deduction_add', { p_employee: 'e', p_month: '2026-09-01', p_amount: 0, p_days: 2, p_reason: 'غياب بلا عذر' })
    await hr.deleteDeduction('d1', 'خطأ إدخال')
    expect(h.rpc).toHaveBeenLastCalledWith('ops_deduction_delete', expect.objectContaining({ p_id: 'd1', p_reason: 'خطأ إدخال' }))
  })
  it('تصدير الشهر عبر ops_month_export', async () => {
    h.state.result = { data: 'exp-1', error: null }
    expect(await hr.exportMonth('2026-09-01')).toBe('exp-1')
    expect(h.rpc).toHaveBeenCalledWith('ops_month_export', { p_month: '2026-09-01' })
  })
})

describe('hr.sdk — المالية', () => {
  it('كشف الشهر عبر finance_payroll_sheet، التعديل بسبب، الاعتماد بمعرّف التصدير', async () => {
    await hr.payrollSheet('2026-09-01'); expect(h.rpc).toHaveBeenCalledWith('finance_payroll_sheet', { p_month: '2026-09-01' })
    await hr.adjustPayroll('r', 750000, 'مكافأة'); expect(h.rpc).toHaveBeenCalledWith('finance_payroll_adjust', { p_row: 'r', p_final_net: 750000, p_note: 'مكافأة' })
    await hr.approvePayroll('x'); expect(h.rpc).toHaveBeenCalledWith('finance_payroll_approve', { p_export: 'x' })
  })
  it('تعريف الراتب عبر finance_salary_set بنوع الأجر والمخصصات والاستقطاعات', async () => {
    await hr.setSalary({ employeeId: 'e', payType: 'daily', base: 0, daily: 25000, allowances: { نقل: 50000 }, fixedDeductions: {}, notes: '' })
    expect(h.rpc).toHaveBeenCalledWith('finance_salary_set', { p_employee: 'e', p_pay_type: 'daily', p_base: 0, p_daily: 25000, p_allowances: { نقل: 50000 }, p_fixed_deductions: {}, p_notes: null })
  })
  it('ملف الراتب يُقرأ من employee_salary_profiles (جدول المالية حصراً)', async () => {
    await hr.getSalaryProfile('e'); expect(h.fromCalls).toEqual(['employee_salary_profiles'])
  })
})

describe('hr.sdk — الأخطاء', () => {
  it('يترجم رموز HR_* إلى رسائل عربية ويترك النص المجهول كما هو', () => {
    for (const code of Object.keys(HR_ERROR_MESSAGES)) expect(hrErrorMessage(new Error(`x ${code} y`))).toBe(HR_ERROR_MESSAGES[code])
    expect(hrErrorMessage('boom')).toBe('boom')
  })
  it('رسالة قفل الشهر بعد اعتماد المالية موجودة', () => {
    expect(hrErrorMessage(new Error('HR_MONTH_LOCKED'))).toMatch(/مقفول/)
  })
})

describe('hr.sdk — الاستيراد والهيكل التنظيمي (00143)', () => {
  it('الاستيراد يمرر الصفوف وعلم التحقق المسبق إلى hr_employees_import', async () => {
    h.state.result = { data: { dry_run: true, total: 1, ok: 1, failed: 0, rows: [] }, error: null }
    const res = await hr.importEmployees([{ employee_number: 'E1', full_name: 'x', department: 'النقل' }], true)
    expect(res.dry_run).toBe(true)
    expect(h.rpc).toHaveBeenCalledWith('hr_employees_import', { p_rows: [{ employee_number: 'E1', full_name: 'x', department: 'النقل' }], p_dry_run: true })
  })
  it('الأقسام: النظرة العامة عبر hr_departments_overview والحفظ عبر hr_department_save بقيم null للاختياري', async () => {
    await hr.listDepartments(); expect(h.rpc).toHaveBeenCalledWith('hr_departments_overview', {})
    await hr.saveDepartment({ name: 'النقل', code: 'trn', parentId: '', managerId: undefined })
    expect(h.rpc).toHaveBeenLastCalledWith('hr_department_save', { p_id: null, p_name: 'النقل', p_code: 'trn', p_parent: null, p_is_active: true, p_manager: null, p_is_job_title: false, p_drives_vehicles: false, p_maintenance_specialty: null })
    await hr.saveDepartment({ id: 'd', name: 'x', code: 'X', parentId: 'p', isActive: false, managerId: 'm' })
    expect(h.rpc).toHaveBeenLastCalledWith('hr_department_save', { p_id: 'd', p_name: 'x', p_code: 'X', p_parent: 'p', p_is_active: false, p_manager: 'm', p_is_job_title: false, p_drives_vehicles: false, p_maintenance_specialty: null })
    // (00156) تخصص الصيانة يُرسل فقط لعقدة مسمى وظيفي
    await hr.saveDepartment({ name: 'فني كهرباء', code: 'T-EL', parentId: 'p', isJobTitle: true, maintenanceSpecialty: 'electrical' })
    expect(h.rpc).toHaveBeenLastCalledWith('hr_department_save', expect.objectContaining({ p_is_job_title: true, p_maintenance_specialty: 'electrical' }))
    await hr.saveDepartment({ name: 'قسم', code: 'D', parentId: null, isJobTitle: false, maintenanceSpecialty: 'electrical' })
    expect(h.rpc).toHaveBeenLastCalledWith('hr_department_save', expect.objectContaining({ p_is_job_title: false, p_maintenance_specialty: null }))
  })
  it('رسائل أخطاء الاستيراد والأقسام مترجمة', () => {
    for (const c of ['HR_IMPORT_DEPT_UNKNOWN', 'HR_IMPORT_DUP_IN_FILE', 'HR_DEPT_CYCLE', 'HR_DEPT_HAS_EMPLOYEES', 'HR_DEPT_CODE_TAKEN']) expect(hrErrorMessage(new Error(c))).not.toBe(c)
  })
})
