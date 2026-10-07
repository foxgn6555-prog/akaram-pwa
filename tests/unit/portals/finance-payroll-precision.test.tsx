/**
 * 00194 — كشف الرواتب المالي بدقة عالية:
 *   فلاتر مترابطة (فرع ← أقسام الفرع فقط) · ترتيب بأي عمود · مجاميع تتبع الفلتر · بوابة الاعتماد (بلا ملف راتب / خلل حسابي)
 *   · لوحة التحقق الحسابي · Excel: عمود تحقق بمعادلة، ملخص الفروع، ورقة لكل فرع، ورقة التحقق.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const h = vi.hoisted(() => ({ sheet: [] as unknown[], reconcile: [] as unknown[], approve: vi.fn(async () => undefined), adjust: vi.fn(async () => undefined), exportStatus: null as unknown }))
const mut = (fn: (...a: never[]) => Promise<unknown>) => ({ mutate: (v: never) => void fn(v), mutateAsync: fn, isPending: false })
vi.mock('@features/hr', async (orig) => ({
  ...(await orig<typeof import('@features/hr')>()),
  usePayrollSheet: () => ({ data: h.sheet, isLoading: false }), usePayrollReconcile: () => ({ data: h.reconcile, isLoading: false }), useMonthExportStatus: () => ({ data: h.exportStatus }),
  useApprovePayroll: () => mut(h.approve), useAdjustPayroll: () => mut(h.adjust), useEmployeeMonthDays: () => ({ data: [], isLoading: false }), useEmployeeMonthDeductions: () => ({ data: [], isLoading: false }),
  useFinanceNotices: () => ({ data: [] }), useHrEmployees: () => ({ data: [], isLoading: false }), useMarkNoticeDone: () => mut(async () => undefined), useSalaryProfile: () => ({ data: null, isLoading: false }), useSetSalary: () => mut(async () => undefined),
}))
vi.mock('@sdk/hr.sdk', () => ({ hr: { listDeductions: async () => [] } }))

import PayrollOverview from '@portals/finance/pages/Payroll/PayrollOverview'
import { applyFilters, branchOptions, DEFAULT_FILTERS, departmentOptions, explainRow, groupByBranchDept, reconcileSummary, rowFlags, sheetTotals, sortRows, totalsConsistent } from '@features/hr/lib/payrollSheetModel'
import { buildPayrollWorkbook } from '@features/hr/lib/payrollExcel'
import type { PayrollReconcileRow, PayrollSheetRow } from '@features/hr'

const base = { export_id: 'x1', export_version: 2, export_status: 'exported', exported_at: '2026-10-01T08:00:00Z', contract_type: 'monthly', pay_type: 'monthly', working_days: 26, days_present: 24, days_late: 1, days_absent: 1, days_incomplete: 0, days_leave: 1, days_leave_paid: 1, days_leave_unpaid: 0, late_minutes: 30, early_minutes: 0,
  ops_deduction_amount: 0, ops_deduction_days: 0, ops_deduction_days_amount: 0, ops_deduction_reasons: null, auto_deduction_minutes: 0, auto_deduction_days: 1, auto_deduction_amount: 20000, auto_absence_days: 1, auto_shortfall_days: 0, overtime_minutes: 0, shortfall_minutes: 0,
  daily_rate: 0, allowances_total: 0, fixed_deductions_total: 0, advance_installment: 0, scheduled_days: 26, unevaluated_days: 0, shift_minutes: 480, covered_days: 30, days_in_month: 30, proration_ratio: 1, final_net: null, finance_note: null, job_title: null }
const row = (o: Partial<PayrollSheetRow>): PayrollSheetRow => ({ ...base, ...o } as PayrollSheetRow)
const rows: PayrollSheetRow[] = [
  row({ row_id: 'r1', employee_id: 'e1', employee_number: 'E-2', full_name: 'أحمد', branch_name: 'الكرخ', department_name: 'النقل', base_salary: 600000, gross_amount: 600000, deductions_total: 20000, proposed_net: 580000 }),
  row({ row_id: 'r2', employee_id: 'e2', employee_number: 'E-10', full_name: 'باسم', branch_name: 'الكرخ', department_name: 'النقل', base_salary: 500000, gross_amount: 500000, deductions_total: 20000, proposed_net: 480000, days_absent: 4 }),
  row({ row_id: 'r3', employee_id: 'e3', employee_number: 'E-3', full_name: 'سارة', branch_name: 'الكرخ', department_name: 'الإدارة', base_salary: 900000, allowances_total: 100000, fixed_deductions_total: 30000, gross_amount: 1000000, deductions_total: 50000, proposed_net: 950000, final_net: 940000, finance_note: 'تسوية' }),
  row({ row_id: 'r4', employee_id: 'e4', employee_number: 'E-4', full_name: 'كريم', branch_name: 'الرصافة', department_name: 'الصيانة', pay_type: 'daily', contract_type: 'daily', daily_rate: 25000, payable_days: 25, base_salary: 0, gross_amount: 625000, deductions_total: 0, auto_deduction_amount: 0, auto_deduction_days: 0, proposed_net: 625000, advance_installment: 0 }),
  row({ row_id: 'r5', employee_id: 'e5', employee_number: 'E-5', full_name: 'نور', branch_name: 'الرصافة', department_name: 'النقل', base_salary: 400000, gross_amount: 400000, deductions_total: 70000, advance_installment: 50000, proposed_net: 330000 }),
]
const missingRow = row({ row_id: 'r6', employee_id: 'e6', employee_number: 'E-6', full_name: 'علي', branch_name: 'الرصافة', department_name: null, pay_type: null, base_salary: null, gross_amount: null, deductions_total: null, proposed_net: null, auto_deduction_amount: 0, auto_deduction_days: 0 })
const rc = (o: Partial<PayrollReconcileRow>): PayrollReconcileRow => ({ row_id: 'r1', employee_id: 'e1', employee_number: 'E-2', full_name: 'أحمد', department_name: 'النقل', branch_name: 'الكرخ', pay_type: 'monthly', gross_stored: 600000, gross_expected: 600000, deductions_stored: 20000, deductions_expected: 20000, net_stored: 580000, net_expected: 580000, final_net: 580000,
  components: { base_salary: 600000, allowances: 0, fixed_deductions: 0, ops_amount: 0, ops_days_amount: 0, auto_amount: 20000, auto_basis: 'salary', advance: 0, present: 24, absent: 1, leave: 1, proration_ratio: 1 }, live: { present: 24, absent: 1, leave: 1 }, issues: [], money_ok: true, attendance_ok: true, ok: true, ...o })

beforeEach(() => { h.sheet = rows; h.reconcile = rows.map((r) => rc({ row_id: r.row_id, employee_id: r.employee_id, employee_number: r.employee_number, full_name: r.full_name })); h.exportStatus = null; vi.clearAllMocks(); vi.spyOn(window, 'confirm').mockReturnValue(true) })

describe('00194 — نموذج الكشف (دوال نقية)', () => {
  it('الفروع والأقسام: أقسام الفرع المختار فقط، و«بلا قسم» آخراً', () => {
    expect(branchOptions([...rows, missingRow])).toEqual(['الرصافة', 'الكرخ'])
    expect(departmentOptions(rows, 'الكرخ')).toEqual(['الإدارة', 'النقل'])
    expect(departmentOptions(rows, 'الرصافة')).toEqual(['الصيانة', 'النقل'])
    expect(departmentOptions([...rows, missingRow], 'الرصافة')).toEqual(['الصيانة', 'النقل', 'بلا قسم'])
  })
  it('الفلاتر: فرع + قسم يتيم يُهمَل، التعاقد، الحالة، البحث يطبّع الأرقام والهمزات', () => {
    expect(applyFilters(rows, { ...DEFAULT_FILTERS, branch: 'الكرخ', department: 'النقل' }).map((r) => r.employee_number)).toEqual(['E-2', 'E-10'])
    expect(applyFilters(rows, { ...DEFAULT_FILTERS, branch: 'الرصافة', department: 'الإدارة' })).toHaveLength(2)   // الإدارة ليست من أقسام الرصافة ⇒ يُهمل القسم
    expect(applyFilters(rows, { ...DEFAULT_FILTERS, contract: 'daily' }).map((r) => r.full_name)).toEqual(['كريم'])
    expect(applyFilters([...rows, missingRow], { ...DEFAULT_FILTERS, profile: 'missing' }).map((r) => r.full_name)).toEqual(['علي'])
    expect(applyFilters(rows, { ...DEFAULT_FILTERS, profile: 'adjusted' }).map((r) => r.full_name)).toEqual(['سارة'])
    expect(applyFilters(rows, { ...DEFAULT_FILTERS, search: '٣' }).map((r) => r.employee_number)).toEqual(['E-3'])
    expect(applyFilters(rows, { ...DEFAULT_FILTERS, search: 'احمد' }).map((r) => r.full_name)).toEqual(['أحمد'])
  })
  it('الترتيب: الافتراضي فرع←قسم←رقم طبيعي (E-2 قبل E-10)؛ بالصافي تنازلياً؛ بالغياب', () => {
    expect(sortRows(rows, 'default', 'asc').map((r) => r.employee_number)).toEqual(['E-4', 'E-5', 'E-3', 'E-2', 'E-10'])
    expect(sortRows(rows, 'net', 'desc').map((r) => r.full_name)).toEqual(['سارة', 'كريم', 'أحمد', 'باسم', 'نور'])
    expect(sortRows(rows, 'absent', 'desc')[0]!.full_name).toBe('باسم')
    expect(sortRows(rows, 'number', 'asc').map((r) => r.employee_number)).toEqual(['E-2', 'E-3', 'E-4', 'E-5', 'E-10'])
  })
  it('المجاميع دقيقة ومتسقة: الإجمالي − الاستقطاعات = المقترح؛ المعتمد يعكس التعديل اليدوي؛ التجميع الهرمي', () => {
    const t = sheetTotals(rows)
    expect(t).toMatchObject({ count: 5, missing: 0, gross: 3125000, deductions: 160000, proposed: 2965000, final: 2955000, advance: 50000, auto: 80000, adjusted: 1, absent: 8 })
    expect(totalsConsistent(t, rows.length)).toBe(true)
    expect(totalsConsistent({ ...t, proposed: 2900000 }, rows.length)).toBe(false)
    const g = groupByBranchDept(rows)
    expect(g.map((b) => [b.branch, b.departments.map((d) => d.name)])).toEqual([['الرصافة', ['الصيانة', 'النقل']], ['الكرخ', ['الإدارة', 'النقل']]])
    expect(g[1]!.totals.gross).toBe(2100000)
    expect(rowFlags(missingRow)).toEqual(['بلا ملف راتب']); expect(rowFlags(rows[2]!)).toEqual(['صافٍ معدَّل يدوياً'])
  })
  it('ملخص التحقق وشرح المعادلة', () => {
    const list = [rc({}), rc({ row_id: 'r2', money_ok: false, ok: false, issues: ['NET_MISMATCH'] }), rc({ row_id: 'r3', attendance_ok: false, ok: false, issues: ['ATTENDANCE_CHANGED'] }), rc({ row_id: 'r6', pay_type: null, ok: false, issues: ['SALARY_MISSING'] })]
    expect(reconcileSummary(list)).toEqual({ total: 4, ok: 1, money: 1, attendance: 1, missing: 1, canApprove: false })
    expect(explainRow(rc({}))).toBe('الإجمالي: الأساسي 600,000 + مخصصات 0 = 600,000 · الاستقطاعات: ثابتة 0 + عمليات 0 + أيام عمليات 0 + تلقائي 20,000 + قسط سلفة 0 = 20,000 · الصافي = 600,000 − 20,000 = 580,000')
    expect(explainRow(rc({ pay_type: 'daily', components: { daily_rate: 25000, payable_days: 25, allowances: 0, fixed_deductions: 0, ops_amount: 0, ops_days_amount: 0, auto_amount: 0, advance: 0 }, gross_expected: 625000, deductions_expected: 0, net_expected: 625000 }))).toContain('25,000 × 25 يوم مدفوع')
    expect(explainRow(rc({ pay_type: null }))).toContain('بلا ملف راتب')
  })
})

describe('00194 — صفحة كشف الرواتب', () => {
  it('اختيار الفرع يحصر الأقسام بأقسامه ويصفّر القسم السابق؛ المجاميع والعدّاد يتبعان الفلتر؛ إعادة الضبط', () => {
    render(<MemoryRouter><PayrollOverview /></MemoryRouter>)
    expect(screen.getAllByTestId(/^ps-branch-/).map((b) => b.getAttribute('data-testid'))).toEqual(['ps-branch-الرصافة', 'ps-branch-الكرخ'])
    const dept = screen.getByTestId('ps-f-dept') as HTMLSelectElement
    expect([...dept.options].map((o) => o.value)).toEqual(['', 'الإدارة', 'الصيانة', 'النقل'])
    fireEvent.change(dept, { target: { value: 'الإدارة' } })
    expect(screen.getByTestId('ps-shown')).toHaveTextContent('يُعرض 1 من 5')
    fireEvent.change(screen.getByTestId('ps-f-branch'), { target: { value: 'الرصافة' } })
    expect([...(screen.getByTestId('ps-f-dept') as HTMLSelectElement).options].map((o) => o.value)).toEqual(['', 'الصيانة', 'النقل'])
    expect((screen.getByTestId('ps-f-dept') as HTMLSelectElement).value).toBe('')
    expect(screen.getByTestId('ps-shown')).toHaveTextContent('يُعرض 2 من 5')
    expect(screen.getByTestId('ps-count')).toHaveTextContent('2'); expect(screen.getByTestId('ps-gross')).toHaveTextContent('1,025,000'); expect(screen.getByTestId('ps-final')).toHaveTextContent('955,000')
    expect(screen.getByTestId('ps-stats')).toHaveAttribute('data-scope', 'filtered')
    expect(screen.queryByTestId('ps-branch-الرصافة')).toBeNull()   // فرع واحد ⇒ لا صف فرع
    expect(screen.getByTestId('ps-grand-total')).toHaveTextContent('حسب الفلتر')
    fireEvent.click(screen.getByTestId('ps-f-reset'))
    expect(screen.getByTestId('ps-shown')).toHaveTextContent('5 موظفاً')
    expect(screen.getByTestId('ps-grand-total')).toHaveTextContent('2,955,000')
  })
  it('الترتيب من رأس العمود: ضغطة = تنازلي للمبالغ، ضغطة ثانية تعكس؛ القائمة متزامنة', () => {
    render(<MemoryRouter><PayrollOverview /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('ps-sort-net'))
    expect((screen.getByTestId('ps-f-sort') as HTMLSelectElement).value).toBe('net')
    let ids = screen.getAllByTestId(/^ps-row-/).map((r) => r.getAttribute('data-testid'))
    // داخل كل قسم تنازلياً: الكرخ/النقل ⇒ أحمد (580k) قبل باسم (480k)
    expect(ids.indexOf('ps-row-E-2')).toBeLessThan(ids.indexOf('ps-row-E-10'))
    fireEvent.click(screen.getByTestId('ps-sort-net'))
    ids = screen.getAllByTestId(/^ps-row-/).map((r) => r.getAttribute('data-testid'))
    expect(ids.indexOf('ps-row-E-10')).toBeLessThan(ids.indexOf('ps-row-E-2'))
    expect(screen.getByTestId('ps-sort-net')).toHaveTextContent('▲')
  })
  it('بلا ملف راتب: لافتة بالأسماء وزر «عرضهم فقط»، وزر الاعتماد معطّل بسبب واضح', () => {
    h.sheet = [...rows, missingRow]
    render(<MemoryRouter><PayrollOverview /></MemoryRouter>)
    expect(screen.getByTestId('ps-missing-banner')).toHaveTextContent('علي (E-6)')
    const approve = screen.getByTestId('ps-approve')
    expect(approve).toBeDisabled(); expect(approve.getAttribute('title')).toMatch(/بلا ملف راتب/)
    fireEvent.click(screen.getByTestId('ps-missing-filter'))
    expect(screen.getAllByTestId(/^ps-row-/).map((r) => r.getAttribute('data-testid'))).toEqual(['ps-row-E-6'])
    expect(screen.getByTestId('ps-group-بلا قسم')).toBeInTheDocument()
  })
  it('التحقق الحسابي: شارة ✓، واللوحة تعرض المخزَّن/المحسوب وشرح المعادلة؛ عند خلل مالي: لافتة + اعتماد ممنوع + الصف الأحمر', () => {
    const { unmount } = render(<MemoryRouter><PayrollOverview /></MemoryRouter>)
    expect(screen.getByTestId('ps-verify-badge')).toHaveTextContent('✓'); expect(screen.getByTestId('ps-consistency')).toHaveTextContent('5 صف متطابق')
    expect(screen.getByTestId('ps-approve')).toBeEnabled()
    fireEvent.click(screen.getByTestId('ps-view-verify'))
    const r1 = screen.getByTestId('ps-verify-row-E-2')
    expect(r1).toHaveAttribute('data-ok', 'true'); expect(r1).toHaveTextContent('600,000 / 600,000'); expect(r1).toHaveTextContent('الصافي = 600,000 − 20,000 = 580,000')
    expect(r1.textContent).not.toMatch(/[\u0660-\u0669]/)
    unmount()
    h.reconcile = [rc({}), rc({ row_id: 'r2', employee_id: 'e2', employee_number: 'E-10', full_name: 'باسم', net_stored: 481000, net_expected: 480000, money_ok: false, ok: false, issues: ['NET_MISMATCH'] }), rc({ row_id: 'r3', employee_id: 'e3', employee_number: 'E-3', full_name: 'سارة', attendance_ok: false, ok: false, issues: ['ATTENDANCE_CHANGED'], live: { present: 20, absent: 5, leave: 1 } })]
    render(<MemoryRouter><PayrollOverview /></MemoryRouter>)
    expect(screen.getByTestId('ps-reconcile-banner')).toHaveTextContent('1 صف')
    expect(screen.getByTestId('ps-approve')).toBeDisabled(); expect(screen.getByTestId('ps-approve').getAttribute('title')).toMatch(/غير متطابق/)
    fireEvent.click(screen.getByTestId('ps-approve'))
    expect(h.approve).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('ps-view-verify'))
    expect(screen.getByTestId('ps-verify-summary')).toHaveTextContent('1 صف غير متطابق حسابياً — الاعتماد ممنوع')
    expect(screen.getByTestId('ps-verify-row-E-10')).toHaveAttribute('data-money-ok', 'false'); expect(screen.getByTestId('ps-verify-row-E-10')).toHaveTextContent('الصافي ≠ الإجمالي − الاستقطاعات')
    expect(screen.getByTestId('ps-verify-row-E-3')).toHaveTextContent('20 / 5 / 1'); expect(screen.getByTestId('ps-verify-row-E-3')).toHaveTextContent('تغيّرت الحضورية بعد التصدير')
    fireEvent.click(screen.getByTestId('ps-verify-issues'))
    expect(within(screen.getByTestId('ps-verify-table')).getAllByTestId(/^ps-verify-row-/)).toHaveLength(2)
  })
  it('الاعتماد السليم: تأكيد يذكر عدد الموظفين وإجمالي الصافي المعتمد ثم approve بمعرّف التصدير', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<MemoryRouter><PayrollOverview /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('ps-approve'))
    await vi.waitFor(() => expect(h.approve).toHaveBeenCalledWith({ exportId: 'x1', force: false }))
    expect(confirm.mock.calls.at(-1)![0]).toMatch(/5 موظفاً/); expect(confirm.mock.calls.at(-1)![0]).toMatch(/2,955,000/)
  })
})

describe('00194 — Excel المالي', () => {
  it('عمود «تحقق الصافي» بمعادلة حية لكل صف + خلاصة في صف الإجمالي، ملاحظات التدقيق، وتسمية الفلاتر في الترويسة', async () => {
    const wb = await buildPayrollWorkbook('2026-09-01', [...rows, missingRow], [], { filtersLabel: 'الفرع: الكرخ' })
    const ws = wb.worksheets[0]!
    const headers = (ws.getRow(4).values as unknown[]).slice(1) as string[]
    expect(headers.slice(-2)).toEqual(['تحقق الصافي', 'ملاحظات التدقيق'])
    expect(String(ws.getCell('A2').value)).toContain('الفرع: الكرخ')
    expect((ws.getRow(5).getCell(41).value as { formula: string }).formula).toBe('IF(ABS(MAX(0,V5-AF5)-AG5)<=1,"✓","✗")')
    expect(ws.getRow(7).getCell(42).value).toBe('صافٍ معدَّل يدوياً')
    expect(ws.getRow(10).getCell(41).value).toBe('بلا راتب'); expect(ws.getRow(10).getCell(42).value).toBe('بلا ملف راتب')
    expect(String((ws.getRow(11).getCell(41).value as { formula: string }).formula)).toContain('COUNTIF(AO5:AO10,"✗")')
    expect(ws.views[0]).toMatchObject({ xSplit: 3, ySplit: 4 })
  })
  it('ورقة «ملخص الفروع» هرمية (فرع ثم أقسامه) بمجاميع كل مستوى وإجمالي عام', async () => {
    const wb = await buildPayrollWorkbook('2026-09-01', rows)
    const bs = wb.getWorksheet('ملخص الفروع')!
    const col1 = [3, 4, 5, 6, 7, 8, 9].map((r) => String(bs.getRow(r).getCell(1).value).trim())
    expect(col1).toEqual(['الرصافة', 'الصيانة', 'النقل', 'الكرخ', 'الإدارة', 'النقل', 'الإجمالي العام'])
    expect(bs.getRow(3).getCell(6).value).toBe(1025000); expect(bs.getRow(6).getCell(6).value).toBe(2100000); expect(bs.getRow(9).getCell(6).value).toBe(3125000)
    expect(bs.getRow(9).getCell(13).value).toBe(2955000); expect(bs.getRow(9).getCell(10).value).toBe(50000)
  })
  it('ورقة لكل فرع عند تعدد الفروع (ولا تُنشأ لفرع واحد) بنفس الأعمدة', async () => {
    const wb = await buildPayrollWorkbook('2026-09-01', rows)
    const names = wb.worksheets.map((w) => w.name)
    expect(names).toContain('فرع · الكرخ'); expect(names).toContain('فرع · الرصافة')
    const k = wb.getWorksheet('فرع · الكرخ')!
    expect(k.getRow(4).getCell(3).value).toBe('الاسم'); expect(k.rowCount).toBe(4 + 3 + 1)
    const single = await buildPayrollWorkbook('2026-09-01', rows.filter((r) => r.branch_name === 'الكرخ'))
    expect(single.worksheets.map((w) => w.name).some((n) => n.startsWith('فرع ·'))).toBe(false)
  })
  it('ورقة «التحقق الحسابي» عند تمرير نتائج التحقق: عنوان أخضر/أحمر، صف لكل موظف، النتيجة والشرح', async () => {
    const okWb = await buildPayrollWorkbook('2026-09-01', rows, [], { reconcile: [rc({})] })
    const vs = okWb.getWorksheet('التحقق الحسابي')!
    expect(String(vs.getCell('A1').value)).toContain('كل الأرقام متطابقة'); expect(vs.getCell('A1').fill).toMatchObject({ fgColor: { argb: 'FF065F46' } })
    expect(vs.getRow(4).getCell(14).value).toBe('✓ متطابق'); expect(String(vs.getRow(4).getCell(16).value)).toContain('الصافي = 600,000 − 20,000 = 580,000')
    const badWb = await buildPayrollWorkbook('2026-09-01', rows, [], { reconcile: [rc({ net_stored: 581000, money_ok: false, ok: false, issues: ['NET_MISMATCH'] })] })
    const bv = badWb.getWorksheet('التحقق الحسابي')!
    expect(String(bv.getCell('A1').value)).toContain('1 صف غير متطابق'); expect(bv.getRow(4).getCell(13).value).toBe(1000); expect(bv.getRow(4).getCell(15).value).toBe('الصافي ≠ الإجمالي − الاستقطاعات')
    expect((await buildPayrollWorkbook('2026-09-01', rows)).getWorksheet('التحقق الحسابي')).toBeUndefined()
  })
})
