/** وحدة ناقلة الحاويات المكبسية (00330): القوائم فقط؛ الناقلات وحدها؛ الوزن إلزامي وافتراضه 16 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const h = vi.hoisted(() => ({ record: vi.fn() }))
vi.mock('@features/transfer-station', () => ({ useCarrierList: () => ({ data: [], isLoading: false }) }))
vi.mock('@features/station-fleet/hooks', () => ({
  useStationFleet: () => ({ data: [
    { id: 'v1', vehicle_name: 'نسافة 1', db_number: '101', plate_number: 'A1', vehicle_category: 'nasafa', category_label: 'نسافة', station_outbound: true, driver_employee_id: null, driver_name: null, has_gps: true, device_id: 'dev1', ownership_type: 'owned' },
    { id: 'v3', vehicle_name: 'ناقلة', db_number: '202', plate_number: 'B2', vehicle_category: 'container_carrier', category_label: 'ناقلة حاويات مكبسية', station_outbound: true, driver_employee_id: null, driver_name: null, has_gps: true, device_id: 'd', ownership_type: 'owned' },
  ], isLoading: false }),
  useStationDrivers: () => ({ data: [{ driver_kind: 'employee', ref_id: 'e1', full_name: 'علي', detail: 'سائق', phone: null }], isLoading: false }),
  useStationDestinations: () => ({ data: [{ id: 'd1', name: 'النهروان', geofence_id: 'z', geofence_name: 'زون', has_zone: true, active: true, sort: 1 }], isLoading: false }),
  useStationRecordExit: () => ({ mutate: h.record, isPending: false }),
}))
import CarrierPage from '@portals/transfer-station/pages/Carrier/CarrierPage'

beforeEach(() => h.record.mockReset())

describe('CarrierPage (00330)', () => {
  it('يعرض الناقلات فقط ويفترض 16 طن ويرفض وزناً فارغاً', () => {
    render(<MemoryRouter><CarrierPage /></MemoryRouter>)
    expect(screen.getByTestId('carrier-page')).toBeInTheDocument()
    expect(screen.getByTestId('carrier-month')).toBeInTheDocument()
    const sel = screen.getByTestId('f-carrier-vehicle') as HTMLSelectElement
    expect(within(sel).getByText(/DB 202/)).toBeInTheDocument()
    expect(within(sel).queryByText(/DB 101/)).toBeNull()
    expect(screen.getByTestId('f-carrier-weight')).toHaveValue(16)
    fireEvent.change(sel, { target: { value: 'v3' } })
    fireEvent.change(screen.getByTestId('f-carrier-driver'), { target: { value: 'e1' } })
    fireEvent.change(screen.getByTestId('f-carrier-destination'), { target: { value: 'd1' } })
    fireEvent.change(screen.getByTestId('f-carrier-weight'), { target: { value: '' } })
    fireEvent.click(screen.getByTestId('carrier-submit'))
    expect(h.record).not.toHaveBeenCalled()
    expect(screen.getByText('الوزن مطلوب بالطن (أكبر من صفر)')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('f-carrier-weight'), { target: { value: '12.5' } })
    fireEvent.click(screen.getByTestId('carrier-submit'))
    expect(h.record).toHaveBeenCalledWith(expect.objectContaining({ vehicleId: 'v3', driverEmployeeId: 'e1', weightTons: 12.5 }), expect.anything())
  })
})
