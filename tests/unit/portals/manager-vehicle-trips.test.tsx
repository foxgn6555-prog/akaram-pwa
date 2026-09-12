import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({
  data: [] as Record<string, unknown>[],
  days: [
    {
      trip_day: '2026-09-09',
      total_count: 2,
      open_count: 1,
      first_departure_at: 'a',
      last_activity_at: 'b',
    },
  ],
  arrival: vi.fn(),
  garage: vi.fn(),
  maintenanceState: {} as Record<string, unknown>,
}))
vi.mock('@features/vehicle-operations/hooks', () => ({
  useTripLegs: () => ({ data: [] }),
  useMaintenanceEvents: () => ({
    data: [
      {
        event_key: 'case:reported',
        event_type: 'case',
        title: 'تسجيل العطل وإرسال الآلية',
        details: 'عطل فرامل',
        happened_at: '2026-09-09T07:00:00Z',
        progress: 0,
      },
    ],
    isLoading: false,
  }),
  useMaintenanceDispatchState: () => ({ data: h.maintenanceState }),
  useSendVehicleToStation: () => ({ mutate: vi.fn() }),
  useConfirmVehicleSiteReturn: () => ({ mutate: vi.fn() }),
  useSendVehicleToMaintenance: () => ({ mutate: vi.fn() }),
}))
vi.mock('@features/sector', () => ({
  useSectorVehicleTripDays: () => ({ data: h.days }),
  useSectorVehicleTripsForDay: () => ({ data: h.data, isLoading: false }),
  useConfirmSectorVehicleArrival: () => ({ mutate: h.arrival, isPending: false }),
  useSendSectorVehicleToGarage: () => ({ mutate: h.garage, isPending: false }),
}))
import VehicleTripsPage from '@portals/manager/pages/VehicleTrips/VehicleTripsPage'
const trip = {
  id: 'd1',
  vehicle_id: 'v1',
  driver_name: 'علي',
  shift: 'morning',
  sector_id: 1,
  departed_at: '2026-09-09T06:00:00Z',
  arrived_at: null,
  site_departed_at: null,
  returned_at: null,
  recipient_manager_id: 'm1',
  recipient_manager_name: 'مسؤول',
  arrival_notes: null,
  site_departure_notes: null,
  vehicle_name: 'كابسة كبيرة',
  db_number: 'DB-1',
  image_path: 'x',
  area_name: 'أرخيته',
  parent_sector: 'karrada',
}
describe('صفحة حركة آليات مسؤول القسم', () => {
  beforeEach(() => {
    h.data = [trip]
    h.arrival.mockReset()
    h.garage.mockReset()
    h.maintenanceState = {}
  })
  it('يعرض زر الوصول فقط قبل الوصول ويرسل الملاحظات', () => {
    render(<VehicleTripsPage />)
    expect(screen.getByTestId('manager-trip-day-2026-09-09')).toHaveTextContent('2 آلية')
    expect(screen.queryByTestId('send-garage-d1')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('confirm-arrival-d1'))
    fireEvent.change(screen.getByTestId('trip-stage-notes'), { target: { value: 'وصلت سليمة' } })
    fireEvent.click(screen.getByTestId('confirm-trip-stage'))
    expect(h.arrival).toHaveBeenCalledWith(
      { departureId: 'd1', notes: 'وصلت سليمة' },
      expect.any(Object),
    )
    expect(h.garage).not.toHaveBeenCalled()
  })
  it('يوقف أزرار الحركة عندما تكون موافقة الصيانة معلقة', () => {
    h.data = [{ ...trip, arrived_at: '2026-09-09T06:30:00Z' }]
    h.maintenanceState = { decision_status: 'awaiting_approval' }
    render(<VehicleTripsPage />)
    expect(screen.getByText(/بانتظار موافقة الكراج المركزي/)).toBeInTheDocument()
    expect(screen.queryByTestId('send-garage-d1')).not.toBeInTheDocument()
  })
  it('يعرض لمسؤول القسم التسلسل الزمني للحالة المرتبطة', () => {
    h.data = [{ ...trip, arrived_at: '2026-09-09T06:30:00Z' }]
    h.maintenanceState = { case_id: 'c1', decision_status: 'acknowledged' }
    render(<VehicleTripsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'عرض تسلسل الصيانة' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('تسجيل العطل وإرسال الآلية')).toBeInTheDocument()
  })
  it('لا يسمح بالإرسال إلى الكراج إلا بعد الوصول', () => {
    h.data = [{ ...trip, arrived_at: '2026-09-09T06:30:00Z' }]
    render(<VehicleTripsPage />)
    expect(screen.queryByTestId('confirm-arrival-d1')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('send-garage-d1'))
    fireEvent.click(screen.getByTestId('confirm-trip-stage'))
    expect(h.garage).toHaveBeenCalledWith(
      { departureId: 'd1', notes: undefined },
      expect.any(Object),
    )
  })
})
