/** وحدة السكسات/النسافات الخارجة (00330): الخروج بالقوائم فقط — آلية ← سائق ← وجهة؛ وسم التتبع؛ جدول الوجهة/الوصول */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { SaksatRecord } from '@features/transfer-station/types'

const h = vi.hoisted(() => ({ list: [] as unknown[], legacy: [] as unknown[], fleet: [] as unknown[], drivers: [] as unknown[], dests: [] as unknown[], record: vi.fn() }))
vi.mock('@features/transfer-station', () => ({ useSaksatList: () => ({ data: h.list, isLoading: false }), useTripsList: () => ({ data: h.legacy, isLoading: false }) }))
vi.mock('@features/station-fleet/hooks', () => ({
  useStationFleet: () => ({ data: h.fleet, isLoading: false }),
  useStationDrivers: () => ({ data: h.drivers, isLoading: false }),
  useStationDestinations: () => ({ data: h.dests, isLoading: false }),
  useStationRecordExit: () => ({ mutate: h.record, isPending: false }),
}))
import SaksatPage from '@portals/transfer-station/pages/Saksat/SaksatPage'

const REC = (over: Partial<SaksatRecord>): SaksatRecord => ({
  id: 's1', driver_name: 'سائق سكسة', vehicle_type: 'سكس', weight_tons: 8, exit_time: '2026-09-01T08:05:00Z', log_date: '2026-09-01', status: 'draft',
  submitted_at: null, archived_at: null, archive_reason: null, created_at: null, ...over,
})
const ui = () => render(<MemoryRouter><SaksatPage /></MemoryRouter>)

beforeEach(() => {
  h.record.mockReset()
  h.legacy = []
  h.fleet = [
    { id: 'v1', vehicle_name: 'نسافة 1', db_number: '101', plate_number: 'A1', vehicle_category: 'nasafa', category_label: 'نسافة', station_outbound: true, driver_employee_id: null, driver_name: null, has_gps: true, device_id: 'dev1', ownership_type: 'owned' },
    { id: 'v2', vehicle_name: 'سكس 2', db_number: '102', plate_number: 'A2', vehicle_category: 'six', category_label: 'سكس', station_outbound: true, driver_employee_id: null, driver_name: null, has_gps: false, device_id: null, ownership_type: 'rented' },
    { id: 'v3', vehicle_name: 'ناقلة', db_number: '202', plate_number: 'B2', vehicle_category: 'container_carrier', category_label: 'ناقلة حاويات مكبسية', station_outbound: true, driver_employee_id: null, driver_name: null, has_gps: true, device_id: 'd', ownership_type: 'owned' },
  ]
  h.drivers = [
    { driver_kind: 'employee', ref_id: 'e1', full_name: 'علي الموظف', detail: 'سائق · 100', phone: null },
    { driver_kind: 'external', ref_id: 'x1', full_name: 'حسن الخارجي', detail: 'متعهد: النقل', phone: null },
  ]
  h.dests = [{ id: 'd1', name: 'النهروان', geofence_id: 'z', geofence_name: 'زون', has_zone: true, active: true, sort: 1 }, { id: 'd2', name: 'النباعي', geofence_id: null, geofence_name: null, has_zone: false, active: true, sort: 2 }]
  h.list = [
    REC({ id: 's1', destination_name: 'النهروان', tracking: 'gps', arrived_at: '2026-09-01T09:10:00Z', db_number: '101' }),
    REC({ id: 's2', driver_name: 'سائق 2', destination_name: 'النباعي', tracking: 'none', arrived_at: null }),
    REC({ id: 's3', driver_name: 'سائق قديم', destination_name: null }),
    REC({ id: 's4', driver_name: 'سائق 4', destination_name: 'النهروان', tracking: 'gps', arrived_at: null }),
  ]
})

describe('SaksatPage (00330)', () => {
  it('قائمة الآليات تستثني الناقلات، والجدول يعرض الوجهة والوصول بالحالات الأربع', () => {
    ui()
    const sel = screen.getByTestId('f-saksat-vehicle') as HTMLSelectElement
    expect(within(sel).getByText(/DB 101/)).toBeInTheDocument()
    expect(within(sel).getByText(/DB 102 .* بلا GPS/)).toBeInTheDocument()
    expect(within(sel).queryByText(/DB 202/)).toBeNull()
    expect(screen.getByTestId('saksat-arrival-s1')).toHaveTextContent('وصلت')
    expect(screen.getByTestId('saksat-arrival-s2')).toHaveTextContent('بلا تتبع')
    expect(screen.getByTestId('saksat-arrival-s3')).toHaveTextContent('قديم')
    expect(screen.getByTestId('saksat-arrival-s4')).toHaveTextContent('في الطريق')
    expect(screen.queryByTestId('f-saksat-name')).toBeNull()
  })

  it('يرفض الإرسال بلا آلية/سائق/وجهة ولا يستدعي الحفظ', () => {
    ui()
    fireEvent.click(screen.getByTestId('saksat-submit'))
    expect(h.record).not.toHaveBeenCalled()
    expect(screen.getByText('اختر الآلية من قائمة آليات المحطة')).toBeInTheDocument()
    expect(screen.getByText('اختر السائق من القائمة')).toBeInTheDocument()
    expect(screen.getByText('اختر الوجهة')).toBeInTheDocument()
  })

  it('خروج بسائق موظف ونسافة بـ GPS: وسم «الوصول يُسجَّل آلياً» والحمولة القياسية للنسافة 25 وللسكس 10', () => {
    ui()
    fireEvent.change(screen.getByTestId('f-saksat-vehicle'), { target: { value: 'v1' } })
    expect(screen.getByTestId('f-saksat-tracking')).toHaveTextContent('الوصول يُسجَّل آلياً')
    expect(screen.getByTestId('f-saksat-dk-contracted')).toBeDisabled()
    fireEvent.change(screen.getByTestId('f-saksat-driver'), { target: { value: 'e1' } })
    fireEvent.change(screen.getByTestId('f-saksat-destination'), { target: { value: 'd1' } })
    fireEvent.click(screen.getByTestId('saksat-submit'))
    expect(h.record).toHaveBeenCalledWith({ vehicleId: 'v1', driverKind: 'employee', destinationId: 'd1', driverEmployeeId: 'e1', externalDriverId: null, driverName: null, weightTons: 25 }, expect.anything())
    fireEvent.change(screen.getByTestId('f-saksat-vehicle'), { target: { value: 'v2' } })
    expect(screen.getByTestId('f-saksat-weight')).toHaveValue(10)
  })

  it('00332: سجلات النسافات القديمة تظهر للقراءة فقط عند وجودها', () => {
    ui()
    expect(screen.queryByTestId('saksat-legacy')).toBeNull()
  })
  it('00332: قسم قابل للطي للسجلات القديمة', () => {
    h.legacy = [REC({ id: 't1', driver_name: 'سائق نسافة قديم', vehicle_type: 'نسافة' })]
    ui()
    expect(screen.getByTestId('saksat-legacy')).toHaveTextContent('1 سجل')
    expect(screen.queryByText('سائق نسافة قديم')).toBeNull()
    fireEvent.click(screen.getByTestId('saksat-legacy-toggle'))
    expect(screen.getByText('سائق نسافة قديم')).toBeInTheDocument()
    expect(screen.getByTestId('saksat-legacy').querySelector('input, select, button[type=submit]')).toBeNull()
  })

  it('آلية مؤجرة بلا GPS: وسم «بلا تتبع»، سائق خارجي من القائمة أو متعاقد بالاسم', () => {
    ui()
    fireEvent.change(screen.getByTestId('f-saksat-vehicle'), { target: { value: 'v2' } })
    expect(screen.getByTestId('f-saksat-tracking')).toHaveTextContent('بلا تتبع')
    fireEvent.click(screen.getByTestId('f-saksat-dk-external'))
    const drv = screen.getByTestId('f-saksat-driver') as HTMLSelectElement
    expect(within(drv).getByText(/حسن الخارجي/)).toBeInTheDocument()
    expect(within(drv).queryByText(/علي الموظف/)).toBeNull()
    fireEvent.click(screen.getByTestId('f-saksat-dk-contracted'))
    fireEvent.change(screen.getByTestId('f-saksat-destination'), { target: { value: 'd2' } })
    fireEvent.click(screen.getByTestId('saksat-submit'))
    expect(screen.getByText('اكتب اسم سائق الآلية المتعاقدة')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('f-saksat-driver-name'), { target: { value: 'سائق المتعاقد' } })
    fireEvent.change(screen.getByTestId('f-saksat-weight'), { target: { value: '' } })
    fireEvent.click(screen.getByTestId('saksat-submit'))
    expect(h.record).toHaveBeenCalledWith(expect.objectContaining({ vehicleId: 'v2', driverKind: 'contracted', driverName: 'سائق المتعاقد', destinationId: 'd2', weightTons: null }), expect.anything())
  })

  it('بلا آليات معلَّمة: رسالة توجيه لغرفة العمليات', () => {
    h.fleet = []
    ui()
    expect(screen.getByTestId('saksat-no-fleet')).toBeInTheDocument()
  })
})
