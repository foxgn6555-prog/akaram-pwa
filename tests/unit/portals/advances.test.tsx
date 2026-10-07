/**
 * 00191 — السُّلَف
 *  · غرفة العمليات: النموذج (موظف/نوع/مبلغ/طريقة) يرسل الحقول الصحيحة؛ قائمة الحالة فقط (بلا أقساط)؛ إلغاء بسبب
 *  · المعتمِد (طلبات الموافقة): بطاقة السلفة بالتفاصيل، تعديل المبلغ قبل الموافقة يستدعي advance_decide بالمبلغ، الرفض بسبب
 *  · المالية: جاهزة للتسليم → «تم التسليم»؛ قيد الاستقطاع مع المتبقي؛ التفاصيل (المسار/الأقساط/التسديد النقدي)؛ Excel؛ أرقام إنكليزية
 *  · التطوير المركزية: الأنواع والسياسة · التنقّل والمسارات · كشف الرواتب يعرض عمود قسط السلفة
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const h = vi.hoisted(() => ({
  list: [] as unknown[], detail: null as unknown, summary: null as unknown, types: [] as unknown[],
  create: vi.fn(), decide: vi.fn(), deliver: vi.fn(), settle: vi.fn(), cancel: vi.fn(), saveType: vi.fn(), setPolicy: vi.fn(), decideGeneric: vi.fn(),
}))
vi.mock('@features/advances/hooks', () => ({
  useAdvanceTypes: () => ({ data: h.types, isLoading: false }),
  useSaveAdvanceType: () => ({ mutate: h.saveType, isPending: false }),
  useAdvancePolicy: () => ({ data: { max_installment_ratio: 0.5, block_if_open: true } }),
  useAdvanceEmployeeLookup: (q: string) => ({ data: q ? [{ id: 'e9', full_name: 'كرار المقترض', employee_number: 'K-9', job_title: 'سائق', department_name: 'النقل', open_advance: null }, { id: 'e8', full_name: 'كرار الثاني', employee_number: 'K-8', job_title: null, department_name: null, open_advance: 'ADV-2026-00001' }] : [] }),
  useAdvancesList: () => ({ data: h.list, isLoading: false }),
  useAdvance: (id?: string | null) => ({ data: id ? h.detail : undefined, isLoading: false }),
  useAdvancesSummary: () => ({ data: h.summary }),
  useCreateAdvance: () => ({ mutate: h.create, isPending: false }),
  useDecideAdvance: () => ({ mutate: h.decide, isPending: false }),
  useDeliverAdvance: () => ({ mutate: h.deliver, isPending: false }),
  useSettleAdvanceCash: () => ({ mutate: h.settle, isPending: false }),
  useCancelAdvance: () => ({ mutate: h.cancel, isPending: false }),
}))
vi.mock('@features/hr', () => ({
  useHrPolicy: () => ({ data: { advance_max_installment_ratio: 0.4, advance_block_if_open: false } }),
  useSetHrPolicy: () => ({ mutate: h.setPolicy, isPending: false }),
}))
vi.mock('@features/sector-manager/hooks', () => ({
  useApprovalTimeline: () => ({ data: [], isLoading: false }),
  useMyApprovalTasks: () => ({ data: [{
    task_id: 'tk1', request_kind: 'advance', request_id: 'a1', step_no: 1, total_steps: 2, step_label: 'معاون المدير', requester_user_id: 'ops', requester_name: 'غرفة العمليات', requester_role: 'ops_room', requester_role_label: 'غرفة العمليات',
    area_name: null, parent_sector: null, type_name: 'سلفة', start_date: null, end_date: null, start_time: null, end_time: null, days: null, minutes: null, notes: 'ظرف عائلي', attachment_path: null, created_at: '2026-10-07T08:00:00Z', previous_steps: [], items: null, ref_no: 'ADV-2026-00007',
    details: { employee_name: 'كرار المقترض', employee_number: 'K-9', type_name: 'سلفة زواج', amount: 300000, requested_amount: 300000, method: 'equal', method_label: 'أقساط شهرية متساوية', installments: 3, monthly_amount: null, percent: null, estimated_installment: 100000 },
  }], isLoading: false }),
  useDecideApproval: () => ({ mutate: h.decideGeneric, isPending: false }),
}))
vi.mock('@lib/export/excel-report', async (importOriginal) => ({ ...((await importOriginal()) as Record<string, unknown>), buildExcelReport: vi.fn(async (o: unknown) => o) }))

import OpsAdvancesPage from '@portals/ops-room/pages/Advances/OpsAdvancesPage'
import FinanceAdvancesPage, { downloadAdvancesExcel } from '@portals/finance/pages/Advances/FinanceAdvancesPage'
import AdvanceTypesPage from '@portals/it/pages/Integrations/AdvanceTypesPage'
import TeamRequestsPage from '@portals/admin-ops/pages/Requests/TeamRequestsPage'
import { buildExcelReport } from '@lib/export/excel-report'
import { PORTAL_UNITS } from '@config/portals.config'
import { PORTALS } from '@lib/constants/portals.constants'
import { customRoutes as opsRoomRoutes } from '@portals/ops-room/routes'
import { customRoutes as financeRoutes } from '@portals/finance/routes'
import { customRoutes as itRoutes } from '@portals/it/routes'
import type { Advance } from '@sdk/advances.sdk'

const adv = (o: Partial<Advance>): Advance => ({
  id: 'a1', ref_no: 'ADV-2026-00007', employee_id: 'e9', employee_name: 'كرار المقترض', employee_number: 'K-9', type_name: 'سلفة زواج', amount: 300000, requested_amount: 300000, repayment_method: 'equal', method_label: 'أقساط شهرية متساوية',
  installments: 3, monthly_amount: null, percent: null, notes: 'ظرف عائلي', status: 'pending', status_label: 'قيد الموافقة', requested_by: 'ops', requested_by_name: 'غرفة العمليات', created_at: '2026-10-07T08:00:00Z',
  approved_at: null, rejected_at: null, reject_note: null, delivered_at: null, cancelled_at: null, cancel_reason: null, current_step: { step_no: 1, label: 'معاون المدير (افتراضي — بلا سلسلة مضبوطة)' }, ...o,
})
const r = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)
beforeEach(() => { vi.clearAllMocks(); h.list = []; h.detail = null; h.summary = { awaiting_delivery: 1, awaiting_delivery_amount: 240000, pending: 2, active: 3, outstanding: 1250000, delivered_total: 2000000, repaid_total: 750000 }; h.types = [{ id: 't1', name: 'سلفة زواج', max_amount: null, max_installments: 24, is_active: true, sort_order: 30 }, { id: 't2', name: 'سلفة طارئة', max_amount: 500000, max_installments: 6, is_active: true, sort_order: 20 }] })

describe('غرفة العمليات — طلب سلفة', () => {
  it('النموذج: اختيار موظف ونوع ومبلغ وطريقة أقساط متساوية → يرسل الحقول الصحيحة ويعرض القسط التقديري', async () => {
    r(<OpsAdvancesPage />)
    expect(screen.getByTestId('adv-empty')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('adv-new'))
    expect(screen.getByTestId('adv-submit')).toBeDisabled()
    fireEvent.change(screen.getByTestId('adv-emp-q'), { target: { value: 'كرار' } })
    const results = screen.getByTestId('adv-emp-results')
    expect(within(results).getByTestId('adv-emp-e8')).toHaveTextContent('لديه سلفة مفتوحة ADV-2026-00001')
    fireEvent.click(within(results).getByTestId('adv-emp-e9'))
    fireEvent.change(screen.getByTestId('adv-type'), { target: { value: 't1' } })
    fireEvent.change(screen.getByTestId('adv-amount'), { target: { value: '300000' } })
    fireEvent.change(screen.getByTestId('adv-installments'), { target: { value: '3' } })
    expect(screen.getByTestId('adv-estimate')).toHaveTextContent('100,000')
    fireEvent.click(screen.getByTestId('adv-submit'))
    await waitFor(() => expect(h.create).toHaveBeenCalledTimes(1))
    expect(h.create.mock.calls[0]![0]).toEqual({ employeeId: 'e9', typeId: 't1', amount: 300000, method: 'equal', installments: 3, monthly: null, percent: null, notes: null })
  })
  it('طريقة النسبة/الثابت تُرسل حقولها؛ تجاوز سقف النوع يعطّل الإرسال', () => {
    r(<OpsAdvancesPage />)
    fireEvent.click(screen.getByTestId('adv-new'))
    fireEvent.change(screen.getByTestId('adv-emp-q'), { target: { value: 'كرار' } })
    fireEvent.click(screen.getByTestId('adv-emp-e9'))
    fireEvent.change(screen.getByTestId('adv-type'), { target: { value: 't2' } })
    fireEvent.change(screen.getByTestId('adv-amount'), { target: { value: '600000' } })
    fireEvent.click(screen.getByTestId('adv-method-percent'))
    fireEvent.change(screen.getByTestId('adv-percent'), { target: { value: '15' } })
    expect(screen.getByTestId('adv-submit')).toBeDisabled()   // يتجاوز 500,000
    fireEvent.change(screen.getByTestId('adv-amount'), { target: { value: '400000' } })
    fireEvent.click(screen.getByTestId('adv-submit'))
    expect(h.create.mock.calls[0]![0]).toMatchObject({ typeId: 't2', amount: 400000, method: 'percent', percent: 15, installments: null, monthly: null })
    fireEvent.click(screen.getByTestId('adv-method-fixed'))
    fireEvent.change(screen.getByTestId('adv-monthly'), { target: { value: '100000' } })
    expect(screen.getByTestId('adv-estimate')).toHaveTextContent('على 4 شهراً')
    fireEvent.click(screen.getByTestId('adv-submit'))
    expect(h.create.mock.calls[1]![0]).toMatchObject({ method: 'fixed', monthly: 100000, percent: null })
  })
  it('القائمة: حالة الطلب والخطوة الحالية فقط (لا أقساط ولا رواتب)؛ إلغاء قيد الموافقة بسبب إلزامي', () => {
    h.list = [adv({}), adv({ id: 'a2', status: 'rejected', status_label: 'مرفوضة', reject_note: 'لا يستوفي الشروط', current_step: null }), adv({ id: 'a3', status: 'delivered', status_label: 'مسلَّمة — قيد الاستقطاع', delivered_at: '2026-10-07T10:00:00Z', current_step: null })]
    r(<OpsAdvancesPage />)
    const c = screen.getByTestId('adv-a1')
    expect(c).toHaveTextContent('قيد الموافقة'); expect(c).toHaveTextContent('الخطوة الحالية: 1. معاون المدير'); expect(c).toHaveTextContent('300,000')
    expect(screen.getByTestId('adv-a2')).toHaveTextContent('سبب الرفض: لا يستوفي الشروط')
    expect(screen.getByTestId('adv-a3')).not.toHaveTextContent('المتبقي')
    expect(screen.queryByTestId('adv-cancel-a3')).toBeNull()
    fireEvent.click(screen.getByTestId('adv-cancel-a1'))
    expect(screen.getByTestId('adv-cancel-confirm-a1')).toBeDisabled()
    fireEvent.change(screen.getByTestId('adv-cancel-reason-a1'), { target: { value: 'أُدخل خطأً' } })
    fireEvent.click(screen.getByTestId('adv-cancel-confirm-a1'))
    expect(h.cancel).toHaveBeenCalledWith({ id: 'a1', reason: 'أُدخل خطأً' }, expect.anything())
    expect(screen.getByTestId('ops-advances').textContent).not.toMatch(/[\u0660-\u0669]/)
  })
})

describe('المعتمِد — بطاقة السلفة في طلبات الموافقة', () => {
  it('تعرض الموظف والمبلغ والطريقة والقسط؛ تعديل المبلغ وعدد الأقساط ثم الموافقة يستدعي advance_decide بالقيم؛ الرفض بسبب', async () => {
    r(<TeamRequestsPage />)
    const card = screen.getByTestId('task-a1')
    expect(card).toHaveTextContent('سلفة · سلفة زواج'); expect(card).toHaveTextContent('ADV-2026-00007')
    const d = screen.getByTestId('task-advance-a1')
    expect(d).toHaveTextContent('كرار المقترض'); expect(screen.getByTestId('task-advance-amount-a1')).toHaveTextContent('300,000'); expect(d).toHaveTextContent('أقساط شهرية متساوية · 3 شهراً'); expect(d).toHaveTextContent('القسط الشهري التقديري: 100,000')
    fireEvent.click(screen.getByTestId('advance-edit-a1'))
    fireEvent.change(screen.getByTestId('advance-amount-a1'), { target: { value: '240000' } })
    fireEvent.change(screen.getByTestId('advance-installments-a1'), { target: { value: '4' } })
    fireEvent.click(screen.getByTestId('approve-a1'))
    await waitFor(() => expect(h.decide).toHaveBeenCalledTimes(1))
    expect(h.decide.mock.calls[0]![0]).toEqual({ id: 'a1', approve: true, amount: 240000, installments: 4 })
    expect(h.decideGeneric).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('reject-a1'))
    expect(screen.getByTestId('reject-confirm-a1')).toBeDisabled()
    fireEvent.change(screen.getByTestId('reject-reason-a1'), { target: { value: 'لا يستوفي الشروط' } })
    fireEvent.click(screen.getByTestId('reject-confirm-a1'))
    expect(h.decide.mock.calls[1]![0]).toEqual({ id: 'a1', approve: false, note: 'لا يستوفي الشروط' })
  })
  it('الموافقة بلا تعديل ترسل مبلغاً فارغاً (يبقى كما طُلب)', () => {
    r(<TeamRequestsPage />)
    fireEvent.click(screen.getByTestId('approve-a1'))
    expect(h.decide.mock.calls[0]![0]).toEqual({ id: 'a1', approve: true, amount: null, installments: null })
  })
})

describe('المالية — السلف', () => {
  it('جاهزة للتسليم: الإحصاءات، زر «تم التسليم» يستدعي التسليم بالملاحظة؛ أرقام إنكليزية', async () => {
    h.list = [adv({ status: 'approved', status_label: 'معتمدة — بانتظار التسليم', approved_at: '2026-10-07T09:00:00Z', amount: 240000, estimated_installment: 80000, remaining: 240000, repaid_total: 0 })]
    r(<FinanceAdvancesPage />)
    expect(screen.getByTestId('adv-stat-awaiting')).toHaveTextContent('1'); expect(screen.getByTestId('adv-stat-awaiting')).toHaveTextContent('240,000')
    expect(screen.getByTestId('adv-stat-active')).toHaveTextContent('1,250,000')
    const row = screen.getByTestId('adv-a1')
    expect(row).toHaveTextContent('معتمدة — بانتظار التسليم'); expect(row).toHaveTextContent('(طُلب 300,000)'); expect(row).toHaveTextContent('القسط الشهري: 80,000')
    fireEvent.click(screen.getByTestId('adv-deliver-a1'))
    fireEvent.change(screen.getByTestId('adv-deliver-note-a1'), { target: { value: 'سُلّمت نقداً' } })
    expect(screen.getByTestId('adv-deliver-confirm-a1')).toHaveTextContent('خصم 240,000 من القاصة')
    fireEvent.click(screen.getByTestId('adv-deliver-confirm-a1'))
    await waitFor(() => expect(h.deliver).toHaveBeenCalledWith({ id: 'a1', note: 'سُلّمت نقداً' }, expect.anything()))
    expect(screen.getByTestId('fin-advances').textContent).not.toMatch(/[\u0660-\u0669]/)
  })
  it('قيد الاستقطاع: المتبقي وبداية الاستقطاع؛ التفاصيل تعرض المسار والأقساط والتسديد النقدي المقيّد بالمتبقي', async () => {
    const a = adv({ status: 'delivered', status_label: 'مسلَّمة — قيد الاستقطاع', amount: 240000, repaid_total: 80000, remaining: 160000, estimated_installment: 80000, delivered_at: '2026-09-07T10:00:00Z', delivered_by_name: 'محاسب', start_month: '2026-10-01', current_step: null })
    h.list = [a]
    h.detail = { ...a, installment_rows: [{ id: 'i1', period_month: '2026-10-01', amount: 80000, source: 'payroll', export_id: 'x', note: null, created_at: '2026-11-01T08:00:00Z' }], events: [{ id: 1, action: 'created', actor_name: 'غرفة العمليات', amount: 300000, note: null, created_at: '2026-09-01T08:00:00Z' }, { id: 2, action: 'delivered', actor_name: 'محاسب', amount: 240000, note: null, created_at: '2026-09-07T10:00:00Z' }],
      timeline: [{ step_no: 1, label: 'معاون المدير', status: 'approved', decided_by: 'المعاون', decided_at: '2026-09-02T08:00:00Z', note: null, approvers: ['المعاون'] }, { step_no: 2, label: 'المدير المفوض', status: 'approved', decided_by: 'المدير', decided_at: '2026-09-03T08:00:00Z', note: null, approvers: ['المدير'] }] }
    r(<FinanceAdvancesPage />)
    fireEvent.click(screen.getByTestId('adv-tab-delivered'))
    expect(screen.getByTestId('adv-remaining-a1')).toHaveTextContent('160,000'); expect(screen.getByTestId('adv-a1')).toHaveTextContent('الاستقطاع من 2026-10'); expect(screen.getByTestId('adv-a1')).toHaveTextContent('(محاسب)')
    fireEvent.click(screen.getByTestId('adv-open-a1'))
    const dlg = screen.getByTestId('adv-detail')
    expect(within(dlg).getByTestId('adv-detail-remaining')).toHaveTextContent('160,000')
    expect(within(dlg).getByTestId('adv-detail-timeline')).toHaveTextContent('1. معاون المدير — موافقة'); expect(within(dlg).getByTestId('adv-detail-timeline')).toHaveTextContent('2. المدير المفوض — موافقة')
    expect(within(dlg).getByTestId('adv-detail-installments')).toHaveTextContent('2026-10'); expect(within(dlg).getByTestId('adv-detail-installments')).toHaveTextContent('كشف الرواتب')
    expect(within(dlg).getByTestId('adv-detail-events')).toHaveTextContent('تسليم المبلغ')
    fireEvent.change(within(dlg).getByTestId('adv-settle-amount'), { target: { value: '200000' } })
    expect(within(dlg).getByTestId('adv-settle-confirm')).toBeDisabled()
    fireEvent.change(within(dlg).getByTestId('adv-settle-amount'), { target: { value: '160000' } })
    fireEvent.change(within(dlg).getByTestId('adv-settle-note'), { target: { value: 'تسديد المتبقي' } })
    fireEvent.click(within(dlg).getByTestId('adv-settle-confirm'))
    await waitFor(() => expect(h.settle).toHaveBeenCalledWith({ id: 'a1', amount: 160000, note: 'تسديد المتبقي' }, expect.anything()))
  })
  it('Excel: أعمدة الموظف والمبلغ والمسدَّد والمتبقي والحالة مع صف إجمالي', async () => {
    await downloadAdvancesExcel([adv({ status: 'delivered', status_label: 'x', repaid_total: 80000, remaining: 160000, amount: 240000, start_month: '2026-10-01' }), adv({ id: 'b', status: 'settled', status_label: 'y', repaid_total: 100000, remaining: 0, amount: 100000 })])
    const o = (vi.mocked(buildExcelReport).mock.calls[0]![0]) as { columns: { header: string }[]; rows: Record<string, unknown>[]; totalRow: Record<string, unknown> }
    expect(o.columns.map((c) => c.header)).toEqual(expect.arrayContaining(['الرقم', 'الموظف', 'النوع', 'المبلغ', 'طريقة التسديد', 'المسدَّد', 'المتبقي', 'الحالة', 'التسليم', 'بداية الاستقطاع']))
    expect(o.rows[0]).toMatchObject({ ref: 'ADV-2026-00007', amount: 240000, repaid: 80000, remaining: 160000, status: 'مسلَّمة — قيد الاستقطاع', start: '2026-10' })
    expect(o.totalRow).toMatchObject({ amount: 340000, repaid: 180000, remaining: 160000 })
  })
})

describe('التطوير المركزية — الأنواع والسياسة', () => {
  it('تعرض الأنواع المزروعة؛ نوع جديد بسقف وأقساط؛ السياسة تُحفظ كنسبة عشرية', async () => {
    r(<AdvanceTypesPage />)
    expect(screen.getByTestId('adv-type-t2')).toHaveTextContent('500,000'); expect(screen.getByTestId('adv-type-t1')).toHaveTextContent('بلا سقف')
    fireEvent.click(screen.getByTestId('adv-type-add'))
    fireEvent.change(screen.getByTestId('adv-type-name'), { target: { value: 'سلفة دراسة' } })
    fireEvent.change(screen.getByTestId('adv-type-max'), { target: { value: '750000' } })
    fireEvent.change(screen.getByTestId('adv-type-inst'), { target: { value: '10' } })
    fireEvent.click(screen.getByTestId('adv-type-save'))
    await waitFor(() => expect(h.saveType).toHaveBeenCalledTimes(1))
    expect(h.saveType.mock.calls[0]![0]).toEqual({ id: null, name: 'سلفة دراسة', maxAmount: 750000, maxInstallments: 10, isActive: true, sortOrder: 100 })
    await waitFor(() => expect(screen.getByTestId('adv-policy-ratio')).toHaveValue(40))
    fireEvent.change(screen.getByTestId('adv-policy-ratio'), { target: { value: '35' } })
    fireEvent.click(screen.getByTestId('adv-policy-block'))
    fireEvent.click(screen.getByTestId('adv-policy-save'))
    expect(h.setPolicy).toHaveBeenCalledWith({ advance_max_installment_ratio: 0.35, advance_block_if_open: true })
  })
})

describe('التنقّل والمسارات', () => {
  it('السلف في قوائم غرفة العمليات والمالية والتطوير المركزية، والمسارات موجودة', () => {
    expect(PORTAL_UNITS[PORTALS.OPS_ROOM].some((n) => n.path === '/ops-room/advances')).toBe(true)
    expect(PORTAL_UNITS[PORTALS.FINANCE].some((n) => n.path === '/finance/advances')).toBe(true)
    const it = PORTAL_UNITS[PORTALS.IT].flatMap((n) => [n, ...(n.children ?? [])])
    expect(it.some((n) => n.path === '/it/integrations/advances')).toBe(true)
    expect(opsRoomRoutes.some((x) => x.path === 'advances')).toBe(true)
    expect(financeRoutes.some((x) => x.path === 'advances')).toBe(true)
    expect(itRoutes.some((x) => x.path === 'integrations/advances')).toBe(true)
    // لا شيء في بوابة الموظف
    expect(PORTAL_UNITS[PORTALS.EMPLOYEE].some((n) => n.path.includes('advance'))).toBe(false)
  })
})
