/** 00144: منطق شرائح الاستقطاع، تكلفة الرصيد، تنسيق الاستقطاع المقترح، أعمدة كشف المالية */
import { describe, expect, it } from 'vitest'
import { applyTiers, validateTiers } from '@features/hr/lib/policy'
import { balanceCost, daysBetween, minutesBetween } from '@portals/hr/components/leaves/leaveUtils'
import { proposedLabel } from '@portals/hr/components/hr-format'
import { buildPayrollWorkbook } from '@features/hr/lib/payrollExcel'
import type { DeductionTier, LeaveType, PayrollSheetRow } from '@features/hr'

const DEFAULT: DeductionTier[] = [
  { from: 1, to: 15, minutes: 0 }, { from: 16, to: 25, minutes: 20 }, { from: 26, to: 35, minutes: 60 }, { from: 36, to: 60, minutes: 120 },
  { from: 61, to: 120, day_fraction: 0.5 }, { from: 121, to: null, day_fraction: 1 },
]
const T = (o: Partial<LeaveType>): LeaveType => ({ id: 't', code: 'x', name: 'x', kind: 'leave', is_paid: true, consumes_balance: false, deduction_days_per_day: 1, requires_attachment: false, max_days_per_request: null, max_minutes: null, sort_order: 1, is_active: true, ...o })

describe('شرائح الاستقطاع (نفس قواعد الخادم)', () => {
  it('الشرائح الافتراضية صالحة وتطبَّق على مثال المستخدم: شفت 8 ساعات وعمل 7:45 → داخل السماحية، 7:30 → 60 دقيقة', () => {
    expect(validateTiers(DEFAULT)).toBeNull()
    expect(applyTiers(DEFAULT, 480 - 465)).toEqual({ minutes: 0, days: 0 })
    expect(applyTiers(DEFAULT, 30)).toEqual({ minutes: 60, days: 0 })
    expect(applyTiers(DEFAULT, 20)).toEqual({ minutes: 20, days: 0 })
    expect(applyTiers(DEFAULT, 90)).toEqual({ minutes: 0, days: 0.5 })
    expect(applyTiers(DEFAULT, 480)).toEqual({ minutes: 0, days: 1 })
    expect(applyTiers(DEFAULT, 0)).toEqual({ minutes: 0, days: 0 })
  })
  it('تُرفض الفجوات، والشريحة المغلقة الأخيرة، والشريحة المفتوحة في الوسط، والشريحة بلا قيمة', () => {
    expect(validateTiers([{ from: 1, to: 10, minutes: 0 }, { from: 12, to: null, minutes: 30 }])).toMatch(/الدقيقة 11/)
    expect(validateTiers([{ from: 1, to: 10, minutes: 0 }])).toMatch(/مفتوحة/)
    expect(validateTiers([{ from: 1, to: null, minutes: 0 }, { from: 2, to: null, minutes: 5 }])).toMatch(/الأخيرة/)
    expect(validateTiers([{ from: 1, to: 10, minutes: 0 }, { from: 11, to: null }])).toMatch(/حدد دقائق/)
    expect(validateTiers([{ from: 2, to: null, minutes: 1 }])).toMatch(/الدقيقة 1/)
    expect(validateTiers([])).toMatch(/شريحة واحدة/)
  })
})

describe('تكلفة الطلب من الرصيد', () => {
  it('الإجازة المدفوعة تخصم أيامها، الزمنية المدفوعة تخصم 1/N يوم، غير المستهلِك للرصيد صفر', () => {
    expect(balanceCost(T({ consumes_balance: true }), 3, 3)).toBe(3)
    expect(balanceCost(T({ kind: 'time_permit', consumes_balance: true }), 0, 3)).toBe(0.333)
    expect(balanceCost(T({ kind: 'time_permit', consumes_balance: true }), 0, 4)).toBe(0.25)
    expect(balanceCost(T({ consumes_balance: false, is_paid: false }), 5, 3)).toBe(0)
    expect(balanceCost(undefined, 5, 3)).toBe(0)
  })
  it('حساب الأيام والدقائق', () => {
    expect(daysBetween('2026-10-01', '2026-10-03')).toBe(3)
    expect(daysBetween('2026-10-01', '2026-10-01')).toBe(1)
    expect(minutesBetween('09:00', '10:30')).toBe(90)
    expect(minutesBetween('10:00', '09:00')).toBe(-60)
  })
})

describe('عرض الاستقطاع المقترح', () => {
  it('أيام + دقائق، أو شرطة عند الصفر', () => {
    expect(proposedLabel({ proposed_deduction_minutes: 60, proposed_deduction_days: 0 })).toBe('1س 0د')
    expect(proposedLabel({ proposed_deduction_minutes: 0, proposed_deduction_days: 0.5 })).toBe('0.5 يوم')
    expect(proposedLabel({ proposed_deduction_minutes: 20, proposed_deduction_days: 1 })).toBe('1 يوم + 20د')
    expect(proposedLabel({ proposed_deduction_minutes: 0, proposed_deduction_days: 0 })).toBe('—')
  })
})

describe('كشف رواتب المالية (Excel) يحمل أعمدة الاستقطاع التلقائي', () => {
  it('الترويسة والقيم والمجاميع', async () => {
    const row = {
      export_id: 'x', export_version: 1, export_status: 'exported', exported_at: new Date().toISOString(), row_id: 'r1', id: 'r1', employee_id: 'e1', employee_number: 'E1', full_name: 'أحمد',
      department_name: 'النقل', branch_name: 'بغداد', job_title: 'سائق', contract_type: 'monthly', working_days: 26, days_present: 24, days_late: 2, days_absent: 1, days_incomplete: 0, days_leave: 1,
      late_minutes: 30, early_minutes: 0, ops_deduction_amount: 0, ops_deduction_days: 0, ops_deduction_reasons: null,
      auto_deduction_minutes: 60, auto_deduction_days: 1.5, auto_deduction_amount: 78000, overtime_minutes: 90, shortfall_minutes: 510,
      pay_type: 'monthly', base_salary: 1440000, daily_rate: 0, allowances_total: 0, fixed_deductions_total: 0, proposed_net: 1362000, final_net: 1362000, finance_note: null,
    } as PayrollSheetRow
    const wb = await buildPayrollWorkbook('2026-08-01', [row])
    const ws = wb.worksheets[0]!
    const headers = (ws.getRow(4).values as unknown[]).slice(1)
    expect(headers).toContain('استقطاع تلقائي (دقائق)'); expect(headers).toContain('استقطاع تلقائي (أيام)'); expect(headers).toContain('استقطاع تلقائي (مبلغ)')
    const r5 = ws.getRow(5).values as unknown[]
    const iMin = headers.indexOf('استقطاع تلقائي (دقائق)') + 1, iAmt = headers.indexOf('استقطاع تلقائي (مبلغ)') + 1, iNet = headers.indexOf('الصافي المقترح') + 1
    expect(r5[iMin]).toBe(60); expect(r5[iAmt]).toBe(78000); expect(r5[iNet]).toBe(1362000)
    const tot = ws.getRow(6).values as Array<{ formula?: string } | string | number>
    expect((tot[iAmt] as { formula?: string })?.formula).toMatch(/SUM/)
    expect((tot[iNet] as { formula?: string })?.formula).toMatch(/SUM/)
  })
})
