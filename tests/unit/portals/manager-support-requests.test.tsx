import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({
  list: [] as Record<string, unknown>[],
  managers: [
    { user_id: 'mA', manager_name: 'مسؤول الجادرية', shift: 'morning', sectors: [4], area_names: ['الجادرية'], parent_sectors: ['karrada'], active_vehicles: 3 },
  ],
  lendable: [
    { departure_id: 'dep1', vehicle_id: 'v1', vehicle_name: 'كابسة 1', db_number: 'DB-1', driver_name: 'علي', sector_id: 4, area_name: 'الجادرية', trip_status: 'at_site' },
    { departure_id: 'dep2', vehicle_id: 'v2', vehicle_name: 'كابسة 2', db_number: 'DB-2', driver_name: 'حسن', sector_id: 4, area_name: 'الجادرية', trip_status: 'at_site' },
  ],
  create: vi.fn(),
  accept: vi.fn(),
  reject: vi.fn(),
  cancel: vi.fn(),
  end: vi.fn(),
}))
vi.mock('@features/sector', () => ({
  useSupportRequests: () => ({ data: h.list, isLoading: false }),
  useSupportManagers: () => ({ data: h.managers }),
  useSupportLendableVehicles: () => ({ data: h.lendable, isLoading: false }),
  useManagerProfile: () => ({ data: { user_id: 'mB', shift: 'morning', sectors: [1, 2] } }),
  useSectors: () => ({ data: [{ id: 1, name: 'أرخيته' }, { id: 2, name: 'الرياض' }, { id: 4, name: 'الجادرية' }] }),
  useCreateSupportRequest: () => ({ mutate: h.create, isPending: false }),
  useAcceptSupportRequest: () => ({ mutate: h.accept, isPending: false }),
  useRejectSupportRequest: () => ({ mutate: h.reject, isPending: false }),
  useCancelSupportRequest: () => ({ mutate: h.cancel, isPending: false }),
  useEndSupport: () => ({ mutate: h.end, isPending: false }),
}))
import SupportRequestsPage from '@portals/manager/pages/Support/SupportRequestsPage'
const base = {
  status: 'pending',
  requester_user_id: 'mB',
  requester_name: 'مسؤول أرخيته',
  requester_sector_id: 1,
  requester_area_name: 'أرخيته',
  target_user_id: 'mA',
  target_name: 'مسؤول الجادرية',
  needed_count: 2,
  reason: 'تراكم نفايات',
  decision_note: null,
  cancel_reason: null,
  created_at: '2026-09-28T06:00:00Z',
  decided_at: null,
  completed_at: null,
  assignments: [],
}
describe('00154: صفحة طلبات الدعم لمسؤول القسم', () => {
  beforeEach(() => {
    h.list = []
    h.create.mockReset(); h.accept.mockReset(); h.reject.mockReset(); h.cancel.mockReset(); h.end.mockReset()
  })
  it('ينشئ طلباً: المسؤول المختار + منطقة من مناطقي فقط + العدد + السبب', () => {
    render(<SupportRequestsPage />)
    fireEvent.click(screen.getByTestId('support-new'))
    const sector = screen.getByTestId('support-sector') as HTMLSelectElement
    expect(Array.from(sector.options).map((o) => o.textContent)).toEqual(['أرخيته', 'الرياض'])
    expect(screen.getByTestId('support-target')).toHaveTextContent('مسؤول الجادرية — الجادرية (3 آلية نشطة)')
    fireEvent.change(screen.getByTestId('support-target'), { target: { value: 'mA' } })
    fireEvent.change(sector, { target: { value: '2' } })
    fireEvent.change(screen.getByTestId('support-count'), { target: { value: '3' } })
    fireEvent.change(screen.getByTestId('support-reason'), { target: { value: 'سوق الجمعة' } })
    fireEvent.click(screen.getByTestId('support-submit'))
    expect(h.create).toHaveBeenCalledWith({ targetUserId: 'mA', sectorId: 2, neededCount: 3, reason: 'سوق الجمعة' }, expect.any(Object))
  })
  it('الوارد: يقبل بآليات لا تتجاوز المطلوب ويرفض بسبب إلزامي', () => {
    h.list = [{ ...base, id: 'r1', direction: 'incoming', needed_count: 1 }]
    render(<SupportRequestsPage />)
    expect(screen.getByTestId('support-req-r1')).toHaveTextContent('مسؤول أرخيته يطلب دعمك')
    fireEvent.click(screen.getByTestId('support-accept-r1'))
    fireEvent.click(screen.getByTestId('lend-dep1'))
    fireEvent.click(screen.getByTestId('lend-dep2'))
    expect((screen.getByTestId('lend-dep2') as HTMLInputElement).checked).toBe(false)
    fireEvent.click(screen.getByTestId('support-decision-submit'))
    expect(h.accept).toHaveBeenCalledWith({ requestId: 'r1', departureIds: ['dep1'], note: undefined }, expect.any(Object))
  })
  it('الاعتذار يمرر السبب، والصادر المعلّق يمكن إلغاؤه', () => {
    h.list = [
      { ...base, id: 'r1', direction: 'incoming' },
      { ...base, id: 'r2', direction: 'outgoing' },
    ]
    render(<SupportRequestsPage />)
    fireEvent.click(screen.getByTestId('support-reject-r1'))
    fireEvent.change(screen.getByTestId('support-note'), { target: { value: 'لا تتوفر آليات' } })
    fireEvent.click(screen.getByTestId('support-decision-submit'))
    expect(h.reject).toHaveBeenCalledWith({ requestId: 'r1', note: 'لا تتوفر آليات' }, expect.any(Object))
    fireEvent.click(screen.getByTestId('support-tab-outgoing'))
    expect(screen.getByTestId('support-req-r2')).toHaveTextContent('طلبك من مسؤول الجادرية')
    fireEvent.click(screen.getByTestId('support-cancel-r2'))
    fireEvent.change(screen.getByTestId('support-note'), { target: { value: 'انتفت الحاجة' } })
    fireEvent.click(screen.getByTestId('support-decision-submit'))
    expect(h.cancel).toHaveBeenCalledWith({ requestId: 'r2', reason: 'انتفت الحاجة' }, expect.any(Object))
  })
  it('الدعم الجاري: المستفيد «إنهاء» والمالك «استرجاع»، والمنتهي يعرض كيف انتهى', () => {
    const asg = { id: 'a1', departure_id: 'dep1', vehicle_id: 'v1', vehicle_name: 'كابسة 1', db_number: 'DB-1', driver_name: 'علي', from_sector_id: 4, to_sector_id: 1, started_at: '2026-09-28T07:00:00Z', ended_at: null, end_kind: null, end_note: null, trip_status: 'at_site' }
    h.list = [
      { ...base, id: 'r1', status: 'accepted', direction: 'outgoing', assignments: [asg] },
      { ...base, id: 'r2', status: 'accepted', direction: 'incoming', assignments: [{ ...asg, id: 'a2' }] },
      { ...base, id: 'r3', status: 'completed', direction: 'incoming', assignments: [{ ...asg, id: 'a3', ended_at: '2026-09-28T09:00:00Z', end_kind: 'recalled' }] },
    ]
    render(<SupportRequestsPage />)
    expect(screen.getByTestId('support-end-a2')).toHaveTextContent('استرجاع الآلية')
    expect(screen.getByTestId('support-asg-a3')).toHaveTextContent('استرجعها المالك')
    fireEvent.click(screen.getByTestId('support-tab-outgoing'))
    expect(screen.getByTestId('support-end-a1')).toHaveTextContent('إنهاء الدعم')
    fireEvent.click(screen.getByTestId('support-end-a1'))
    fireEvent.change(screen.getByTestId('support-end-note'), { target: { value: 'شكراً' } })
    fireEvent.click(screen.getByTestId('support-end-submit'))
    expect(h.end).toHaveBeenCalledWith({ assignmentId: 'a1', note: 'شكراً' }, expect.any(Object))
  })
  it('بلا آليات قابلة للإرسال يعرض تنبيهاً ويعطّل الإرسال', () => {
    h.lendable = []
    h.list = [{ ...base, id: 'r1', direction: 'incoming' }]
    render(<SupportRequestsPage />)
    fireEvent.click(screen.getByTestId('support-accept-r1'))
    expect(screen.getByTestId('support-no-lendable')).toBeInTheDocument()
    expect(screen.getByTestId('support-decision-submit')).toBeDisabled()
  })
})
