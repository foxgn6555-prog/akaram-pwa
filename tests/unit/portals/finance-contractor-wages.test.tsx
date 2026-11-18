/**
 * 00263 — أجور المتعهدين (المالية) بالعدد المعتمد: الكشف لكل متعهد مع المعادلة المرئية، حالة اعتماد الشهر،
 * تحديد الأجرين (متعهد/عامل) مع معاينة، تفصيل الأيام، نسخ الشهر السابق، Excel، أرقام إنكليزية.
 * + مسار الصرف: قواعد البصمة (الأيام المحجوبة والاستقطاع والصافي)، لوحة الجاهزية، «اعتماد وإرسال»، تجميد الأجور بطلب قائم.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'

const h = vi.hoisted(() => ({
  rows: [] as unknown[], status: null as unknown, adjusted: [] as unknown[], adjError: false, readiness: undefined as unknown, readinessError: false, days: [] as unknown[],
  setRates: vi.fn(), copyPrev: vi.fn(), close: vi.fn(), refetchAdjusted: vi.fn(), refetchReadiness: vi.fn(), wageDays: vi.fn(async () => [] as unknown[]),
}))
vi.mock('@features/contractors/hooks', () => ({
  useContractorWagesMonthStatus: () => ({ data: h.status }),
  useContractorWagesSheet: () => ({ data: h.rows, isLoading: false }),
  useSetContractorRates: () => ({ mutate: h.setRates, isPending: false }),
  useCopyPreviousRates: () => ({ mutate: h.copyPrev, isPending: false }),
}))
vi.mock('@features/disbursements/hooks', () => ({
  useContractorWagesAdjusted: () => ({ data: h.adjError ? undefined : h.adjusted, isLoading: false, isError: h.adjError, refetch: h.refetchAdjusted }),
  useContractorWagesReadiness: () => ({ data: h.readinessError ? undefined : h.readiness, isLoading: false, isError: h.readinessError, refetch: h.refetchReadiness }),
  useContractorWageDaysAdjusted: () => ({ data: h.days, isLoading: false }),
  useContractorWagesClose: () => ({ mutate: (v: unknown, o?: { onSuccess?: (r: unknown) => void }) => { h.close(v); o?.onSuccess?.({ id: 'req-new' }) }, isPending: false }),
}))
vi.mock('@sdk/disbursements.sdk', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, disbursements: { contractorWageDays: h.wageDays } }
})
vi.mock('@lib/export/excel-report', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, buildExcelReport: vi.fn(async (o: unknown) => o) }
})
import ContractorWagesPage, { downloadContractorWagesExcel, mergeWages, summarizeAdjusted, summarizeWages, wageFormula } from '@portals/finance/pages/Contractors/ContractorWagesPage'
import { useMyPermissionsStore } from '@features/permissions/my-permissions'
import { buildExcelReport } from '@lib/export/excel-report'
import { blockerText } from '@features/disbursements/components/ContractorWagesSendPanel'

const Where = () => <p data-testid="where">{useLocation().pathname}</p>
const page = () => render(<MemoryRouter><ContractorWagesPage /><Where /></MemoryRouter>)

const approved = { month: '2026-03-01', approved: true, approved_source: 'contractor', approved_by_name: 'غرفة العمليات', approved_at: '2026-04-01T08:00:00Z', is_locked: true, month_ended: true }
const base = { contractor_phone: '07700000000', sector_id: 1, area_name: 'أرخيته', parent_sector: 'karrada', shift: 'morning', is_active: true, approved: true, approved_source: 'contractor', note: null, set_by_name: null, set_at: null }
// مثال المستخدم: 16 معتمد × 30 يوماً ⇒ 450 × 8,000 + 30 × 15,000 = 4,050,000 (قبل الحجب والاستقطاع)
const c1 = { ...base, contractor_user_id: 'c1', contractor_name: 'متعهد أرخيته', paid_days: 30, worker_days: 450, headcount_total: 480, contractor_daily_wage: 15000, worker_daily_wage: 8000, rates_set: true, contractor_pay: 450000, workers_pay: 3600000, total_pay: 4050000, note: 'عقد 2026', set_by_name: 'محاسب', set_at: '2026-10-05T08:00:00Z' }
const c2 = { ...base, contractor_user_id: 'c2', contractor_name: 'متعهد الزعفرانية', area_name: 'الزعفرانية 2', parent_sector: 'zaafaraniya', paid_days: 5, worker_days: 0, headcount_total: 5, contractor_daily_wage: 0, worker_daily_wage: 0, rates_set: false, contractor_pay: null, workers_pay: null, total_pay: null }
// بعد البصمة: 3 أيام محجوبة (3 × (15,000 + 15 × 8,000) = 405,000) + استقطاع 4,500 ⇒ الصافي 3,640,500
const a1 = { contractor_user_id: 'c1', contractor_name: 'متعهد أرخيته', area_name: 'أرخيته', sector_id: 1, parent_sector: 'karrada', fingerprint_linked: true, rates_set: true, pay_days: 30, paid_days: 27, blocked_days: 3, late_days: 1, deduction_minutes: 20, contractor_daily_wage: 15000, worker_daily_wage: 8000, gross_pay: 4050000, blocked_pay: 405000, deduction_amount: 4500, net_pay: 3640500 }
const a2 = { contractor_user_id: 'c2', contractor_name: 'متعهد الزعفرانية', area_name: 'الزعفرانية 2', sector_id: 2, parent_sector: 'zaafaraniya', fingerprint_linked: false, rates_set: false, pay_days: 5, paid_days: 5, blocked_days: 0, late_days: 0, deduction_minutes: 0, contractor_daily_wage: 0, worker_daily_wage: 0, gross_pay: null, blocked_pay: null, deduction_amount: null, net_pay: null }
const ready = { month: '2026-03-01', locked: true, attendance_required: true, attendance_confirmed: true, attendance_pending_auto: 0, contractors: 1, missing_rates: 0, no_fingerprint: 0, gross_total: 4050000, deductions_total: 409500, net_total: 3640500, active_request: null, latest_rejected: null, blockers: [], can_send: true }

beforeEach(() => { vi.clearAllMocks(); h.rows = [c1, c2]; h.adjusted = [a1, a2]; h.status = approved; h.readiness = ready; h.adjError = false; h.readinessError = false; h.days = [] })
afterEach(() => { act(() => useMyPermissionsStore.getState().reset()) })

describe('المالية — أجور المتعهدين بالعدد المعتمد وقواعد البصمة', () => {
  it('الكشف: صف لكل متعهد بالمعادلة والحجب والاستقطاع والصافي، من لا أجور له «غير محدد»، المجاميع، وأرقام إنكليزية', () => {
    page()
    expect(screen.getByTestId('cw-stat-contractors')).toHaveTextContent('2')
    expect(screen.getByTestId('cw-stat-days')).toHaveTextContent('32') // 27 + 5 مدفوعة بعد الحجب
    expect(screen.getByTestId('cw-stat-blocked')).toHaveTextContent('3')
    expect(screen.getByTestId('cw-stat-worker-days')).toHaveTextContent('450')
    expect(screen.getByTestId('cw-stat-missing')).toHaveTextContent('1')
    expect(screen.getByTestId('cw-stat-total')).toHaveTextContent('3,640,500') // الصافي بعد البصمة لا الإجمالي القديم
    expect(screen.getByTestId('cw-month-status')).toHaveTextContent('الجهة المعتمدة: المتعهد')
    expect(screen.getByTestId('cw-days-c1')).toHaveTextContent('27 / 30')
    expect(screen.getByTestId('cw-blocked-c1')).toHaveTextContent('3 محجوب')
    expect(screen.getByTestId('cw-gross-c1')).toHaveTextContent('4,050,000')
    expect(screen.getByTestId('cw-blocked-pay-c1')).toHaveTextContent('405,000')
    expect(screen.getByTestId('cw-deduction-c1')).toHaveTextContent('4,500')
    expect(screen.getByTestId('cw-payable-c1')).toHaveTextContent('3,640,500')
    expect(screen.getByTestId('cw-formula-c1')).toHaveTextContent('450 عامل/يوم × 8,000 + 30 يوم × 15,000 − محجوب بالبصمة 405,000 − استقطاع 4,500')
    expect(screen.getByTestId('cw-row-c1')).toHaveTextContent('قاطع الكرادة / أرخيته')
    expect(screen.getByTestId('cw-row-c2')).toHaveTextContent('غير محدد')
    expect(screen.getByTestId('cw-formula-c2')).toHaveTextContent('حدِّد الأجور')
    expect(screen.getByTestId('cw-payable-c2')).toHaveTextContent('—')
    expect(screen.getByTestId('cw-nofp-c2')).toBeInTheDocument()
    expect(screen.queryByTestId('cw-nofp-c1')).toBeNull()
    expect(screen.getByTestId('cw-unlinked')).toHaveTextContent('1 متعهد بلا رقم بصمة')
    expect(screen.getByTestId('cw-total')).toHaveTextContent('3,640,500')
    expect(screen.getByTestId('contractor-wages-page').textContent).not.toMatch(/[\u0660-\u0669]/)
  })
  it('المجاميع: القديمة بلا بصمة كما كانت، والجديدة بعدها (الصافي = الإجمالي − المحجوب − الاستقطاع)', () => {
    expect(summarizeWages([c1, c2] as never)).toMatchObject({ contractors: 2, paidDays: 35, workerDays: 450, contractorPay: 450000, workersPay: 3600000, total: 4050000, missingRates: 1 })
    const rows = mergeWages([c1, c2] as never, [a1, a2] as never)
    expect(summarizeAdjusted(rows)).toMatchObject({ loaded: 2, payDays: 35, paidDays: 32, blockedDays: 3, deductionMinutes: 20, gross: 4050000, blocked: 405000, deduction: 4500, net: 3640500, unlinked: 1 })
    expect(4050000 - 405000 - 4500).toBe(3640500)
    // لم تُحمَّل أرقام البصمة بعد ⇒ adj = null لا رقماً مفترضاً
    expect(mergeWages([c1] as never, undefined)[0]!.adj).toBeNull()
    expect(summarizeAdjusted(mergeWages([c1] as never, undefined))).toMatchObject({ loaded: 0, net: 0 })
  })
  it('تعذّر تحميل أرقام البصمة: لا مبالغ مفترضة (— في الأرقام) ورسالة بإعادة المحاولة وتعطيل Excel', () => {
    h.adjError = true
    page()
    expect(screen.getByTestId('cw-adjusted-error')).toHaveTextContent('لا تُعرض مبالغ مفترضة')
    expect(screen.getByTestId('cw-stat-total')).toHaveTextContent('—')
    expect(screen.getByTestId('cw-payable-c1')).toHaveTextContent('—')
    expect(screen.getByTestId('cw-total')).toHaveTextContent('—')
    expect(screen.getByTestId('cw-excel')).toBeDisabled()
    fireEvent.click(within(screen.getByTestId('cw-adjusted-error')).getByRole('button', { name: 'إعادة المحاولة' }))
    expect(h.refetchAdjusted).toHaveBeenCalledTimes(1)
  })
  it('الشهر غير المعتمد: تنبيه «غير معتمد» ولا مستحق حتى لو حُددت الأجور', () => {
    h.rows = [{ ...c1, approved: false, approved_source: null, paid_days: 0, worker_days: 0, contractor_pay: null, workers_pay: null, total_pay: null }]
    h.adjusted = [{ ...a1, pay_days: 0, paid_days: 0, blocked_days: 0, deduction_minutes: 0, gross_pay: null, blocked_pay: null, deduction_amount: null, net_pay: null }]
    h.status = { ...approved, approved: false, approved_source: null, is_locked: false }
    page()
    expect(screen.getByTestId('cw-month-status')).toHaveTextContent('غير معتمد')
    expect(screen.getByTestId('cw-payable-c1')).toHaveTextContent('—')
    expect(screen.getByTestId('cw-formula-c1')).toHaveTextContent('بانتظار اعتماد غرفة العمليات')
    expect(screen.getByTestId('cw-stat-total')).toHaveTextContent('0')
    expect(wageFormula({ ...c1, approved: false } as never)).toBe('بانتظار اعتماد غرفة العمليات')
  })
  it('المعادلة بلا حجب ولا استقطاع كما كانت حرفياً، وتُلحق بهما حين يوجدان', () => {
    expect(wageFormula(c1 as never)).toBe('450 عامل/يوم × 8,000 + 30 يوم × 15,000')
    expect(wageFormula(c1 as never, { ...a1, blocked_pay: 0, deduction_amount: 0 } as never)).toBe('450 عامل/يوم × 8,000 + 30 يوم × 15,000')
    expect(wageFormula(c1 as never, { ...a1, blocked_pay: 135000, deduction_amount: 0 } as never)).toBe('450 عامل/يوم × 8,000 + 30 يوم × 15,000 − محجوب بالبصمة 135,000')
    expect(wageFormula(c2 as never, a2 as never)).toBe('حدِّد الأجور حتى يُحتسب المستحق')
  })
  it('تحديد الأجرين: المعاينة = عامل/يوم × أجر العامل + أيام × أجر المتعهد ثم يرسل contractorId/month/contractorDaily/workerDaily/note', async () => {
    h.rows = [c2]; h.adjusted = [a2]
    page()
    fireEvent.click(screen.getByTestId('cw-edit-c2'))
    expect(screen.getByTestId('cw-save')).toBeDisabled()
    fireEvent.change(screen.getByTestId('cw-contractor-wage'), { target: { value: '20000' } })
    expect(screen.getByTestId('cw-save')).toBeDisabled()
    fireEvent.change(screen.getByTestId('cw-worker-wage'), { target: { value: '9000' } })
    expect(screen.getByTestId('cw-preview')).toHaveTextContent('100,000') // 0 × 9,000 + 5 × 20,000
    fireEvent.change(screen.getByTestId('cw-note'), { target: { value: 'عقد جديد' } })
    fireEvent.click(screen.getByTestId('cw-save'))
    await waitFor(() => expect(h.setRates).toHaveBeenCalledTimes(1))
    const sent = h.setRates.mock.calls[0]![0] as Record<string, unknown>
    expect(sent.contractorId).toBe('c2'); expect(sent.contractorDaily).toBe(20000); expect(sent.workerDaily).toBe(9000); expect(sent.note).toBe('عقد جديد'); expect(String(sent.month)).toMatch(/^\d{4}-\d{2}-01$/)
  })
  it('طلب قائم للشهر ⇒ الأجور مجمَّدة: أزرار التحديد ونسخ الشهر السابق معطَّلة بالسبب، ولا محرر', () => {
    h.readiness = { ...ready, active_request: { id: 'r1', request_no: 'DSB-2026-0007', status: 'pending_approval', version: 1, net_total: 3640500 }, blockers: ['active_request'], can_send: false }
    page()
    for (const id of ['c1', 'c2']) {
      expect(screen.getByTestId(`cw-edit-${id}`)).toBeDisabled()
      expect(screen.getByTestId(`cw-edit-${id}`)).toHaveAttribute('title', expect.stringContaining('مجمَّدة'))
    }
    expect(screen.getByTestId('cw-copy-prev')).toBeDisabled()
    fireEvent.click(screen.getByTestId('cw-edit-c1'))
    expect(screen.queryByTestId('cw-editor-c1')).toBeNull()
  })
  it('تفصيل الأيام: يوم محجوب بسببه، ويوم مدفوع باستقطاع، ويوم بلا عدد «لا أجر»', () => {
    h.rows = [c1]; h.adjusted = [a1]
    h.days = [
      { log_date: '2026-03-01', headcount: 16, workers: 15, state: 'paid', block_reason: null, check_in: '2026-03-01T14:00:00Z', check_out: '2026-03-02T01:00:00Z', required_minutes: 720, shortfall_minutes: 0, grace_minutes: 15, deduct_minutes: 0, base_pay: 135000, deduction: 0, day_pay: 135000, edit_reason: null },
      { log_date: '2026-03-02', headcount: 16, workers: 15, state: 'blocked', block_reason: 'absent', check_in: null, check_out: null, required_minutes: 720, shortfall_minutes: 720, grace_minutes: 15, deduct_minutes: 0, base_pay: 135000, deduction: 0, day_pay: 0, edit_reason: null },
      { log_date: '2026-03-03', headcount: 16, workers: 15, state: 'paid', block_reason: null, check_in: '2026-03-03T14:30:00Z', check_out: '2026-03-04T01:00:00Z', required_minutes: 720, shortfall_minutes: 30, grace_minutes: 15, deduct_minutes: 30, base_pay: 135000, deduction: 625, day_pay: 134375, edit_reason: 'تصحيح' },
      { log_date: '2026-03-31', headcount: null, workers: null, state: null, block_reason: null, check_in: null, check_out: null, required_minutes: null, shortfall_minutes: null, grace_minutes: null, deduct_minutes: null, base_pay: null, deduction: null, day_pay: null, edit_reason: null },
    ]
    page()
    fireEvent.click(screen.getByTestId('cw-days-btn-c1'))
    const d = screen.getByTestId('cw-days-c1-detail')
    expect(screen.getByTestId('cw-day-c1-2026-03-01')).toHaveAttribute('data-state', 'paid')
    expect(screen.getByTestId('cw-day-c1-2026-03-02')).toHaveAttribute('data-state', 'blocked')
    expect(screen.getByTestId('cw-day-c1-2026-03-02')).toHaveTextContent('محجوب — غياب البصمة')
    expect(screen.getByTestId('cw-day-c1-2026-03-02')).toHaveTextContent('135,000')
    expect(screen.getByTestId('cw-day-c1-2026-03-03')).toHaveTextContent('625')
    expect(screen.getByTestId('cw-day-c1-2026-03-03')).toHaveTextContent('134,375')
    expect(screen.getByTestId('cw-day-c1-2026-03-03')).toHaveTextContent('تصحيح')
    expect(screen.getByTestId('cw-day-c1-2026-03-31')).toHaveTextContent('لا أجر')
    expect(d.textContent).not.toMatch(/[\u0660-\u0669]/)
    expect(d).toHaveTextContent('2026-03-01')
  })
  it('نسخ أجور الشهر السابق يطلب تأكيداً ثم يستدعي الهوك', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    page()
    fireEvent.click(screen.getByTestId('cw-copy-prev'))
    expect(h.copyPrev).toHaveBeenCalledTimes(1)
  })
  it('Excel: أعمدة الحجب والاستقطاع والصافي وإجماليها، وورقة أيام لكل متعهد بحالة اليوم وصافيه', async () => {
    const rows = mergeWages([c1, c2] as never, [a1, a2] as never)
    const days = [{ name: 'متعهد أرخيته', days: [
      { log_date: '2026-03-01', headcount: 16, workers: 15, state: 'paid', block_reason: null, check_in: '2026-03-01T14:00:00Z', check_out: '2026-03-02T01:00:00Z', required_minutes: 720, shortfall_minutes: 0, grace_minutes: 15, deduct_minutes: 0, base_pay: 135000, deduction: 0, day_pay: 135000, edit_reason: null },
      { log_date: '2026-03-02', headcount: 16, workers: 15, state: 'blocked', block_reason: 'leave', check_in: null, check_out: null, required_minutes: 720, shortfall_minutes: 720, grace_minutes: 15, deduct_minutes: 0, base_pay: 135000, deduction: 0, day_pay: 0, edit_reason: null },
    ] as never }]
    await downloadContractorWagesExcel('2026-03-01', approved as never, rows, days)
    const o = (buildExcelReport as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)![0] as Record<string, unknown>
    expect(o.fileName).toBe('أجور-المتعهدين-2026-03.xlsx')
    expect(String(o.meta)).toContain('الجهة المعتمدة: المتعهد'); expect(String(o.meta)).toContain('(العدد − 1) × أجر العامل + أجر المتعهد')
    expect(String(o.meta)).toContain('نقص الدقائق فوق السماح يُستقطع من أجر المتعهد وحده')
    const keys = (o.columns as { key: string }[]).map((c) => c.key)
    for (const k of ['pd', 'paid', 'bd', 'bp', 'dd', 'dm', 'tp']) expect(keys).toContain(k)
    expect(o.rows).toHaveLength(2)
    expect((o.rows as Record<string, unknown>[])[0]).toMatchObject({ pd: 30, paid: 27, bd: 3, wd: 450, wp: 3600000, cp: 450000, bp: 405000, dd: 4500, dm: 20, tp: 3640500, parent: 'قاطع الكرادة' })
    expect((o.rows as Record<string, unknown>[])[1]).toMatchObject({ name: 'متعهد الزعفرانية (بلا رقم بصمة)', tp: 0 })
    expect(o.totalRow).toMatchObject({ pd: 35, paid: 32, bd: 3, bp: 405000, dd: 4500, tp: 3640500 })
    const extra = (o.extraSheets as Record<string, unknown>[])
    expect(extra).toHaveLength(1)
    const dr = extra[0]!.rows as Record<string, unknown>[]
    expect(dr).toHaveLength(2)
    expect(dr[0]).toMatchObject({ st: 'مدفوع', dp: 135000, req: 720 })
    expect(dr[1]).toMatchObject({ st: 'محجوب', why: 'إجازة معتمدة', dp: 0, bp: 135000 })
    expect(extra[0]!.totalRow).toMatchObject({ bp: 270000, dp: 135000 })
  })
  it('زر Excel يجلب أيام كل متعهد من قارئ البصمة ثم يبني التقرير', async () => {
    page()
    fireEvent.click(screen.getByTestId('cw-excel'))
    await waitFor(() => expect(h.wageDays).toHaveBeenCalledTimes(2))
    expect(h.wageDays.mock.calls.map((c) => (c as unknown[])[0]).sort()).toEqual(['c1', 'c2'])
    await waitFor(() => expect(buildExcelReport).toHaveBeenCalled())
  })
  it('00303: شارة «غير مغطى» تظهر فقط لمن لديه أيام بلا رقم من الجهة المعتمدة', () => {
    h.rows = [{ ...c1, uncovered_days: 3 }, { ...c2, uncovered_days: 0 }]
    page()
    expect(screen.getByTestId('cw-uncovered-c1')).toHaveTextContent('+3 غير مغطى')
    expect(screen.queryByTestId('cw-uncovered-c2')).toBeNull()
  })

  it('blockerText: لكل شرط منع نص عربي يشرح ما المطلوب (لا undefined لأي قيمة محتملة من الخادم)', () => {
    const r = { ...ready, attendance_pending_auto: 0, missing_rates: 2, no_fingerprint: 3 } as never
    const all = ['month_not_locked', 'active_request', 'attendance_not_confirmed', 'rates_missing', 'no_fingerprint', 'no_days', 'nothing_payable'] as const
    const texts = all.map((b) => blockerText(b, r))
    for (const [i, t] of texts.entries()) { expect(t, all[i]).toMatch(/[\u0600-\u06ff]/); expect(t, all[i]).not.toMatch(/undefined|null|NaN/) }
    expect(new Set(texts).size).toBe(all.length)
    expect(texts[3]).toContain('2 متعهد'); expect(texts[4]).toContain('3 متعهد')
    expect(blockerText('attendance_not_confirmed', { ...ready, attendance_pending_auto: 0 } as never)).not.toContain('ينتظر التأكيد')
    expect(blockerText('attendance_not_confirmed', { ...ready, attendance_pending_auto: 7 } as never)).toContain('7 حضور تلقائي ينتظر التأكيد')
  })

  describe('اعتماد وإرسال إلى المدير المفوض', () => {
    it('جاهز: أرقام الإرسال، والزر مفعَّل، والتأكيد يرسل الشهر والملاحظة ثم ينتقل إلى أمر الصرف الجديد', async () => {
      page()
      const panel = screen.getByTestId('cw-send-panel')
      expect(panel).toHaveAttribute('data-ready', 'yes')
      expect(within(panel).getByTestId('cw-send-kpi-net')).toHaveTextContent('3,640,500')
      expect(within(panel).getByTestId('cw-send-kpi-deductions')).toHaveTextContent('409,500')
      expect(screen.queryByTestId('cw-blockers')).toBeNull()
      expect(screen.getByTestId('cw-send')).toBeEnabled()
      expect(screen.getByTestId('cw-send')).toHaveTextContent('اعتماد وإرسال للمدير المفوض')
      fireEvent.click(screen.getByTestId('cw-send'))
      const sheet = screen.getByTestId('cw-send-sheet')
      expect(within(sheet).getByTestId('cw-send-sheet-amount')).toHaveTextContent('3,640,500')
      fireEvent.change(within(sheet).getByTestId('cw-send-note'), { target: { value: 'بعد مراجعة البصمة' } })
      fireEvent.click(within(sheet).getByTestId('cw-send-confirm'))
      expect(h.close).toHaveBeenCalledTimes(1)
      const sent = h.close.mock.calls[0]![0] as { month: string; note: string }
      expect(sent.month).toMatch(/^\d{4}-\d{2}-01$/); expect(sent.note).toBe('بعد مراجعة البصمة')
      await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/finance/disbursements/req-new'))
    })
    it('الرجوع من ورقة التأكيد لا يرسل شيئاً', () => {
      page()
      fireEvent.click(screen.getByTestId('cw-send'))
      fireEvent.click(screen.getByTestId('cw-send-cancel'))
      expect(screen.queryByTestId('cw-send-sheet')).toBeNull()
      expect(h.close).not.toHaveBeenCalled()
    })
    it('الشروط الناقصة تُعرض بأسمائها وبما يلزم، والزر معطَّل، ولا ملخص أرقام', () => {
      h.readiness = { ...ready, locked: false, attendance_confirmed: false, attendance_pending_auto: 4, missing_rates: 2, no_fingerprint: 1, net_total: null, gross_total: null, deductions_total: null,
        blockers: ['month_not_locked', 'attendance_not_confirmed', 'rates_missing', 'no_fingerprint'], can_send: false }
      page()
      expect(screen.getByTestId('cw-send-panel')).toHaveAttribute('data-ready', 'no')
      expect(screen.getByTestId('cw-blocker-month_not_locked')).toHaveTextContent('الشهر غير مقفل')
      expect(screen.getByTestId('cw-blocker-attendance_not_confirmed')).toHaveTextContent('4 حضور تلقائي ينتظر التأكيد')
      expect(screen.getByTestId('cw-blocker-rates_missing')).toHaveTextContent('2 متعهد بلا أجور محدَّدة')
      expect(screen.getByTestId('cw-blocker-no_fingerprint')).toHaveTextContent('1 متعهد بلا رقم بصمة')
      expect(screen.getByTestId('cw-send')).toBeDisabled()
      expect(screen.queryByTestId('cw-send-kpis')).toBeNull()
      fireEvent.click(screen.getByTestId('cw-send'))
      expect(screen.queryByTestId('cw-send-sheet')).toBeNull()
    })
    it('بلا صلاحية finance_contractor_wages_close: الزر معطَّل مع السبب ولو كان الشهر جاهزاً', () => {
      act(() => useMyPermissionsStore.getState().set('u1', { 'finance.dashboard': ['view'] }))
      page()
      expect(screen.getByTestId('cw-send')).toBeDisabled()
      expect(screen.getByTestId('cw-send-noperm')).toBeInTheDocument()
      fireEvent.click(screen.getByTestId('cw-send'))
      expect(screen.queryByTestId('cw-send-sheet')).toBeNull()
    })
    it('طلب قائم: حالته ورابطه بدل الزر، ولا يُعدّ «طلب قائم» شرط منع في القائمة', () => {
      h.readiness = { ...ready, active_request: { id: 'r1', request_no: 'DSB-2026-0007', status: 'approved', version: 1, net_total: 3640500 }, blockers: ['active_request'], can_send: false }
      page()
      expect(screen.queryByTestId('cw-send')).toBeNull()
      expect(screen.queryByTestId('cw-blockers')).toBeNull()
      expect(screen.getByTestId('cw-send-status')).toHaveTextContent('معتمد')
      expect(screen.getByTestId('cw-send-active')).toHaveTextContent('DSB-2026-0007')
      expect(screen.getByTestId('cw-send-active-link')).toHaveAttribute('href', '/finance/disbursements/r1')
    })
    it('مرفوض سابقاً: يظهر سبب الرفض والزر «إعادة الإرسال» (نسخة جديدة)', () => {
      h.readiness = { ...ready, latest_rejected: { id: 'r0', request_no: 'DSB-2026-0006', version: 1, net_total: 3640500, decision_note: 'راجعوا الحجب' } }
      page()
      expect(screen.getByTestId('cw-send-rejected-reason')).toHaveTextContent('راجعوا الحجب')
      expect(screen.getByTestId('cw-send')).toHaveTextContent('إعادة الإرسال للمدير المفوض')
      fireEvent.click(screen.getByTestId('cw-send'))
      expect(within(screen.getByTestId('cw-send-sheet')).getByTestId('cw-send-confirm')).toHaveTextContent('إعادة الإرسال للمدير المفوض')
    })
    it('تعذّر فحص الجاهزية: رسالة بإعادة المحاولة بلا زر إرسال', () => {
      h.readinessError = true
      page()
      expect(screen.getByTestId('cw-send-error')).toBeInTheDocument()
      expect(screen.queryByTestId('cw-send')).toBeNull()
      fireEvent.click(within(screen.getByTestId('cw-send-error')).getByRole('button', { name: 'إعادة المحاولة' }))
      expect(h.refetchReadiness).toHaveBeenCalledTimes(1)
    })
  })
})
