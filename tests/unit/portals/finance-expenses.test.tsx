/**
 * 00358 — وحدة «المصاريف» (المالية): الرأس بالرصيد ومصاريف النطاق، نموذج مصروف (نوع + مبلغ صحيح ≤ الرصيد + بيان) يستدعي RPC، منع تجاوز الرصيد،
 *          إدارة الأنواع (إضافة/تعديل/إيقاف؛ النظامي بلا أزرار)، السجل والإلغاء بسبب، ملخص حسب النوع.
 *          مشتريات الصيانة (المالية): قائمة الأوامر المعلّقة بـ «تم التسليم» و«إعادة بسبب»، شارة حالة الدفع، العدّادات.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import FinanceExpensesPage from '@portals/finance/pages/Expenses/FinanceExpensesPage'
import FinanceMaintenancePurchases from '@portals/finance/pages/Purchases/MaintenancePurchases'

const h = vi.hoisted(() => ({
  list: [] as unknown[], types: [] as unknown[], summary: null as unknown, purchases: [] as unknown[],
  record: vi.fn(), cancel: vi.fn(), saveType: vi.fn(), confirm: vi.fn(), txCancel: vi.fn(),
}))
vi.mock('@features/treasury/hooks', () => ({
  useExpenseTypes: () => ({ data: h.types, isLoading: false }),
  useSaveExpenseType: () => ({ mutate: h.saveType, isPending: false }),
  useExpenseRecord: () => ({ mutate: h.record, isPending: false }),
  useExpenseCancel: () => ({ mutate: h.cancel, isPending: false }),
  useTreasuryList: () => ({ data: h.list, isLoading: false }),
  useTreasurySummary: () => ({ data: h.summary, isLoading: false }),
  useTreasuryConfirm: () => ({ mutate: h.confirm, isPending: false }),
  useTreasuryCancel: () => ({ mutate: h.txCancel, isPending: false }),
}))
vi.mock('@features/vehicle-operations/hooks', () => ({ useMaintenancePurchasesFinance: () => ({ data: h.purchases, isLoading: false }) }))

const type = (o: Record<string, unknown>) => ({ id: 't1', name: 'مصاريف ورق وقرطاسية', is_active: true, is_system: false, sort_order: 10, used: 2, total_confirmed: 50000, ...o })
const tx = (o: Record<string, unknown>) => ({
  id: 'x1', ref_no: 'TR-2026-00031', kind: 'expense', amount: 35000, type_id: null, type_name: 'مصاريف ورق وقرطاسية', expense_type_id: 't1', employee_id: null, employee_name: null, employee_number: null, reward_type: null,
  details: 'أوراق A4', status: 'confirmed', affects_balance: true, needs_finance: false, created_by: 'u', created_by_name: 'المالية', created_at: '2026-10-05T08:00:00Z',
  confirmed_by: 'u', confirmed_by_name: 'المالية', confirmed_at: '2026-10-05T08:00:00Z', finance_note: null, cancelled_by: null, cancelled_by_name: null, cancelled_at: null, cancel_reason: null, ...o,
})
const po = (o: Record<string, unknown>) => ({
  order_id: 'o1', order_number: 'MP-2026-0007', supplier_name: 'مورد الكرادة', notes: null, order_date: '2026-10-06T07:00:00Z', part_category: 'mechanical', item_name: 'فلتر زيت', quantity: 4, unit: 'قطعة', unit_price: 25000, line_total: 100000,
  order_total: 280000, workshop_key: 'central', created_by_name: 'ورشة المركزية', treasury_tx_id: 'ptx1', treasury_status: 'pending', treasury_ref: 'TR-2026-00032', confirmed_at: null, ...o,
})
const r = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  h.types = [type({}), type({ id: 't2', name: 'مصاريف تشغيلية', sort_order: 20, used: 0, total_confirmed: 0 }), type({ id: 't3', name: 'ضيافة', is_active: false }), type({ id: 'ts', name: 'مشتريات صيانة', is_system: true, sort_order: 70 })]
  h.summary = { balance: 705000, frozen: 0, pending_out: 0, pending_count: 0, range: { receipts_confirmed: 1000000, receipts_pending: 0, rewards_cash_confirmed: 0, rewards_count: 0, gps_confirmed: 0, gps_pending: 0, expenses_confirmed: 50000, expenses_count: 2, purchases_confirmed: 280000, purchases_pending: 0, count: 4 }, by_type: [], expenses_by_type: [{ type_id: 't1', name: 'مصاريف ورق وقرطاسية', confirmed: 50000, count: 2 }], rewards_by_type: {}, by_month: [] }
  h.list = [tx({}), tx({ id: 'x2', ref_no: 'TR-2026-00030', amount: 15000, expense_type_id: 't2', type_name: 'مصاريف تشغيلية', details: null }), tx({ id: 'x3', amount: 150000, status: 'cancelled', cancel_reason: 'خطأ', cancelled_by_name: 'المالية', cancelled_at: '2026-10-05T09:00:00Z' })]
  h.purchases = [po({}), po({ item_name: 'بطارية', part_category: 'electrical', quantity: 1, unit_price: 180000, line_total: 180000 }), po({ order_id: 'o2', order_number: 'MP-2026-0006', order_total: 90000, treasury_tx_id: 'ptx0', treasury_status: 'confirmed', treasury_ref: 'TR-2026-00020', confirmed_at: '2026-10-02T08:00:00Z', item_name: 'زيت', line_total: 90000 })]
})

describe('00358 — المصاريف', () => {
  it('الرأس: الرصيد 705,000 ومصاريف النطاق 50,000 ومشتريات 280,000؛ السجل 3 حركات ومجموع المسجَّل 50,000؛ ملخص حسب النوع؛ زر الإلغاء للمسجَّلة فقط ويرسل السبب', () => {
    r(<FinanceExpensesPage />)
    expect(screen.getByTestId('xp-stat-balance')).toHaveTextContent('705,000'); expect(screen.getByTestId('xp-stat-range')).toHaveTextContent('50,000'); expect(screen.getByTestId('xp-stat-purchases')).toHaveTextContent('280,000'); expect(screen.getByTestId('xp-stat-count')).toHaveTextContent('3')
    expect(screen.getByTestId('xp-list-total')).toHaveTextContent('50,000')
    expect(screen.getByTestId('xp-by-type')).toHaveTextContent('مصاريف ورق وقرطاسية'); expect(screen.getByTestId('xp-by-type')).toHaveTextContent('50,000')
    expect(screen.getByTestId('tx-x1')).toHaveTextContent('مصروف'); expect(screen.getByTestId('tx-x1')).toHaveTextContent('أوراق A4')
    expect(screen.getByTestId('xp-cancel-x1')).toBeInTheDocument(); expect(screen.queryByTestId('xp-cancel-x3')).toBeNull()
    expect(screen.getByTestId('xp-filter-type')).not.toHaveTextContent('مشتريات صيانة')
    fireEvent.click(screen.getByTestId('xp-cancel-x1'))
    fireEvent.change(screen.getByTestId('reason-input'), { target: { value: 'سُجّل مرتين' } }); fireEvent.click(screen.getByTestId('reason-confirm'))
    expect(h.cancel.mock.calls[0]![0]).toEqual({ id: 'x1', reason: 'سُجّل مرتين' })
    expect(screen.getByTestId('finance-expenses-page').textContent).not.toMatch(/[٠-٩]/)
  })
  it('نموذج مصروف: أنواع فعّالة غير نظامية فقط؛ معطّل حتى اختيار نوع ومبلغ صحيح؛ تجاوز الرصيد يمنع مع تنبيه أحمر؛ الإرسال بالقيم الصحيحة', async () => {
    r(<FinanceExpensesPage />)
    fireEvent.click(screen.getByTestId('btn-new-expense'))
    expect(screen.getByTestId('expense-type-t1')).toBeInTheDocument(); expect(screen.getByTestId('expense-type-t2')).toBeInTheDocument()
    expect(screen.queryByTestId('expense-type-t3')).toBeNull(); expect(screen.queryByTestId('expense-type-ts')).toBeNull()
    expect(screen.getByTestId('expense-submit')).toBeDisabled()
    fireEvent.click(screen.getByTestId('expense-type-t1'))
    fireEvent.change(screen.getByTestId('expense-amount'), { target: { value: '800,000' } })
    expect(screen.getByTestId('expense-amount-hint')).toHaveTextContent('يتجاوز رصيد القاصة (705,000)'); expect(screen.getByTestId('expense-submit')).toBeDisabled()
    fireEvent.change(screen.getByTestId('expense-amount'), { target: { value: '35,000' } })
    expect(screen.getByTestId('expense-amount-hint')).toHaveTextContent('35,000 د.ع'); expect(screen.getByTestId('expense-submit')).toBeEnabled()
    fireEvent.change(screen.getByTestId('expense-details'), { target: { value: 'أوراق A4 — 10 رزم' } })
    fireEvent.click(screen.getByTestId('expense-submit'))
    await waitFor(() => expect(h.record).toHaveBeenCalledTimes(1))
    expect(h.record.mock.calls[0]![0]).toEqual({ typeId: 't1', amount: 35000, details: 'أوراق A4 — 10 رزم' })
  })
  it('أنواع المصاريف: إضافة، تعديل الاسم، إيقاف/تفعيل؛ النظامي يظهر موسوماً بلا أزرار', () => {
    r(<FinanceExpensesPage />)
    fireEvent.click(screen.getByTestId('btn-expense-types'))
    expect(screen.getByTestId('xt-new-submit')).toBeDisabled()
    fireEvent.change(screen.getByTestId('xt-new-name'), { target: { value: 'مصاريف إنترنت' } }); fireEvent.click(screen.getByTestId('xt-new-submit'))
    expect(h.saveType.mock.calls[0]![0]).toEqual({ name: 'مصاريف إنترنت' })
    fireEvent.click(screen.getByTestId('xt-rename-t1')); fireEvent.change(screen.getByTestId('xt-edit-t1'), { target: { value: 'قرطاسية' } }); fireEvent.click(screen.getByTestId('xt-save-t1'))
    expect(h.saveType.mock.calls[1]![0]).toEqual({ id: 't1', name: 'قرطاسية', isActive: true, sortOrder: 10 })
    fireEvent.click(screen.getByTestId('xt-toggle-t2')); expect(h.saveType.mock.calls[2]![0]).toEqual({ id: 't2', name: 'مصاريف تشغيلية', isActive: false, sortOrder: 20 })
    expect(screen.getByTestId('xt-toggle-t3')).toHaveTextContent('تفعيل')
    expect(screen.getByTestId('xt-row-ts')).toHaveTextContent('نظامي — من أوامر الشراء'); expect(screen.queryByTestId('xt-toggle-ts')).toBeNull(); expect(screen.queryByTestId('xt-rename-ts')).toBeNull()
  })
})

describe('00358 — مشتريات الصيانة (المالية): التسليم من القاصة', () => {
  it('العدّادات (معلّق 280,000 · مسلَّم 90,000 · أمران)، قائمة المعلّقة بأمر واحد، «تم التسليم» يؤكد حركة القاصة، «إعادة بسبب» تلغيها، شارة الحالة في الجدول', async () => {
    r(<FinanceMaintenancePurchases />)
    expect(screen.getByTestId('mp-stat-pending')).toHaveTextContent('280,000'); expect(screen.getByTestId('mp-stat-paid')).toHaveTextContent('90,000'); expect(screen.getByTestId('mp-stat-orders')).toHaveTextContent('2'); expect(screen.getByTestId('mp-stat-total')).toHaveTextContent('370,000')
    const p = screen.getByTestId('mp-pending-o1')
    expect(p).toHaveTextContent('MP-2026-0007'); expect(p).toHaveTextContent('TR-2026-00032'); expect(p).toHaveTextContent('ورشة المركزية'); expect(p).toHaveTextContent('280,000')
    expect(screen.queryByTestId('mp-pending-o2')).toBeNull()
    fireEvent.click(screen.getByTestId('mp-confirm-o1'))
    expect(screen.getByTestId('mp-confirm-dialog')).toHaveTextContent('سيُخصم 280,000 د.ع من رصيد القاصة')
    fireEvent.click(screen.getByTestId('mp-confirm-submit'))
    await waitFor(() => expect(h.confirm).toHaveBeenCalledTimes(1)); expect(h.confirm.mock.calls[0]![0]).toEqual({ id: 'ptx1', note: null })
    fireEvent.click(screen.getByTestId('mp-return-o1'))
    fireEvent.change(screen.getByTestId('reason-input'), { target: { value: 'الفاتورة غير مطابقة' } }); fireEvent.click(screen.getByTestId('reason-confirm'))
    expect(h.txCancel.mock.calls[0]![0]).toEqual({ id: 'ptx1', reason: 'الفاتورة غير مطابقة' })
    expect(screen.getByTestId('mp-pay-o1-0')).toHaveTextContent('بانتظار التسليم'); expect(screen.getByTestId('mp-pay-o2-2')).toHaveTextContent('سُلّم من القاصة')
  })
})
