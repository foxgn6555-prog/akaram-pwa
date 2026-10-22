import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@sdk/client', () => ({ supabase: { rpc: h.rpc }, sdkGuard: async (p: Promise<{ data: unknown; error: unknown }>) => { const r = await p; if (r.error) throw new Error((r.error as { message: string }).message); return r.data } }))
import { stationErrorMessage, stationFleet } from '@sdk/station-fleet.sdk'

describe('stationFleet sdk (00329)', () => {
  beforeEach(() => { vi.clearAllMocks(); h.rpc.mockResolvedValue({ data: [], error: null }) })

  it('يرسل معاملات الفئة والوجهة والسائق الخارجي بأسماء RPC الصحيحة', async () => {
    await stationFleet.saveCategory({ code: 'nasafa', label: 'نسافة', minTons: null, maxTons: null, weighingDestination: null, garageUsable: true, stationOutbound: true, sort: 8, active: true })
    expect(h.rpc).toHaveBeenCalledWith('ops_vehicle_category_save', { p_code: 'nasafa', p_label: 'نسافة', p_min_tons: null, p_max_tons: null, p_weighing_destination: null, p_garage_usable: true, p_station_outbound: true, p_sort: 8, p_active: true })
    await stationFleet.saveDestination({ id: null, name: 'النهروان', geofenceId: 'z1', sort: 1, active: true })
    expect(h.rpc).toHaveBeenCalledWith('station_destination_save', { p_id: null, p_name: 'النهروان', p_geofence_id: 'z1', p_sort: 1, p_active: true })
    await stationFleet.setStationVehicle('v1', true)
    expect(h.rpc).toHaveBeenCalledWith('garage_set_station_vehicle', { p_vehicle_id: 'v1', p_is_station: true })
    await stationFleet.candidates('', true)
    expect(h.rpc).toHaveBeenCalledWith('station_fleet_candidates', { p_search: null, p_only_station: true, p_limit: 60 })
  })

  it('تسجيل الخروج: القيم الاختيارية تُرسل null', async () => {
    await stationFleet.recordExit({ vehicleId: 'v1', driverKind: 'employee', destinationId: 'd1', driverEmployeeId: 'e1' })
    expect(h.rpc).toHaveBeenCalledWith('station_record_exit', { p_vehicle_id: 'v1', p_driver_kind: 'employee', p_destination_id: 'd1', p_driver_employee_id: 'e1', p_external_driver_id: null, p_driver_name: null, p_weight_tons: null, p_log_date: null })
  })

  it('رسائل الأخطاء تُعرَّب حسب الرمز وتُعاد كما هي إن كانت مجهولة', () => {
    expect(stationErrorMessage(new Error('STATION_VEHICLE_NOT_STATION'))).toBe('هذه الآلية ليست من آليات المحطة')
    expect(stationErrorMessage(new Error('P0001: STATION_WEIGHT_REQUIRED'))).toContain('وزن الحمولة')
    expect(stationErrorMessage(new Error('weird'))).toBe('weird')
  })
})
