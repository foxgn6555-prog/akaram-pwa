/** 00184 — كشف المالية: الإجمالي/إجمالي الاستقطاعات، الإجازة المدفوعة، الأجر اليومي، الترتيب الطبيعي، أعمدة Excel */
import { describe, expect, it } from 'vitest'
import { buildPayrollWorkbook, employeeSortKey, groupByDepartment, MONEY_COLS, rowDeductions, rowGross } from '@features/hr/lib/payrollExcel'
import type { PayrollSheetRow } from '@features/hr'

const base = {
  export_id: 'x', export_version: 2, export_status: 'exported', exported_at: '2026-10-01T05:00:00Z', branch_name: 'بغداد', job_title: 'عامل', contract_type: 'daily',
  working_days: 5, days_late: 0, days_incomplete: 0, late_minutes: 0, early_minutes: 0, ops_deduction_reasons: null, auto_deduction_minutes: 0, overtime_minutes: 0, shortfall_minutes: 0,
  fixed_deductions_total: 0, final_net: null, finance_note: null,
} as const
const daily: PayrollSheetRow = { ...base, row_id: 'r9', employee_id: 'e9', employee_number: 'PF-9', full_name: 'يومي تسعة', department_name: 'قسم أ', pay_type: 'daily', base_salary: 0, daily_rate: 25000, allowances_total: 0,
  days_present: 2, days_absent: 1, days_leave: 2, days_leave_paid: 1, days_leave_unpaid: 1, ops_deduction_amount: 0, ops_deduction_days: 0, ops_deduction_days_amount: 0,
  auto_deduction_days: 2, auto_absence_days: 2, auto_shortfall_days: 0, auto_deduction_amount: 0, payable_days: 3, gross_amount: 75000, deductions_total: 0, proposed_net: 75000 } as PayrollSheetRow
const monthly: PayrollSheetRow = { ...base, row_id: 'r10', employee_id: 'e10', employee_number: 'PF-10', full_name: 'شهري عشرة', department_name: 'قسم ب', pay_type: 'monthly', base_salary: 900000, daily_rate: 0, allowances_total: 60000, fixed_deductions_total: 30000,
  days_present: 2, days_absent: 1, days_leave: 2, days_leave_paid: 1, days_leave_unpaid: 1, ops_deduction_amount: 0, ops_deduction_days: 1, ops_deduction_days_amount: 30000,
  auto_deduction_days: 2, auto_absence_days: 2, auto_shortfall_days: 0, auto_deduction_amount: 60000, payable_days: null, gross_amount: 960000, deductions_total: 120000, proposed_net: 840000 } as PayrollSheetRow
const two: PayrollSheetRow = { ...daily, row_id: 'r2', employee_id: 'e2', employee_number: 'PF-2', full_name: 'يومي اثنان', days_present: 1, days_leave: 0, days_leave_paid: 0, days_leave_unpaid: 0, auto_deduction_days: 0, auto_absence_days: 0, payable_days: 1, gross_amount: 20000, daily_rate: 20000, proposed_net: 20000 }
const none: PayrollSheetRow = { ...two, row_id: 'r1', employee_id: 'e1', employee_number: 'PF-1', full_name: 'بلا قسم', department_name: null, pay_type: null, gross_amount: null, deductions_total: null, proposed_net: null, payable_days: null }
/** صف قديم مصدَّر قبل 00184 (بلا أعمدة التفصيل) */
const legacy = { ...monthly, row_id: 'r-old', employee_number: 'PF-7', gross_amount: undefined, deductions_total: undefined, ops_deduction_days_amount: undefined, payable_days: undefined, days_leave_paid: undefined, days_leave_unpaid: undefined } as unknown as PayrollSheetRow

describe('00184 · كشف المالية', () => {
  it('الإجمالي وإجمالي الاستقطاعات من الأعمدة المخزَّنة، أو محلياً للصفوف القديمة وبلا ملف راتب', () => {
    expect(rowGross(monthly)).toBe(960000); expect(rowDeductions(monthly)).toBe(120000)
    expect(rowGross(daily)).toBe(75000); expect(rowDeductions(daily)).toBe(0)
    expect(rowGross(legacy)).toBe(960000); expect(rowDeductions(legacy)).toBe(120000)
    expect(rowGross(none)).toBe(0); expect(rowDeductions(none)).toBe(0)
    const legacyDaily = { ...daily, gross_amount: undefined, payable_days: undefined } as unknown as PayrollSheetRow
    expect(rowGross(legacyDaily)).toBe(75000) // حاضر 2 + إجازة مدفوعة 1
  })
  it('الترتيب الطبيعي للرقم الوظيفي: 2 قبل 9 قبل 10؛ الأقسام أبجدياً و«بلا قسم» آخراً', () => {
    expect(['PF-10', 'PF-9', 'PF-2'].sort((a, b) => employeeSortKey(a).localeCompare(employeeSortKey(b)))).toEqual(['PF-2', 'PF-9', 'PF-10'])
    const g = groupByDepartment([monthly, none, daily, two])
    expect(g.map((x) => x.name)).toEqual(['قسم أ', 'قسم ب', 'بلا قسم'])
    expect(g[0]!.rows.map((r) => r.employee_number)).toEqual(['PF-2', 'PF-9'])
    expect(g[0]!.gross).toBe(95000); expect(g[1]!.deductions).toBe(120000); expect(g[1]!.ops).toBe(30000)
  })
  it('Excel: أعمدة الإجازة المدفوعة/غير المدفوعة والإجمالي وإجمالي الاستقطاعات بترتيب منطقي، وصف الإجمالي يجمع أعمدة المبالغ', async () => {
    const wb = await buildPayrollWorkbook('2026-09-01', [two, daily, monthly, none])
    const ws = wb.worksheets[0]!
    const headers = (ws.getRow(4).values as unknown[]).slice(1) as string[]
    const idx = (h: string) => headers.indexOf(h)
    expect(idx('إجازة مدفوعة')).toBeGreaterThan(idx('غائب')); expect(idx('إجازة غير مدفوعة')).toBe(idx('إجازة مدفوعة') + 1)
    expect(idx('الإجمالي')).toBeGreaterThan(idx('المخصصات')); expect(idx('الإجمالي')).toBeLessThan(idx('الاستقطاعات الثابتة'))
    expect(idx('إجمالي الاستقطاعات')).toBeGreaterThan(idx('استقطاع تلقائي (مبلغ)')); expect(idx('الصافي المقترح')).toBe(idx('إجمالي الاستقطاعات') + 1)
    expect(headers).toContain('استقطاع تلقائي (أيام)')
    const rowOf = (num: string) => { for (let i = 5; i <= 8; i++) if (ws.getRow(i).getCell(2).value === num) return ws.getRow(i).values as unknown[]; throw new Error(num) }
    const m = rowOf('PF-10'), d = rowOf('PF-9')
    expect(m[idx('الإجمالي') + 1]).toBe(960000); expect(m[idx('إجمالي الاستقطاعات') + 1]).toBe(120000); expect(m[idx('استقطاع العمليات (مبلغ الأيام)') + 1]).toBe(30000)
    expect(m[idx('إجازة مدفوعة') + 1]).toBe(1); expect(m[idx('إجازة غير مدفوعة') + 1]).toBe(1); expect(m[idx('الأيام المدفوعة') + 1]).toBe('')
    expect(d[idx('الأيام المدفوعة') + 1]).toBe(3); expect(d[idx('الإجمالي') + 1]).toBe(75000); expect(d[idx('منها أيام غياب/إجازة غير مدفوعة') + 1]).toBe(2); expect(d[idx('الصافي المقترح') + 1]).toBe(75000)
    const tot = ws.getRow(9).values as Array<{ formula?: string } | string | number>
    for (const c of MONEY_COLS) { expect(headers[c - 1]).toBeTruthy(); expect((tot[c] as { formula?: string })?.formula).toMatch(/^SUM\(/) }
    expect(MONEY_COLS).toContain(idx('الإجمالي') + 1); expect(MONEY_COLS).toContain(idx('إجمالي الاستقطاعات') + 1); expect(MONEY_COLS).toContain(idx('الصافي المعتمد') + 1)
    const ds = wb.getWorksheet('ملخص الأقسام')!
    expect((ds.getRow(2).values as unknown[]).slice(1)).toContain('إجمالي الاستقطاعات')
  })
})
