/**
 * 00188 — أجور عمال المتعهدين (المالية): الكشف الشهري مجمّعاً حسب المتعهد، تحديد الأجر (يومي × الحضور / شهري ثابت)،
 * المعاينة قبل الحفظ، نسخ الشهر السابق، Excel، والأرقام إنكليزية.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const h = vi.hoisted(() => ({
  rows: [] as unknown[],
  setWage: vi.fn(), copyPrev: vi.fn(),
}))
vi.mock('@features/contractors/hooks', () => ({
  useContractorWagesSheet: () => ({ data: h.rows, isLoading: false }),
  useSetContractorWage: () => ({ mutate: h.setWage, isPending: false }),
  useCopyPreviousWages: () => ({ mutate: h.copyPrev, isPending: false }),
}))
vi.mock('@lib/export/excel-report', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, buildExcelReport: vi.fn(async (o: unknown) => o) }
})
import ContractorWagesPage, { downloadContractorWagesExcel, groupWagesByContractor } from '@portals/finance/pages/Contractors/ContractorWagesPage'
import { buildExcelReport } from '@lib/export/excel-report'

const base = { contractor_user_id: 'c1', contractor_name: 'متعهد أرخيته', sector_id: 1, area_name: 'أرخيته', parent_sector: 'الكرادة', phone: null, is_active: true, absent_days: 1, marked_days: 5, contractor_checkins: 5, monthly_wage: 0, daily_wage: 0, note: null, set_by_name: null, set_at: null }
const w1 = { ...base, worker_id: 'w1', full_name: 'عامل واحد', present_days: 4, wage_mode: 'daily', daily_wage: 25000, payable: 100000, note: 'اتفاق', set_by_name: 'محاسب', set_at: '2026-10-05T08:00:00Z' }
const w2 = { ...base, worker_id: 'w2', full_name: 'عامل اثنان', present_days: 2, wage_mode: 'monthly', payable: null }
const w3 = { ...base, contractor_user_id: 'c2', contractor_name: 'متعهد الزعفرانية', area_name: 'الزعفرانية 2', parent_sector: 'الزعفرانية', worker_id: 'w3', full_name: 'عامل ثلاثة', present_days: 3, wage_mode: 'monthly', monthly_wage: 600000, payable: 600000 }

describe('المالية — أجور عمال المتعهدين', () => {
  it('الكشف مجمّع حسب المتعهد مع مجاميع، ويُعلّم العامل بلا أجر، ويحسب المستحق الكلي بأرقام إنكليزية', () => {
    h.rows = [w1, w2, w3]
    render(<MemoryRouter><ContractorWagesPage /></MemoryRouter>)
    expect(screen.getByTestId('cw-stat-workers')).toHaveTextContent('3')
    expect(screen.getByTestId('cw-stat-missing')).toHaveTextContent('1')
    expect(screen.getByTestId('cw-stat-total')).toHaveTextContent('700,000')
    expect(screen.getByTestId('cw-group-c1')).toHaveTextContent('متعهد أرخيته'); expect(screen.getByTestId('cw-group-c1')).toHaveTextContent('100,000'); expect(screen.getByTestId('cw-group-c1')).toHaveTextContent('1 بلا أجر محدد')
    expect(screen.getByTestId('cw-payable-w1')).toHaveTextContent('100,000'); expect(screen.getByTestId('cw-payable-w1')).toHaveTextContent('25,000 × 4 يوم')
    expect(screen.getByTestId('cw-row-w2')).toHaveTextContent('غير محدد')
    expect(screen.getByTestId('cw-total')).toHaveTextContent('700,000')
    expect(screen.getByTestId('contractor-wages-page').textContent).not.toMatch(/[\u0660-\u0669]/)
    const g = groupWagesByContractor([w1, w2, w3] as never)
    expect(g).toHaveLength(2); expect(g[0]!.payable).toBe(100000); expect(g[0]!.missing).toBe(1); expect(g[1]!.payable).toBe(600000)
  })
  it('تحديد الأجر: يومي يعرض معاينة = الأجر × أيام الحضور ثم يرسل workerId/month/mode/amount/note؛ الشهري ثابت', async () => {
    h.rows = [w2]
    render(<MemoryRouter><ContractorWagesPage /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('cw-edit-w2'))
    expect(screen.getByTestId('cw-save')).toBeDisabled()
    fireEvent.change(screen.getByTestId('cw-amount'), { target: { value: '20000' } })
    expect(screen.getByTestId('cw-preview')).toHaveTextContent('40,000')
    fireEvent.change(screen.getByTestId('cw-mode'), { target: { value: 'monthly' } })
    expect(screen.getByTestId('cw-preview')).toHaveTextContent('20,000')
    fireEvent.change(screen.getByTestId('cw-note'), { target: { value: 'عقد شهري' } })
    fireEvent.click(screen.getByTestId('cw-save'))
    await waitFor(() => expect(h.setWage).toHaveBeenCalledTimes(1))
    const sent = h.setWage.mock.calls[0]![0] as Record<string, unknown>
    expect(sent.workerId).toBe('w2'); expect(sent.mode).toBe('monthly'); expect(sent.amount).toBe(20000); expect(sent.note).toBe('عقد شهري'); expect(String(sent.month)).toMatch(/^\d{4}-\d{2}-01$/)
  })
  it('نسخ أجور الشهر السابق يطلب تأكيداً ثم يستدعي الهوك؛ Excel يبني ورقتين (العمال + حسب المتعهد) بصف إجمالي', async () => {
    h.rows = [w1, w3]
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<MemoryRouter><ContractorWagesPage /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('cw-copy-prev'))
    expect(confirm).toHaveBeenCalled(); expect(h.copyPrev).toHaveBeenCalledTimes(1)
    confirm.mockRestore()
    await downloadContractorWagesExcel('2026-10-01', [w1, w3] as never)
    const opts = (buildExcelReport as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)![0] as { rows: Record<string, unknown>[]; totalRow: Record<string, unknown>; extraSheets: { rows: Record<string, unknown>[] }[]; fileName: string }
    expect(opts.rows).toHaveLength(2); expect(opts.rows[0]!.payable).toBe(100000); expect(opts.totalRow.payable).toBe(700000)
    expect(opts.extraSheets[0]!.rows).toHaveLength(2); expect(opts.fileName).toContain('2026-10')
  })
})
