import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const edge = readFileSync('supabase/functions/lvn-gps-sync/index.ts', 'utf8'),
  client = readFileSync('src/services/gps-lvn.sdk.ts', 'utf8'),
  hooks = readFileSync('src/features/gps-lvn/hooks.ts', 'utf8'),
  gpsPage = readFileSync('src/portals/ops-room/pages/Gps/GpsDataPage.tsx', 'utf8'),
  tripRouteMapPage = readFileSync('src/portals/ops-room/pages/Gps/TripRouteMapPage.tsx', 'utf8'),
  html = readFileSync('index.html', 'utf8'),
  round2 = readFileSync('supabase/migrations/00094_gps_live_operations_and_alerts.sql', 'utf8'),
  integrity = readFileSync('supabase/migrations/00098_gps_route_integrity.sql', 'utf8'),
  alertControl = readFileSync(
    'supabase/migrations/00102_gps_alert_grouping_escalation.sql',
    'utf8',
  ),
  routeEvents = readFileSync(
    'supabase/migrations/00103_gps_route_events_and_multilevel_escalation.sql',
    'utf8',
  ),
  observability = readFileSync(
    'supabase/migrations/00104_gps_operations_observability.sql',
    'utf8',
  ),
  diagnostics = readFileSync('supabase/migrations/00105_gps_route_diagnostics.sql', 'utf8'),
  windowProgress = readFileSync(
    'supabase/migrations/00106_gps_history_window_progress.sql',
    'utf8',
  ),
  windowAudit = readFileSync('supabase/migrations/00111_gps_window_coverage_audit.sql', 'utf8'),
  investigations = readFileSync('supabase/migrations/00112_gps_trip_investigations.sql', 'utf8'),
  landmarks = readFileSync('supabase/migrations/00115_gps_landmarks_and_zone_shapes.sql', 'utf8'),
  landmarkIcons = readFileSync('supabase/migrations/00116_gps_landmark_icon_library.sql', 'utf8'),
  zoneEditor = readFileSync('src/portals/ops-room/pages/Gps/ZoneMapEditor.tsx', 'utf8'),
  liveMap = readFileSync('src/portals/ops-room/pages/Gps/GpsLiveMap.tsx', 'utf8'),
  pushDispatcher = readFileSync('supabase/functions/notification-push-dispatch/index.ts', 'utf8')
describe('عقد أمان LVN GPS', () => {
  it('يحصر بيانات دخول LVN في Edge Function ولا يرسلها من العميل', () => {
    expect(edge).toContain("Deno.env.get('LVN_API_EMAIL')")
    expect(edge).toContain("Deno.env.get('LVN_API_PASSWORD')")
    expect(client).not.toMatch(/LVN_API_EMAIL|LVN_API_PASSWORD|user_api_hash/)
  })
  it('ينقح hash من الأخطاء ويتحقق من دور غرفة العمليات', () => {
    expect(edge).toContain('user_api_hash=[REDACTED]')
    expect(edge).toMatch(/\['ops_room',\s*'it_admin',\s*'super_admin'\]/)
  })
  it('يستخدم التحديث الجزئي والمؤشر ولا يعتبر غياب الجهاز حذفاً', () => {
    expect(edge).toContain("'/get_devices_latest'")
    expect(edge).toContain('sync_cursor')
    expect(edge).not.toMatch(/delete\(.*gps_devices/s)
  })
  it('يحفظ أحداث المزود ويمنع تشغيل مزامنتين متزامنتين', () => {
    expect(edge).toContain("from('gps_vendor_events')")
    expect(edge).toContain('LVN_SYNC_ALREADY_RUNNING')
  })
  it('يستورد مناطق LVN ويدعم التحديث التلقائي وCron الموثوق', () => {
    expect(hooks).toContain("gpsLvn.sync('incremental')")
    // دورة المزامنة كل ثانية — حارس running يمنع تراكب الطلبات.
    expect(hooks).toContain('1_000')   // (00386-أ: أُزيل شرط 30_000 — كان يخص خطافات بقع التوقف القديمة فقط)
    expect(edge).toContain("request('/add_report_data'")
    expect(edge).toContain("from('gps_geofences')")
    expect(edge).toContain('token === SERVICE_ROLE')
  })
  it('يسمح ببلاطات OSM ويقيّم تنبيهات الانطلاقة على الخادم', () => {
    expect(html).toContain('https://*.tile.openstreetmap.org')
    expect(round2).toContain('gps_evaluate_operational_alerts')
    expect(round2).toContain("'outside_zone'")
    expect(edge).toContain("admin.rpc('gps_evaluate_operational_alerts')")
  })
  it('يجمع التنبيه المفتوح ويصعّده من موزع خادمي موثوق دون تكرار', () => {
    expect(alertControl).toContain('trg_group_open_gps_alert')
    expect(alertControl).toContain('occurrence_count')
    expect(alertControl).toContain("auth.jwt()->>'role'")
    expect(alertControl).toContain("':escalation'")
    expect(pushDispatcher).toContain("admin.rpc('notification_evaluate_gps_escalations')")
  })
  it('00386-أ: محرّك بقع التوقف القديم أُزيل من دالة الحافة والواجهة والقاعدة — والخلف هو مستودع GPS', () => {
    expect(edge).not.toContain("action === 'stops'"); expect(edge).not.toContain('pullStopHistory('); expect(edge).not.toMatch(/gps_stop_/)
    expect(edge).toContain("['test', 'full', 'incremental', 'history', 'trips', 'trip'].includes(body.action)")
    expect(readFileSync('src/services/gps-lvn.sdk.ts', 'utf8')).not.toMatch(/gps_stop_|GpsStopHotspot/)
    expect(readFileSync('src/features/gps-lvn/hooks.ts', 'utf8')).not.toMatch(/StopHotspot/)
    expect(readFileSync('src/portals/ops-room/pages/Gps/GpsLiveMap.tsx', 'utf8')).not.toMatch(/hotspot/i)   // الخريطة الحية: الآليات/الزونات/المعالم فقط
    expect(existsSync('src/components/gps/StopHotspotsPage.tsx')).toBe(false); expect(existsSync('src/portals/it/pages/DevCleanup')).toBe(false)
    const retire = readFileSync('supabase/migrations/00332_retire_gps_stop_engine.sql', 'utf8')
    for (const t of ['gps_stop_events', 'gps_stop_scan_state', 'gps_stop_hotspot_settings', 'dev_cleanup_runs']) expect(retire).toContain(`drop table if exists public.${t} cascade`)
    for (const j of ['gps_stop_hotspots_refresh', 'gps_stop_events_weekly_purge', 'gps_stop_events_daily_purge']) expect(retire).toContain(`'${j}'`)
    expect(retire).toContain("'engine_retired'"); expect(retire.split('كتالوج الاحتفاظ')[0]).not.toMatch(/drop[^\n]*(trip_route|gps_history|gps_geofences|gps_map_landmarks)/)   // لا يلمس الجيران
    for (const p of ['src/portals/executive/routes.tsx', 'src/portals/deputy/routes.tsx']) expect(readFileSync(p, 'utf8')).toContain("import('@portals/ops-room/pages/WasteMap/OpsWasteMapPage').then((m) => ({ default: () => <m.default readOnly")
  })
  it('يحسب التوقفات والحركة من الخادم ويحد الطلبات الجماعية', () => {
    expect(routeEvents).toContain('gps_trip_route_events')
    expect(routeEvents).toContain('gps_trip_route_metrics_bulk')
    expect(routeEvents).toContain('cardinality(p_departure_ids)not between 1 and 200')
    expect(routeEvents).toContain('generate_series(1,p.escalation_levels)')
  })
  it('يحمي صفحات المحطات وتصدير التصعيد ويضع حدوداً وفهارس تشغيلية', () => {
    expect(observability).toContain('perform app.require_gps_operator()')
    expect(observability).toContain('p_limit not between 1 and 100')
    expect(observability).toContain('cardinality(p_alert_ids)not between 1 and 200')
    expect(observability).toContain('revoke all on function public.gps_trip_route_events_page')
    expect(observability).toContain('gps_alerts_open_priority_detected_idx')
    expect(observability).toContain('notifications_gps_alert_history_idx')
  })
  it('يشخّص نقص المسار ويستورد كل نافذة طويلة دون إعادة النافذة الأولى', () => {
    expect(diagnostics).toContain('gps_trip_route_diagnostics_bulk')
    expect(diagnostics).toContain('cardinality(p_departure_ids)not between 1 and 200')
    expect(diagnostics).toContain('perform app.require_gps_operator()')
    expect(diagnostics).toContain("then'provider_payload_rejected'")
    expect(edge).toContain('body.windowIndex ?? 0')
    expect(edge).toContain('windowIndex * 72 * 3600000')
    expect(edge).toContain('GPS_HISTORY_WINDOW_OUT_OF_RANGE')
    expect(edge).toContain(
      "const status = rejected > 0 || completed < chunks ? 'partial' : 'success'",
    )
  })
  it('00347: تصدير الانطلاقيات القديم وخرائط مسار الآلية الكاملة أُزيلت من الواجهة؛ تصدير التنبيهات باقٍ', () => {
    const source = readFileSync('src/features/gps-lvn/export.ts', 'utf8')
    expect(source).not.toContain('exportGpsTrips')
    expect(source).toContain('export async function exportGpsAlerts')
    expect(existsSync('src/portals/ops-room/pages/Gps/GpsRouteMap.tsx')).toBe(false)
    expect(gpsPage).not.toContain('RouteModal')
    for (const dead of ['useGpsRoute =', 'useGpsRouteWindow', 'useGpsHistoryImport', 'useGpsAllHistoryImport', 'useGpsBatchHistoryAudit', 'useGpsTripDiagnostics', 'useGpsHistoryWindows', 'useGpsTripWindowCoverageAudit', 'useGpsTripEvents', 'useGpsTripZoneEvents', 'useGpsTripShiftContext'])
      expect(hooks, dead).not.toContain(dead)
  })

  it('يعرض تقدم كل نافذة ويمنع العميل من إعادة النافذة الناجحة جماعياً', () => {
    expect(windowProgress).toContain('gps_trip_history_windows')
    expect(windowProgress).toContain("coalesce(r.status,'pending')")
    expect(windowProgress).toContain("interval'72 hours'")
    expect(windowProgress).toContain('perform app.require_gps_operator()')
    // 00346: واجهة النوافذ القديمة أُزيلت من GpsDataPage؛ العقد يبقى على الطبقة البرمجية
    expect(gpsPage).not.toContain('TripRouteModal')
    expect(gpsPage).not.toContain('TripsWorkspace')
    // 00347: المسارات تبويب داخل وحدة GPS (?view=trips) لا صفحة مستقلة ولا بند جانبي
    expect(gpsPage).toMatch(/id: 'trips',\s*label: 'مسارات الانطلاقيات'/)
    expect(readFileSync('src/portals/ops-room/routes.tsx', 'utf8')).not.toContain('trip-routes')
    expect(readFileSync('src/config/portals.config.ts', 'utf8')).not.toContain('/ops-room/trip-routes')
    expect(client).toContain('importDepartureHistory')
  })
  it('يدقق كل نافذة من المصدر إلى الرسم ويكشف حدود الصفحات', () => {
    expect(windowAudit).toContain('gps_trip_window_coverage_audit')
    expect(windowAudit).toContain('source_acceptance_percent')
    expect(windowAudit).toContain('storage_match_percent')
    expect(windowAudit).toContain('renderable_points')
    expect(windowAudit).toContain("then'render_limit'")
    expect(windowAudit).toContain('perform app.require_gps_operator()')
    expect(client).toContain('gps_trip_window_coverage_audit')
  })
  it('00347: خريطة المسار الجديدة ترسم الزونات والمراحل وتقيّد السحب بالدالة الخادمية', () => {
    expect(tripRouteMapPage).toContain('<Polygon')
    expect(tripRouteMapPage).toContain('<Marker')
    expect(tripRouteMapPage).toContain('usePullTripRouteNow')
    expect(client).toContain("action: 'trip', departureId")
    expect(client).toContain("LVN_FUNCTION_OUTDATED")
  })
  it('يحمي تحقيقات GPS ويعرض الزونات والمقارنة والتصدير العربي', () => {
    expect(investigations).toContain('enable row level security')
    expect(investigations).toContain('perform app.require_gps_operator()')
    expect(investigations).toContain('app.audit_trigger()')
    expect(investigations).toContain(
      'public.gps_trip_investigation_save(uuid,uuid,text,timestamptz,text,text,uuid)from public,anon',
    )
    expect(tripRouteMapPage).toMatch(/heat/i)
    // 00346: المقارنة والتحقيقات انتقلتا إلى صفحة خريطة المسار الجديدة
    expect(tripRouteMapPage).toContain('trm-compare-box')
    expect(tripRouteMapPage).toContain('useGpsTripInvestigationSave')
    expect(tripRouteMapPage).toContain('trm-investigations')
    const exportSource = readFileSync('src/features/gps-lvn/trip-route-export.ts', 'utf8')
    expect(exportSource).toContain('buildExcelReport')
    expect(exportSource).toContain('buildTripRouteKml')
  })
  it('يدعم محرر الزونات كامل الشاشة والأشكال والمعالم المحمية', () => {
    expect(gpsPage).toContain('fixed inset-0 z-[2100]')
    for (const shape of ['rectangle', 'square', 'circle', 'triangle', 'hexagon', 'corridor'])
      expect(zoneEditor).toContain(shape)
    expect(zoneEditor).toContain('ممر تشغيلي')
    expect(landmarks).toContain('enable row level security')
    expect(landmarks).toContain('perform app.require_gps_operator()')
    expect(landmarks).toContain('gps_map_landmark_save')
    expect(client).toContain('gps_map_landmarks_list')
    expect(landmarkIcons).toContain("add column icon text not null default 'pin'")
    expect(landmarkIcons).toContain('GPS_LANDMARK_ICON_INVALID')
    expect(gpsPage).toContain('شكل المعلم')
    expect(liveMap).toContain("toggleLayer('vehicles')")
    expect(liveMap).toContain("toggleLayer('zones')")
    expect(liveMap).toContain("toggleLayer('landmarks')")
  })
  it('يجلب التاريخ ضمن نوافذ بغداد ويقارن المستلم بالمخزن ويقيس الفجوات', () => {
    expect(edge).toContain("request('/get_history'")
    expect(edge).toContain("timeZone: 'Asia/Baghdad'")
    expect(edge).toContain("from('gps_history_import_runs')")
    expect(integrity).toContain('source_points')
    expect(integrity).toContain('stored_points')
    expect(integrity).toContain('gap_count')
    expect(integrity).toContain("at time zone 'Asia/Baghdad'")
  })
})
