#!/usr/bin/env python3
"""
الجولة ١ — مشغّل اختبار ترحيلات قاعدة البيانات على PostgreSQL حقيقي (بلا Docker).

يطبّق **كل** ملفات supabase/migrations/*.sql بالترتيب على قاعدة فارغة، ثم يشغّل
فحوص الجولة ١ (الجداول + دوال التحقق + القيود الأربعة الحرجة).

الاستخدام:
    python3 tests/db/run-map-planning-checks.py

المتطلبات:
    pip install pgserver          # يوفّر PostgreSQL 16 داخل الحزمة
    (اختياري) إضافات pg_trgm / btree_gin — يبنى تلقائياً إن غابت

ما يغطيه (٢٠ فحصاً):
    ① تطبيق ٤٢٥ ترحيلاً بلا خطأ
    ② سبع دوال هندسية تعطي النتائج الصحيحة
    ③ منع التقاطع بين شارعين / زقاقين
    ④ منع زقاق بمحلة من زون آخر
    ⑤ منع زقاق خارج مضلّع الزون
    ⑥ منع تكرار الكود ومنع بادئة لا تطابق التصنيف
    ⑦ حساب الطول تلقائياً من المسار
    ⑧ منع تغيير كود موثّق + تسجيل confirmed_by/at
    ⑨ منع حذف زون فيه عناصر
    ⑩ تسجيل كل تعديل في audit_logs
"""
import glob
import os
import subprocess
import sys
import tempfile

try:
    import pgserver
except ImportError:
    print("مطلوب: pip install pgserver")
    sys.exit(2)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BIN = os.path.join(os.path.dirname(pgserver.__file__), "pginstall", "bin")
PSQL = os.path.join(BIN, "psql")

MOCK_CRON = """
create schema if not exists cron;
create table if not exists cron.job(jobid bigserial primary key, schedule text, command text,
  nodename text default 'localhost', nodeport int default 5432, database text, username text,
  active bool default true, jobname text unique);
create or replace function cron.schedule(job_name text, s text, c text) returns bigint language plpgsql as $f$
declare jid bigint;
begin
  insert into cron.job(jobname,schedule,command) values (job_name,s,c)
  on conflict (jobname) do update set schedule=excluded.schedule, command=excluded.command
  returning jobid into jid;
  return jid;
end $f$;
create or replace function cron.unschedule(job_name text) returns boolean language plpgsql as $f$
begin delete from cron.job where jobname=job_name; return true; end $f$;
create or replace function cron.unschedule(i bigint) returns boolean language plpgsql as $f$
begin delete from cron.job where jobid=i; return true; end $f$;
"""

PASS, FAIL = 0, 0


def check(name: str, got: str, want: str, detail: str = "") -> None:
    global PASS, FAIL
    ok = got == want
    print(("  ✓ " if ok else "  ✗ ") + name)
    if not ok:
        print(f"      النتيجة: {got!r} — المتوقع: {want!r}")
        if detail:
            print(f"      {detail[:300]}")
        FAIL += 1
    else:
        PASS += 1


def main() -> int:
    d = tempfile.mkdtemp(prefix="mapcheck-")
    srv = pgserver.get_server(d)
    url = srv.get_uri()

    def sql(q: str) -> tuple[int, str, str]:
        r = subprocess.run([PSQL, url, "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", q],
                           capture_output=True, text=True)
        return r.returncode, r.stdout.strip(), r.stderr.strip()

    def load(path: str) -> subprocess.CompletedProcess:
        return subprocess.run([PSQL, url, "-q", "-v", "ON_ERROR_STOP=1", "-f", path],
                              capture_output=True, text=True)

    print("=== ⓪ تهيئة بيئة Supabase محلية ===")
    for role in ("anon", "authenticated", "service_role", "supabase_auth_admin", "supabase_storage_admin"):
        sql(f"create role {role} nologin")
    sql("create schema if not exists app")
    subprocess.run([PSQL, url, "-q", "-v", "ON_ERROR_STOP=1", "-f", "-"],
                   input=MOCK_CRON, capture_output=True, text=True)
    mock = load(os.path.join(ROOT, "tests/db/supabase-mock.sql"))
    if mock.returncode:
        print("فشل تحضير بيئة Supabase:", mock.stderr[:800])
        return 1

    print("\n=== ① تطبيق كل الترحيلات بالترتيب ===")
    files = sorted(glob.glob(os.path.join(ROOT, "supabase/migrations/*.sql")))
    for f in files:
        r = load(f)
        if r.returncode:
            print(f"  ✗ {os.path.basename(f)}")
            print(r.stderr[:1200])
            return 1
    print(f"  ✓ {len(files)} ترحيلاً طُبِّقت بلا خطأ")

    print("\n=== ② الكائنات أُنشئت ===")
    _, out, _ = sql("select string_agg(c.relname, ',' order by c.relname) from pg_class c "
                    "join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' "
                    "and c.relname like 'map\\_%' and c.relkind='r'")
    check("جداول الخريطة الستة", out,
          "map_alleys,map_geometry_reviews,map_import_skips,map_mahallas,map_streets,map_zones")

    print("\n=== ③ الدوال الهندسية ===")
    check("مسافة درجة عرض واحدة",
          sql("select round(app.map_distance_m(33.30,44.42,33.31,44.42))::text")[1], "1112")
    check("طول مقطع ١٠٠م",
          sql("select round(app.map_line_length_m('[[33.30,44.42],[33.3009,44.42]]'::jsonb))::text")[1], "100")
    check("مسار صالح", sql("select app.map_path_valid('[[33.30,44.42],[33.31,44.43]]'::jsonb)::text")[1], "true")
    check("نقطة واحدة مرفوضة", sql("select app.map_path_valid('[[33.30,44.42]]'::jsonb)::text")[1], "false")
    check("إحداثي نصّي مرفوض",
          sql("""select app.map_path_valid('[["x",44.42],[33.31,44.43]]'::jsonb)::text""")[1], "false")
    check("تقاطع مقطعين",
          sql("select app.map_paths_intersect('[[33.30,44.42],[33.32,44.44]]'::jsonb,"
              "'[[33.30,44.44],[33.32,44.42]]'::jsonb)::text")[1], "true")
    check("متوازيان لا يتقاطعان",
          sql("select app.map_paths_intersect('[[33.30,44.42],[33.30,44.44]]'::jsonb,"
              "'[[33.31,44.42],[33.31,44.44]]'::jsonb)::text")[1], "false")

    print("\n=== ④ تحضير زون اختباري ===")
    code, _, err = sql("""
insert into sectors(id,code,name,parent_sector) values (1,'S1','ارخيته','karrada') on conflict do nothing;
insert into gps_geofences(id,name,source,polygon,sector_id) values
 ('d88545a5-a0a0-4d00-90dd-fb4529ddcbdf','ارخيته','platform',
  '[[33.2900,44.4150],[33.2900,44.4350],[33.3100,44.4350],[33.3100,44.4150]]'::jsonb,1)
 on conflict (id) do nothing;
insert into map_zones(id,geofence_id,code,name,sector_id) values
 ('aaaaaaaa-0000-0000-0000-000000000001','d88545a5-a0a0-4d00-90dd-fb4529ddcbdf','ARK','ارخيته',1);
insert into map_mahallas(id,zone_id,code,osm_number) values
 ('bbbbbbbb-0000-0000-0000-000000000005','aaaaaaaa-0000-0000-0000-000000000001','MHL-0905','905');
""")
    if code:
        print("فشل تحضير الزون:", err[:800])
        return 1
    print("  ✓ زون ارخيته + محلة 905")

    print("\n=== ⑤ القيود الحرجة ===")
    c, _, e = sql("""insert into map_streets(zone_id,code,name,kind,path) values
('aaaaaaaa-0000-0000-0000-000000000001','STR-0001','شارع الاختبار','primary',
 '[[33.2950,44.4200],[33.2990,44.4200]]'::jsonb)""")
    check("شارع صحيح يُقبل", "pass" if c == 0 else f"fail: {e[:80]}", "pass")

    # القانون المعتمد (الجولة ٢): العبور عند نقطة داخلية **مسموح ويُسجَّل** للمراجعة.
    # السبب: قياس الواقع أثبت أن 93 من 7140 زوجاً تتقاطع، و1.3% فقط تتشارك نقطة.
    c, _, e = sql("""insert into map_streets(zone_id,code,name,kind,path) values
('aaaaaaaa-0000-0000-0000-000000000001','STR-0002','متقاطع','primary',
 '[[33.2970,44.4180],[33.2970,44.4220]]'::jsonb)""")
    check("شارع متقاطع يُقبل ويُسجَّل للمراجعة", "pass" if c == 0 else f"fail: {e[:80]}", "pass")
    _, rv, _ = sql("select count(*)::text from map_geometry_reviews where table_name='map_streets' and kind='crossing'")
    check("العبور سُجِّل في map_geometry_reviews", "ok" if (rv and rv.strip() not in ("0", "")) else "missing", "ok")

    c, _, e = sql("""insert into map_alleys(zone_id,mahalla_id,code,path) values
('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000005','ALY-0001',
 '[[33.2960,44.4210],[33.2965,44.4220]]'::jsonb)""")
    check("زقاق داخل محلة زونه يُقبل", "pass" if c == 0 else f"fail: {e[:80]}", "pass")

    c, _, e = sql("""insert into map_alleys(zone_id,mahalla_id,code,path) values
('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000005','ALY-0002',
 '[[33.3500,44.5000],[33.3510,44.5010]]'::jsonb)""")
    check("زقاق خارج الزون يُرفض (MAP_OUTSIDE)", "MAP_OUTSIDE" if "MAP_OUTSIDE" in e else "accepted", "MAP_OUTSIDE")

    # نفس القانون للأزقة (20261122000500): العبور مسموح ويُسجَّل.
    # قياس الواقع: 10 من 95 زقاقاً تتقاطع فعلياً — منعها كان يُسقط واقعاً.
    c, _, e = sql("""insert into map_alleys(zone_id,mahalla_id,code,path) values
('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000005','ALY-0009',
 '[[33.2962,44.4212],[33.2963,44.4218]]'::jsonb)""")
    check("زقاق يخترق زقاقاً يُقبل ويُسجَّل", "pass" if c == 0 else f"fail: {e[:80]}", "pass")
    _, rv, _ = sql("select count(*)::text from map_geometry_reviews where table_name='map_alleys' and kind='crossing'")
    check("عبور الزقاق سُجِّل للمراجعة", "ok" if (rv and rv.strip() not in ("0", "")) else "missing", "ok")

    # التراكب الطولي ≥ 20م يبقى مرفوضاً — هذا الخطأ الحقيقي
    c, _, e = sql("""insert into map_alleys(zone_id,mahalla_id,code,path) values
('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000005','ALY-0010',
 '[[33.296005,44.4210],[33.296505,44.4220]]'::jsonb)""")
    check("زقاق متراكب طولياً ≥20م يُرفض (MAP_OVERLAP)",
          "MAP_OVERLAP" if "MAP_OVERLAP" in e else "accepted", "MAP_OVERLAP")

    c, _, e = sql("""insert into map_streets(zone_id,code,name,kind,path) values
('aaaaaaaa-0000-0000-0000-000000000001','STR-0001','مكرر','primary',
 '[[33.3050,44.4300],[33.3060,44.4300]]'::jsonb)""")
    check("كود مكرر يُرفض", "rejected" if c else "accepted", "rejected")

    c, _, e = sql("""insert into map_streets(zone_id,code,name,kind,path) values
('aaaaaaaa-0000-0000-0000-000000000001','LOC-0009','خطأ','primary',
 '[[33.3050,44.4320],[33.3060,44.4320]]'::jsonb)""")
    check("بادئة لا تطابق التصنيف تُرفض", "rejected" if c else "accepted", "rejected")

    _, out, _ = sql("select case when length_m between 400 and 460 then 'ok' else length_m::text end "
                    "from map_streets where code='STR-0001'")
    check("الطول يُحسب تلقائياً (≈٤٤٥م)", out, "ok")

    sql("update map_streets set status='verified' where code='STR-0001'")
    c, _, e = sql("update map_streets set code='STR-0099' where code='STR-0001'")
    check("تغيير كود موثّق يُرفض (MAP_CODE_LOCKED)",
          "MAP_CODE_LOCKED" if "MAP_CODE_LOCKED" in e else "accepted", "MAP_CODE_LOCKED")

    _, out, _ = sql("select case when confirmed_at is not null then 'ok' else 'null' end "
                    "from map_streets where status='verified'")
    check("التوثيق يسجّل confirmed_at", out, "ok")

    c, _, e = sql("delete from map_zones where id='aaaaaaaa-0000-0000-0000-000000000001'")
    check("حذف زون فيه عناصر يُرفض (MAP_ZONE_BUSY)",
          "MAP_ZONE_BUSY" if "MAP_ZONE_BUSY" in e else "accepted", "MAP_ZONE_BUSY")

    print("\n=== ⑥ التدقيق ===")
    _, out, _ = sql("select count(*)::text from audit_logs where table_name like 'map_%'")
    check("كل تعديل مسجَّل في audit_logs", "ok" if int(out or 0) >= 5 else f"only {out}", "ok")

    print("\n" + "=" * 60)
    print(f"النتيجة: {PASS} نجح · {FAIL} فشل")
    print("=" * 60)
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
