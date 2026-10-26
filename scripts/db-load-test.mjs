/**
 * اختبار الحِمل المحلي (00349-C): 500 مستخدم افتراضي على المسارات الثقيلة ضد قاعدة مضمّنة (كل الترحيلات + mock).
 *   S1 حضور جماعي: 500 موظف يبصمون (دفعات ADMS + بصمات مفردة) ⇒ تقييم يوم الحضور تلقائياً
 *   S2 GPS كل ثانية: مزامنة 300 جهاز × N ثانية + 20 شاشة عمليات تستعلم الخريطة/اللوحة/التنبيهات كل ثانية
 *   S3 المشاركة الحية: 160 مشاركاً (مسؤولو أقسام + متعهدون) يرسلون نبضات + 10 مشاهدين
 *   S4 الموافقات: 200 طلب تعيين + 200 قرار + صندوق المهام
 *   S5 اللوحات: 500 مستخدم يفتحون لوحاتهم معاً
 * المخرجات: جدول زمن الاستجابة (p50/p95/p99/الأقصى) لكل دالة، أبطأ الاستعلامات (pg_stat_statements)،
 *   الجداول التي تُمسح تسلسلياً، مفاتيح أجنبية بلا فهرس — وملف JSON في /tmp/akaram-load-report.json
 * التشغيل: node scripts/db-load-test.mjs [--users=500] [--seconds=20] [--conns=40]
 * ملاحظة: القياس محلي (قرص/ذاكرة الجهاز، بلا شبكة ولا PostgREST ولا RLS للمستخدم الحقيقي) — انظر التقرير لحدود المقارنة مع Supabase.
 */
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'fs';

const arg = (k, d) => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? Number(m.split('=')[1]) : d; };
const USERS = Math.max(220, arg('users', 500)), SECONDS = arg('seconds', 20), CONNS = arg('conns', 40), DEVICES = arg('devices', 300);
const dir = '/tmp/epgdata-load';
fs.rmSync(dir, { recursive: true, force: true });
const pgs = new EmbeddedPostgres({
  databaseDir: dir, user: 'postgres', password: 'pw', port: 54332, persistent: false,
  onLog: () => {}, onError: () => {}, // سجلات الخادم (أخطاء الدوال المتوقعة) لا تُطبع — الملخص يعدّها
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  postgresFlags: ['-c', 'shared_preload_libraries=pg_stat_statements', '-c', 'pg_stat_statements.track=all', '-c', 'pg_stat_statements.max=5000',
    '-c', 'max_connections=120', '-c', 'shared_buffers=128MB', '-c', 'work_mem=8MB', '-c', 'log_min_messages=warning', '-c', 'log_min_error_statement=panic', '-c', 'track_io_timing=on'],
});
await pgs.initialise(); await pgs.start(); await pgs.createDatabase('akram');
const conn = () => new pg.Client({ host: '127.0.0.1', port: 54332, user: 'postgres', password: 'pw', database: 'akram' });
const admin = conn(); await admin.connect();
const stop = async (code) => { await admin.end().catch(() => {}); await pgs.stop(); process.exit(code); };
const run = async (label, sql) => { try { await admin.query(sql); } catch (e) { console.error('SETUP FAIL', label, e.message, (e.where || '').split('\n').slice(0, 2).join(' / ')); await stop(1); } };

console.log(`⏳ تجهيز القاعدة (الترحيلات)…`);
await run('roles', `do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $$;`);
await run('appschema', 'create schema if not exists app; create extension if not exists pgcrypto; create extension if not exists pg_stat_statements;');
await run('mock', fs.readFileSync('tests/db/supabase-mock.sql', 'utf8'));
for (const f of fs.readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort()) await run(f, fs.readFileSync('supabase/migrations/' + f, 'utf8'));

// ───────────── بيانات الحِمل ─────────────
const U = (p, i) => `${p}000000-0000-0000-0000-${String(i).padStart(12, '0')}`; // uuid مولَّد
const SECTORS = (await admin.query('select id from public.sectors order by id')).rows.map((r) => Number(r.id));
const S = SECTORS.length;
// قاعدة العمل: متعهد نشط واحد لكل منطقة ⇒ عدد المتعهدين = عدد المناطق (بحد أقصى 60 = عدد مسؤولي الأقسام)
const N_MGR = 60, N_CON = Math.min(60, S), N_OPS = 20, N_OFF = 10, N_EMP = USERS;
const sectorExpr = (iExpr) => `(array[${SECTORS.join(',')}]::smallint[])[1 + ((${iExpr}) % ${S})]`; // المسؤولون/المتعهدون/غرفة العمليات/كراج/كل الموظفين
console.log(`⏳ تجهيز ${USERS} مستخدم (مسؤولو أقسام ${N_MGR}، متعهدون ${N_CON} = عدد المناطق، غرفة عمليات ${N_OPS}، كراج ${N_OFF}) + ${DEVICES} جهاز GPS…`);
await run('fixtures', `
set local app.dedup_window_seconds = '0';
insert into public.hr_shifts (id, name, start_time, end_time, grace_minutes, work_days) values ('5a000000-0000-0000-0000-00000000aa01', 'شفت الحِمل 24 ساعة', '00:00', '23:59', 15, '{0,1,2,3,4,5,6}') on conflict (name) do nothing;
insert into public.departments (id, name, code) values ('5ad00000-0000-0000-0000-0000000000a1','قسم الحِمل','LD1') on conflict do nothing;
insert into public.departments (id, name, code, parent_id, is_job_title) values ('5ad00000-0000-0000-0000-0000000000a2','سائق الحِمل','LD1J','5ad00000-0000-0000-0000-0000000000a1', true) on conflict do nothing;
-- كل الموظفين (1..N_EMP): حساب + دور employee + موظف + شفت
insert into auth.users (id, email) select ('5a000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'load' || i || '@t.iq' from generate_series(1, ${N_EMP}) i on conflict (id) do nothing;
insert into public.user_roles (user_id, role) select ('5a000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'employee' from generate_series(1, ${N_EMP}) i on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, department_id, biometric_pin)
  select ('5ae00000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, ('5a000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'LD-' || i, 'موظف الحِمل ' || i, '2024-01-01', '5ad00000-0000-0000-0000-0000000000a1', (90000 + i)::text from generate_series(1, ${N_EMP}) i on conflict (employee_number) do nothing;
insert into public.employee_shift_assignments (employee_id, shift_id, effective_from) select ('5ae00000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, '5a000000-0000-0000-0000-00000000aa01', '2024-01-01' from generate_series(1, ${N_EMP}) i on conflict do nothing;
-- مسؤولو أقسام: 1..N_MGR
insert into public.user_roles (user_id, role) select ('5a000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'department_manager' from generate_series(1, ${N_MGR}) i on conflict do nothing;
insert into public.manager_profiles (user_id, shift, sectors) select ('5a000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'morning', array[${sectorExpr('i - 1')}] from generate_series(1, ${N_MGR}) i on conflict do nothing;
-- متعهدون: N_MGR+1 .. N_MGR+N_CON، مديرهم مسؤول قسم
insert into public.contractor_profiles (user_id, manager_user_id, sector_id) select ('5a000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, ('5a000000-0000-0000-0000-' || lpad((i - ${N_MGR})::text, 12, '0'))::uuid, ${sectorExpr(`i - ${N_MGR} - 1`)} from generate_series(${N_MGR + 1}, ${N_MGR + N_CON}) i on conflict do nothing;
-- غرفة عمليات: التالون
insert into public.user_roles (user_id, role) select ('5a000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'ops_room' from generate_series(${N_MGR + N_CON + 1}, ${N_MGR + N_CON + N_OPS}) i on conflict do nothing;
-- كراج مركزي (طالبو التعيين) + مديران مفوضان للقرار
insert into public.user_roles (user_id, role) select ('5a000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'central_garage_officer' from generate_series(${N_MGR + N_CON + N_OPS + 1}, ${N_MGR + N_CON + N_OPS + N_OFF}) i on conflict do nothing;
insert into auth.users (id, email) values ('5a000000-0000-0000-0000-00000000ce01','load-ceo1@t.iq'),('5a000000-0000-0000-0000-00000000ce02','load-ceo2@t.iq') on conflict (id) do nothing;
-- مسؤولو قواطع (admin_ops) ×10 لِلوحة القاطع
insert into public.user_roles (user_id, role) select ('5a000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'admin_ops' from generate_series(${N_MGR + N_CON + N_OPS + N_OFF + 1}, ${N_MGR + N_CON + N_OPS + N_OFF + 10}) i on conflict do nothing;
insert into public.sector_manager_profiles (user_id, parent_sectors) select ('5a000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, case when i % 2 = 0 then array['karrada'] else array['zaafaraniya'] end from generate_series(${N_MGR + N_CON + N_OPS + N_OFF + 1}, ${N_MGR + N_CON + N_OPS + N_OFF + 10}) i on conflict do nothing;
insert into public.user_roles (user_id, role) values ('5a000000-0000-0000-0000-00000000ce01','super_admin'),('5a000000-0000-0000-0000-00000000ce02','super_admin') on conflict do nothing;
-- جهاز بصمة
insert into public.biometric_devices (id, serial_number, name, timezone_offset, is_active) values ('5ad00000-0000-0000-0000-00000000bb01', 'LOAD-DEV-1', 'جهاز الحِمل', '+03:00', true) on conflict (serial_number) do nothing;
`);
{
  const c = (await admin.query(`select (select count(*) from public.employees where employee_number like 'LD-%') emp, (select count(*) from public.manager_profiles where user_id::text like '5a000000-%') mgr,
    (select count(*) from public.contractor_profiles where user_id::text like '5a000000-%') con, (select count(*) from public.user_roles where role = 'ops_room' and user_id::text like '5a000000-%') ops,
    (select app.live_kind_of(('5a000000-0000-0000-0000-' || lpad(${N_MGR + 1}::text, 12, '0'))::uuid)) con_kind, (select app.live_kind_of('5a000000-0000-0000-0000-000000000001')) mgr_kind`)).rows[0];
  console.log(`   موظفون=${c.emp} مسؤولو أقسام=${c.mgr} متعهدون=${c.con} غرفة عمليات=${c.ops} · نوع المشاركة: متعهد=${c.con_kind} مسؤول=${c.mgr_kind}`);
}
const providerId = (await admin.query(`select id from public.gps_providers where type='vendor_api' and is_active order by created_at limit 1`)).rows[0]?.id;
if (!providerId) { console.error('no vendor_api provider'); await stop(1); }
const OPS_UIDS = Array.from({ length: N_OPS }, (_, k) => U('5a', N_MGR + N_CON + 1 + k));
const OFF_UIDS = Array.from({ length: N_OFF }, (_, k) => U('5a', N_MGR + N_CON + N_OPS + 1 + k));
const MGR_UIDS = Array.from({ length: N_MGR }, (_, k) => U('5a', 1 + k));
const CON_UIDS = Array.from({ length: N_CON }, (_, k) => U('5a', N_MGR + 1 + k));
const CEO = ['5a000000-0000-0000-0000-00000000ce01', '5a000000-0000-0000-0000-00000000ce02'];
const ADM_UIDS = Array.from({ length: 10 }, (_, k) => U('5a', N_MGR + N_CON + N_OPS + N_OFF + 1 + k));

// ───────────── مجمّع اتصالات + قياس ─────────────
const pool = new pg.Pool({ host: '127.0.0.1', port: 54332, user: 'postgres', password: 'pw', database: 'akram', max: CONNS });
const metrics = new Map(); // fn -> { ms: number[], errors: Map<code, n> }
const rec = (fn, ms, err) => {
  if (!metrics.has(fn)) metrics.set(fn, { ms: [], errors: new Map() });
  const m = metrics.get(fn); m.ms.push(ms);
  if (err) { const code = (err.match(/[A-Z][A-Z_]{4,}/) || [err.slice(0, 40)])[0]; m.errors.set(code, (m.errors.get(code) || 0) + 1); }
};
/** استدعاء واحد كمستخدم معيّن (auth.uid عبر GUC) مع قياس الزمن */
async function call(fn, uid, sql, params = []) {
  const c = await pool.connect();
  const t0 = process.hrtime.bigint();
  let err = null;
  try {
    await c.query('begin');
    await c.query(`select set_config('auth.user_id', $1, true), set_config('app.dedup_window_seconds', '8', true)`, [uid ?? '']);
    const r = await c.query(sql, params);
    await c.query('commit');
    return r.rows;
  } catch (e) { err = e.message; await c.query('rollback').catch(() => {}); return null; }
  finally { rec(fn, Number(process.hrtime.bigint() - t0) / 1e6, err); c.release(); }
}
const pct = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const fmt = (n) => (Math.round(n * 10) / 10).toFixed(1);
/** تشغيل مهام بالتوازي بسقف معيّن */
async function parallel(tasks, limit = CONNS) {
  let i = 0; const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => { while (i < tasks.length) { const t = tasks[i++]; await t(); } });
  await Promise.all(workers);
}
const snapshot = () => { const out = {}; for (const [fn, m] of metrics) out[fn] = { n: m.ms.length, p50: pct(m.ms, 0.5), p95: pct(m.ms, 0.95), p99: pct(m.ms, 0.99), max: Math.max(...m.ms), avg: m.ms.reduce((a, b) => a + b, 0) / m.ms.length, errors: Object.fromEntries(m.errors) }; return out; };
const report = { config: { USERS, SECONDS, CONNS, DEVICES }, scenarios: {} };
const scenario = async (key, title, fnBody) => {
  metrics.clear();
  await admin.query('select pg_stat_statements_reset()');
  const t0 = Date.now();
  await fnBody();
  const wall = (Date.now() - t0) / 1000;
  const snap = snapshot();
  const calls = Object.values(snap).reduce((a, m) => a + m.n, 0);
  console.log(`\n■ ${title} — ${calls} استدعاء في ${fmt(wall)} ث (${fmt(calls / wall)} استدعاء/ث)`);
  console.log('  الدالة'.padEnd(42) + 'عدد'.padStart(7) + 'p50'.padStart(9) + 'p95'.padStart(9) + 'p99'.padStart(9) + 'أقصى'.padStart(9) + '  أخطاء');
  for (const [fn, m] of Object.entries(snap).sort((a, b) => b[1].p95 - a[1].p95))
    console.log('  ' + fn.padEnd(40) + String(m.n).padStart(7) + fmt(m.p50).padStart(9) + fmt(m.p95).padStart(9) + fmt(m.p99).padStart(9) + fmt(m.max).padStart(9) + '  ' + (Object.keys(m.errors).length ? JSON.stringify(m.errors) : '—'));
  const top = (await admin.query(`select left(regexp_replace(query, '\\s+', ' ', 'g'), 110) q, calls, round(total_exec_time::numeric, 1) total_ms, round(mean_exec_time::numeric, 2) mean_ms, rows, shared_blks_read + shared_blks_hit blks
    from pg_stat_statements where dbid = (select oid from pg_database where datname = 'akram') and query not ilike '%pg_stat_statements%' and query not ilike 'begin%' and query not ilike 'commit%' and query not ilike 'rollback%' and query not ilike '%set_config(%'
    order by total_exec_time desc limit 8`)).rows;
  console.log('  ▸ أثقل الاستعلامات الداخلية (مجموع الزمن):');
  for (const r of top) console.log(`    ${String(r.total_ms).padStart(9)} ms  ×${String(r.calls).padStart(6)}  (متوسط ${r.mean_ms} ms)  ${r.q}`);
  report.scenarios[key] = { title, wall_s: wall, calls, per_fn: snap, top_statements: top };
};
const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10); // تاريخ بغداد

// ───────────── S1 حضور جماعي ─────────────
await scenario('attendance', `S1 حضور جماعي — ${N_EMP} موظف يبصمون دخولاً (دفعات ADMS ×50 + بصمات مفردة) ثم خروجاً`, async () => {
  const line = (i, t) => `${90000 + i}\t${today} ${t}\t0\t1`;
  // دفعات: الجهاز يدفع 50 بصمة في الطلب الواحد
  const batches = [];
  for (let s = 1; s <= N_EMP; s += 50) batches.push(Array.from({ length: Math.min(50, N_EMP - s + 1) }, (_, k) => line(s + k, '07:58:00')).join('\n'));
  await parallel(batches.map((raw) => () => call('biometric_ingest ×50 بصمة', null, `select public.biometric_ingest('LOAD-DEV-1', $1, 'ATTLOG')`, [raw])));
  // بصمات مفردة متزامنة (أجهزة ترسل كل بصمة لحظياً)
  await parallel(Array.from({ length: N_EMP }, (_, k) => () => call('biometric_ingest ×1 بصمة', null, `select public.biometric_ingest('LOAD-DEV-1', $1, 'ATTLOG')`, [line(k + 1, '16:02:00')])));
  // تقارير الحضور بعد الدفعة: غير المطابقين + موظف يفتح حضوره
  await parallel(Array.from({ length: 20 }, (_, k) => () => call('biometric_unmatched_report', CEO[k % 2], `select * from public.biometric_unmatched_report(current_date - 1, current_date)`)));
});

// ───────────── S2 GPS كل ثانية ─────────────
await scenario('gps', `S2 GPS — ${DEVICES} جهاز يُزامَن كل ثانية × ${SECONDS} ث + ${N_OPS} شاشة عمليات تستعلم كل ثانية`, async () => {
  const items = (tick) => Array.from({ length: DEVICES }, (_, k) => ({ id: `LD${k + 1}`, name: `مركبة ${k + 1}`, lat: 33.3 + k * 1e-4 + tick * 1e-5, lng: 44.4 + k * 1e-4, speed: (k + tick) % 60, course: (k * 7) % 360, timestamp: Math.floor(Date.now() / 1000) - 5 + tick, online: 'online', device_data: { imei: `86${String(k).padStart(13, '0')}`, plate_number: `بغداد ${k + 1}` } }));
  const t0 = Date.now();
  const syncLoop = (async () => {
    for (let tick = 0; tick < SECONDS; tick++) {
      const s = Date.now();
      await call('lvn_apply_devices (300 جهاز)', null, `select * from public.lvn_apply_devices($1, $2::jsonb, null, 'v1', 'incremental')`, [providerId, JSON.stringify(items(tick))]);
      await call('gps_evaluate_operational_alerts', null, `select public.gps_evaluate_operational_alerts()`);
      const wait = 1000 - (Date.now() - s); if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
  })();
  const viewers = OPS_UIDS.map((uid) => (async () => {
    while (Date.now() - t0 < SECONDS * 1000) {
      const s = Date.now();
      await Promise.all([
        call('gps_lvn_live_map', uid, `select * from public.gps_lvn_live_map()`),
        call('gps_lvn_dashboard', uid, `select public.gps_lvn_dashboard()`),
        call('gps_lvn_open_alerts', uid, `select * from public.gps_lvn_open_alerts(100)`),
        call('gps_lvn_devices (صفحة 50)', uid, `select * from public.gps_lvn_devices(null,null,null,null,null,null,null,50,0)`),
      ]);
      const wait = 1000 - (Date.now() - s); if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
  })());
  await Promise.all([syncLoop, ...viewers]);
});

// ───────────── S3 المشاركة الحية ─────────────
await scenario('live', `S3 المشاركة الحية — ${N_MGR + N_CON} مشاركاً × 10 نبضات + 10 مشاهدين`, async () => {
  const sharers = [...MGR_UIDS, ...CON_UIDS];
  const tasks = [];
  for (let round = 0; round < 10; round++) for (const uid of sharers) tasks.push(() => call('live_share_ping', uid, `select public.live_share_ping($1, $2, 8)`, [33.31 + Math.random() * 0.01, 44.42 + Math.random() * 0.01]));
  const viewers = OPS_UIDS.slice(0, 10).map((uid) => async () => { for (let i = 0; i < 10; i++) await call('live_map_current', uid, `select * from public.live_map_current(null)`); });
  const status = sharers.map((uid) => () => call('live_share_status', uid, `select public.live_share_status()`));
  await parallel([...tasks, ...viewers, ...status]);
});

// ───────────── S4 الموافقات ─────────────
await scenario('approvals', `S4 الموافقات — 200 طلب تعيين من ${N_OFF} مسؤولي كراج + 200 قرار + صندوق المهام`, async () => {
  const creates = Array.from({ length: 200 }, (_, k) => () => call('hire_request_create', OFF_UIDS[k % N_OFF], `select public.hire_request_create($1::jsonb)`, [{ full_name: `مرشح الحِمل ${k + 1}`, job_title_id: '5ad00000-0000-0000-0000-0000000000a2' }]));
  await parallel(creates);
  const ids = (await admin.query(`select id from public.hire_requests where full_name like 'مرشح الحِمل %' and status = 'pending'`)).rows.map((r) => r.id);
  const decides = ids.map((id, k) => () => call('approval_decide_request', CEO[k % 2], `select public.approval_decide_request('hire', $1::uuid, true, null)`, [id]));
  const inbox = Array.from({ length: 100 }, (_, k) => () => call('approval_my_tasks', k % 3 === 0 ? CEO[k % 2] : OFF_UIDS[k % N_OFF], `select * from public.approval_my_tasks()`));
  const timeline = ids.slice(0, 100).map((id, k) => () => call('approval_timeline', OFF_UIDS[k % N_OFF], `select * from public.approval_timeline('hire', $1::uuid)`, [id]));
  await parallel([...decides, ...inbox, ...timeline]);
});

// ───────────── S5 اللوحات ─────────────
await scenario('dashboards', `S5 اللوحات — ${USERS} مستخدم يفتحون لوحاتهم في اللحظة نفسها`, async () => {
  const monthStart = today.slice(0, 8) + '01';
  const tasks = [];
  for (const uid of MGR_UIDS) tasks.push(() => call('manager_team_summary', uid, `select public.manager_team_summary()`));
  for (const uid of ADM_UIDS) { tasks.push(() => call('sector_manager_dashboard', uid, `select public.sector_manager_dashboard()`)); tasks.push(() => call('sector_manager_reports', uid, `select public.sector_manager_reports($1::date, $2::date)`, [monthStart, today])); }
  for (const uid of CON_UIDS) tasks.push(() => call('live_share_status', uid, `select public.live_share_status()`));
  for (const uid of OPS_UIDS) { tasks.push(() => call('gps_lvn_dashboard', uid, `select public.gps_lvn_dashboard()`)); tasks.push(() => call('live_map_current', uid, `select * from public.live_map_current(null)`)); }
  for (const uid of OFF_UIDS) tasks.push(() => call('garage_dashboard_summary', uid, `select public.garage_dashboard_summary($1::date, $2::date, null, null)`, [monthStart, today]));
  for (let k = 0; k < 40; k++) tasks.push(() => call('exec_overview (شهر)', CEO[k % 2], `select public.exec_overview($1::date, $2::date, null, null)`, [monthStart, today]));
  for (let k = 0; k < 40; k++) tasks.push(() => call('notifications (آخر 20)', U('5a', 1 + k), `select * from public.notifications where user_id = auth.uid() order by created_at desc limit 20`));
  // بقية الموظفين: صندوق مهامهم (أخف صفحة شائعة)
  for (let i = N_MGR + N_CON + N_OPS + N_OFF + 11; i <= N_EMP; i++) tasks.push(() => call('approval_my_tasks', U('5a', i), `select * from public.approval_my_tasks()`));
  // ترتيب عشوائي ليحاكي الواقع
  tasks.sort(() => Math.random() - 0.5);
  await parallel(tasks);
});

// ───────────── تشخيص الفهارس ─────────────
console.log('\n■ تشخيص الفهارس بعد الحِمل');
const seq = (await admin.query(`select relname, n_live_tup, seq_scan, seq_tup_read, idx_scan from pg_stat_user_tables where schemaname = 'public' and n_live_tup >= 200 and seq_scan > 50 order by seq_tup_read desc limit 15`)).rows;
console.log('  ▸ جداول كبيرة تُمسح تسلسلياً كثيراً (مرشّحة لفهرس):');
for (const r of seq) console.log(`    ${r.relname.padEnd(36)} صفوف=${String(r.n_live_tup).padStart(6)}  مسح تسلسلي=${String(r.seq_scan).padStart(6)}  صفوف مقروءة=${String(r.seq_tup_read).padStart(9)}  عبر فهرس=${r.idx_scan}`);
const fks = (await admin.query(`
  select c.conrelid::regclass::text tbl, a.attname col
  from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
  where c.contype = 'f' and c.connamespace = 'public'::regnamespace and array_length(c.conkey, 1) = 1
    and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = a.attnum)
    and (select n_live_tup from pg_stat_user_tables t where t.relid = c.conrelid) >= 100
  order by 1, 2`)).rows;
console.log(`  ▸ مفاتيح أجنبية بلا فهرس في جداول بها ≥100 صف: ${fks.length}`);
for (const r of fks) console.log(`    ${r.tbl}.${r.col}`);
report.diagnostics = { seq_scans: seq, fk_without_index: fks };
fs.writeFileSync('/tmp/akaram-load-report.json', JSON.stringify(report, null, 1));
console.log('\n✔ التقرير الخام: /tmp/akaram-load-report.json');
await pool.end();
await stop(0);
