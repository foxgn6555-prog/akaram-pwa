/**
 * 00189 — القاصة: وحدات المدير التنفيذي (مستحقات/مكافآت/GPS/فعاليات) + صفحة القاصة في المالية
 *  · الزرّان عند الدخول · الاستلام يرسل المبلغ والنوع فقط (الباقي تلقائي) · إدارة الأنواع
 *  · المكافأة: النقدية تتطلب مبلغاً؛ كتاب الشكر لا يمرّ بالمالية · GPS اسم الحركة ثابت
 *  · المالية: زر التأكيد بحسب النوع (تأكيد الاستلام/تم التسليم/تم الدفع) والإعادة بسبب · Excel · أرقام إنكليزية
 *  · الفعاليات: الفلاتر والبحث وفتح العارض للقراءة فقط مع طباعة وتصدير
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const h = vi.hoisted(() => ({
  list: [] as unknown[], pendingList: [] as unknown[], types: [] as unknown[], summary: null as unknown, designs: [] as unknown[],
  record: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), saveType: vi.fn(),
}))
vi.mock('@features/treasury/hooks', () => ({
  useReceivableTypes: () => ({ data: h.types, isLoading: false }),
  useSaveReceivableType: () => ({ mutate: h.saveType, isPending: false }),
  useTreasuryList: (f: { status?: string | null; kind?: string | null }) => ({ data: f.status === 'pending' && !f.kind ? h.pendingList : h.list, isLoading: false }),
  useTreasurySummary: () => ({ data: h.summary, isLoading: false }),
  useEmployeeLookup: (q: string) => ({ data: q ? [{ id: 'e1', full_name: 'علي مكافأة', employee_number: 'EX-4', job_title: 'سائق', department_name: 'النقل' }] : [] }),
  useCompletedDesigns: () => ({ data: h.designs, isLoading: false }),
  useTreasuryRecord: () => ({ mutate: h.record, isPending: false }),
  useTreasuryConfirm: () => ({ mutate: h.confirm, isPending: false }),
  useTreasuryCancel: () => ({ mutate: h.cancel, isPending: false }),
}))
vi.mock('@features/media/hooks', () => ({
  useSignedPhotoUrls: () => ({ data: {} }),
  useDesignDetail: (id: string | null) => ({ isLoading: false, data: id ? { design: { id, title: 'حملة نظافة الكرادة', sector_parent: 'karrada', period_type: 'daily', period_start: '2026-10-01', period_end: '2026-10-01', cover_image_path: null, summary: null, template_colors: null, template_style: null }, sheets: [{ work_type: 'رفع أنقاض', sheet_text: 'نص الورقة' }], photos: [{ photo_id: 'p1', work_type: 'رفع أنقاض', storage_path: 'x/p1.jpg', caption: null, report_caption: null, display_fit: 'contain', display_zoom: 1 }] } : undefined }),
}))
vi.mock('@portals/media/pages/Designs/DesignReportView', () => ({ default: (p: { title: string; onSaveReport?: unknown; groups: unknown[] }) => <div data-testid="report-view" data-editable={String(Boolean(p.onSaveReport))}>{p.title} · {p.groups.length} مجموعة</div> }))
vi.mock('@portals/media/pages/Designs/DesignExportMenu', () => ({ default: (p: { title: string }) => <button data-testid="export-menu">تصدير {p.title}</button> }))
vi.mock('@lib/export/excel-report', async (importOriginal) => ({ ...((await importOriginal()) as Record<string, unknown>), buildExcelReport: vi.fn(async (o: unknown) => o) }))

import ExecReceivablesPage from '@portals/executive/pages/Treasury/ExecReceivablesPage'
import ExecRewardsPage from '@portals/executive/pages/Treasury/ExecRewardsPage'
import ExecGpsPaymentsPage from '@portals/executive/pages/Treasury/ExecGpsPaymentsPage'
import ExecEventsPage from '@portals/executive/pages/Treasury/ExecEventsPage'
import FinanceTreasuryPage from '@portals/finance/pages/Budget/BudgetOverview'
import { downloadTreasuryExcel } from '@features/treasury/components/TreasuryShared'
import { buildExcelReport } from '@lib/export/excel-report'

const tx = (o: Record<string, unknown>) => ({ id: 'id', ref_no: 'TR-2026-00001', kind: 'receipt', amount: 2500000, type_id: 't1', type_name: 'مستحقات دائرة بلدية الكرادة', employee_id: null, employee_name: null, employee_number: null, reward_type: null, details: 'وصل 77', status: 'pending', affects_balance: true, needs_finance: true, created_by: 'u', created_by_name: 'المدير التنفيذي', created_at: '2026-10-06T09:30:00Z', confirmed_by: null, confirmed_by_name: null, confirmed_at: null, finance_note: null, cancelled_by: null, cancelled_by_name: null, cancelled_at: null, cancel_reason: null, ...o })
const summary = { balance: 1700000, frozen: 2500000, pending_out: 300000, pending_count: 2, range: { receipts_confirmed: 2500000, receipts_pending: 2500000, rewards_cash_confirmed: 500000, rewards_count: 3, gps_confirmed: 300000, gps_pending: 300000, count: 7 }, by_type: [{ type_id: 't1', name: 'مستحقات دائرة بلدية الكرادة', confirmed: 2500000, pending: 2500000, count: 2 }], rewards_by_type: { cash: 1, gift: 1, thanks_letter: 1 }, by_month: [{ month: '2026-10', receipts: 2500000, rewards: 500000, gps: 300000 }] }
const r = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

beforeEach(() => { h.list = []; h.pendingList = []; h.types = [{ id: 't1', name: 'مستحقات دائرة بلدية الكرادة', is_active: true, sort_order: 20 }, { id: 't0', name: 'مستحقات الدائرة الإدارية — أمانة بغداد', is_active: true, sort_order: 10 }]; h.summary = summary; h.designs = []; vi.clearAllMocks() })

describe('المدير التنفيذي — مستحقات الشركة', () => {
  it('عند الدخول زرّان؛ الاستلام يرسل المبلغ والنوع فقط (التاريخ/المنفّذ تلقائيان) والإحصاءات بأرقام إنكليزية', async () => {
    h.list = [tx({ id: 'a' }), tx({ id: 'b', status: 'confirmed', confirmed_by_name: 'محاسب', confirmed_at: '2026-10-06T10:00:00Z', finance_note: 'استُلم نقداً' })]
    r(<ExecReceivablesPage />)
    expect(screen.getByTestId('btn-receive')).toHaveTextContent('استلام مبالغ'); expect(screen.getByTestId('btn-types')).toHaveTextContent('إضافة مستحقات')
    expect(screen.queryByTestId('receive-form')).toBeNull()
    fireEvent.click(screen.getByTestId('btn-receive'))
    expect(screen.getByTestId('receive-submit')).toBeDisabled()
    fireEvent.change(screen.getByTestId('receive-amount'), { target: { value: '2500000' } })
    fireEvent.change(screen.getByTestId('receive-type'), { target: { value: 't1' } })
    fireEvent.change(screen.getByTestId('receive-details'), { target: { value: 'وصل 77' } })
    fireEvent.click(screen.getByTestId('receive-submit'))
    await waitFor(() => expect(h.record).toHaveBeenCalledTimes(1))
    expect(h.record.mock.calls[0]![0]).toEqual({ kind: 'receipt', amount: 2500000, typeId: 't1', details: 'وصل 77' })
    expect(screen.getByTestId('rc-stat-balance')).toHaveTextContent('1,700,000'); expect(screen.getByTestId('rc-stat-frozen')).toHaveTextContent('2,500,000')
    expect(screen.getByTestId('tx-a')).toHaveTextContent('بانتظار المالية'); expect(screen.getByTestId('tx-b')).toHaveTextContent('مؤكَّدة'); expect(screen.getByTestId('tx-b')).toHaveTextContent('محاسب'); expect(screen.getByTestId('tx-b')).toHaveTextContent('استُلم نقداً')
    expect(screen.getByTestId('rc-cancel-a')).toBeInTheDocument(); expect(screen.queryByTestId('rc-cancel-b')).toBeNull()
    expect(screen.getByTestId('exec-receivables-page').textContent).not.toMatch(/[\u0660-\u0669]/)
  })
  it('إدارة الأنواع: إضافة بترتيب تالٍ، تعديل الاسم، إيقاف/تفعيل؛ وإلغاء المعلّق يتطلب سبباً', async () => {
    h.list = [tx({ id: 'a' })]
    r(<ExecReceivablesPage />)
    fireEvent.click(screen.getByTestId('btn-types'))
    fireEvent.change(screen.getByTestId('type-name'), { target: { value: 'مستحقات بلدية الزعفرانية' } })
    fireEvent.click(screen.getByTestId('type-add'))
    expect(h.saveType.mock.calls[0]![0]).toEqual({ name: 'مستحقات بلدية الزعفرانية', sortOrder: 30 })
    fireEvent.click(screen.getByTestId('type-toggle-t1'))
    expect(h.saveType.mock.calls[1]![0]).toMatchObject({ id: 't1', isActive: false })
    fireEvent.click(screen.getByTestId('type-edit-t0'))
    fireEvent.change(screen.getByTestId('type-edit-input-t0'), { target: { value: 'مستحقات أمانة بغداد' } })
    fireEvent.submit(screen.getByTestId('type-edit-input-t0').closest('form')!)
    expect(h.saveType.mock.calls[2]![0]).toMatchObject({ id: 't0', name: 'مستحقات أمانة بغداد' })
    fireEvent.click(screen.getByTestId('rc-cancel-a'))
    expect(screen.getByTestId('reason-confirm')).toBeDisabled()
    fireEvent.change(screen.getByTestId('reason-input'), { target: { value: 'سُجّل بالخطأ' } })
    fireEvent.click(screen.getByTestId('reason-confirm'))
    await waitFor(() => expect(h.cancel).toHaveBeenCalledWith({ id: 'a', reason: 'سُجّل بالخطأ' }, expect.anything()))
  })
})

describe('المدير التنفيذي — المكافآت و GPS', () => {
  it('المكافأة النقدية تتطلب موظفاً ومبلغاً وتُبلَّغ المالية؛ كتاب الشكر يتطلب تفاصيل ولا يمرّ بالمالية', async () => {
    r(<ExecRewardsPage />)
    fireEvent.click(screen.getByTestId('btn-new-reward'))
    expect(screen.getByTestId('reward-submit')).toBeDisabled()
    fireEvent.change(screen.getByTestId('emp-picker-input'), { target: { value: 'علي' } })
    fireEvent.click(await screen.findByTestId('emp-picker-opt-e1'))
    expect(screen.getByTestId('emp-picker-selected')).toHaveTextContent('علي مكافأة')
    expect(screen.getByTestId('reward-hint')).toHaveTextContent('تم التسليم'); expect(screen.getByTestId('reward-hint')).toHaveTextContent('غير مرتبطة بالراتب')
    expect(screen.getByTestId('reward-submit')).toBeDisabled()
    fireEvent.change(screen.getByTestId('reward-amount'), { target: { value: '500000' } })
    fireEvent.click(screen.getByTestId('reward-submit'))
    await waitFor(() => expect(h.record).toHaveBeenCalledTimes(1))
    expect(h.record.mock.calls[0]![0]).toEqual({ kind: 'reward', employeeId: 'e1', rewardType: 'cash', amount: 500000, details: null })
    // كتاب شكر (النموذج ما زال مفتوحاً لأن الـ mutate وهمي)
    fireEvent.click(screen.getByTestId('emp-picker-clear'))
    fireEvent.change(screen.getByTestId('emp-picker-input'), { target: { value: 'علي' } })
    fireEvent.click(await screen.findByTestId('emp-picker-opt-e1'))
    fireEvent.click(screen.getByTestId('reward-type-thanks_letter'))
    expect(screen.queryByTestId('reward-amount')).toBeNull()
    expect(screen.getByTestId('reward-hint')).toHaveTextContent('لا تمرّ بالمالية')
    expect(screen.getByTestId('reward-submit')).toBeDisabled()
    fireEvent.change(screen.getByTestId('reward-details'), { target: { value: 'كتاب شكر لجهوده' } })
    fireEvent.click(screen.getByTestId('reward-submit'))
    await waitFor(() => expect(h.record).toHaveBeenCalledTimes(2))
    expect(h.record.mock.calls[1]![0]).toEqual({ kind: 'reward', employeeId: 'e1', rewardType: 'thanks_letter', amount: null, details: 'كتاب شكر لجهوده' })
  })
  it('قائمة المكافآت تعرض اسم الموظف والنوع، وتخفي المبلغ لغير النقدية، وفلتر النوع يعمل', () => {
    h.list = [tx({ id: 'c', kind: 'reward', employee_name: 'علي مكافأة', employee_number: 'EX-4', reward_type: 'cash', amount: 500000, type_name: null }), tx({ id: 'g', kind: 'reward', employee_name: 'حسن', reward_type: 'gift', amount: 0, affects_balance: false, type_name: null, details: 'ساعة يد' }), tx({ id: 'l', kind: 'reward', employee_name: 'حسن', reward_type: 'thanks_letter', amount: 0, affects_balance: false, needs_finance: false, status: 'confirmed', type_name: null, details: 'كتاب شكر' })]
    r(<ExecRewardsPage />)
    expect(screen.getByTestId('tx-c')).toHaveTextContent('علي مكافأة · مبلغ نقدي'); expect(screen.getByTestId('tx-amount-c')).toHaveTextContent('500,000')
    expect(screen.queryByTestId('tx-amount-g')).toBeNull(); expect(screen.getByTestId('tx-g')).toHaveTextContent('هدية')
    expect(screen.getByTestId('tx-l')).toHaveTextContent('مسجَّلة')
    expect(screen.getByTestId('rw-stat-count')).toHaveTextContent('3'); expect(screen.getByTestId('rw-stat-cash')).toHaveTextContent('500,000')
    fireEvent.change(screen.getByTestId('rw-filter-type'), { target: { value: 'gift' } })
    expect(screen.queryByTestId('tx-c')).toBeNull(); expect(screen.getByTestId('tx-g')).toBeInTheDocument()
  })
  it('GPS: اسم الحركة ثابت ومعطّل، ويُرسل المبلغ فقط', async () => {
    r(<ExecGpsPaymentsPage />)
    expect(screen.getByTestId('gps-type-name')).toHaveValue('تسديد مستحقات GPS'); expect(screen.getByTestId('gps-type-name')).toBeDisabled()
    expect(screen.getByTestId('gps-submit')).toBeDisabled()
    fireEvent.change(screen.getByTestId('gps-amount'), { target: { value: '300,000' } })
    fireEvent.click(screen.getByTestId('gps-submit'))
    await waitFor(() => expect(h.record).toHaveBeenCalledTimes(1))
    expect(h.record.mock.calls[0]![0]).toEqual({ kind: 'gps_payment', amount: 300000, details: null })
    expect(screen.getByTestId('gps-stat-pending')).toHaveTextContent('300,000')
  })
})

describe('المالية — القاصة', () => {
  it('الرصيد والمجمّد، وزر التأكيد بحسب النوع، والتأكيد يرسل الملاحظة، والإعادة تتطلب سبباً', async () => {
    h.pendingList = [tx({ id: 'a' }), tx({ id: 'c', kind: 'reward', employee_name: 'علي', reward_type: 'cash', amount: 500000, type_name: null }), tx({ id: 'p', kind: 'gps_payment', type_name: 'تسديد مستحقات GPS', amount: 300000 }), tx({ id: 'l', kind: 'reward', reward_type: 'thanks_letter', needs_finance: false, status: 'confirmed', amount: 0, affects_balance: false })]
    h.list = [tx({ id: 'b', status: 'confirmed' })]
    r(<FinanceTreasuryPage />)
    expect(screen.getByTestId('tr-stat-balance')).toHaveTextContent('1,700,000'); expect(screen.getByTestId('tr-stat-frozen')).toHaveTextContent('2,500,000'); expect(screen.getByTestId('tr-stat-pending-count')).toHaveTextContent('3')
    expect(screen.getByTestId('tr-confirm-a')).toHaveTextContent('تأكيد الاستلام'); expect(screen.getByTestId('tr-confirm-c')).toHaveTextContent('تم التسليم'); expect(screen.getByTestId('tr-confirm-p')).toHaveTextContent('تم الدفع')
    expect(within(screen.getByTestId('tr-pending-list')).queryByTestId('tx-l')).toBeNull()   // كتاب الشكر لا يحتاج المالية
    fireEvent.click(screen.getByTestId('tr-confirm-a'))
    expect(screen.getByTestId('tr-confirm-dialog')).toHaveTextContent('سيُضاف المبلغ إلى رصيد القاصة')
    fireEvent.change(screen.getByTestId('tr-confirm-note'), { target: { value: 'استُلم نقداً' } })
    fireEvent.click(screen.getByTestId('tr-confirm-submit'))
    await waitFor(() => expect(h.confirm).toHaveBeenCalledWith({ id: 'a', note: 'استُلم نقداً' }, expect.anything()))
    fireEvent.click(screen.getByTestId('tr-return-p'))
    fireEvent.change(screen.getByTestId('reason-input'), { target: { value: 'ينقصه الوصل' } })
    fireEvent.click(screen.getByTestId('reason-confirm'))
    await waitFor(() => expect(h.cancel).toHaveBeenCalledWith({ id: 'p', reason: 'ينقصه الوصل' }, expect.anything()))
    expect(screen.getByTestId('tr-by-month')).toHaveTextContent('2026-10')
    expect(screen.getByTestId('finance-treasury-page').textContent).not.toMatch(/[\u0660-\u0669]/)
  })
  it('Excel: صف لكل حركة وصافي المؤكَّد (مقبوضات − مكافآت نقدية − GPS)', async () => {
    await downloadTreasuryExcel([tx({ id: 'b', status: 'confirmed' }), tx({ id: 'c', kind: 'reward', reward_type: 'cash', amount: 500000, status: 'confirmed' }), tx({ id: 'p', kind: 'gps_payment', amount: 300000, status: 'confirmed' }), tx({ id: 'x', status: 'pending' }), tx({ id: 'g', kind: 'reward', reward_type: 'gift', amount: 0, affects_balance: false, status: 'confirmed' })] as never, { title: 'القاصة', sub: 'المالية', fileName: 'x.xlsx' })
    const opts = (buildExcelReport as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)![0] as { rows: Record<string, unknown>[]; totalRow: Record<string, unknown> }
    expect(opts.rows).toHaveLength(5); expect(opts.totalRow.amount).toBe(1700000); expect(opts.rows[4]!.amount).toBe('')
  })
})

describe('المدير التنفيذي — فعاليات الشركة', () => {
  it('يعرض المكتمل مع الفلاتر والبحث، ويفتح العارض للقراءة فقط مع طباعة وتصدير', () => {
    h.designs = [
      { id: 'd1', title: 'حملة نظافة الكرادة', sector_parent: 'karrada', period_type: 'daily', period_start: '2026-10-01', period_end: '2026-10-01', cover_image_path: null, photo_count: 12, completed_at: '2026-10-01T15:00:00Z', completed_by_name: 'إعلامي', work_types: ['رفع أنقاض', 'غسل الشارع'] },
      { id: 'd2', title: 'تقرير الزعفرانية الشهري', sector_parent: 'zaafaraniya', period_type: 'monthly', period_start: '2026-09-01', period_end: '2026-09-30', cover_image_path: null, photo_count: 40, completed_at: '2026-10-02T15:00:00Z', completed_by_name: 'إعلامي', work_types: ['كنس الشوارع'] },
    ]
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    r(<ExecEventsPage />)
    expect(screen.getByTestId('ev-count')).toHaveTextContent('2 فعالية')
    expect(screen.getByTestId('ev-d1')).toHaveTextContent('يومي'); expect(screen.getByTestId('ev-d1')).toHaveTextContent('قاطع الكرادة'); expect(screen.getByTestId('ev-d1')).toHaveTextContent('رفع أنقاض · غسل الشارع')
    expect(screen.getByTestId('ev-filter-sector')).toBeInTheDocument(); expect(screen.getByTestId('ev-filter-period')).toBeInTheDocument(); expect(screen.getByTestId('ev-range-from')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('ev-search'), { target: { value: 'كنس' } })
    expect(screen.queryByTestId('ev-d1')).toBeNull(); expect(screen.getByTestId('ev-d2')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('ev-search'), { target: { value: '' } })
    fireEvent.click(screen.getByTestId('ev-d1'))
    const viewer = screen.getByTestId('exec-design-viewer')
    expect(viewer).toHaveAttribute('data-rp-overlay')
    expect(screen.getByTestId('report-view')).toHaveTextContent('حملة نظافة الكرادة · 1 مجموعة'); expect(screen.getByTestId('report-view')).toHaveAttribute('data-editable', 'false')
    expect(screen.getByTestId('export-menu')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('exec-design-print')); expect(print).toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('exec-design-close')); expect(screen.queryByTestId('exec-design-viewer')).toBeNull()
    print.mockRestore()
  })
})
