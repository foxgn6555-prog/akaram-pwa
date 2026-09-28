/** سجل زيارات المحطة + سير العمل بالخطوات (00130): وصول ← وزن ← وجهة ← اكتمال */
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ confirm: vi.fn(), dispatch: vi.fn(), record: vi.fn(), complete: vi.fn(), rows: [] as Record<string, unknown>[], kinds: null as null | Record<string, unknown>[] }))
vi.mock('@features/vehicle-operations/hooks', () => ({
  useStationMovementDays: () => ({ data: [{ visit_day: '2026-09-09', visit_count: 3, vehicle_count: 2, open_count: 1, total_stay_minutes: 75 }] }),
  useStationVisitsForDay: () => ({ data: h.rows, isLoading: false }),
  useStationConfirmArrival: () => ({ mutate: h.confirm, isPending: false }),
  useStationDispatchVehicle: () => ({ mutate: h.dispatch, isPending: false }),
}))
vi.mock('@features/transfer-station', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>
  return {
    ...original,
    useRecordWeighing: () => ({ mutate: h.record, isPending: false, error: null }),
    useCompleteWeighing: () => ({ mutate: h.complete, isPending: false, error: null }),
    // الأنواع من القاعدة (تديرها غرفة العمليات) — احتياط القائمة الثابتة عند غيابها
    useVehicleKinds: () => {
      const kindFromRow = original.kindFromRow as (r: Record<string, unknown>) => unknown
      return { kinds: h.kinds ? h.kinds.map(kindFromRow) : original.VEHICLE_KINDS, rows: h.kinds ?? [], isLoading: false }
    },
  }
})
import StationVehicleMovementsPage from '@portals/transfer-station/pages/VehicleMovements/StationVehicleMovementsPage'
const base = { visit_id: 'leg1', departure_id: 'd1', visit_number: 2, inbound_sequence: 3, vehicle_id: 'v1', vehicle_name: 'كابسة كبيرة', db_number: 'DB-1', driver_name: 'علي', shift: 'morning', sector_id: 1, area_name: 'أرخيته', manager_name: 'مسؤول القسم', inbound_departed_at: '2026-09-09T08:00:00Z', arrived_at: null, dispatched_at: null, outbound_destination: null, status: 'in_transit', transit_minutes: null, stay_minutes: null, inbound_notes: 'حمولة ثانية', arrival_notes: null, dispatch_notes: null, step_weight_tons: null, step_destination: null, step_vehicle_kind: null, step_weighed_at: null, step_completed_at: null, step_violation: false }
describe('سجل زيارات المحطة اليومي', () => {
  beforeEach(() => { h.confirm.mockReset(); h.dispatch.mockReset(); h.record.mockReset(); h.complete.mockReset(); h.rows = [base]; h.kinds = null })
  it('يعرض مجلد اليوم ورقم الزيارة ويؤكد الوصول بملاحظاته', () => { render(<StationVehicleMovementsPage />); expect(screen.getByTestId('station-day-2026-09-09')).toHaveTextContent('3 زيارة'); expect(screen.getByTestId('station-visit-leg1')).toHaveTextContent('الزيارة #2'); fireEvent.click(screen.getByTestId('station-arrive-leg1')); fireEvent.change(screen.getByTestId('station-action-notes'), { target: { value: 'وصلت كاملة' } }); fireEvent.click(screen.getByTestId('confirm-station-action')); expect(h.confirm).toHaveBeenCalledWith({ legId: 'leg1', notes: 'وصلت كاملة' }, expect.any(Object)) })
  it('يعرض مدة البقاء والسجل التاريخي ولا يعرض إجراء بعد المغادرة', () => { h.rows = [{ ...base, status: 'dispatched', arrived_at: '2026-09-09T08:20:00Z', dispatched_at: '2026-09-09T09:35:00Z', outbound_destination: 'work_site', transit_minutes: 20, stay_minutes: 75, arrival_notes: 'تم الوزن', dispatch_notes: 'عودة للموقع' }]; render(<StationVehicleMovementsPage />); expect(screen.getByTestId('station-visit-leg1')).toHaveTextContent('1 س 15 د'); expect(screen.getByTestId('station-visit-leg1')).toHaveTextContent('عودة للموقع'); expect(screen.queryByTestId('station-work-leg1')).not.toBeInTheDocument() })

  it('بعد الوصول تظهر خطوة كتابة الوزن فقط', () => {
    h.rows = [{ ...base, status: 'at_station', arrived_at: '2026-09-09T08:20:00Z' }]
    render(<StationVehicleMovementsPage />)
    expect(screen.getByTestId('station-weigh-leg1')).toBeInTheDocument()
    expect(screen.queryByTestId('station-complete-leg1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('station-garage-leg1')).not.toBeInTheDocument()
  })

  it('حوار الوزن يحفظ الوزن بوقت تلقائي عبر RPC', () => {
    h.rows = [{ ...base, status: 'at_station', arrived_at: '2026-09-09T08:20:00Z' }]
    render(<StationVehicleMovementsPage />)
    fireEvent.click(screen.getByTestId('station-weigh-leg1'))
    expect(screen.getByTestId('weighing-dialog')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('weighing-weight'), { target: { value: '5.5' } })
    fireEvent.click(screen.getByTestId('confirm-weighing'))
    expect(h.record).toHaveBeenCalledWith({ visitLegId: 'leg1', weightTons: 5.5 }, expect.any(Object))
  })

  it('يحذر عند وزن أقل من الحد ويكمل بالوجهة والنوع', () => {
    h.rows = [{ ...base, status: 'at_station', arrived_at: '2026-09-09T08:20:00Z', step_weight_tons: 1.5, step_weighed_at: '2026-09-09T08:25:00Z' }]
    render(<StationVehicleMovementsPage />)
    expect(screen.getByText(/بانتظار اختيار الوجهة/)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('station-complete-leg1'))
    // كابسة وسط حدها 4 ⇒ الوزن 1.5 مخالفة
    expect(screen.getByTestId('weighing-violation-warning')).toBeInTheDocument()
    // المحطة التحويلية + كيا حدها 2 ⇒ 1.5 ما تزال مخالفة
    fireEvent.click(screen.getByTestId('weighing-dest-transfer_station'))
    fireEvent.change(screen.getByTestId('weighing-kind'), { target: { value: 'kia' } })
    expect(screen.getByTestId('weighing-violation-warning')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('confirm-complete'))
    expect(h.complete).toHaveBeenCalledWith({ visitLegId: 'leg1', destination: 'transfer_station', vehicleKind: 'kia' }, expect.any(Object))
  })

  it('لا يتيح أنواع المحطة التحويلية عند اختيار المكبس', () => {
    h.rows = [{ ...base, status: 'at_station', arrived_at: '2026-09-09T08:20:00Z', step_weight_tons: 7, step_weighed_at: '2026-09-09T08:25:00Z' }]
    render(<StationVehicleMovementsPage />)
    fireEvent.click(screen.getByTestId('station-complete-leg1'))
    const kind = screen.getByTestId('weighing-kind') as HTMLSelectElement
    expect([...kind.options].map(o => o.value)).toEqual(['compactor_small', 'compactor_medium', 'compactor_large'])
    expect(screen.queryByTestId('weighing-violation-warning')).not.toBeInTheDocument()
  })

  it('بعد الاكتمال يعرض ملخص العملية وأزرار المغادرة وشارة المخالفة', () => {
    h.rows = [{ ...base, status: 'at_station', arrived_at: '2026-09-09T08:20:00Z', step_weight_tons: 1.5, step_destination: 'transfer_station', step_vehicle_kind: 'kia', step_weighed_at: '2026-09-09T08:25:00Z', step_completed_at: '2026-09-09T08:31:00Z', step_violation: true }]
    render(<StationVehicleMovementsPage />)
    expect(screen.getByTestId('weighing-summary-leg1')).toHaveTextContent('المحطة التحويلية')
    expect(screen.getByText('مخالفة وزن')).toBeInTheDocument()
    expect(screen.getByTestId('station-work-leg1')).toBeInTheDocument()
    expect(screen.getByTestId('station-garage-leg1')).toBeInTheDocument()
    expect(screen.queryByTestId('station-weigh-leg1')).not.toBeInTheDocument()
  })

  it('حدود الأوزان تأتي من القاعدة (غرفة العمليات): حد جديد يلغي المخالفة، ونوع جديد يظهر، والمعطّل يختفي', () => {
    h.kinds = [
      { kind: 'compactor_medium', label: 'كابسة وسط', min_tons: '1', max_tons: '6', destination: 'both', sort: 2, active: true },
      { kind: 'trailer_20', label: 'مقطورة 20', min_tons: '12', max_tons: null, destination: 'press', sort: 9, active: true },
    ]
    h.rows = [{ ...base, status: 'at_station', arrived_at: '2026-09-09T08:20:00Z', step_weight_tons: 1.5, step_weighed_at: '2026-09-09T08:25:00Z' }]
    render(<StationVehicleMovementsPage />)
    fireEvent.click(screen.getByTestId('station-complete-leg1'))
    // الحد الأدنى للكابسة الوسط أصبح 1 ⇒ 1.5 ليست مخالفة
    expect(screen.queryByTestId('weighing-violation-warning')).not.toBeInTheDocument()
    const kind = screen.getByTestId('weighing-kind') as HTMLSelectElement
    expect([...kind.options].map(o => o.value)).toEqual(['compactor_medium', 'trailer_20'])
    expect(screen.getByText(/حدود الأوزان تُدار من غرفة العمليات/)).toBeInTheDocument()
  })
  it('يعرض شارة «صُحح من غرفة العمليات» عندما تصحح غرفة العمليات وزناً مكتملاً', () => {
    h.rows = [{ ...base, status: 'at_station', arrived_at: '2026-09-09T08:20:00Z', step_weight_tons: 6.5, step_weighed_at: '2026-09-09T08:25:00Z', step_completed_at: '2026-09-09T08:30:00Z', step_destination: 'press', step_vehicle_kind: 'compactor_large', step_violation: false, step_corrected_at: '2026-09-09T10:00:00Z', step_correction_reason: 'خطأ إدخال' }]
    render(<StationVehicleMovementsPage />)
    expect(screen.getByTestId('weighing-corrected-leg1')).toHaveTextContent('صُحح من غرفة العمليات')
    expect(screen.getByTestId('weighing-summary-leg1')).toHaveTextContent('6.5 طن')
  })
})
