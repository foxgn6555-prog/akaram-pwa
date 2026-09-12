import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({
  sync: vi.fn(),
  bind: vi.fn(),
  unbind: vi.fn(),
  history: vi.fn(),
  allHistory: vi.fn(),
  batchHistory: vi.fn(),
  alert: vi.fn(),
  zone: vi.fn(),
  routeWindow: vi.fn((..._args: unknown[]) => ({ data: [], isLoading: false })),
  zoneVehicles: vi.fn(),
  alertBulk: vi.fn().mockResolvedValue([]),
  exportAlerts: vi.fn(),
  exportTrips: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@portals/ops-room/pages/Gps/GpsRouteMap', () => ({
  default: () => <div data-testid="mock-route-map" />,
}))
vi.mock('@sdk/gps-lvn.sdk', () => ({
  gpsLvn: {
    alertEscalationsBulk: h.alertBulk,
    tripRouteDiagnostics: vi.fn().mockResolvedValue([]),
    tripShiftContexts: vi.fn().mockResolvedValue([]),
    tripRouteMetrics: vi.fn().mockResolvedValue([]),
    tripRouteEvents: vi.fn().mockResolvedValue([]),
    tripWindowCoverageAudit: vi.fn().mockResolvedValue([]),
    tripZoneEvents: vi.fn().mockResolvedValue([]),
    tripInvestigations: vi.fn().mockResolvedValue([]),
  },
}))
vi.mock('@features/gps-lvn/export', () => ({
  exportGpsAlerts: h.exportAlerts,
  exportGpsTrips: h.exportTrips,
}))
const alert = {
  id: 'alert-1',
  device_id: 'g1',
  device_name: 'كابسة GPS',
  garage_vehicle_id: 'v1',
  vehicle_name: 'كابسة GPS',
  db_number: '100',
  departure_id: 'trip-1',
  alert_type: 'gps_stale',
  severity: 'warning',
  title: 'توقفت قراءات GPS',
  details: {},
  opened_at: '2026-09-10T08:00:00Z',
  acknowledged_at: null,
  acknowledged_by: null,
  occurrence_count: 3,
  last_detected_at: '2026-09-10T08:05:00Z',
}
const trip = {
  departure_id: 'trip-1',
  vehicle_id: 'v1',
  device_id: 'g1',
  db_number: '100',
  vehicle_name: 'كابسة GPS',
  driver_name: 'أحمد',
  departed_at: '2026-09-10T06:00:00Z',
  returned_at: '2026-09-14T08:00:00Z',
  gps_points: 120,
  first_fix: '2026-09-10T06:01:00Z',
  last_fix: '2026-09-10T08:00:00Z',
  covered_seconds: 7000,
  total_seconds: 7200,
  coverage_percent: 97,
  gap_count: 0,
  largest_gap_seconds: 0,
  gps_coverage: 'covered',
  last_import_status: 'success',
  source_points: 120,
  stored_points: 120,
  imported_at: '2026-09-10T08:01:00Z',
}
const device = {
  id: 'g1',
  external_id: '101',
  device_name: 'كابسة GPS',
  imei: 'IMEI-1',
  vin: 'VIN-1',
  plate_number: 'بغداد 1',
  registration_number: null,
  object_owner: 'البلدية',
  device_model: 'LVN-X',
  driver_name: 'أحمد',
  online_status: 'online',
  engine_status: 'on',
  operational_status: 'moving',
  alarm: null,
  last_seen_at: '2026-09-10T10:00:00Z',
  latitude: 33.3,
  longitude: 44.3,
  speed: 22,
  speed_unit: 'kph',
  course: 90,
  power: '12',
  address: 'الرياض',
  fix_time: '2026-09-10T10:00:00Z',
  garage_vehicle_id: null,
  garage_vehicle_name: null,
  garage_db_number: null,
  active_departure_id: null,
  departure_driver: null,
  departed_at: null,
  trip_stage: 'none',
  assigned_zone_count: 0,
  inside_assigned_zone: false,
  total_count: 1,
}
vi.mock('@features/gps-lvn/hooks', () => ({
  useGpsAutoSync: () => ({ lastAttempt: null }),
  useGpsRoute: () => ({ data: [], isLoading: false }),
  useGpsRouteWindow: (...args: unknown[]) => h.routeWindow(...args),
  useGpsTripHistory: () => ({ data: [trip], isLoading: false }),
  useGpsTripShiftContext: () => ({ data: [], isLoading: false }),
  useGpsTripZoneEvents: () => ({ data: [], isLoading: false }),
  useGpsTripInvestigations: () => ({ data: [], isLoading: false }),
  useGpsTripInvestigationSave: () => ({ mutate: vi.fn(), isPending: false }),
  useGpsTripMetrics: () => ({ data: [], isLoading: false }),
  useGpsTripDiagnostics: () => ({ data: [], isLoading: false }),
  useGpsTripWindowCoverageAudit: () => ({
    data: [
      {
        window_index: 0,
        range_from: '2026-09-10T06:00:00Z',
        range_to: '2026-09-13T06:00:00Z',
        expected_seconds: 259200,
        import_status: 'success',
        run_id: 'r1',
        chunks_requested: 6,
        chunks_completed: 6,
        source_points: 125,
        valid_points: 120,
        reported_stored_points: 120,
        rejected_points: 5,
        actual_stored_points: 120,
        renderable_points: 120,
        first_fix: '2026-09-10T06:01:00Z',
        last_fix: '2026-09-13T05:59:00Z',
        leading_gap_seconds: 60,
        trailing_gap_seconds: 60,
        internal_gap_count: 0,
        largest_gap_seconds: 60,
        covered_seconds: 250000,
        coverage_percent: 96.5,
        source_acceptance_percent: 96,
        storage_match_percent: 100,
        render_complete: true,
        diagnosis_code: 'provider_payload_rejected',
        error_code: null,
        finished_at: '2026-09-13T06:01:00Z',
      },
    ],
    isLoading: false,
  }),
  useGpsHistoryWindows: () => ({
    data: [
      { window_index: 0, status: 'success', chunks_completed: 6, chunks_requested: 6 },
      { window_index: 1, status: 'pending', chunks_completed: null, chunks_requested: null },
    ],
    isLoading: false,
  }),
  useGpsBatchHistoryAudit: () => ({
    mutate: h.batchHistory,
    isPending: false,
    progress: { currentTrip: 0, totalTrips: 0, currentWindow: 0, totalWindows: 0 },
    results: [],
  }),
  useGpsAllHistoryImport: () => ({
    mutate: h.allHistory,
    isPending: false,
    progress: { current: 0, total: 0 },
  }),
  useGpsTripEvents: () => ({ data: [], isLoading: false }),
  useGpsAlertEscalations: () => ({ data: [], isLoading: false }),
  useGpsSchedulerHealth: () => ({ data: null, isLoading: false }),
  useGpsLiveMap: () => ({ data: [] }),
  useGpsMapGeofences: () => ({
    data: [
      {
        id: 'z1',
        name: 'زون المنصة',
        source: 'platform',
        color: '#06b6d4',
        polygon: [
          { lat: 33.3, lng: 44.3 },
          { lat: 33.4, lng: 44.3 },
          { lat: 33.4, lng: 44.4 },
        ],
      },
    ],
  }),
  useGpsOpenAlerts: () => ({ data: [alert] }),
  useGpsZoneEvents: () => ({ data: [] }),
  useGpsAlertWorkflow: () => ({ mutate: h.alert, isPending: false }),
  useGpsPlatformGeofence: () => ({ mutate: h.zone, isPending: false }),
  useGpsGeofences: () => ({ data: [] }),
  useGpsGeofenceAssignment: () => ({ mutate: vi.fn(), isPending: false }),
  useGpsZoneVehicles: () => ({
    data: [
      {
        vehicle_id: 'v1',
        vehicle_name: 'كابسة الاختبار',
        db_number: '101',
        plate_number: null,
        vehicle_category: 'كابسة',
        is_assigned: false,
        device_id: 'g1',
        device_name: 'GPS',
      },
    ],
    isLoading: false,
  }),
  useGpsZoneVehicleAssignment: () => ({ mutate: h.zoneVehicles, isPending: false }),
  useGpsHistoryImport: () => ({ mutate: h.history, isPending: false }),
  useGpsDashboard: () => ({
    data: {
      total: 1,
      online: 1,
      offline: 0,
      moving: 1,
      stopped: 0,
      bound: 0,
      unbound: 1,
      stale: 0,
      alarms: 0,
      last_success_at: '2026-09-10T10:00:00Z',
      last_full_sync_at: null,
      last_incremental_sync_at: null,
      last_error_code: null,
      api_version: '2.5.1',
    },
  }),
  useGpsDevices: () => ({ data: [device], isLoading: false, isFetching: false }),
  useGpsOptions: () => ({ data: { owners: ['البلدية'], models: ['LVN-X'], drivers: ['أحمد'] } }),
  useGpsSyncRuns: () => ({ data: [] }),
  useGpsSync: () => ({ mutate: h.sync, isPending: false }),
  useGpsBind: () => ({ mutate: h.bind, isPending: false }),
  useGpsUnbind: () => ({ mutate: h.unbind, isPending: false }),
  useGpsDetail: () => ({ data: null, isLoading: false }),
  useGpsCandidates: () => ({ data: [] }),
}))
import GpsDataPage from '@portals/ops-room/pages/Gps/GpsDataPage'
import { useUiStore } from '@stores/ui.store'
describe('بيانات LVN GPS', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useUiStore.setState({ toasts: [] })
  })
  it('تعرض غرفة العمليات ثم مساحة الأسطول وفلاترها المنظمة', () => {
    render(<GpsDataPage />)
    expect(screen.getByTestId('gps-data-page')).toHaveTextContent('قيادة الانطلاقيات والمسارات')
    expect(screen.getByText('الخريطة التشغيلية')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'الخريطة الحية' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'التنبيهات (1)' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /أجهزة الأسطول/ }))
    expect(screen.getAllByText('كابسة GPS').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/كم\/س/).length).toBeGreaterThan(0)
    expect(screen.getByLabelText('مالك الجهاز')).toBeInTheDocument()
    expect(screen.getByLabelText('الحالة التشغيلية')).toBeInTheDocument()
    expect(screen.getByLabelText('حالة الانطلاقة')).toBeInTheDocument()
    expect(screen.getByLabelText('المدار / الزون')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'المسار' }).length).toBeGreaterThan(0)
  })
  it('يوفر فحص التكامل والمزامنة والربط', () => {
    render(<GpsDataPage />)
    fireEvent.click(screen.getByRole('button', { name: /سلامة التكامل/ }))
    fireEvent.click(screen.getByRole('button', { name: /اختبار الاتصال/ }))
    expect(h.sync).toHaveBeenCalledWith('test')
    fireEvent.click(screen.getByRole('button', { name: /مزامنة الآن/ }))
    expect(h.sync).toHaveBeenCalledWith('full')
    fireEvent.click(screen.getByRole('button', { name: /أجهزة الأسطول/ }))
    fireEvent.click(screen.getAllByRole('button', { name: 'ربط' })[0]!)
    expect(screen.getByText('ربط الجهاز بآلية')).toBeInTheDocument()
  })
  it('يصدر التنبيهات العربية مع سجل التصعيد الجماعي', async () => {
    h.alertBulk.mockResolvedValueOnce([])
    render(<GpsDataPage />)
    fireEvent.click(screen.getByRole('button', { name: 'تصدير التنبيهات والتصعيد' }))
    await waitFor(() => expect(h.alertBulk).toHaveBeenCalledWith(['alert-1']))
    await waitFor(() => expect(h.exportAlerts).toHaveBeenCalledWith([alert], []))
  })
  it('يعرض فشل تصدير التنبيهات ويعيد تفعيل الزر', async () => {
    h.alertBulk.mockRejectedValueOnce(new Error('network'))
    render(<GpsDataPage />)
    fireEvent.click(screen.getByRole('button', { name: 'تصدير التنبيهات والتصعيد' }))
    await waitFor(() => expect(useUiStore.getState().toasts.at(-1)?.type).toBe('error'))
    expect(screen.getByRole('button', { name: 'تصدير التنبيهات والتصعيد' })).toBeEnabled()
  })
  it('يقر التنبيه ويسجل وصف المعالجة', () => {
    render(<GpsDataPage />)
    fireEvent.click(screen.getByRole('button', { name: 'إقرار المتابعة' }))
    expect(h.alert).toHaveBeenCalledWith({ type: 'acknowledge', alertId: 'alert-1' })
    fireEvent.click(screen.getByRole('button', { name: 'تسجيل المعالجة' }))
    fireEvent.change(screen.getByLabelText('إجراء معالجة التنبيه'), {
      target: { value: 'تم فحص الجهاز ميدانياً' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'اعتماد المعالجة وإغلاق التنبيه' }))
    expect(h.alert).toHaveBeenCalledWith(
      { type: 'resolve', alertId: 'alert-1', note: 'تم فحص الجهاز ميدانياً' },
      expect.any(Object),
    )
  })
  it('يفلتر الاستثناءات حسب التكرار ويعرض عداد التجميع', () => {
    render(<GpsDataPage />)
    expect(screen.getByText('تكرر 3×')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('فلتر تكرار التنبيه'), { target: { value: '5' } })
    expect(screen.getByText('لا توجد تنبيهات تطابق الفلاتر.')).toBeInTheDocument()
  })
  it('يسند عدة آليات للزون من النافذة الجماعية', () => {
    render(<GpsDataPage />)
    fireEvent.click(screen.getByRole('button', { name: /الزونات/ }))
    fireEvent.click(screen.getByRole('button', { name: 'إسناد الآليات' }))
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'حفظ الإسناد' }))
    expect(h.zoneVehicles).toHaveBeenCalledWith(
      { zoneId: 'z1', vehicleIds: ['v1'] },
      expect.any(Object),
    )
  })
  it('ينشئ زوناً تشغيلياً من محرر الإحداثيات', () => {
    render(<GpsDataPage />)
    fireEvent.click(screen.getByRole('button', { name: /الزونات المناطق والحركة/ }))
    fireEvent.click(screen.getByRole('button', { name: '+ إنشاء زون تشغيلي جديد' }))
    fireEvent.change(screen.getByLabelText('اسم الزون'), { target: { value: 'زون جديد' } })
    fireEvent.change(screen.getByLabelText('إحداثيات الزون'), {
      target: { value: '33.3,44.3\n33.4,44.3\n33.4,44.4' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'حفظ الزون' }))
    expect(h.zone).toHaveBeenCalledWith(expect.objectContaining({ type: 'save', name: 'زون جديد' }))
  })
  it('يفتح مسار الانطلاقية ويتيح تدقيقه من LVN', async () => {
    render(<GpsDataPage />)
    fireEvent.click(screen.getByRole('button', { name: /الانطلاقيات المسار/ }))
    expect(screen.getByText('سجل الانطلاقيات ومساراتها')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('بحث الانطلاقيات'), { target: { value: 'غير موجود' } })
    expect(screen.getByText('لا توجد انطلاقيات تطابق فلاتر التحقيق.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('بحث الانطلاقيات'), { target: { value: '100' } })
    fireEvent.click(screen.getByRole('button', { name: 'تدقيق جماعي (1)' }))
    expect(h.batchHistory).toHaveBeenCalledWith(['trip-1'])
    fireEvent.click(screen.getAllByRole('button', { name: 'قارن' })[0]!)
    expect(screen.getByRole('region', { name: 'مقارنة الانطلاقيات' })).toHaveTextContent(
      'مقارنة انطلاقيتين',
    )
    fireEvent.click(screen.getAllByRole('button', { name: 'فتح المسار' })[0]!)
    const routeDialog = screen.getByRole('dialog', { name: /مسار انطلاقية/ })
    expect(routeDialog).toHaveClass('z-[2000]', 'fixed', 'inset-0')
    expect(routeDialog.parentElement).toBe(document.body)
    expect(document.body.style.overflow).toBe('hidden')
    expect(screen.getByText('التسلسل الزمني')).toBeInTheDocument()
    expect(await screen.findByTestId('mock-route-map')).toBeInTheDocument()
    expect(screen.getByText('المسافة التقريبية')).toBeInTheDocument()
    expect(screen.getByText(/مسار طويل مقسم/)).toBeInTheDocument()
    expect(screen.getByText('سجل تحقيق المسار')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ملاحظة عامة' }))
    expect(screen.getByRole('region', { name: 'محرر تحقيق GPS' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'سلسلة اكتمال نافذة المسار' })).toHaveTextContent(
      'مستلم من LVN',
    )
    expect(screen.getByRole('region', { name: 'سلسلة اكتمال نافذة المسار' })).toHaveTextContent(
      'رفض في بيانات المصدر',
    )
    expect(screen.getByRole('region', { name: 'سلسلة اكتمال نافذة المسار' })).toHaveTextContent(
      '١٢٠',
    )
    fireEvent.click(screen.getByRole('button', { name: 'ملف تحقيق Excel' }))
    await waitFor(() =>
      expect(h.exportTrips).toHaveBeenCalledWith([trip], [], [], [], [], [], [], [], []),
    )
    expect(useUiStore.getState().toasts.at(-1)?.type).toBe('success')
    fireEvent.click(screen.getByRole('button', { name: 'تدقيق كل النوافذ الناقصة (1)' }))
    expect(h.allHistory).toHaveBeenCalledWith({ departureId: 'trip-1', indexes: [1] })
    fireEvent.click(screen.getByRole('button', { name: 'نافذة المسار التالية' }))
    expect(h.routeWindow).toHaveBeenLastCalledWith(
      'g1',
      '2026-09-13T06:00:00.000Z',
      '2026-09-14T08:00:00.000Z',
      true,
    )
    fireEvent.click(screen.getByRole('button', { name: 'تدقيق نافذة 2 من LVN' }))
    expect(h.history).toHaveBeenCalledWith({ departureId: 'trip-1', windowIndex: 1 })
  })
})
