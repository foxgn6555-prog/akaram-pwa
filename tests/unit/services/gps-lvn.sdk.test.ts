import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }))
vi.mock('@sdk/client', () => ({
  supabase: { rpc: h.rpc, functions: { invoke: h.invoke } },
  sdkGuard: async (value: Promise<{ data: unknown; error: null | { message: string } }>) => {
    const result = await value
    if (result.error) throw new Error(result.error.message)
    return result.data
  },
}))
import { gpsLvn } from '@sdk/gps-lvn.sdk'
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
})
