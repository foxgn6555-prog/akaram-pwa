import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }))
vi.mock('@sdk/client', () => ({
  supabase: { rpc: h.rpc, functions: { invoke: h.invoke } },
  sdkGuard: async (value: Promise<{ data: unknown; error: null | { message: string } }>) => {
    const result = await value
    if (result.error) throw new Error(result.error.message)
    return result.data
  },
  sdkVoid: async (value: Promise<{ error: null | { message: string } }>) => {
    const result = await value
    if (result.error) throw new Error(result.error.message)
  },
}))
import { gpsLvn, pullShiftWindow } from '@sdk/gps-lvn.sdk'
describe('LVN GPS SDK', () => {
  beforeEach(() => {
    h.rpc.mockReset()
    h.invoke.mockReset()
    h.rpc.mockResolvedValue({ data: [], error: null })
  })
  it('يمرر جميع الفلاتر والترقيم إلى RPC', async () => {
    await gpsLvn.devices({
      search: ' DB-1 ',
      online: 'online',
      operational: 'moving',
      trip: 'active',
      zone: 'inside',
      binding: 'bound',
      freshness: 'fresh',
      owner: 'البلدية',
      model: 'X',
      page: 2,
      pageSize: 30,
    })
    expect(h.rpc).toHaveBeenCalledWith('gps_lvn_devices_v2', {
      p_search: 'DB-1',
      p_online: 'online',
      p_operational: 'moving',
      p_binding: 'bound',
      p_freshness: 'fresh',
      p_owner: 'البلدية',
      p_model: 'X',
      p_trip: 'active',
      p_zone: 'inside',
      p_limit: 30,
      p_offset: 30,
    })
  })
  it('يجلب المسار بصفحات مرتبطة بحدود يوم بغداد', async () => {
    h.rpc.mockResolvedValueOnce({
      data: [{ fix_time: '2026-09-10T00:00:00Z', total_count: 1 }],
      error: null,
    })
    const rows = await gpsLvn.route('d1', '2026-09-10')
    expect(rows).toHaveLength(1)
    expect(h.rpc).toHaveBeenCalledWith(
      'gps_lvn_route_window',
      expect.objectContaining({
        p_device_id: 'd1',
        p_from: '2026-09-09T21:00:00.000Z',
        p_limit: 5000,
        p_offset: 0,
      }),
    )
  })
  it('يكمل ترقيم المسار بعد خمسة آلاف نقطة دون إسقاط الصفحة التالية', async () => {
    const first = Array.from({ length: 5000 }, (_, index) => ({
      fix_time: `2026-09-10T00:${index}:00Z`,
      total_count: 5001,
    }))
    h.rpc.mockResolvedValueOnce({ data: first, error: null }).mockResolvedValueOnce({
      data: [{ fix_time: '2026-09-10T23:59:00Z', total_count: 5001 }],
      error: null,
    })
    const rows = await gpsLvn.routeWindow('d1', '2026-09-10T00:00:00Z', '2026-09-11T00:00:00Z')
    expect(rows).toHaveLength(5001)
    expect(h.rpc).toHaveBeenLastCalledWith(
      'gps_lvn_route_window',
      expect.objectContaining({ p_limit: 5000, p_offset: 5000 }),
    )
  })
  it('يدير إقرار التنبيه والزونات عبر RPC محمية', async () => {
    await gpsLvn.acknowledgeAlert('a1')
    expect(h.rpc).toHaveBeenLastCalledWith('gps_alert_acknowledge', { p_alert_id: 'a1' })
    await gpsLvn.resolveAlert('a1', ' تمت المعالجة ')
    expect(h.rpc).toHaveBeenLastCalledWith('gps_alert_resolve', {
      p_alert_id: 'a1',
      p_note: 'تمت المعالجة',
    })
    await gpsLvn.savePlatformGeofence(
      null,
      'زون الاختبار',
      [
        { lat: 33.3, lng: 44.3 },
        { lat: 33.4, lng: 44.3 },
        { lat: 33.4, lng: 44.4 },
      ],
      '#06b6d4',
    )
    expect(h.rpc).toHaveBeenLastCalledWith(
      'gps_platform_geofence_save',
      expect.objectContaining({ p_name: 'زون الاختبار' }),
    )
    await gpsLvn.mapLandmarks()
    expect(h.rpc).toHaveBeenLastCalledWith('gps_map_landmarks_list')
    await gpsLvn.saveMapLandmark({
      id: null,
      name: ' محطة الاختبار ',
      category: 'station',
      icon: 'building',
      latitude: 33.3152,
      longitude: 44.3661,
      color: '#f97316',
      notes: ' موقع ثابت ',
    })
    expect(h.rpc).toHaveBeenLastCalledWith('gps_map_landmark_save', {
      p_id: null,
      p_name: 'محطة الاختبار',
      p_category: 'station',
      p_latitude: 33.3152,
      p_longitude: 44.3661,
      p_color: '#f97316',
      p_notes: 'موقع ثابت',
      p_icon: 'building',
    })
  })
  it('يحفظ إسناد الزون وسياسة إشعار GPS بعقود محمية', async () => {
    h.rpc.mockResolvedValueOnce({ data: [{ gps_schedule_healthy: true }], error: null })
    await expect(gpsLvn.schedulerHealth()).resolves.toEqual({ gps_schedule_healthy: true })
    expect(h.rpc).toHaveBeenLastCalledWith('gps_scheduler_health')
    await gpsLvn.tripShiftContext('trip-1')
    expect(h.rpc).toHaveBeenLastCalledWith('gps_trip_shift_context', { p_departure_id: 'trip-1' })
    await gpsLvn.tripShiftContexts(['trip-1', 'trip-2'])
    expect(h.rpc).toHaveBeenLastCalledWith('gps_trip_shift_context_bulk', {
      p_departure_ids: ['trip-1', 'trip-2'],
    })
    await gpsLvn.tripRouteMetrics(['trip-1'])
    expect(h.rpc).toHaveBeenLastCalledWith('gps_trip_route_metrics_bulk', {
      p_departure_ids: ['trip-1'],
    })
    await gpsLvn.tripRouteEvents(['trip-1'])
    expect(h.rpc).toHaveBeenLastCalledWith('gps_trip_route_events_bulk', {
      p_departure_ids: ['trip-1'],
      p_limit: 10000,
    })
    await gpsLvn.tripRouteDiagnostics(['trip-1'])
    expect(h.rpc).toHaveBeenLastCalledWith('gps_trip_route_diagnostics_bulk', {
      p_departure_ids: ['trip-1'],
    })
    await gpsLvn.tripHistoryWindows('trip-1')
    expect(h.rpc).toHaveBeenLastCalledWith('gps_trip_history_windows', {
      p_departure_id: 'trip-1',
    })
    await gpsLvn.tripWindowCoverageAudit('trip-1')
    expect(h.rpc).toHaveBeenLastCalledWith('gps_trip_window_coverage_audit', {
      p_departure_id: 'trip-1',
    })
    await gpsLvn.tripZoneEvents('trip-1')
    expect(h.rpc).toHaveBeenLastCalledWith('gps_trip_zone_events', { p_departure_id: 'trip-1' })
    await gpsLvn.tripInvestigations('trip-1')
    expect(h.rpc).toHaveBeenLastCalledWith('gps_trip_investigations_list', {
      p_departure_id: 'trip-1',
    })
    await gpsLvn.saveTripInvestigation({
      departureId: 'trip-1',
      eventType: 'gap',
      eventAt: '2026-09-10T09:00:00Z',
      note: ' تحقق من الانقطاع ',
      status: 'in_review',
    })
    expect(h.rpc).toHaveBeenLastCalledWith('gps_trip_investigation_save', {
      p_id: null,
      p_departure_id: 'trip-1',
      p_event_type: 'gap',
      p_event_at: '2026-09-10T09:00:00Z',
      p_note: 'تحقق من الانقطاع',
      p_status: 'in_review',
      p_assigned_to: null,
    })
    await gpsLvn.tripRouteEventsPage('trip-1', 'stop', 2)
    expect(h.rpc).toHaveBeenLastCalledWith('gps_trip_route_events_page', {
      p_departure_id: 'trip-1',
      p_event_type: 'stop',
      p_limit: 20,
      p_offset: 20,
    })
    await gpsLvn.alertEscalationHistory('a1')
    expect(h.rpc).toHaveBeenLastCalledWith('gps_alert_escalation_history', { p_alert_id: 'a1' })
    await gpsLvn.alertEscalationsBulk(['a1'])
    expect(h.rpc).toHaveBeenLastCalledWith('gps_alert_escalations_bulk', { p_alert_ids: ['a1'] })
    await gpsLvn.zoneVehicleCandidates('z1', ' DB 101 ')
    expect(h.rpc).toHaveBeenLastCalledWith('gps_zone_vehicle_candidates', {
      p_geofence_id: 'z1',
      p_search: 'DB 101',
    })
    await gpsLvn.replaceZoneVehicles('z1', ['v1', 'v2'])
    expect(h.rpc).toHaveBeenLastCalledWith('gps_zone_replace_vehicles', {
      p_geofence_id: 'z1',
      p_vehicle_ids: ['v1', 'v2'],
    })
    await gpsLvn.saveAlertNotificationPolicy({
      alert_type: 'gps_offline',
      enabled: true,
      priority: 'critical',
      recipient_roles: ['ops_room'],
      in_app_enabled: true,
      push_enabled: true,
      sound_enabled: true,
      only_during_departure: true,
      escalation_minutes: 15,
      escalation_repeat_minutes: 20,
      escalation_levels: 3,
    })
    expect(h.rpc).toHaveBeenLastCalledWith('gps_alert_notification_policy_save', {
      p_alert_type: 'gps_offline',
      p_enabled: true,
      p_priority: 'critical',
      p_recipient_roles: ['ops_room'],
      p_in_app: true,
      p_push: true,
      p_sound: true,
      p_only_during_departure: true,
      p_escalation_minutes: 15,
      p_escalation_repeat_minutes: 20,
      p_escalation_levels: 3,
    })
  })
  it('ينفذ الربط وفكه عبر RPC فقط', async () => {
    await gpsLvn.bind('d1', 'v1', ' ربط يدوي ')
    expect(h.rpc).toHaveBeenLastCalledWith('gps_lvn_bind_vehicle', {
      p_device_id: 'd1',
      p_garage_vehicle_id: 'v1',
      p_notes: 'ربط يدوي',
    })
    await gpsLvn.unbind('d1')
    expect(h.rpc).toHaveBeenLastCalledWith('gps_lvn_unbind_vehicle', { p_device_id: 'd1' })
  })
  it('يستدعي Edge Function للمزامنة دون تمرير أسرار', async () => {
    h.invoke.mockResolvedValue({ data: { ok: true, action: 'full' }, error: null })
    await gpsLvn.sync('full')
    expect(h.invoke).toHaveBeenCalledWith('lvn-gps-sync', { body: { action: 'full' } })
  })
  it('يستورد تاريخ اليوم والانطلاقية من الخادم فقط', async () => {
    h.invoke.mockResolvedValue({ data: { ok: true, action: 'history' }, error: null })
    await gpsLvn.importDayHistory('d1', '2026-09-10')
    expect(h.invoke).toHaveBeenLastCalledWith('lvn-gps-sync', {
      body: { action: 'history', deviceId: 'd1', day: '2026-09-10' },
    })
    await gpsLvn.importDepartureHistory('trip-1', 2)
    expect(h.invoke).toHaveBeenLastCalledWith('lvn-gps-sync', {
      body: { action: 'history', departureId: 'trip-1', windowIndex: 2 },
    })
  })
  it('00210: فشل الدالة الخادمية يُترجَم إلى رمز LVN من جسم الاستجابة بدل رسالة non-2xx', async () => {
    const body = { error: 'LVN_LOGIN_REJECTED' }
    h.invoke.mockResolvedValueOnce({ data: null, error: { name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code', context: { json: async () => body } } })
    await expect(gpsLvn.sync('test')).rejects.toMatchObject({ name: 'LvnSyncError', code: 'LVN_LOGIN_REJECTED', message: 'LVN_LOGIN_REJECTED' })
    h.invoke.mockResolvedValueOnce({ data: { ok: false, error: 'LVN_FULL_SYNC_REQUIRED' }, error: null })
    await expect(gpsLvn.sync('incremental')).rejects.toMatchObject({ code: 'LVN_FULL_SYNC_REQUIRED' })
    h.invoke.mockResolvedValueOnce({ data: null, error: { message: 'Failed to send a request to the Edge Function' } })
    await expect(gpsLvn.sync('test')).rejects.toMatchObject({ code: 'Failed to send a request to the Edge Function' })
  })
  it('00342: مسار الانطلاقية — الإعدادات والقراءة عبر RPC، و«سحب الآن» عبر الدالة الخادمية بالإجراء trip', async () => {
    h.rpc.mockResolvedValueOnce({ data: { stop_min_seconds: 120 }, error: null })
    expect((await gpsLvn.tripRouteSettings()).stop_min_seconds).toBe(120)
    expect(h.rpc).toHaveBeenCalledWith('trip_route_settings_get')
    await gpsLvn.saveTripRouteSettings({ stop_min_seconds: 180 })
    expect(h.rpc).toHaveBeenCalledWith('trip_route_settings_save', { p: { stop_min_seconds: 180 } })
    h.rpc.mockResolvedValueOnce({ data: { departure_id: 'dep1', status: 'complete', points: [], stops: [], gaps: [], legs: [] }, error: null })
    expect((await gpsLvn.tripRoute('dep1')).status).toBe('complete')
    expect(h.rpc).toHaveBeenCalledWith('trip_route_get_v2', { p_departure: 'dep1', p_max_points: 3000 })
    await gpsLvn.tripRoute('dep1', 500)
    expect(h.rpc).toHaveBeenLastCalledWith('trip_route_get_v2', { p_departure: 'dep1', p_max_points: 500 })
    h.invoke.mockResolvedValueOnce({ data: { ok: true, action: 'trip', departureId: 'dep1', status: 'partial', points: 40, final: false }, error: null })
    expect((await gpsLvn.pullTripRouteNow('dep1')).points).toBe(40)
    expect(h.invoke).toHaveBeenCalledWith('lvn-gps-sync', { body: { action: 'trip', departureId: 'dep1' } })
    h.invoke.mockResolvedValueOnce({ data: null, error: { name: 'FunctionsHttpError', message: 'non-2xx', context: { json: async () => ({ error: 'TRIP_ROUTE_NO_DEVICE' }) } } })
    await expect(gpsLvn.pullTripRouteNow('dep2')).rejects.toMatchObject({ code: 'TRIP_ROUTE_NO_DEVICE' })
    // 00347: دالة حافة قديمة تتجاهل action='trip' وترد بنتيجة مزامنة عادية ⇒ خطأ صريح بدل نجاح كاذب
    h.invoke.mockResolvedValueOnce({ data: { ok: true, action: 'incremental', received: 0 }, error: null })
    await expect(gpsLvn.pullTripRouteNow('dep3')).rejects.toMatchObject({ code: 'LVN_FUNCTION_OUTDATED' })
  })

  /* ═══ 20261128000200: نوافذ الشفتات وسحبها ═══ */

  it('نوافذ الشفتات: بلا يوم يمرّر كائن فارغاً، وبيوم يمرّر p_day', async () => {
    h.rpc.mockResolvedValueOnce({ data: { day: '2026-11-20', windows: [] }, error: null })
    const a = await gpsLvn.shiftWindows()
    expect(h.rpc).toHaveBeenLastCalledWith('gps_shift_windows', { p_day: null })
    expect(a.windows).toEqual([])
    await gpsLvn.shiftWindows('2026-11-20')
    expect(h.rpc).toHaveBeenLastCalledWith('gps_shift_windows', { p_day: '2026-11-20' })
  })

  it('نافذة شفت واحد: الاسم واليوم، والمعرّف يفوز حين يُمرَّر', async () => {
    h.rpc.mockResolvedValueOnce({
      data: { shift_name: 'مرن مسائي', start: '17:00', end: '04:00', crosses_midnight: true, note: 'يعبر منتصف الليل' },
      error: null,
    })
    const w = await gpsLvn.shiftWindow({ shiftName: 'مرن مسائي', day: '2026-11-20' })
    expect(h.rpc).toHaveBeenLastCalledWith('gps_shift_window', {
      p_shift_id: null, p_shift_name: 'مرن مسائي', p_day: '2026-11-20',
    })
    expect(w.crosses_midnight).toBe(true)
    expect(w.note).toContain('منتصف الليل')
    await gpsLvn.shiftWindow({ shiftId: 's1' })
    expect(h.rpc).toHaveBeenLastCalledWith('gps_shift_window', {
      p_shift_id: 's1', p_shift_name: null, p_day: null,
    })
  })

  it('حالة الشفتات: بلا يوم كائن فارغ، وكل حقل يصل كما هو', async () => {
    const payload = {
      day: '2026-11-20', fleet: 111,
      shifts: [{ shift_id: 's1', shift_name: 'ليلي', state: 'missing', can_pull: true }],
    }
    h.rpc.mockResolvedValueOnce({ data: payload, error: null })
    expect((await gpsLvn.shiftPending()).fleet).toBe(111)
    expect(h.rpc).toHaveBeenLastCalledWith('gps_shift_pending', { p_day: null })
    await gpsLvn.shiftPending('2026-11-20')
    expect(h.rpc).toHaveBeenLastCalledWith('gps_shift_pending', { p_day: '2026-11-20' })
  })

  it('أهداف السحب: بلا معاملات، ويُعيد أول صف أو صفراً آمناً', async () => {
    h.rpc.mockResolvedValueOnce({ data: [{ total_devices: 111, total_batches: 5 }], error: null })
    expect((await gpsLvn.historyTargets()).total_devices).toBe(111)
    expect(h.rpc).toHaveBeenLastCalledWith('lvn_history_targets', {})
    h.rpc.mockResolvedValueOnce({ data: [], error: null })
    expect(await gpsLvn.historyTargets()).toEqual({ total_devices: 0, total_batches: 0 })
    h.rpc.mockResolvedValueOnce({ data: null, error: null })
    // سلوك حقيقي: data=null يرمي — لا يُخفى كصفر
    await expect(gpsLvn.historyTargets()).rejects.toThrow()
  })

  it('دفعة السحب: p_size افتراضي 25 ويُقيَّد بما يُمرَّر', async () => {
    await gpsLvn.historyTargetBatch(0)
    expect(h.rpc).toHaveBeenLastCalledWith('lvn_history_target_batch', { p_batch: 0, p_size: 25 })
    await gpsLvn.historyTargetBatch(3, 50)
    expect(h.rpc).toHaveBeenLastCalledWith('lvn_history_target_batch', { p_batch: 3, p_size: 50 })
  })

  describe('pullShiftWindow — دفعات حقيقية', () => {
    const dev = (n: number) => ({
      batch_no: 0, device_id: `d${n}`, external_id: `E${n}`,
      device_name: `جهاز ${n}`, vehicle_name: `آلية ${n}`,
    })
    /** كل نداء لدالة RPC يُوجَّه حسب اسمه — لا ترتيب هشّ. */
    const route = (opts: {
      total?: number
      batches: number
      perBatch?: (b: number) => unknown[]
    }) => {
      h.rpc.mockImplementation((fn: string, args?: { p_batch?: number }) => {
        if (fn === 'lvn_history_targets') {
          return Promise.resolve({
            data: [{ total_devices: opts.total ?? 0, total_batches: opts.batches }],
            error: null,
          })
        }
        if (fn === 'lvn_history_target_batch') {
          const b = args?.p_batch ?? 0
          return Promise.resolve({ data: opts.perBatch?.(b) ?? [], error: null })
        }
        return Promise.resolve({ data: null, error: null })
      })
    }

    it('يمرّ على كل دفعة ويجمع النقاط المضافة', async () => {
      route({ total: 3, batches: 2, perBatch: (b) => (b === 0 ? [dev(1), dev(2)] : [dev(3)]) })
      h.invoke.mockResolvedValue({ data: { ok: true, action: 'history', insertedPoints: 10 }, error: null })
      const res = await pullShiftWindow({
        day: '2026-11-20',
        window: { from: '2026-11-20T14:00:00Z', to: '2026-11-21T01:00:00Z' },
      })
      expect(res.done).toBe(3)
      expect(res.total).toBe(3)
      expect(res.inserted).toBe(30)
      expect(res.failed).toEqual([])
      expect(res.aborted).toBe(false)
      // النافذة تصل كاملة إلى الدالة الخادمية — لا تُقصّ عند منتصف الليل
      expect(h.invoke).toHaveBeenCalledWith('lvn-gps-sync', expect.objectContaining({
        body: expect.objectContaining({
          action: 'history',
          deviceId: 'd1',
          fromTime: '2026-11-20T14:00:00Z',
          toTime: '2026-11-21T01:00:00Z',
        }),
      }))
    })

    it('الإيقاف يُعلَّم ويعيد ما سُحب — لا يرمي', async () => {
      const ctl = new AbortController()
      route({ total: 4, batches: 2, perBatch: () => [dev(1), dev(2)] })
      h.invoke.mockImplementation(() => {
        ctl.abort()
        return Promise.resolve({ data: { ok: true, action: 'history', insertedPoints: 4 }, error: null })
      })
      const res = await pullShiftWindow({
        day: '2026-11-20', window: { from: 'a', to: 'b' }, signal: ctl.signal,
      })
      expect(res.aborted).toBe(true)
      expect(res.done).toBe(1)
      expect(res.inserted).toBe(4)
    })

    it('جهاز فاشل يُسجَّل باسمه وسببه، والسحب يكمل', async () => {
      route({ total: 2, batches: 1, perBatch: () => [dev(1), dev(2)] })
      h.invoke
        .mockResolvedValueOnce({ data: { ok: false, error: 'LVN_LOGIN_REJECTED' }, error: null })
        .mockResolvedValueOnce({ data: { ok: true, action: 'history', insertedPoints: 7 }, error: null })
      const res = await pullShiftWindow({ day: '2026-11-20', window: { from: 'a', to: 'b' } })
      expect(res.failed).toHaveLength(1)
      expect(res.failed[0]?.device).toBe('آلية 1')
      expect(res.failed[0]?.error).toBe('LVN_LOGIN_REJECTED')
      expect(res.inserted).toBe(7)
      expect(res.done).toBe(2)
    })

    it('خطأ شبكة على الدالة الخادمية يذهب إلى failed لا إلى توقف السحب', async () => {
      route({ total: 1, batches: 1, perBatch: () => [dev(1)] })
      h.invoke.mockResolvedValueOnce({ data: null, error: { message: 'network down' } })
      const res = await pullShiftWindow({ day: '2026-11-20', window: { from: 'a', to: 'b' } })
      expect(res.failed[0]?.error).toBe('network down')
      expect(res.inserted).toBe(0)
    })

    it('بلا أجهزة إطلاقاً: صفر عمل بلا فشل ولا التباس', async () => {
      route({ total: 0, batches: 1, perBatch: () => [] })
      const res = await pullShiftWindow({ day: '2026-11-20', window: { from: 'a', to: 'b' } })
      expect(res).toMatchObject({ done: 0, inserted: 0, failed: [], aborted: false })
      expect(h.invoke).not.toHaveBeenCalled()
    })

    it('حجم الدفعة يُقيَّد بين ١ و٥٠ رغم ما يُمرَّر', async () => {
      route({ total: 0, batches: 1, perBatch: () => [] })
      await pullShiftWindow({ day: 'd', window: { from: 'a', to: 'b' }, batchSize: 999 })
      expect(h.rpc).toHaveBeenCalledWith('lvn_history_target_batch', { p_batch: 0, p_size: 50 })
      h.rpc.mockClear()
      route({ total: 0, batches: 1, perBatch: () => [] })
      await pullShiftWindow({ day: 'd', window: { from: 'a', to: 'b' }, batchSize: 0 })
      expect(h.rpc).toHaveBeenCalledWith('lvn_history_target_batch', { p_batch: 0, p_size: 1 })
    })

    it('onProgress يُنادى لكل جهاز بتقدُّم تراكمي صحيح', async () => {
      route({ total: 2, batches: 1, perBatch: () => [dev(1), dev(2)] })
      h.invoke.mockResolvedValue({ data: { ok: true, action: 'history', insertedPoints: 3 }, error: null })
      const seen: Array<{ done: number, total: number, inserted: number }> = []
      await pullShiftWindow({
        day: '2026-11-20', window: { from: 'a', to: 'b' },
        onProgress: (p) => seen.push({ done: p.done, total: p.total, inserted: p.inserted }),
      })
      expect(seen).toEqual([
        { done: 1, total: 2, inserted: 3 },
        { done: 2, total: 2, inserted: 6 },
      ])
    })
  })
})
