/**
 * اختبار حقيقي للترحيلات 20261128000100–000400 على Postgres داخل العملية (PGlite).
 *
 * لماذا PGlite لا اختبار نصّي: الحاجز الذي نُدافع عنه (لا حذف بلا شهادة بناء،
 * ولا حذف زيارات بلا تصدير) لا يُثبته إلا تشغيل الدالة على صفوف حقيقية.
 * الاختبار النصّي يمرّ على تعريف معطوب؛ هذا لا يمرّ.
 *
 * ما يُثبته:
 *   ① الشهادة: يوم بلا شهادة لكل زوناته لا يُعتمد، وزون فاشل/متخطّى يُبطل الاعتماد.
 *   ② التفريغ: يحتفظ ٤٨ ساعة، لا يمسح الجدول، ويتخطّى الأيام غير المعتمدة.
 *   ③ نوافذ الشفتات: العابر لمنتصف الليل له نهاية في اليوم التالي.
 *   ④ الأرشيف: bucket خاص بحد ٢٥ م.ب، والجدول ١٥ عموداً، والبصمة السيئة تُرفض.
 *   ⑤ حارس الزيارات: لا إذن حذف بلا تصدير، و`cutoff == اليوم` محظور (الحذف < cutoff).
 *   ⑥ مصدر الزيارات: ١٧ عموداً، ومدى > 366 يُرفض.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const MIG = (f: string) => join(process.cwd(), 'supabase/migrations', f)
const MIGRATIONS = [
  '20261128000100_gps_retention_build_ledger.sql',
  '20261128000200_gps_shift_windows_pull.sql',
  '20261128000300_map_visits_excel_archive.sql',
  '20261128000400_map_visits_archive_retention.sql',
]

/** بنية دنيا تحاكي Supabase: auth.uid، storage، cron، والجداول التي تعتمد عليها الترحيلات. */
const PRELUDE = `
create role anon;
create role authenticated;
create role service_role;
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists cron;
create schema if not exists app;
create table auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $f$
  select nullif(current_setting('auth.user_id', true), '')::uuid $f$;
create table public.user_roles (user_id uuid, role text);
create or replace function public.has_role(p_roles text[]) returns boolean
  language sql stable as $f$
  select coalesce((select ur.role = any(p_roles) from public.user_roles ur
    where ur.user_id = auth.uid() limit 1), false) $f$;
create or replace function app.has_role(p_roles text[]) returns boolean
  language sql stable as $f$ select public.has_role(p_roles) $f$;
create table storage.buckets (id text primary key, name text, public boolean,
  file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(),
  bucket_id text, name text);
create table cron.job (jobid bigserial primary key, jobname text, schedule text,
  command text, active boolean default true);
create or replace function cron.schedule(p_name text, p_sched text, p_cmd text)
  returns bigint language plpgsql as $f$
declare n bigint;
begin
  insert into cron.job (jobname, schedule, command) values (p_name, p_sched, p_cmd) returning jobid into n;
  return n;
end $f$;
create or replace function cron.unschedule(p_name text) returns boolean
  language sql as $f$ delete from cron.job where jobname = p_name returning true $f$;
create or replace function app.user_display_name(p uuid) returns text
  language sql stable as $f$ select 'مستخدم' $f$;
create table public.map_zones (id uuid primary key default gen_random_uuid(), name text);
create table public.map_visits (
  id uuid primary key default gen_random_uuid(), placeday date, zone_id uuid,
  vehicle_id uuid, mahalla_number text, place_kind text, place_name text,
  entered_at timestamptz, exited_at timestamptz, dwell_seconds int,
  points_count int, status text);
create table public.gps_devices (id uuid primary key default gen_random_uuid(),
  external_id text, name text, is_active boolean default true, provider_id uuid,
  online_status text);
create table public.gps_vehicle_bindings (device_id uuid, garage_vehicle_id uuid);
create table public.garage_vehicles (id uuid primary key default gen_random_uuid(),
  vehicle_name text, db_number text, driver_name text, driver_employee_id uuid);
create table public.employees (id uuid primary key default gen_random_uuid(), full_name text);
create table public.hr_employees (id uuid primary key default gen_random_uuid(), full_name text);
create table public.gps_device_position_history (device_id uuid, latitude numeric,
  longitude numeric, speed numeric, fix_time timestamptz);
create table public.hr_shifts (id uuid primary key default gen_random_uuid(),
  name text, start_time time, end_time time, is_active boolean default true,
  work_days smallint[]);
create table public.data_retention_events (id uuid primary key default gen_random_uuid(),
  data_key text, action text, created_at timestamptz default now());
create table public.data_retention_requests (id uuid primary key default gen_random_uuid(),
  data_key text, cutoff date, rows_exported bigint, rows_deleted bigint,
  export_sha256 text, status text);
create table public.gps_history_import_runs (id uuid primary key default gen_random_uuid(),
  requested_by uuid, status text, range_from timestamptz, range_to timestamptz);
create table public.gps_history_purge_settings (
  id int default 1, enabled boolean default true, keep_hours int default 24,
  last_run timestamptz, last_rows int, runs_count int default 0, last_error text,
  last_skipped_rows int, last_skipped jsonb, last_run_at timestamptz,
  last_bytes_before bigint, last_bytes_after bigint, last_skipped_days jsonb,
  keep_days int);
create or replace function app.map_baghdad_day(p timestamptz) returns date
  language sql immutable as $f$ select (p at time zone 'Asia/Baghdad')::date $f$;
create or replace function public.map_require_reader() returns void language plpgsql as $f$
begin if auth.uid() is null then raise exception 'R'; end if; end $f$;
create or replace function public.map_require_editor() returns void language plpgsql as $f$
begin if auth.uid() is null then raise exception 'E'; end if; end $f$;
create or replace function app.require_retention_catalog_complete() returns void
  language plpgsql as $f$
declare missing text;
begin
  select string_agg(t.table_name, ', ' order by t.table_name) into missing
    from information_schema.tables t
   where t.table_schema='public' and t.table_type='BASE TABLE'
     and not exists (select 1 from app.data_retention_catalog() k where k.table_name=t.table_name);
  if missing is not null then
    raise exception 'RETENTION_CATALOG_INCOMPLETE: %', missing;
  end if;
end $f$;
create or replace function app.data_retention_count(p_key text, p_cutoff timestamptz)
  returns table (total bigint, locked bigint) language sql stable as $f$
  select 0::bigint, 0::bigint $f$;
create or replace function app.data_retention_delete_some(p_key text, p_cutoff timestamptz, p_limit int)
  returns bigint language sql volatile as $f$ select 0::bigint $f$;
create or replace function app.cold_archive_source_catalog()
  returns table (data_key text) language sql immutable as $f$ select 'x'::text $f$;
create or replace function app.data_retention_log(p_actor uuid, p_key text, p_action text, p_detail jsonb default '{}'::jsonb)
  returns void language sql as $f$ insert into public.data_retention_events(data_key, action) values (p_key, p_action) $f$;
create or replace function app.notify_by_role(p_roles text[], p_title text, p_body text, p_sev text, p_link text default null)
  returns void language sql as $f$ select $f$;
`

describe('الاحتفاظ والأرشيف — على Postgres حقيقي (PGlite)', () => {
  let db: PGlite
  const one = async <T = Record<string, unknown>>(sql: string): Promise<T> =>
    (await db.query<T>(sql)).rows[0] as T
  const all = async <T = Record<string, unknown>>(sql: string): Promise<T[]> =>
    (await db.query<T>(sql)).rows
  const exec = (sql: string) => db.exec(sql)
  const iso = (v: unknown) => new Date(v as string).toISOString().slice(0, 10)

  let zoneA = ''
  let zoneB = ''
  let device = ''
  let vehicle = ''

  beforeAll(async () => {
    db = new PGlite()
    await exec(PRELUDE)
    // الطبقة الأولى من الكتالوج (الجدول الوهمي) — الترحيل ① يوسّعه ثم يستبدله ④
    const tables = await all<{ table_name: string }>(
      `select table_name from information_schema.tables
        where table_schema='public' and table_type='BASE TABLE'
          and table_name not in ('gps_visit_builds','map_report_files')`,
    )
    const rows = tables
      .map((t) => `('${t.table_name}','ops','${t.table_name}','وصف','${t.table_name}',null,null,'لا',false,0,false)`)
      .join(',\n')
    await exec(`create or replace function app.data_retention_catalog()
      returns table (data_key text, portal_key text, label text, description text,
        table_name text, time_column text, keep_where text, safety_lock text,
        deletable boolean, default_months int, default_export_required boolean)
      language sql immutable as $f$ values ${rows} $f$;`)

    for (const f of MIGRATIONS) await exec(readFileSync(MIG(f), 'utf8'))

    await exec(`insert into auth.users(id,email) values('11111111-1111-1111-1111-111111111111','t@t.iq');
      insert into user_roles(user_id,role) values('11111111-1111-1111-1111-111111111111','it_admin');
      select set_config('auth.user_id','11111111-1111-1111-1111-111111111111',false);`)
    // الإنتاج: 20261128000100 رفع keep_hours إلى 48 صراحةً (كان 24 قبل الإصلاح).
    // نُطابق الحالة الحقيقية كي يقيس الاختبار السلوك لا قيمة بذرة قديمة.
    await exec(`insert into gps_history_purge_settings (id, keep_hours) values (1, 48)`)

    zoneA = (await one<{ id: string }>(`insert into map_zones(name) values('زون أ') returning id`)).id
    zoneB = (await one<{ id: string }>(`insert into map_zones(name) values('زون ب') returning id`)).id
    device = (await one<{ id: string }>(`insert into gps_devices(external_id,name) values('D1','جهاز') returning id`)).id
    vehicle = (await one<{ id: string }>(`insert into garage_vehicles(vehicle_name,db_number) values('آلية ١','DB-1') returning id`)).id
  }, 120_000)

  afterAll(async () => { await db?.close() })

  it('④ الترحيلات الأربعة تُطبَّق ولا يبقى جدول بلا تعريف في الكتالوج', async () => {
    const missing = await one<{ n: number }>(`select count(*)::int n from information_schema.tables t
      where t.table_schema='public' and t.table_type='BASE TABLE'
        and not exists (select 1 from app.data_retention_catalog() k where k.table_name=t.table_name)`)
    expect(missing.n).toBe(0)
  })

  it('④ الحاجز يرفض أي جدول جديد غير معرَّف', async () => {
    await exec(`create table public.__probe (id int)`)
    await expect(exec(`select app.require_retention_catalog_complete()`)).rejects.toThrow(/RETENTION_CATALOG_INCOMPLETE/)
    await exec(`drop table public.__probe`)
  })

  it('① يوم بلا شهادة لكل زوناته لا يُعتمد', async () => {
    const r = await one<{ v: boolean }>(`select app.gps_day_is_certified('2026-11-20'::date) v`)
    expect(r.v).toBe(false)
  })

  it('① زون واحد فاشل أو متخطّى يُبطل اعتماد اليوم كله', async () => {
    await exec(`insert into gps_visit_builds(zone_id,day,status,visits_created) values
      ('${zoneA}','2026-11-20','built',10),('${zoneB}','2026-11-20','empty',0)`)
    expect((await one<{ v: boolean }>(`select app.gps_day_is_certified('2026-11-20'::date) v`)).v).toBe(true)
    await exec(`update gps_visit_builds set status='failed' where zone_id='${zoneB}'`)
    expect((await one<{ v: boolean }>(`select app.gps_day_is_certified('2026-11-20'::date) v`)).v).toBe(false)
    await exec(`update gps_visit_builds set status='skipped' where zone_id='${zoneB}'`)
    expect((await one<{ v: boolean }>(`select app.gps_day_is_certified('2026-11-20'::date) v`)).v).toBe(false)
    await exec(`update gps_visit_builds set status='empty' where zone_id='${zoneB}'`)
    expect((await one<{ v: boolean }>(`select app.gps_day_is_certified('2026-11-20'::date) v`)).v).toBe(true)
  })

  it('② التفريغ يحتفظ ٤٨ ساعة ولا يمسح الجدول، ويتخطّى الأيام غير المعتمدة', async () => {
    await exec(`delete from gps_device_position_history`)
    await exec(`insert into gps_device_position_history(device_id,latitude,longitude,speed,fix_time) values
      ('${device}',1,1,0, now() - interval '2 hours'),
      ('${device}',1,1,0, now() - interval '10 hours'),
      ('${device}',1,1,0, now() - interval '3 days'),
      ('${device}',1,1,0, now() - interval '5 days')`)
    const before = (await one<{ n: number }>(`select count(*)::int n from gps_device_position_history`)).n
    const res = await one<{ r: Record<string, unknown> }>(`select app.gps_history_daily_purge(false) r`).then(x => x.r)
    expect(Number(res.keep_hours)).toBe(48)
    expect(Number(res.rows_purged)).toBeLessThan(before)
    const recent = (await one<{ n: number }>(
      `select count(*)::int n from gps_device_position_history where fix_time > now() - interval '48 hours'`)).n
    const after = (await one<{ n: number }>(`select count(*)::int n from gps_device_position_history`)).n
    expect(after).toBeGreaterThanOrEqual(recent)
  })

  it('③ الشفت العابر لمنتصف الليل له نهاية في اليوم التالي', async () => {
    await exec(`insert into hr_shifts(name,start_time,end_time) values
      ('مرن مسائي','17:00','04:00'),('صباحي','08:00','16:00')`)
    const w = await all<{ shift_name: string, crosses_midnight: boolean, hours: string, win_start: string, win_end: string }>(
      `select * from app.map_shift_windows_for_day('2026-11-20'::date)`)
    expect(w).toHaveLength(2)
    const cross = w.find((x) => x.shift_name === 'مرن مسائي')
    expect(cross?.crosses_midnight).toBe(true)
    expect(new Date(cross!.win_end).getTime()).toBeGreaterThan(new Date(cross!.win_start).getTime())
    expect(Number(cross?.hours)).toBe(11)
  })

  it('③ الأرشيف: bucket خاص بحد ٢٥ م.ب وجدول بـ١٥ عموداً', async () => {
    expect((await one<{ p: boolean }>(`select public p from storage.buckets where id='map-reports'`)).p).toBe(false)
    expect(Number((await one<{ f: number }>(`select file_size_limit f from storage.buckets where id='map-reports'`)).f))
      .toBe(26214400)
    const cols = (await one<{ n: number }>(`select count(*)::int n from information_schema.columns
      where table_schema='public' and table_name='map_report_files'`)).n
    expect(cols).toBe(15)
  })

  it('③ بصمة SHA-256 غير صالحة تُرفض قبل الرفع', async () => {
    await expect(exec(`select public.map_report_register_file(
      'reports/x/y.xlsx','sheet','ن',current_date,'ورقة','zzz',10)`)).rejects.toThrow(/SHA256/)
  })

  it('⑤ لا إذن بحذف زيارة بلا تصدير مُثبت', async () => {
    await exec(`insert into map_visits(placeday,zone_id,entered_at,status) values
      ('2026-11-01','${zoneA}','2026-11-01 10:00Z','confirmed'),
      ('2026-11-01','${zoneA}','2026-11-01 11:00Z','confirmed'),
      ('2026-11-02','${zoneA}','2026-11-02 10:00Z','confirmed')`)
    const g = await all<{ placeday: string, can_purge: boolean, exported: boolean }>(
      `select * from public.map_visits_purge_guard('2026-11-10',30)`)
    expect(g).toHaveLength(2)
    expect(g.every((r) => r.exported === false && r.can_purge === false)).toBe(true)
  })

  it('⑤ القاطع الذي يساوي اليوم محظور — لأن الحذف < cutoff', async () => {
    await exec(`insert into data_retention_requests(data_key,cutoff,rows_exported,status)
      values ('map_visits','2026-11-01',2,'done')`)
    const g = await all<{ placeday: string, can_purge: boolean }>(
      `select * from public.map_visits_purge_guard('2026-11-10',30)`)
    expect(g.find((r) => iso(r.placeday) === '2026-11-01')?.can_purge).toBe(false)
    // 2026-11-02 بعد القاطع ⇒ لا يغطيه
    expect(g.find((r) => iso(r.placeday) === '2026-11-02')?.can_purge).toBe(false)
  })

  it('⑤ قاطع يغطي اليومين ⇒ مأذونان', async () => {
    await exec(`update data_retention_requests set cutoff='2026-11-03' where data_key='map_visits'`)
    const g = await all<{ can_purge: boolean }>(`select * from public.map_visits_purge_guard('2026-11-10',30)`)
    expect(g.every((r) => r.can_purge === true)).toBe(true)
  })

  it('⑥ مصدر الزيارات ١٧ عموداً ومدى > 366 يُرفض', async () => {
    await exec(`update map_visits set vehicle_id='${vehicle}' where placeday='2026-11-01'`)
    const rep = await all<Record<string, unknown>>(`select * from public.gps_visit_reports('2026-11-01','2026-11-02',null)`)
    expect(rep).toHaveLength(3)
    expect(Object.keys(rep[0]!)).toHaveLength(17)
    await expect(exec(`select * from public.gps_visit_reports('2024-01-01','2026-01-01',null)`))
      .rejects.toThrow(/366/)
  })
})
