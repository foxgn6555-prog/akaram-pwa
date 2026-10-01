/** 00162: مخزن غرفة العمليات (تسليم/إلغاء/مواد/تسوية) + طلب مستلزمات مسؤول القسم من القائمة + مهمة مستلزمات في طلبات الموافقة. بلا بيانات مالية. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ deliver: vi.fn(), cancel: vi.fn(), save: vi.fn(), receive: vi.fn(), adjust: vi.fn(), create: vi.fn(), decide: vi.fn(), scope: '' as string }))
const items = [
  { id: 'i-bags', name: 'أكياس نفايات 50 لتر', unit: 'كيس', qty_on_hand: 485, min_qty: 100, is_active: true, low_stock: false, reserved: 20, updated_at: 'x' },
  { id: 'i-brooms', name: 'مكانس', unit: 'قطعة', qty_on_hand: 3, min_qty: 5, is_active: true, low_stock: true, reserved: 0, updated_at: 'x' },
]
const req = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, ref_no: `كتاب/مستلزمات/2026/000${id.slice(-1)}`, manager_id: 'm1', manager_name: 'مسؤول قسم 4', shift: 'morning', areas: 'الجادرية', parent_sector: 'الكرادة',
  items: [{ item_id: 'i-bags', name: 'أكياس نفايات 50 لتر', unit: 'كيس', qty: 20, delivered_qty: null }, { item_id: 'i-brooms', name: 'مكانس', unit: 'قطعة', qty: 3, delivered_qty: null }],
  notes: null, approval_status: status, current_step: status === 'pending' ? 'مسؤول قاطع (حسب التسلسل)' : null, created_at: '2026-10-01T06:00:00Z', decided_at: null, delivered_at: null, receiver_name: null, delivery_note: null, cancel_reason: null, delivered_by_name: null, ...extra,
})
vi.mock('@features/ops-store/hooks', () => ({
  useStoreItems: () => ({ data: items, isLoading: false }),
  useStoreMovements: () => ({ data: [{ id: 'mv1', item_id: 'i-bags', item_name: 'أكياس نفايات 50 لتر', unit: 'كيس', kind: 'out', qty: -15, balance_after: 485, request_id: 'r1', request_ref: 'كتاب/مستلزمات/2026/0001', note: 'تسليم', by_name: 'غرفة', created_at: 'x' }], isLoading: false }),
  useSaveStoreItem: () => ({ mutate: h.save, isPending: false }),
  useStoreReceive: () => ({ mutate: h.receive, isPending: false }),
  useStoreAdjust: () => ({ mutate: h.adjust, isPending: false }),
  useSupplyRequests: (scope: string) => ({ data: scope === 'done' ? [req('r9', 'delivered', { receiver_name: 'سائق', delivered_at: 'x', delivered_by_name: 'غرفة' })] : [req('r1', 'approved'), req('r2', 'pending')], isLoading: false }),
  useCreateSupplyRequest: () => ({ mutate: h.create, isPending: false }),
  useDeliverSupply: () => ({ mutate: h.deliver, isPending: false }),
  useCancelSupply: () => ({ mutate: h.cancel, isPending: false }),
}))
vi.mock('@features/sector-manager/hooks', () => ({
  useApprovalTimeline: () => ({ data: [] }),
  useMyApprovalTasks: () => ({ data: [{
    task_id: 't1', request_kind: 'supplies', request_id: 'r2', step_no: 1, total_steps: 2, step_label: 'مسؤول قاطع (حسب التسلسل)', requester_user_id: 'm1', requester_name: 'مسؤول قسم 4', requester_role: 'department_manager', requester_role_label: 'مسؤول قسم',
    area_name: 'الجادرية', parent_sector: 'الكرادة', type_name: 'مستلزمات القواطع', start_date: null, end_date: null, start_time: null, end_time: null, days: null, minutes: null, notes: 'للمنطقة', attachment_path: null, created_at: '2026-10-01T06:00:00Z', previous_steps: [],
    items: [{ item_id: 'i-bags', name: 'أكياس نفايات 50 لتر', unit: 'كيس', qty: 20, delivered_qty: null }], ref_no: 'كتاب/مستلزمات/2026/0002',
  }], isLoading: false }),
  useDecideApproval: () => ({ mutate: h.decide, isPending: false }),
}))
vi.mock('@features/sector', () => ({
  useManagerProfile: () => ({ data: { shift: 'morning', sectors: [4] } }),
  useSectors: () => ({ data: [{ id: 4, name: 'الجادرية' }] }),
  useSupplies: () => ({ data: [] }),
}))
import OpsStorePage from '@portals/ops-room/pages/Store/OpsStorePage'
import NewRequestPage from '@portals/manager/pages/Request/NewRequestPage'
import TeamRequestsPage from '@portals/admin-ops/pages/Requests/TeamRequestsPage'
const wrap = (el: React.ReactElement) => render(<MemoryRouter>{el}</MemoryRouter>)
const noFinance = () => { const t = document.body.textContent ?? ''; for (const w of ['سعر', 'تكلفة', 'دينار', 'مالي', 'IQD']) expect(t).not.toContain(w) }

describe('المخزن (غرفة العمليات) — 00162', () => {
  beforeEach(() => vi.clearAllMocks())
  it('للتسليم: الجاهز يظهر بزر تسليم، وقيد الموافقة بلا زر؛ التسليم يتطلب اسم المستلم وكميات ≤ المطلوب ثم يُرسل الكميات', () => {
    wrap(<OpsStorePage />)
    expect(screen.getByTestId('store-tab-ready')).toHaveTextContent('1')
    expect(screen.getByTestId('supply-status-r1')).toHaveTextContent('جاهز للتسليم'); expect(screen.getByTestId('supply-status-r2')).toHaveTextContent('قيد الموافقة · مسؤول قاطع')
    expect(screen.queryByTestId('deliver-r2')).toBeNull()
    fireEvent.click(screen.getByTestId('deliver-r1'))
    expect(screen.getByTestId('deliver-confirm-r1')).toBeDisabled()
    fireEvent.change(screen.getByTestId('receiver-r1'), { target: { value: 'سائق المنطقة 4' } })
    fireEvent.change(screen.getByTestId('deliver-qty-i-bags'), { target: { value: '25' } })
    expect(screen.getByTestId('deliver-confirm-r1')).toBeDisabled()
    fireEvent.change(screen.getByTestId('deliver-qty-i-bags'), { target: { value: '15' } })
    fireEvent.click(screen.getByTestId('deliver-confirm-r1'))
    expect(h.deliver).toHaveBeenCalledWith({ id: 'r1', receiverName: 'سائق المنطقة 4', items: [{ item_id: 'i-bags', delivered_qty: 15 }, { item_id: 'i-brooms', delivered_qty: 3 }], note: null }, expect.any(Object))
    noFinance()
  })
  it('الإلغاء يتطلب سبباً (3 أحرف)', () => {
    wrap(<OpsStorePage />)
    fireEvent.click(screen.getByTestId('cancel-r2'))
    fireEvent.change(screen.getByTestId('cancel-reason-r2'), { target: { value: 'لا' } }); expect(screen.getByTestId('cancel-confirm-r2')).toBeDisabled()
    fireEvent.change(screen.getByTestId('cancel-reason-r2'), { target: { value: 'المادة غير متوفرة' } }); fireEvent.click(screen.getByTestId('cancel-confirm-r2'))
    expect(h.cancel).toHaveBeenCalledWith({ id: 'r2', reason: 'المادة غير متوفرة' }, expect.any(Object))
  })
  it('المواد: إضافة مادة، إدخال كمية، تسوية بسبب إلزامي، تنبيه دون الحد الأدنى والمحجوز', () => {
    wrap(<OpsStorePage />)
    fireEvent.click(screen.getByTestId('store-tab-items'))
    expect(screen.getByTestId('item-i-brooms')).toHaveTextContent('دون الحد الأدنى'); expect(screen.getByTestId('item-i-bags')).toHaveTextContent('محجوز لطلبات جاهزة: 20')
    fireEvent.change(screen.getByTestId('item-name'), { target: { value: 'قفازات' } }); fireEvent.change(screen.getByTestId('item-unit'), { target: { value: 'زوج' } }); fireEvent.change(screen.getByTestId('item-min'), { target: { value: '50' } })
    fireEvent.click(screen.getByTestId('item-save'))
    expect(h.save).toHaveBeenCalledWith({ name: 'قفازات', unit: 'زوج', minQty: 50 }, expect.any(Object))
    fireEvent.click(screen.getByTestId('act-in-i-brooms')); fireEvent.change(screen.getByTestId('act-val-i-brooms'), { target: { value: '10' } }); fireEvent.click(screen.getByTestId('act-confirm-i-brooms'))
    expect(h.receive).toHaveBeenCalledWith({ itemId: 'i-brooms', qty: 10, note: null }, expect.any(Object))
    fireEvent.click(screen.getByTestId('act-adjust-i-bags')); fireEvent.change(screen.getByTestId('act-val-i-bags'), { target: { value: '480' } })
    expect(screen.getByTestId('act-confirm-i-bags')).toBeDisabled()
    fireEvent.change(screen.getByTestId('act-txt-i-bags'), { target: { value: 'جرد: 5 أكياس تالفة' } }); fireEvent.click(screen.getByTestId('act-confirm-i-bags'))
    expect(h.adjust).toHaveBeenCalledWith({ itemId: 'i-bags', newQty: 480, reason: 'جرد: 5 أكياس تالفة' }, expect.any(Object))
  })
  it('الحركات والمنجزة', () => {
    wrap(<OpsStorePage />)
    fireEvent.click(screen.getByTestId('store-tab-movements')); expect(screen.getByTestId('movements-list')).toHaveTextContent('إخراج -15 → الرصيد 485')
    fireEvent.click(screen.getByTestId('store-tab-done')); expect(screen.getByTestId('done-r9')).toHaveTextContent('استلمها سائق')
  })
})

describe('طلب مستلزمات مسؤول القسم — من القائمة', () => {
  beforeEach(() => vi.clearAllMocks())
  it('يختار مواد وكميات، يلزم الإقرار، ويرسل [{item_id, qty}]؛ ويعرض طلباته بحالاتها', async () => {
    wrap(<NewRequestPage />)
    expect(screen.getByTestId('supply-send')).toBeDisabled()
    fireEvent.change(screen.getByTestId('f-item-pick'), { target: { value: 'i-bags' } })
    fireEvent.change(screen.getByTestId('f-qty-i-bags'), { target: { value: '30' } })
    fireEvent.change(screen.getByTestId('f-item-pick'), { target: { value: 'i-brooms' } })
    fireEvent.click(screen.getByTestId('f-del-i-brooms'))
    fireEvent.change(screen.getByTestId('f-supply-notes'), { target: { value: 'للجادرية' } })
    expect(screen.getByTestId('supply-send')).toBeDisabled()
    fireEvent.click(screen.getByTestId('f-supply-sign'))
    fireEvent.click(screen.getByTestId('supply-send'))
    await waitFor(() => expect(h.create).toHaveBeenCalledWith({ items: [{ item_id: 'i-bags', qty: 30 }], notes: 'للجادرية' }, expect.any(Object)))
    expect(screen.getByTestId('my-supply-status-r1')).toHaveTextContent('جاهز للتسليم في غرفة العمليات')
    expect(screen.getByTestId('my-supply-status-r2')).toHaveTextContent('قيد الموافقة · عند: مسؤول قاطع')
    noFinance()
  })
})

describe('مهمة مستلزمات في طلبات الموافقة', () => {
  it('تعرض المواد ورقم الكتاب، والموافقة تُرسل kind=supplies', () => {
    wrap(<TeamRequestsPage />)
    expect(screen.getByTestId('task-r2')).toHaveTextContent('مستلزمات القواطع'); expect(screen.getByTestId('task-items-r2')).toHaveTextContent('أكياس نفايات 50 لتر20 كيس')
    fireEvent.click(screen.getByTestId('approve-r2'))
    expect(h.decide).toHaveBeenCalledWith({ kind: 'supplies', requestId: 'r2', approve: true })
  })
})
