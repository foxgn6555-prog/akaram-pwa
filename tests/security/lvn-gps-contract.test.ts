import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const edge = readFileSync('supabase/functions/lvn-gps-sync/index.ts', 'utf8'),
  client = readFileSync('src/services/gps-lvn.sdk.ts', 'utf8'),
  hooks = readFileSync('src/features/gps-lvn/hooks.ts', 'utf8'),
  gpsPage = readFileSync('src/portals/ops-room/pages/Gps/GpsDataPage.tsx', 'utf8'),
  routeMap = readFileSync('src/portals/ops-room/pages/Gps/GpsRouteMap.tsx', 'utf8'),
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
    expect(hooks).toContain('30_000')
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
  it('يجمع Excel صراحة حسب السائق واليوم والشفت والآلية', () => {
    const source = readFileSync('src/features/gps-lvn/export.ts', 'utf8')
    expect(source).toContain("workbook.addWorksheet('ملخص السائقين'")
    expect(source).toContain('مدة التداخل بالدقائق')
    expect(source).toContain('context.driver_name')
    expect(source).toContain('context.shift')
    expect(source).toContain('trip.vehicle_id')
    expect(source).toContain('group.trips.size')
    expect(source).toContain("workbook.addWorksheet('تدقيق نوافذ المسار'")
    expect(source).toContain('القابل للرسم')
  })

  it('يعرض تقدم كل نافذة ويمنع العميل من إعادة النافذة الناجحة جماعياً', () => {
    expect(windowProgress).toContain('gps_trip_history_windows')
    expect(windowProgress).toContain("coalesce(r.status,'pending')")
    expect(windowProgress).toContain("interval'72 hours'")
    expect(windowProgress).toContain('perform app.require_gps_operator()')
    expect(gpsPage).toContain("window.status !== 'success'")
    expect(hooks).toContain('await gpsLvn.importDepartureHistory')
  })
  it('يدقق كل نافذة من المصدر إلى الرسم ويكشف حدود الصفحات', () => {
    expect(windowAudit).toContain('gps_trip_window_coverage_audit')
    expect(windowAudit).toContain('source_acceptance_percent')
    expect(windowAudit).toContain('storage_match_percent')
    expect(windowAudit).toContain('renderable_points')
    expect(windowAudit).toContain("then'render_limit'")
    expect(windowAudit).toContain('perform app.require_gps_operator()')
    expect(gpsPage).toContain('سلسلة اكتمال النافذة')
  })
  it('يربط الخريطة بالمراحل والزونات والشفتات ويقيد التدقيق الجماعي', () => {
    expect(routeMap).toContain('الشريط الزمني لمسار GPS')
    expect(routeMap).toContain('statusColor[segment.status]')
    expect(routeMap).toContain('<Polygon')
    expect(routeMap).toContain('shiftFor(focused, shifts)')
    expect(hooks).toContain('useGpsBatchHistoryAudit')
    expect(hooks).toContain('.slice(0, 20)')
    expect(hooks).toContain("window.status !== 'success'")
  })
  it('يحمي تحقيقات GPS ويعرض الزونات والمقارنة والتصدير العربي', () => {
    expect(investigations).toContain('enable row level security')
    expect(investigations).toContain('perform app.require_gps_operator()')
    expect(investigations).toContain('app.audit_trigger()')
    expect(investigations).toContain(
      'public.gps_trip_investigation_save(uuid,uuid,text,timestamptz,text,text,uuid)from public,anon',
    )
    expect(routeMap).toContain('خريطة السرعة الحرارية')
    expect(routeMap).toContain('<Marker')
    expect(gpsPage).toContain('مقارنة انطلاقيتين')
    expect(gpsPage).toContain('سجل تحقيق المسار')
    const exportSource = readFileSync('src/features/gps-lvn/export.ts', 'utf8')
    expect(exportSource).toContain("workbook.addWorksheet('زونات الانطلاقية المحددة'")
    expect(exportSource).toContain("workbook.addWorksheet('تحقيقات المسار'")
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
