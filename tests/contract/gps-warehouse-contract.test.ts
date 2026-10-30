/** 00380 — عقد مستودع GPS: لا مفاتيح في الشيفرة، الدالة تتحقق من الدور، المستودع خادم فقط، والهجرة لا تُعرّض الجداول */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const fn = readFileSync('supabase/functions/gps-warehouse/index.ts', 'utf8')
const wh = readFileSync('gps-warehouse/supabase/migrations/0001_warehouse_schema.sql', 'utf8')
const main = readFileSync('supabase/migrations/00324_gps_warehouse_link.sql', 'utf8')
const engine = readFileSync('gps-warehouse/supabase/migrations/0002_pull_engine.sql', 'utf8')
const cronMig = readFileSync('supabase/migrations/00325_gps_warehouse_pull_cron.sql', 'utf8')
const lvnShared = readFileSync('supabase/functions/_shared/lvn-history.ts', 'utf8')
const all = [fn, wh, main, engine, cronMig, lvnShared, readFileSync('src/services/gps-warehouse.sdk.ts', 'utf8'), readFileSync('src/features/gps-warehouse/GpsWarehouseCard.tsx', 'utf8'), readFileSync('gps-warehouse/supabase/config.toml', 'utf8')].join('\n')

describe('gps-warehouse contract (00380)', () => {
  it('لا مفتاح سرّي أو JWT مضمّن في أي ملف', () => {
    expect(all).not.toMatch(/sb_secret_[A-Za-z0-9]{8,}/)
    expect(all).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\./)
  })
  it('دالة الحافة: الأسرار من البيئة، 403 بلا دور، الفحص للعمليات/IT والكتابة لـ IT فقط، وتسجيل النتيجة في المشروع الأول', () => {
    expect(fn).toContain("Deno.env.get('GPS_WAREHOUSE_URL')"); expect(fn).toContain("Deno.env.get('GPS_WAREHOUSE_SERVICE_KEY')")
    expect(fn).toContain("'GPS_WAREHOUSE_FORBIDDEN' }, 403")
    expect(fn).toContain("READ_ROLES = ['ops_room', 'it_admin', 'super_admin'], WRITE_ROLES = ['it_admin', 'super_admin']")
    expect(fn).toContain("admin.rpc('gps_warehouse_link_record'")
    expect(fn).toContain("'wh_ping'"); expect(fn).toContain("'wh_upsert_vehicles'"); expect(fn).toContain("'wh_enqueue_month'")
    expect(fn).toContain('GPS_WAREHOUSE_NOT_CONFIGURED')
  })
  it('00381: محرّك السحب — قطع ≤3 ساعات، استئناف من المؤشر، تحرير عند نفاد الميزانية، أرشفة مضغوطة، تحرير القفل دائماً، والمجدول عبر Vault بلا مفاتيح', () => {
    expect(fn).toContain('const CHUNK_MS = 3 * 3600_000'); expect(fn).toContain("'wh_jobs_claim'"); expect(fn).toContain("'wh_ingest_points'"); expect(fn).toContain("'wh_job_finish'"); expect(fn).toContain("'wh_job_release'")
    expect(fn).toContain("new CompressionStream('gzip')"); expect(fn).toContain("storage.from('gps-archive')"); expect(fn).toContain("finally {\n    await whRpc('wh_pull_release')")
    expect(fn).toContain("if (action === 'pull')")
    expect(lvnShared).not.toContain('snap_to_road'); expect(fn).toContain("snap_to_road: 'false'")   // المعامل يُمرَّر من المحرّك لا من المكتبة
    expect(lvnShared).toContain("+03:00")
    expect(cronMig).toContain("vault.decrypted_secrets where name = 'project_url'"); expect(cronMig).toContain('/functions/v1/gps-warehouse'); expect(cronMig).toContain('{"action":"pull"}')
    expect(cronMig).not.toMatch(/eyJ|sb_secret_/)
    expect(engine).toContain("for update skip locked"); expect(engine).toContain("pull_locked_until"); expect(engine).toContain("WH_JOB_STALE")
    expect(engine).toMatch(/revoke all on function[\s\S]*wh_jobs_claim\(int\)[\s\S]*from public, anon, authenticated/)
  })
  it('هجرة المستودع: RLS على كل جدول wh_ وسحب الصلاحيات، وبلا سياسات', () => {
    expect(wh).toMatch(/enable row level security/); expect(wh).toContain('revoke all on table public.%I from anon, authenticated')
    expect(wh).not.toMatch(/create policy/)
    expect(wh).toContain('revoke all on function public.wh_ping(), public.wh_upsert_vehicles(jsonb), public.wh_enqueue_month(date) from public, anon, authenticated')
    expect(wh).toContain("min_stop_minutes int not null default 10"); expect(wh).toContain("max_stop_minutes int not null default 120"); expect(wh).toContain("fault_stop_hours int not null default 24")
  })
  it('المشروع الأول: جدول الحالة بلا أعمدة مفاتيح، والتسجيل للخدمة فقط', () => {
    const mainCode = main.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
    expect(mainCode).not.toMatch(/service_key|secret|token|api_key/i)
    expect(main).toContain("if auth.role() <> 'service_role' then raise exception 'GPS_FORBIDDEN'")
  })
  it('00382-أ: التفريغ اليومي = truncate عند 21:00 UTC (00:00 بغداد) مع إثبات في سجل الأرشيف؛ wh_ping يضم التخزين؛ الكتالوج يضم جدول الإعداد', () => {
    const purge = readFileSync('supabase/migrations/00328_gps_history_daily_purge.sql', 'utf8')
    expect(purge).toContain('truncate table public.gps_device_position_history')
    expect(purge).toContain("cron.schedule('gps-history-purge-midnight', '0 21 * * *'")
    expect(purge).toContain("app.data_retention_log(null, 'gps_position_history', 'daily_purge'")
    expect(purge).toContain("('gps_history_purge_settings', 'gps',")
    expect(purge).toContain("'warehouse', v_wh")
    const ping = readFileSync('gps-warehouse/supabase/migrations/0003_ping_storage.sql', 'utf8')
    expect(ping).toContain("'storage_bytes'"); expect(ping).toContain("'storage_objects'")
  })
  it('00382-ب: النافذة المتجددة — الخام 0 أيام، الأرشيف معطّل، التدوير يمسح قبل cutoff، الجدولة اليومية داخل الصيانة، والشهر المنتهي لا يُجدول', () => {
    const roll = readFileSync('gps-warehouse/supabase/migrations/0004_rolling_window.sql', 'utf8')
    expect(roll).toContain('alter column raw_retention_days set default 0')
    expect(roll).toContain('archive_enabled boolean not null default false')
    expect(roll).toContain('delete from public.wh_stops where day < c')
    expect(roll).toContain('roll := public.wh_rollover()'); expect(roll).toContain('public.wh_daily_enqueue()')
    expect(roll).toContain("raise exception 'WH_MONTH_EXPIRED'")
    expect(fn).toContain("whRpc<Record<string, unknown>>('wh_maintenance')")   // الصيانة (جدولة+تدوير) مع كل دورة للمجدول
  })

  it('00383: محرّك البقع في المستودع والنسخة الملخّصة في المشروع الأول — صالحة فقط، 3 أصناف، تكرار، نصف قطر من الإعدادات، تدوير، خدمة فقط للكتابة، وقراءة لغير الموظفين', () => {
    const hs = readFileSync('gps-warehouse/supabase/migrations/0005_hotspots.sql', 'utf8')
    const p1 = readFileSync('supabase/migrations/00329_gps_hotspots.sql', 'utf8')
    expect(hs).toContain("hotspot_radius_m"); expect(hs).toContain('class_light_max_min'); expect(hs).toContain('class_medium_max_min'); expect(hs).toContain('recur_mid_days'); expect(hs).toContain('recur_high_days')
    expect(hs).toMatch(/class = 'valid'/)                                  // لا طويل ولا عطل
    expect(hs).toContain('delete from public.wh_hotspots where month < c')   // التدوير يمسح البقع القديمة
    expect(hs).toContain('wh_hotspots_refresh(1000)')                        // التحديث داخل الصيانة
    expect(hs).toContain('wh_stops_hotspot_dirty')                           // إعادة حساب يوم ⇒ إعادة تجميع
    expect(hs).toMatch(/revoke all on function[^;]*wh_hotspots_summary/)
    expect(p1).toContain("app.has_role(array['ops_room','it_admin','super_admin'])")
    expect(p1).not.toContain("'employee'")
    expect(p1).toMatch(/gps_hotspots_replace_month[\s\S]*auth\.role\(\) <> 'service_role'/)
    expect(p1).toContain("p_classes text[] default array['medium','heavy']")  // الخفيفة مخفية افتراضياً
    expect(p1).toContain("cron.schedule('gps-warehouse-hotspots-nightly', '30 20 * * *'")
    expect(p1).toContain('{"action":"sync_hotspots"}'); expect(p1).not.toMatch(/sb_secret_|eyJ[A-Za-z0-9_-]{10,}\./)
    expect(p1).toContain("('gps_hotspots', 'gps'"); expect(p1).toContain("('gps_hotspots_sync', 'gps'")
    expect(fn).toContain("whRpc<HotspotRefresh>('wh_hotspots_refresh'"); expect(fn).toContain("'wh_hotspots_summary'"); expect(fn).toContain("admin.rpc('gps_hotspots_replace_month'"); expect(fn).toContain("admin.rpc('gps_hotspots_prune'")
    expect(fn).toContain("record('hotspots', true, result)")
    expect(fn).not.toMatch(/wh_raw_points|wh_day_points'\)[\s\S]*gps_hotspots/)                 // لا نقاط خام تُنسخ للمشروع الأول
  })

  it('00386-ب: مراقبة السحب — ملخص الأخطاء/الأجهزة/العالقة/التقدير في wh_progress، إعادة المحاولة داخل النافذة وللخدمة فقط، إجراء الحافة لـ IT، والتشخيص بلا أسرار', () => {
    const mon = readFileSync('gps-warehouse/supabase/migrations/0006_monitoring.sql', 'utf8')
    const diag = readFileSync('src/features/gps-warehouse/diagnostics.ts', 'utf8')
    const card = readFileSync('src/features/gps-warehouse/GpsWarehouseCard.tsx', 'utf8')
    expect(mon).toContain("values (6,")
    for (const k of ['error_summary', 'failed_devices', 'failed_total', 'stale_running', 'throughput', 'eta_minutes']) expect(mon).toContain(`'${k}'`)
    expect(mon).toMatch(/wh_retry_failed[\s\S]*status = 'failed' and day >= cutoff/)          // لا يُعيد ما خرج من النافذة
    expect(mon).toMatch(/revoke all on function public\.wh_retry_failed\(date\), public\.wh_progress\(\) from public, anon, authenticated/)
    expect(fn).toContain("'retry_failed'"); expect(fn).toMatch(/action === 'retry_failed'[\s\S]*whRpc<Record<string, unknown>>\('wh_retry_failed'/)
    expect(fn).toMatch(/const allowed = action === 'ping' \? READ_ROLES : WRITE_ROLES/)         // الإعادة كتابة ⇒ IT فقط
    expect(card).toContain('window.confirm(')                                                      // إعادة المحاولة بتأكيد
    expect(card).toContain('useSpaceOverview()'); expect(card).toContain('data-testid="gps-warehouse-spaces"')
    expect(diag).not.toMatch(/service|secret|key/i)                                               // التقرير لا يعرف أي مفتاح
    expect(mon).not.toMatch(/sb_secret_|eyJ[A-Za-z0-9_-]{10,}\./)
  })
})
