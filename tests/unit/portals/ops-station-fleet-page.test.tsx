/** اختبارات صفحة غرفة العمليات — أسطول المحطة التحويلية (00329). */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const h = vi.hoisted(() => ({
  candidates: [] as unknown[],
  candidatesArgs: ['', false] as [string, boolean],
  destinations: [] as unknown[],
  drivers: [] as unknown[],
  categories: [] as unknown[],
  zones: [] as unknown[],
  setStation: vi.fn(),
  saveDest: vi.fn(),
  saveDrv: vi.fn(),
  saveCat: vi.fn(),
}))

vi.mock('@features/station-fleet/hooks', () => ({
  useStationFleetCandidates: (q: string, only: boolean) => { if (q || only) h.candidatesArgs = [q, only]; return { data: h.candidates, isLoading: false } },
  useSetStationVehicle: () => ({ mutate: h.setStation, isPending: false }),
  useStationDestinations: () => ({ data: h.destinations, isLoading: false }),
  useSaveStationDestination: () => ({ mutate: h.saveDest, isPending: false }),
  useStationExternalDrivers: () => ({ data: h.drivers, isLoading: false }),
  useSaveExternalDriver: () => ({ mutate: h.saveDrv, isPending: false }),
  useContractorOptions: () => ({ data: [{ user_id: 'c-1', full_name: 'متعهد النقل السريع', sector_id: 1, area_name: 'الكرادة', parent_sector: 'zaafaraniya', is_active: true, drivers_count: 0 }], isLoading: false }),
  useVehicleCategories: () => ({ data: h.categories, isLoading: false }),
  useSaveVehicleCategory: () => ({ mutate: h.saveCat, isPending: false }),
}))
vi.mock('@features/gps-lvn/hooks', () => ({ useGpsMapGeofences: () => ({ data: h.zones, isLoading: false }) }))

import OpsStationFleetPage from '@portals/ops-room/pages/StationFleet/OpsStationFleetPage'

const ui = () => render(<MemoryRouter><OpsStationFleetPage /></MemoryRouter>)

describe('OpsStationFleetPage (00329)', () => {
  beforeEach(() => {
    h.setStation.mockReset(); h.saveDest.mockReset(); h.saveDrv.mockReset(); h.saveCat.mockReset()
    h.candidates = [
      { id: 'v1', vehicle_name: 'نسافة 1', db_number: '101', plate_number: 'A1', vehicle_category: 'nasafa', category_label: 'نسافة', station_outbound: true, is_station_vehicle: false, driver_name: 'علي', has_gps: true, ownership_type: 'owned', sector_name: 'المحطة' },
      { id: 'v2', vehicle_name: 'ناقلة 1', db_number: '202', plate_number: 'B2', vehicle_category: 'container_carrier', category_label: 'ناقلة حاويات مكبسية', station_outbound: true, is_station_vehicle: true, driver_name: null, has_gps: false, ownership_type: 'rented', sector_name: null },
    ]
    h.destinations = [
      { id: 'd1', name: 'النهروان', geofence_id: 'z1', geofence_name: 'زون النهروان', has_zone: true, active: true, sort: 1 },
      { id: 'd2', name: 'النباعي', geofence_id: null, geofence_name: null, has_zone: false, active: true, sort: 2 },
    ]
    h.drivers = [{ id: 'x1', full_name: 'سائق خارجي', phone: '07801234567', contractor_name: 'متعهد النقل', contractor_user_id: 'c-1', license_no: 'L-1', license_image_path: null, notes: null, active: true, vehicles: ['12'] }]
    h.categories = [
      { code: 'six', label: 'سكس', min_tons: 10, max_tons: null, weighing_destination: 'transfer_station', garage_usable: true, station_outbound: true, active: true, sort: 7, updated_at: null, updated_by: null },
      { code: 'other', label: 'أخرى', min_tons: null, max_tons: null, weighing_destination: null, garage_usable: true, station_outbound: false, active: true, sort: 99, updated_at: null, updated_by: null },
    ]
    h.zones = [{ id: 'z1', name: 'زون النهروان', source: 'platform', color: '#000', polygon: [] }, { id: 'z9', name: 'LVN zone', source: 'lvn', color: '#000', polygon: [] }]
  })

  it('يعرض الإحصاءات ويعلّم آلية كآلية محطة ويلغي التعليم', () => {
    ui()
    expect(screen.getByTestId('sf-st-vehicles')).toHaveTextContent('2')
    expect(screen.getByTestId('sf-st-dest')).toHaveTextContent('2')
    expect(screen.getByTestId('sf-st-nozone')).toHaveTextContent('1')
    expect(screen.getByTestId('sf-st-drivers')).toHaveTextContent('1')
    const row1 = screen.getByTestId('sf-veh-101')
    expect(within(row1).getByText('مرتبط')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('sf-veh-toggle-101'))
    expect(h.setStation).toHaveBeenCalledWith({ vehicleId: 'v1', isStation: true })
    fireEvent.click(screen.getByTestId('sf-veh-toggle-202'))
    expect(h.setStation).toHaveBeenCalledWith({ vehicleId: 'v2', isStation: false })
    fireEvent.change(screen.getByTestId('sf-veh-search'), { target: { value: 'نسافة' } })
    fireEvent.click(screen.getByTestId('sf-veh-only'))
    expect(h.candidatesArgs).toEqual(['نسافة', true])
  })

  it('الوجهات: يعرض «بلا زون» ويربط زون منصة فقط عند التعديل', () => {
    ui()
    fireEvent.click(screen.getByTestId('sf-tab-destinations'))
    expect(screen.getByTestId('sf-dest-النباعي')).toHaveTextContent('بلا زون')
    expect(screen.getByTestId('sf-dest-النهروان')).toHaveTextContent('زون النهروان')
    fireEvent.click(screen.getByTestId('sf-dest-edit-النباعي'))
    const zone = screen.getByTestId('sf-dest-zone') as HTMLSelectElement
    expect(within(zone).queryByText('LVN zone')).toBeNull()
    fireEvent.change(zone, { target: { value: 'z1' } })
    fireEvent.click(screen.getByTestId('sf-dest-save'))
    expect(h.saveDest).toHaveBeenCalledWith({ id: 'd2', name: 'النباعي', geofenceId: 'z1', sort: 2, active: true }, expect.anything())
  })

  it('الوجهات: اسم فارغ يُرفض محلياً', () => {
    ui()
    fireEvent.click(screen.getByTestId('sf-tab-destinations'))
    fireEvent.click(screen.getByTestId('sf-dest-add'))
    fireEvent.click(screen.getByTestId('sf-dest-save'))
    expect(screen.getByRole('alert')).toHaveTextContent('اسم الوجهة مطلوب')
    expect(h.saveDest).not.toHaveBeenCalled()
  })

  it('السائقون الخارجيون: إضافة مع تحقق الهاتف وإيقاف سائق', () => {
    ui()
    fireEvent.click(screen.getByTestId('sf-tab-drivers'))
    fireEvent.click(screen.getByTestId('sf-drv-add'))
    fireEvent.change(screen.getByTestId('sf-drv-name'), { target: { value: 'حسن' } })
    // 00375: المتعهد حساب في النظام (قائمة) لا نص حر
    expect(screen.getByTestId('sf-drv-contractor').tagName).toBe('SELECT')
    fireEvent.click(screen.getByTestId('sf-drv-save'))
    expect(screen.getByRole('alert')).toHaveTextContent('اختر المتعهد')
    expect(screen.getByText('DB 12', { exact: false })).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('sf-drv-contractor'), { target: { value: 'c-1' } })
    fireEvent.change(screen.getByTestId('sf-drv-phone'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByTestId('sf-drv-save'))
    expect(screen.getByRole('alert')).toHaveTextContent('رقم الهاتف')
    fireEvent.change(screen.getByTestId('sf-drv-phone'), { target: { value: '07700000000' } })
    fireEvent.click(screen.getByTestId('sf-drv-save'))
    expect(h.saveDrv).toHaveBeenCalledWith(expect.objectContaining({ id: null, fullName: 'حسن', contractorUserId: 'c-1', phone: '07700000000', active: true }), expect.anything())
    fireEvent.click(screen.getByTestId('sf-drv-edit-سائق خارجي'))
    fireEvent.click(screen.getByTestId('sf-drv-active'))
    fireEvent.click(screen.getByTestId('sf-drv-save'))
    expect(h.saveDrv).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'x1', active: false, licenseNo: 'L-1' }), expect.anything())
  })

  it('الفئات: فئة جديدة بلا وزن، وفئة وزن تتطلب حداً أدنى، والرمز لا يُعدَّل', () => {
    ui()
    fireEvent.click(screen.getByTestId('sf-tab-categories'))
    expect(screen.getByTestId('sf-cat-six')).toHaveTextContent('المحطة التحويلية')
    fireEvent.click(screen.getByTestId('sf-cat-add'))
    fireEvent.change(screen.getByTestId('sf-cat-code'), { target: { value: 'water_truck' } })
    fireEvent.change(screen.getByTestId('sf-cat-label'), { target: { value: 'حوضية' } })
    fireEvent.change(screen.getByTestId('sf-cat-weigh'), { target: { value: 'press' } })
    fireEvent.click(screen.getByTestId('sf-cat-save'))
    expect(screen.getByRole('alert')).toHaveTextContent('حداً أدنى')
    fireEvent.change(screen.getByTestId('sf-cat-weigh'), { target: { value: '' } })
    fireEvent.click(screen.getByTestId('sf-cat-outbound'))
    fireEvent.click(screen.getByTestId('sf-cat-save'))
    expect(h.saveCat).toHaveBeenCalledWith({ code: 'water_truck', label: 'حوضية', minTons: null, maxTons: null, weighingDestination: null, garageUsable: true, stationOutbound: true, sort: 50, active: true }, expect.anything())
    fireEvent.click(screen.getByTestId('sf-cat-edit-six'))
    expect(screen.getByTestId('sf-cat-code')).toBeDisabled()
  })
})
