/**
 * القاصة (المالية) بعد مسار الصرف: نوعا الحركة الجديدان «رواتب الموظفين» و«أجور المتعهدين» —
 * تسميتهما ولونهما وعبارة تأكيدهما، ظهورهما في ملخص النطاق وفي جدول الأشهر، وخصمهما من صافي Excel كأي مصروف خارج.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const h = vi.hoisted(() => ({ list: [] as unknown[], summary: null as unknown, listArgs: [] as Record<string, unknown>[] }))
vi.mock('@features/treasury/hooks', () => ({
  useTreasuryList: (f: Record<string, unknown>) => { h.listArgs.push(f); return { data: f.status === 'pending' && !f.kind ? [] : h.list, isLoading: false } },
  useTreasurySummary: () => ({ data: h.summary, isLoading: false }),
  useTreasuryConfirm: () => ({ mutate: vi.fn(), isPending: false }),
  useTreasuryCancel: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@lib/export/excel-report', async (importOriginal) => ({ ...((await importOriginal()) as Record<string, unknown>), buildExcelReport: vi.fn(async (o: unknown) => o) }))
import FinanceTreasuryPage from '@portals/finance/pages/Budget/BudgetOverview'
import { downloadTreasuryExcel, TxCard, txHasAmount, txTitle } from '@features/treasury/components/TreasuryShared'
import { CONFIRM_LABEL, TREASURY_KIND_LABEL } from '@sdk/treasury.sdk'
import { buildExcelReport } from '@lib/export/excel-report'

const tx = (o: Record<string, unknown> = {}) => ({
  id: 'id', ref_no: 'TR-2026-00009', kind: 'payroll', amount: 38450000, type_id: null, type_name: null, employee_id: null, employee_name: null, employee_number: null, reward_type: null,
  details: 'رواتب تشرين الأول 2026 — الطلب DSB-2026-0001', status: 'confirmed', affects_balance: true, needs_finance: true, created_by: 'f1', created_by_name: 'المحاسب علي', created_at: '2026-11-17T11:00:00Z',
  confirmed_by: 'f1', confirmed_by_name: 'المحاسب علي', confirmed_at: '2026-11-17T11:00:00Z', finance_note: null, cancelled_by: null, cancelled_by_name: null, cancelled_at: null, cancel_reason: null, ...o,
})
const summary = {
  balance: 11550000, frozen: 0, pending_out: 0, pending_count: 0,
  range: { receipts_confirmed: 50000000, receipts_pending: 0, rewards_cash_confirmed: 0, rewards_count: 0, gps_confirmed: 0, gps_pending: 0, payroll_confirmed: 38450000, contractor_wages_confirmed: 7800000, count: 3 },
  by_type: [], rewards_by_type: {},
  by_month: [{ month: '2026-11', receipts: 50000000, rewards: 0, gps: 0, payroll: 38450000, contractor_wages: 7800000 }],
}
beforeEach(() => { h.list = []; h.summary = summary; h.listArgs = [] })
const page = () => render(<MemoryRouter><FinanceTreasuryPage /></MemoryRouter>)

describe('القاصة — نوعا الصرف الجديدان', () => {
  it('التسمية وعبارة التأكيد معرّفتان للنوعين (لا undefined في أي واجهة تفرد الأنواع)', () => {
    expect(TREASURY_KIND_LABEL.payroll).toBe('رواتب الموظفين'); expect(TREASURY_KIND_LABEL.contractor_wages).toBe('أجور المتعهدين')
    expect(CONFIRM_LABEL.payroll).toBe('تم الصرف'); expect(CONFIRM_LABEL.contractor_wages).toBe('تم الصرف')
    for (const k of Object.keys(TREASURY_KIND_LABEL)) { expect(TREASURY_KIND_LABEL[k as keyof typeof TREASURY_KIND_LABEL], k).toBeTruthy(); expect(CONFIRM_LABEL[k as keyof typeof CONFIRM_LABEL], k).toBeTruthy() }
  })
  it('ملخص النطاق: صفّان للرواتب والأجور بمبلغيهما الإنكليزيين، وجدول الأشهر بعمودين جديدين', () => {
    page()
    expect(screen.getByTestId('tr-payroll-confirmed')).toHaveTextContent('38,450,000')
    expect(screen.getByTestId('tr-contractor-wages-confirmed')).toHaveTextContent('7,800,000')
    const t = screen.getByTestId('tr-by-month')
    const heads = within(t).getAllByRole('columnheader').map((c) => c.textContent)
    expect(heads).toEqual(['الشهر', 'مقبوضات', 'مكافآت', 'GPS', 'رواتب', 'أجور المتعهدين'])
    const cells = within(t).getAllByRole('row')[1]!.textContent
    expect(cells).toContain('2026-11'); expect(cells).toContain('38,450,000'); expect(cells).toContain('7,800,000')
    expect(screen.getByTestId('finance-treasury-page').textContent).not.toMatch(/[\u0660-\u0669]/)
  })
  it('خادم قديم بلا الحقلين الجديدين ⇒ أصفار لا NaN ولا undefined', () => {
    h.summary = { ...summary, range: { receipts_confirmed: 1, receipts_pending: 0, rewards_cash_confirmed: 0, rewards_count: 0, gps_confirmed: 0, gps_pending: 0, count: 1 }, by_month: [{ month: '2026-10', receipts: 1, rewards: 0, gps: 0 }] }
    page()
    expect(screen.getByTestId('tr-payroll-confirmed')).toHaveTextContent('0'); expect(screen.getByTestId('tr-contractor-wages-confirmed')).toHaveTextContent('0')
    const text = screen.getByTestId('tr-range-summary').textContent ?? ''
    expect(text).not.toMatch(/NaN|undefined/)
  })
  it('مرشّح النوع يعرض النوعين الجديدين ويمرّر قيمتهما للقارئ', () => {
    page()
    const sel = screen.getByTestId('tr-filter-kind')
    const opts = within(sel).getAllByRole('option').map((o) => [o.getAttribute('value'), o.textContent])
    expect(opts).toContainEqual(['payroll', 'رواتب الموظفين']); expect(opts).toContainEqual(['contractor_wages', 'أجور المتعهدين'])
    fireEvent.change(sel, { target: { value: 'contractor_wages' } })
    expect(h.listArgs.at(-1)).toMatchObject({ kind: 'contractor_wages' })
  })
  it('بطاقة الحركة: عنوانها تسمية النوع (لا نوع مستحقات)، المبلغ ظاهر، ولا شيء عن مكافأة', () => {
    const t = tx(); const t2 = tx({ id: 'w', kind: 'contractor_wages', ref_no: 'TR-2026-00010', amount: 7800000, details: 'أجور المتعهدين آذار 2026 — الطلب DSB-2026-0002' })
    expect(txTitle(t as never)).toBe('رواتب الموظفين'); expect(txTitle(t2 as never)).toBe('أجور المتعهدين')
    expect(txHasAmount(t as never)).toBe(true)
    const { container } = render(<TxCard tx={t as never} />)
    expect(container).toHaveTextContent('رواتب الموظفين'); expect(container).toHaveTextContent('TR-2026-00009'); expect(container).toHaveTextContent('38,450,000'); expect(container).toHaveTextContent('الطلب DSB-2026-0001'); expect(container).toHaveTextContent('تم الصرف')
    expect(container).not.toHaveTextContent('الرقم الوظيفي')
    expect(container.querySelector('p.text-indigo-700')).not.toBeNull()   // لون النوع (لا يسقط على undefined)
    const r2 = render(<TxCard tx={t2 as never} />)
    expect(r2.container.querySelector('p.text-teal-700')).not.toBeNull()
  })
  it('Excel: الصرفان يُخصمان من الصافي كأي مبلغ خارج (المقبوضات − الصرف)', async () => {
    await downloadTreasuryExcel([tx({ id: 'r', kind: 'receipt', amount: 50000000, type_name: 'مستحقات' }), tx({ id: 'p' }), tx({ id: 'w', kind: 'contractor_wages', amount: 7800000 })] as never, { title: 'القاصة', sub: 'الشؤون المالية', fileName: 'القاصة.xlsx' })
    const o = (buildExcelReport as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)![0] as { rows: Record<string, unknown>[]; totalRow: Record<string, unknown> }
    expect(o.rows).toHaveLength(3)
    expect(o.rows.map((x) => x.kind)).toEqual(['استلام مبلغ', 'رواتب الموظفين', 'أجور المتعهدين'])
    expect(o.totalRow.amount).toBe(50000000 - 38450000 - 7800000)
    expect(o.totalRow.amount).toBe(3750000)
  })
})
