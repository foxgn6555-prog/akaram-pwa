/**
 * 00263 — أجور المتعهدين (المالية) بالعدد المعتمد: الكشف لكل متعهد مع المعادلة المرئية، حالة اعتماد الشهر،
 * تحديد الأجرين (متعهد/عامل) مع معاينة = عامل/يوم × أجر العامل + أيام × أجر المتعهد، تفصيل الأيام، نسخ الشهر السابق، Excel، أرقام إنكليزية.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const h = vi.hoisted(() => ({
  rows: [] as unknown[], status: null as unknown, days: [] as unknown[],
  setRates: vi.fn(), copyPrev: vi.fn(), wageDays: vi.fn(async () => []),
}))
vi.mock('@features/contractors/hooks', () => ({
  useContractorWagesMonthStatus: () => ({ data: h.status }),
  useContractorWagesSheet: () => ({ data: h.rows, isLoading: false }),
  useContractorWageDays: () => ({ data: h.days, isLoading: false }),
  useSetContractorRates: () => ({ mutate: h.setRates, isPending: false }),
  useCopyPreviousRates: () => ({ mutate: h.copyPrev, isPending: false }),
}))
vi.mock('@sdk/contractors.sdk', () => ({ contractors: { wageDays: h.wageDays } }))
vi.mock('@lib/export/excel-report', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, buildExcelReport: vi.fn(async (o: unknown) => o) }
})
import ContractorWagesPage, { downloadContractorWagesExcel, summarizeWages, wageFormula } from '@portals/finance/pages/Contractors/ContractorWagesPage'
import { buildExcelReport } from '@lib/export/excel-report'

const approved = { month: '2026-03-01', approved: true, approved_source: 'contractor', approved_by_name: 'غرفة العمليات', approved_at: '2026-04-01T08:00:00Z', is_locked: true, month_ended: true }
const base = { contractor_phone: '07700000000', sector_id: 1, area_name: 'أرخيته', parent_sector: 'karrada', shift: 'morning', is_active: true, approved: true, approved_source: 'contractor', note: null, set_by_name: null, set_at: null }
// مثال المستخدم: 16 معتمد × 30 يوماً ⇒ 450 × 8,000 + 30 × 15,000 = 4,050,000
const c1 = { ...base, contractor_user_id: 'c1', contractor_name: 'متعهد أرخيته', paid_days: 30, worker_days: 450, headcount_total: 480, contractor_daily_wage: 15000, worker_daily_wage: 8000, rates_set: true, contractor_pay: 450000, workers_pay: 3600000, total_pay: 4050000, note: 'عقد 2026', set_by_name: 'محاسب', set_at: '2026-10-05T08:00:00Z' }
const c2 = { ...base, contractor_user_id: 'c2', contractor_name: 'متعهد الزعفرانية', area_name: 'الزعفرانية 2', parent_sector: 'zaafaraniya', paid_days: 5, worker_days: 0, headcount_total: 5, contractor_daily_wage: 0, worker_daily_wage: 0, rates_set: false, contractor_pay: null, workers_pay: null, total_pay: null }

describe('المالية — أجور المتعهدين بالعدد المعتمد', () => {
  it('الكشف: صف لكل متعهد بالمعادلة المرئية، من لا أجور له «غير محدد»، المجاميع، حالة الاعتماد، وأرقام إنكليزية', () => {
    h.rows = [c1, c2]; h.status = approved
    render(<MemoryRouter><ContractorWagesPage /></MemoryRouter>)
    expect(screen.getByTestId('cw-stat-contractors')).toHaveTextContent('2')
    expect(screen.getByTestId('cw-stat-days')).toHaveTextContent('35')
    expect(screen.getByTestId('cw-stat-worker-days')).toHaveTextContent('450')
    expect(screen.getByTestId('cw-stat-missing')).toHaveTextContent('1')
    expect(screen.getByTestId('cw-stat-total')).toHaveTextContent('4,050,000')
    expect(screen.getByTestId('cw-month-status')).toHaveTextContent('الجهة المعتمدة: المتعهد')
    expect(screen.getByTestId('cw-payable-c1')).toHaveTextContent('4,050,000')
    expect(screen.getByTestId('cw-formula-c1')).toHaveTextContent('450 عامل/يوم × 8,000 + 30 يوم × 15,000')
    expect(screen.getByTestId('cw-row-c1')).toHaveTextContent('قاطع الكرادة / أرخيته')
    expect(screen.getByTestId('cw-row-c2')).toHaveTextContent('غير محدد')
    expect(screen.getByTestId('cw-formula-c2')).toHaveTextContent('حدِّد الأجور')
    expect(screen.getByTestId('cw-total')).toHaveTextContent('4,050,000')
    expect(screen.getByTestId('contractor-wages-page').textContent).not.toMatch(/[\u0660-\u0669]/)
    const t = summarizeWages([c1, c2] as never)
    expect(t).toMatchObject({ contractors: 2, paidDays: 35, workerDays: 450, contractorPay: 450000, workersPay: 3600000, total: 4050000, missingRates: 1 })
  })
  it('الشهر غير المعتمد: تنبيه «غير معتمد» ولا مستحق حتى لو حُددت الأجور', () => {
    h.rows = [{ ...c1, approved: false, approved_source: null, paid_days: 0, worker_days: 0, contractor_pay: null, workers_pay: null, total_pay: null }]
    h.status = { ...approved, approved: false, approved_source: null, is_locked: false }
    render(<MemoryRouter><ContractorWagesPage /></MemoryRouter>)
    expect(screen.getByTestId('cw-month-status')).toHaveTextContent('غير معتمد')
    expect(screen.getByTestId('cw-payable-c1')).toHaveTextContent('—')
    expect(screen.getByTestId('cw-formula-c1')).toHaveTextContent('بانتظار اعتماد غرفة العمليات')
    expect(screen.getByTestId('cw-stat-total')).toHaveTextContent('0')
    expect(wageFormula({ ...c1, approved: false } as never)).toBe('بانتظار اعتماد غرفة العمليات')
  })
  it('تحديد الأجرين: المعاينة = عامل/يوم × أجر العامل + أيام × أجر المتعهد ثم يرسل contractorId/month/contractorDaily/workerDaily/note', async () => {
    h.rows = [c2]; h.status = approved
    render(<MemoryRouter><ContractorWagesPage /></MemoryRouter>)
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
  it('تفصيل الأيام: يوم بعدد 16 ⇒ 15 عاملاً و135,000، ويوم بلا عدد ⇒ «لا أجر»', () => {
    h.rows = [c1]; h.status = approved
    h.days = [
      { log_date: '2026-03-01', headcount: 16, workers: 15, contractor_pay: 15000, workers_pay: 120000, day_pay: 135000, edit_reason: null },
      { log_date: '2026-03-31', headcount: null, workers: null, contractor_pay: null, workers_pay: null, day_pay: null, edit_reason: null },
    ]
    render(<MemoryRouter><ContractorWagesPage /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('cw-days-btn-c1'))
    const d = screen.getByTestId('cw-days-c1-detail')
    expect(d).toHaveTextContent('2026-03-01'); expect(d).toHaveTextContent('135,000'); expect(d).toHaveTextContent('120,000'); expect(d).toHaveTextContent('لا أجر')
  })
  it('نسخ أجور الشهر السابق يطلب تأكيداً ثم يستدعي الهوك؛ Excel يبني الكشف + ورقة أيام لكل متعهد بصف إجمالي', async () => {
    h.rows = [c1, c2]; h.status = approved
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<MemoryRouter><ContractorWagesPage /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('cw-copy-prev'))
    expect(h.copyPrev).toHaveBeenCalledTimes(1)
    await downloadContractorWagesExcel('2026-03-01', approved as never, [c1, c2] as never, [{ name: 'متعهد أرخيته', days: [{ log_date: '2026-03-01', headcount: 16, workers: 15, contractor_pay: 15000, workers_pay: 120000, day_pay: 135000, edit_reason: null }] as never }])
    const o = (buildExcelReport as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)![0] as Record<string, unknown>
    expect(o.fileName).toBe('أجور-المتعهدين-2026-03.xlsx')
    expect(String(o.meta)).toContain('الجهة المعتمدة: المتعهد'); expect(String(o.meta)).toContain('(العدد − 1) × أجر العامل + أجر المتعهد')
    expect(o.rows).toHaveLength(2)
    expect((o.rows as Record<string, unknown>[])[0]).toMatchObject({ paid: 30, wd: 450, wp: 3600000, cp: 450000, tp: 4050000, parent: 'قاطع الكرادة' })
    expect((o.totalRow as Record<string, unknown>).tp).toBe(4050000)
    const extra = (o.extraSheets as Record<string, unknown>[])
    expect(extra).toHaveLength(1); expect((extra[0]!.rows as unknown[])).toHaveLength(1); expect((extra[0]!.totalRow as Record<string, unknown>).dp).toBe(135000)
  })
})
