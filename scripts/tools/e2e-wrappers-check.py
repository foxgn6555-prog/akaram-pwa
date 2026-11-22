#!/usr/bin/env python3
"""إثبات أغلفة public في حاضنة PG — قبل أي تطبيق على الإنتاج.

يثبت ثلاثة أشياء:
① الأغلفة الـ١٧ تُنشأ بلا خطأ (تواقيع وأعمدة مطابقة لدوال app)
② حارس الدور يعمل: مستخدم بلا دور يُرفض بـ MAP_FORBIDDEN قبل أي كتابة
③ الزونات الثمانية تُدرج بأكواد مطابقة لمخطط map_zones

يتطلّب pgserver موضعياً. لا يلمس الإنتاج.
"""
import os, subprocess, tempfile, sys

BIN = "/tmp/pgvenv/lib/python3.11/site-packages/pgserver/pginstall/bin"
tmp = tempfile.mkdtemp()
d = os.path.join(tmp, "db")
PORT = "5621"

subprocess.run(["pkill","-f",f"postgres.*{PORT}"],capture_output=True)
subprocess.run([f"{BIN}/initdb", "-D", d, "-U", "postgres", "-A", "trust"], capture_output=True)
subprocess.run([f"{BIN}/pg_ctl", "-D", d, "-o", f"-p {PORT} -k {tmp}", "-l", f"{tmp}/log", "start"],
               capture_output=True)
subprocess.run([f"{BIN}/createdb", "-h", tmp, "-p", PORT, "-U", "postgres", "t"], capture_output=True)

FAILED = []
def q(sql, expect_error=False, label=""):
    r = subprocess.run([f"{BIN}/psql", "-h", tmp, "-p", PORT, "-U", "postgres", "-d", "t",
                        "-At", "-v", "ON_ERROR_STOP=1", "-c", sql],
                       capture_output=True, text=True)
    if expect_error:
        ok = r.returncode != 0
        print(("  ✔ " if ok else "  ✘ ") + label + (f" → {r.stderr.strip().splitlines()[0][:90]}" if ok else " → نجح والمتوقع رفض!"))
        if not ok: FAILED.append(label)
        return r.stdout.strip()
    if r.returncode != 0:
        print(f"  ✘ {label}\n     {r.stderr.strip()[:400]}")
        FAILED.append(label)
        return None
    print(f"  ✔ {label}")
    return r.stdout.strip()

print("═══ ⓪ التمهيد ═══")
q("""create schema app; create schema auth;
     create table auth.users(id uuid primary key);
     create role authenticated; create role anon;
     create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;""",
  label="المخططات والأدوار")

# دور قابل للتحويل: لا ops_room
q("""create or replace function app.has_role(p text[]) returns boolean
     language sql stable as $$ select ('ops_room' = any(p) and current_setting('test.actor', true) = 'editor') $$;""",
  label="app.has_role مزيّف يميّز المستخدمين")
q("""create role u_editor; create role u_viewer;""", label="دوران اختباريان")

print("\n═══ ① بناء الحد الأدنى الذي تعتمد عليه الدوال ═══")
q("""create table public.sectors(id smallint primary key, code text, name text);
     insert into public.sectors select g, 'S'||g, n from (values (1,'أرخيته'),(2,'الرياض'),(3,'الواثق'),(4,'الجادرية'),(5,'السندباد'),(6,'الزعفرانية'),(7,'ديالى'),(8,'الوليد')) as t(g,n);
     create table public.gps_geofences(
       id uuid primary key default gen_random_uuid(), name text,
       polygon jsonb not null, sector_id smallint, source text default 'platform',
       is_active bool default true);
     insert into public.gps_geofences(name,polygon,sector_id)
     select v.name,
            jsonb_build_array(jsonb_build_object('lat',33.221+v.s,'lng',44.453),
                              jsonb_build_object('lat',33.255+v.s,'lng',44.453),
                              jsonb_build_object('lat',33.255+v.s,'lng',44.517),
                              jsonb_build_object('lat',33.221+v.s,'lng',44.517)),
            v.s
     from (values (1,'أرخيته'),(2,'الرياض'),(3,'الواثق'),(4,'الجادرية'),
                  (5,'السندباد'),(6,'الزعفرانية'),(7,'ديالى'),(8,'الوليد')) as v(s,name);""",
  label="sectors + gps_geofences")

# map_zones بمخطط مطابق للإنتاج (نفس قيد ^[A-Z]{3}$)
q("""create table public.map_zones (
       id uuid primary key default gen_random_uuid(),
       geofence_id uuid not null unique references public.gps_geofences(id) on delete restrict,
       code text not null check (code ~ '^[A-Z]{3}$'),
       name text not null check (length(trim(name)) between 2 and 120),
       sector_id smallint references public.sectors(id) on delete set null,
       sort_order int not null default 0, notes text,
       created_at timestamptz not null default now(),
       updated_at timestamptz not null default now(),
       created_by uuid, updated_by uuid);""",
  label="public.map_zones")

# دوال app المطلوبة (تعريفات مبسّطة بنفس التوقيع بالضبط)
q("""create or replace function app.map_osm_script(p_zone uuid) returns text
     language sql stable security definer set search_path=public,app as $$
       select 'zone=' || p_zone::text $$;
     create or replace function app.map_zone_polygon(p_zone uuid) returns text
     language sql stable security definer set search_path=public,app as $$
       select '33.221 44.453' $$;
     create or replace function app.map_import_batch(p_zone uuid, p_rows jsonb,
       p_mahallas jsonb default '{}'::jsonb, p_batch uuid default null,
       p_meta jsonb default '{}'::jsonb) returns jsonb
     language sql security definer set search_path=public,app as $$
       select jsonb_build_object('batch_id',p_batch,'inserted',jsonb_array_length(p_rows)) $$;""",
  label="ثلاث دوال app للاستيراد")

# دوال app للقراءة — تُولَّد بنفس الأعمدة
q("""create or replace function app.map_coverage_summary(p_zone uuid, p_day date)
     returns table (place_kind text, places_total int, places_visited int,
       places_confirmed int, places_uncertain int, coverage_pct numeric)
     language sql stable as $$ select 'street'::text, 1, 1, 1, 0, 100::numeric $$;
     create or replace function app.map_coverage_by_place(p_zone uuid, p_day date, p_kind text default null)
     returns table (place_kind text, place_id uuid, place_code text, place_name text,
       mahalla_code text, width_m numeric, length_m numeric, visited boolean, confirmed boolean,
       uncertain_visits int, visits_count int, first_entered_at timestamptz, last_exited_at timestamptz,
       total_dwell_seconds int, vehicles_count int, max_depth_m numeric)
     language sql stable as $$ select 'street'::text,gen_random_uuid(),'S-1','x','M-1',3::numeric,100::numeric,
       true,true,0,1,now(),now(),60,1,5::numeric $$;
     create or replace function app.map_coverage_by_vehicle(p_zone uuid, p_day date)
     returns table (vehicle_id uuid, vehicle_name text, db_number text, plate_number text,
       shift text, driver_name text, in_fleet boolean, unbound_devices int, visits_count int,
       confirmed_count int, uncertain_count int, places_count int, total_dwell_seconds int,
       first_at timestamptz, last_at timestamptz)
     language sql stable as $$ select gen_random_uuid(),'v','1','p','A','d',true,0,1,1,0,1,60,now(),now() $$;
     create or replace function app.map_coverage_rollup(p_zone uuid, p_day date)
     returns table (places_total int, places_visited int, places_confirmed int, places_uncertain int,
       places_not_entered int, visits_total int, visits_confirmed int, visits_uncertain int,
       coverage_pct numeric, confirmed_pct numeric, uncertain_pct numeric, vehicles_active int,
       total_dwell_seconds int)
     language sql stable as $$ select 1,1,1,0,0,1,1,0,100::numeric,100::numeric,0::numeric,1,60 $$;
     create or replace function app.map_unvisited_places(p_zone uuid, p_day date, p_kind text default null)
     returns table (place_kind text, place_id uuid, place_code text, place_name text,
       mahalla_code text, length_m numeric, width_m numeric)
     language sql stable as $$ select 'street'::text,gen_random_uuid(),'S-2','y','M-1',50::numeric,3::numeric $$;
     create or replace function app.map_coverage_trend(p_zone uuid, p_until date, p_days int default 14)
     returns table (day date, places_total int, places_visited int, places_confirmed int,
       places_uncertain int, coverage_pct numeric, visits_total int)
     language sql stable as $$ select current_date,1,1,1,0,100::numeric,1 $$;
     create or replace function app.map_visits_enriched(p_zone uuid, p_day date,
       p_vehicle uuid default null, p_kind text default null)
     returns table (id uuid, vehicle_id uuid, device_id uuid, place_kind text, place_id uuid,
       place_code text, place_name text, placeday date, seq smallint, entered_at timestamptz,
       exited_at timestamptz, dwell_seconds int, points_count smallint, max_depth_m numeric,
       status text, reason text, vehicle_name text, db_number text, driver_name text, shift text,
       shift_source text, driver_source text, department_manager_names text, sector_id smallint,
       sector_name text)
     language sql stable as $$ select gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'street'::text,
       gen_random_uuid(),'S-1','x',current_date,1::smallint,now(),now(),60,1,5::numeric,'confirmed'::text,
       null::text,'v','1','d','A','fleet'::text,'hr'::text,'م'::text,5::smallint,'السندباد'::text $$;
     create or replace function app.map_vehicles_day(p_zone uuid, p_day date)
     returns table (vehicle_id uuid, vehicle_name text, db_number text, plate_number text,
       fleet_shift text, fleet_driver text, shift text, driver_name text, shift_source text,
       visits_count int, confirmed_count int, uncertain_count int, places_count int,
       total_dwell_seconds int, first_at timestamptz, last_at timestamptz)
     language sql stable as $$ select gen_random_uuid(),'v','1','p','A','d','A','d','fleet'::text,1,1,0,1,60,now(),now() $$;
     create or replace function app.map_unvisited_enriched(p_zone uuid, p_day date, p_kind text default null)
     returns table (place_kind text, place_id uuid, place_code text, place_name text,
       mahalla_code text, length_m numeric, width_m numeric, department_manager_names text)
     language sql stable as $$ select 'street'::text,gen_random_uuid(),'S-2','y','M-1',50::numeric,3::numeric,'م'::text $$;
     create or replace function app.map_sector_managers(p_sectors smallint[])
     returns table (sector_id smallint, manager_names text, manager_shifts text, managers_count int)
     language sql stable as $$ select 5::smallint,'م'::text,'A'::text,1 $$;""",
  label="تسع دوال قراءة بنفس الأعمدة")

q("""create table if not exists public.map_export_prefs(id uuid primary key default gen_random_uuid());
     create or replace function app.map_export_prefs_get(p_kind text) returns jsonb
     language sql stable as $$ select '{}'::jsonb $$;
     create or replace function app.map_export_prefs_set(p_kind text, p_columns jsonb) returns jsonb
     language sql as $$ select p_columns $$;
     create or replace function app.map_export_log_add(p_zone uuid, p_kind text, p_from date,
       p_to date, p_rows int, p_columns jsonb) returns uuid
     language sql as $$ select gen_random_uuid() $$;
     create or replace function app.map_build_visits(p_zone uuid, p_from timestamptz, p_to timestamptz,
       p_vehicle uuid default null, p_min_dwell_seconds int default 60, p_max_gap_seconds int default 300,
       p_replace boolean default true)
     returns table (visits_created int, visits_merged int, places_scanned int)
     language sql as $$ select 1,0,1 $$;""",
  label="دوال التصدير + محرّك الزيارات")

print("\n═══ ② تطبيق الهجرة ═══")
sql = open("supabase/migrations/20261122001600_map_public_rpc_wrappers.sql", encoding="utf-8").read()
r = subprocess.run([f"{BIN}/psql", "-h", tmp, "-p", PORT, "-U", "postgres", "-d", "t",
                    "-At", "-v", "ON_ERROR_STOP=1", "-f", "/dev/stdin"],
                   input=sql, capture_output=True, text=True)
if r.returncode != 0:
    print("  ✘ فشل التطبيق:\n", r.stderr[:1500])
    FAILED.append("تطبيق 01600")
else:
    print("  ✔ طُبّقت 01600 كاملة")

n = q("select count(*) from information_schema.routines where routine_schema='public' and routine_name like 'map\\_%'",
      label="عدّ الأغلفة في public")
print(f"     → {n} دالة (المتوقع ١٩: ١٧ غلافاً + حارسان)")
if n != "19":
    FAILED.append(f"عدد الأغلفة {n} ≠ 19")

print("\n═══ ③ حارس الدور ═══")
gid = q("select id from public.gps_geofences where sector_id=5", label="جلب geofence السندباد") or ""

q("""grant usage on schema app, public to u_editor, u_viewer;
     grant execute on all functions in schema app to u_editor, u_viewer;
     grant execute on function public.map_require_editor(), public.map_require_reader() to u_editor, u_viewer;""",
  label="منح التنفيذ للدورين")

# مستخدم بلا دور → يجب أن يُرفض
r1 = subprocess.run([f"{BIN}/psql", "-h", tmp, "-p", PORT, "-U", "postgres", "-d", "t", "-At",
                     "-v", "ON_ERROR_STOP=1", "-c",
                     "set role u_viewer; select public.map_require_editor();"],
                    capture_output=True, text=True)
ok = r1.returncode != 0 and "MAP_FORBIDDEN" in r1.stderr
print(("  ✔ " if ok else "  ✘ ") + "u_viewer بلا دور ⇒ MAP_FORBIDDEN" +
      ("" if ok else f" → {r1.stdout} {r1.stderr[:200]}"))
if not ok: FAILED.append("حارس الكتابة لا يرفض")

r2 = subprocess.run([f"{BIN}/psql", "-h", tmp, "-p", PORT, "-U", "postgres", "-d", "t", "-At",
                     "-v", "ON_ERROR_STOP=1", "-c",
                     "select set_config('test.actor','editor',false); select public.map_require_editor() is null;"],
                    capture_output=True, text=True)
ok2 = r2.returncode == 0 and r2.stdout.strip().splitlines()[-1].strip() == "f"  # void is null = f
print(("  ✔ " if ok2 else "  ✘ ") + "u_editor (ops_room) ⇒ يمر" +
      ("" if ok2 else f" → {r2.stdout} {r2.stderr[:200]}"))
if not ok2: FAILED.append("حارس الكتابة يرفض المخوّل")

# الغلاف يستدعي app فعلاً
r3 = subprocess.run([f"{BIN}/psql", "-h", tmp, "-p", PORT, "-U", "postgres", "-d", "t", "-At",
                     "-v", "ON_ERROR_STOP=1", "-c",
                     f"select set_config('test.actor','editor',false); select public.map_osm_script('{gid}');"],
                    capture_output=True, text=True)
ok3 = r3.returncode == 0 and r3.stdout.strip().splitlines()[-1].startswith("zone=")
print(("  ✔ " if ok3 else "  ✘ ") + "public.map_osm_script ينادي app بنجاح" +
      ("" if ok3 else f" → {r3.stdout} {r3.stderr[:300]}"))
if not ok3: FAILED.append("الغلاف لا ينادي app")

print("\n═══ ④ الزونات الثمانية ═══")
q("""insert into public.map_zones (geofence_id, code, name, sector_id, sort_order)
     select g.id, v.code, v.name, g.sector_id, v.sort_order
     from (values
       (1,'ARK','أرخيته',1),(2,'RYD','الرياض',2),(3,'WTH','الواثق',3),(4,'JAD','الجادرية',4),
       (5,'SND','السندباد',5),(6,'ZAF','الزعفرانية',6),(7,'DYA','ديالى',7),(8,'WAL','الوليد',8)
     ) as v(sector_id, code, name, sort_order)
     join public.gps_geofences g on g.sector_id = v.sector_id
     on conflict (geofence_id) do nothing;""",
  label="إدراج ٨ زونات")

out = q("select count(*), string_agg(code,',' order by sort_order) from public.map_zones",
        label="عدّ الزونات")
if out:
    cnt, codes = (out.split('|') + [''])[:2]
    print(f"     → {cnt} زون: {codes}")
    if cnt != "8": FAILED.append(f"عدد الزونات {cnt} ≠ 8")

print("\n" + "═" * 60)
if FAILED:
    print(f"✘ فشل {len(FAILED)}: {FAILED}")
    sys.exit(1)
print("✔ كل الفحوص نجحت — الهجرة صالحة للتطبيق على الإنتاج")
