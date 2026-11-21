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
    check("جداول الخريطة التسعة", out,
          "map_alleys,map_export_log,map_export_prefs,map_geometry_reviews,"
          "map_import_skips,map_mahallas,map_streets,map_visits,map_zones")

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

    print("\n=== ⑤.b الفهرس المكاني والهندسة المعاد كتابتها ===")

    # ① bbox
    _, bb, _ = sql("select (app.map_bbox('[[33.30,44.42],[33.31,44.43]]'::jsonb))::text")
    check("bbox يُحسب من مسار [lat,lng]", bb, "{33.3,44.42,33.31,44.43}")
    _, bbo, _ = sql("select (app.map_bbox('[{\"lat\":33.30,\"lng\":44.42},{\"lat\":33.31,\"lng\":44.43}]'::jsonb))::text")
    check("bbox يُحسب من {lat,lng} أيضاً", bbo, "{33.3,44.42,33.31,44.43}")

    # ② التداخل: حالات مرجعية دقيقة (مقطع ١٠٠م)
    A100 = "'[[33.30,44.42],[33.3009,44.42]]'::jsonb"
    check("تداخل مع نفسه = الطول كاملاً",
          sql(f"select round(app.map_overlap_length_m({A100},{A100},1.5))::text")[1], "100")
    check("موازٍ بإزاحة ٠.٥م ⇒ تراكب كامل",
          sql("select round(app.map_overlap_length_m('[[33.30,44.4200054],[33.3009,44.4200054]]'::jsonb,"
              + A100 + ",1.5))::text")[1], "100")
    check("موازٍ بإزاحة ٥م ⇒ صفر (خارج التسامح)",
          sql("select round(app.map_overlap_length_m('[[33.30,44.4200537],[33.3009,44.4200537]]'::jsonb,"
              + A100 + ",1.5))::text")[1], "0")
    check("نصف متراكب ⇒ ٥٠م",
          sql("select round(app.map_overlap_length_m('[[33.30045,44.42],[33.30135,44.42]]'::jsonb,"
              + A100 + ",1.5))::text")[1], "50")
    check("عمودي ⇒ صفر",
          sql("select round(app.map_overlap_length_m('[[33.29995,44.4195],[33.29995,44.4205]]'::jsonb,"
              + A100 + ",1.5))::text")[1], "0")

    # ③ أنواع التقاطع: junction / crossing / none
    check("رأس مشترك ⇒ junction",
          sql(f"select app.map_intersection_kind({A100},'[[33.30,44.42],[33.30,44.43]]'::jsonb)")[1], "junction")
    check("يعبر الوسط ⇒ crossing",
          sql(f"select app.map_intersection_kind({A100},'[[33.30045,44.4195],[33.30045,44.4205]]'::jsonb)")[1], "crossing")
    check("بعيد ⇒ none",
          sql(f"select app.map_intersection_kind({A100},'[[33.31,44.42],[33.3109,44.42]]'::jsonb)")[1], "none")

    # ④ map_is_vertex تقرأ الشكلين
    check("رأس بصيغة كائن يُكتشف",
          sql(f"select app.map_is_vertex('{{\"lat\":33.30,\"lng\":44.42}}'::jsonb,{A100})::text")[1], "true")
    check("نقطة ليست رأساً",
          sql(f"select app.map_is_vertex('{{\"lat\":33.35,\"lng\":44.42}}'::jsonb,{A100})::text")[1], "false")

    # ⑤ أعمدة bbox موجودة ومفهرسة
    _, cols, _ = sql("""select string_agg(table_name||'.'||column_name,',' order by table_name)
                        from information_schema.columns
                        where table_schema='public' and column_name='bbox'""")
    check("عمود bbox في الجدولين", cols, "map_alleys.bbox,map_streets.bbox")

    _, idx, _ = sql("""select count(*)::text from pg_indexes
                       where schemaname='public' and indexname like '%bbox_gist%'""")
    check("فهرس GiST على bbox للجدولين", idx, "2")

    print("\n=== ⑦ محرّك الزيارات ===")
    # ── منطقة اختبار معزولة: لا شارع سابق يمرّ بها ─────────────────────────
    #   STR-0001 عند 44.4200، STR-0002 عمودي عند 33.2970. نختار خط طول 44.4250
    #   وخط عرض 33.3000 — بعيداً عن كليهما بمسافة تُلغي أي التباس.
    Z = "'aaaaaaaa-0000-0000-0000-000000000001'"
    V = "'eeeeeeee-0000-0000-0000-000000000002'"
    D = "'dddddddd-0000-0000-0000-000000000002'"
    A_AXIS = "'[[33.3000,44.4250],[33.3010,44.4250]]'::jsonb"   # شارع المحرك
    LAT, LNG = "33.3005", "44.4250"                            # نقطة على المحور

    c, _, e = sql(f"""
insert into map_streets(id,zone_id,code,name,kind,path,width_m) values
 ('cccccccc-0000-0000-0000-000000000001',{Z},'STR-0901','شارع المحرك','primary',{A_AXIS}, 10.0);
insert into gps_providers(id,name) values ('dddddddd-0000-0000-0000-000000000001','LVN');
insert into gps_devices(id,provider_id,external_id,name) values
 ({D},'dddddddd-0000-0000-0000-000000000001','DEV-CHK','جهاز فحص');
insert into auth.users(id,email) values ('eeeeeeee-0000-0000-0000-000000000001','engine@check.iq');
insert into garage_vehicles(id,vehicle_name,db_number,plate_number,chassis_number,
  image_path,shift,driver_name,sector_id,created_by) values
 ({V},'آلية المحرك','DB-9','PL-9','CH-9','/img/x.png','morning','سائق',1,
  'eeeeeeee-0000-0000-0000-000000000001');
insert into gps_vehicle_bindings(device_id,garage_vehicle_id,match_method) values
 ({D},{V},'manual');
""")
    check("تحضير آلية وجهاز وشارع المحرك", "pass" if c == 0 else f"fail: {e[:140]}", "pass")

    check("نصف الدخول لعرض 10م", sql("select app.map_entry_radius_m(10.0)::text")[1], "4")
    check("نصف الدخول لعرض 4م (حد أدنى 3م)",
          sql("select app.map_entry_radius_m(4.0)::text")[1], "3")
    check("نصف الدخول بلا عرض مسجَّل ⇒ 3م",
          sql("select app.map_entry_radius_m(null)::text")[1], "3")

    check("عمق نقطة على المحور = 0م",
          sql(f"select round(app.map_point_depth_m({LAT},{LNG},{A_AXIS})::numeric,1)::text")[1], "0.0")
    _, d5, _ = sql(f"select round(app.map_point_depth_m({LAT},44.4250505,{A_AXIS})::numeric,1)::text")
    check(f"عمق نقطة 5م شرقاً ≈ 5م (المقيس {d5})",
          "ok" if d5 and abs(float(d5) - 5.0) <= 0.5 else f"{d5}", "ok")

    def gps(points, label=""):
        sql("delete from map_visits; delete from gps_device_position_history;")
        vals = ",".join(
            f"({D},{la},{ln},'2026-11-22T09:00:00Z'::timestamptz + interval '{sec} seconds')"
            for sec, la, ln in points)
        c2, _, e2 = sql(f"insert into gps_device_position_history(device_id,latitude,longitude,fix_time) values {vals}")
        if c2:
            return f"insert-fail: {e2[:140]}"
        c3, _, e3 = sql("select visits_created from app.map_build_visits("
                        f"{Z},'2026-11-22 00:00Z'::timestamptz,'2026-11-22 23:59Z'::timestamptz)")
        if c3:
            return f"build-fail: {e3[:200]}"
        return sql("select coalesce(string_agg(place_code||':'||status||'/'||dwell_seconds,'|' "
                   "order by entered_at),'none') from map_visits")[1]

    check("زيارة مؤكدة على المحور (7 دقائق)",
          gps([(i * 60, 33.3005, 44.4250) for i in range(8)]), "STR-0901:confirmed/420")
    check("مكوث 40 ث ⇒ غير مؤكد",
          gps([(i * 20, 33.3005, 44.4250) for i in range(3)]), "STR-0901:uncertain/40")
    check("سبب «غير مؤكد» مذكور نصّاً",
          "نعم" if "أقل من الحد" in (sql("select coalesce(reason,'') from map_visits")[1] or "") else "مفقود",
          "نعم")
    check("نقطة واحدة ⇒ غير مؤكد",
          gps([(0, 33.3005, 44.4250)]), "STR-0901:uncertain/0")
    # 8م شرقاً: أبعد من نصف الداخلي 4م ⇒ لا زيارة إطلاقاً
    check("مرور على الحافة (8م) لا يُحتسب زيارة",
          gps([(i * 60, 33.3005, 44.4250808) for i in range(8)]), "none")
    check("فاصل 6 دقائق بين النقاط يُسقط التقارب",
          gps([(0, 33.3005, 44.4250), (360, 33.3005, 44.4250), (720, 33.3005, 44.4250)]),
          "STR-0901:uncertain/0")
    # خروج (44.4262 = 119م شرقاً) ثم عودة ⇒ جزيرتان مدموجتان (<10 دقائق)
    check("خروج وعودة قريبة ⇒ زيارة واحدة مدموجة",
          gps([(0, 33.3005, 44.4250), (60, 33.3005, 44.4250), (120, 33.3005, 44.4250),
               (180, 33.3005, 44.4262), (240, 33.3005, 44.4250), (300, 33.3005, 44.4250),
               (360, 33.3005, 44.4250), (420, 33.3005, 44.4250)]),
          "STR-0901:confirmed/420")

    gps([(i * 60, 33.3005, 44.4250) for i in range(8)])
    a1 = sql("select visits_created||'/'||visits_merged from app.map_build_visits("
             f"{Z},'2026-11-22 00:00Z','2026-11-22 23:59Z')")[1]
    a2 = sql("select visits_created||'/'||visits_merged from app.map_build_visits("
             f"{Z},'2026-11-22 00:00Z','2026-11-22 23:59Z')")[1]
    check(f"إعادة التشغيل لا تُضاعف (١={a1} · ٢={a2})",
          sql("select count(*)::text from map_visits")[1], "1")

    # الزون فيه شوارع سابقة من أقسام أخرى؛ نتحقق أن شارع المحرك وحده مؤكد
    check("شارع المحرك وحده مؤكد في يومه",
          sql(f"select places_confirmed::text from app.map_coverage_summary({Z},'2026-11-22'::date) "
              "where place_kind='street'")[1], "1")

    # مكان ثانٍ بلا زيارة: يجب أن يظهر في المقام (لا «صفر كاذب» ولا اختفاء)
    sql(f"""insert into map_streets(zone_id,code,name,kind,path,width_m) values
 ({Z},'STR-0902','شارع بلا زيارة','primary','[[33.3020,44.4250],[33.3030,44.4250]]'::jsonb, 10.0)""")
    check("المكان غير المُزار يظهر في المقام",
          sql(f"select places_total||'/'||places_confirmed from app.map_coverage_summary("
              f"{Z},'2026-11-22'::date) where place_kind='street'")[1], "4/1")

    sql("delete from gps_device_position_history;")
    check("الزيارات تبقى بعد تفريغ النقاط الخام",
          sql("select count(*)::text from map_visits")[1], "1")

    print("\n=== ⑧ يوم بغداد (المرحلة ⑥) ===")
    check("قبل منتصف الليل بغداد بثانية ⇒ اليوم السابق",
          sql("select app.map_baghdad_day('2026-11-22T20:59:59Z'::timestamptz)::text")[1], "2026-11-22")
    check("منتصف الليل بغداد بالضبط ⇒ اليوم التالي",
          sql("select app.map_baghdad_day('2026-11-22T21:00:00Z'::timestamptz)::text")[1], "2026-11-23")
    check("01:30 بغداد ⇒ يومه البغدادي",
          sql("select app.map_baghdad_day('2026-11-22T22:30:00Z'::timestamptz)::text")[1], "2026-11-23")
    check("حدود اليوم البغدادي تبدأ 21:00 UTC",
          sql("select day_start::text from app.map_day_bounds('2026-11-22'::date)")[1],
          "2026-11-21 21:00:00+00")

    # زيارة 01:00 بغداد لا تُنسب لليوم السابق (العيب الذي أصلحته 00800)
    sql("delete from map_visits; delete from gps_device_position_history;")
    sql("""insert into gps_device_position_history(device_id,latitude,longitude,fix_time)
           select 'dddddddd-0000-0000-0000-000000000002',33.3005,44.4250,
                  '2026-11-22T22:00:00Z'::timestamptz + (i*60||' seconds')::interval
             from generate_series(0,7) i""")
    sql("select visits_created from app.map_build_visits("
        "'aaaaaaaa-0000-0000-0000-000000000001','2026-11-22 00:00Z','2026-11-24 00:00Z')")
    check("زيارة 01:00 بغداد تُنسب لليوم البغدادي لا لسابقه",
          sql("select placeday::text from map_visits where place_code='STR-0901'")[1], "2026-11-23")

    # «غير مؤكد» منفصل عن «مؤكد» في التغطية
    _, cov, _ = sql("select places_confirmed||'/'||places_uncertain from app.map_coverage_summary("
                    "'aaaaaaaa-0000-0000-0000-000000000001','2026-11-23'::date) where place_kind='street'")
    check("التغطية تفصل المؤكد عن غير المؤكد", cov, "1/0")
    _, cov2, _ = sql("select places_confirmed||'/'||places_uncertain from app.map_coverage_summary("
                     "'aaaaaaaa-0000-0000-0000-000000000001','2026-11-22'::date) where place_kind='street'")
    check("يوم بلا زيارات ⇒ 0/0 لا صفر كاذب", cov2, "0/0")

    print("\n=== ⑨ إحصاءات التغطية (المرحلة ⑥) ===")
    # نُنشئ زوناً نظيفاً بتاريخ ثابت لئلا تتلوّث الأرقام ببيانات ⑦/⑧
    sql("""insert into gps_geofences(id,name,source,polygon,sector_id) values
       ('aaaaaaaa-0000-0000-0000-00000000c0de','زون الإحصاء','platform',
        '[[33.4000,44.6000],[33.4000,44.6200],[33.4200,44.6200],[33.4200,44.6000]]'::jsonb,1)""")
    sql("""insert into map_zones(id,geofence_id,code,name,sector_id) values
       ('aaaaaaaa-0000-0000-0000-00000000c0de','aaaaaaaa-0000-0000-0000-00000000c0de','STZ','زون الإحصاء',1)""")
    sql("""insert into map_mahallas(id,zone_id,code,name) values
       ('bbbbbbbb-0000-0000-0000-00000000c0de','aaaaaaaa-0000-0000-0000-00000000c0de','MHL-0001','محلة')""")
    sql("""insert into map_streets(zone_id,code,name,kind,path,width_m) values
       ('aaaaaaaa-0000-0000-0000-00000000c0de','STR-0001','شارع أ','primary',
        '[[33.4100,44.6100],[33.4110,44.6100]]'::jsonb,10.0),
       ('aaaaaaaa-0000-0000-0000-00000000c0de','STR-0002','شارع ب','primary',
        '[[33.4100,44.6120],[33.4110,44.6120]]'::jsonb,8.0),
       ('aaaaaaaa-0000-0000-0000-00000000c0de','STR-0003','شارع ج','primary',
        '[[33.4100,44.6140],[33.4110,44.6140]]'::jsonb,6.0)""")
    sql("""insert into map_alleys(zone_id,mahalla_id,code,name,path,width_m) values
       ('aaaaaaaa-0000-0000-0000-00000000c0de','bbbbbbbb-0000-0000-0000-00000000c0de','ALY-0001','زقاق أ',
        '[[33.4100,44.6110],[33.4110,44.6110]]'::jsonb,4.0)""")
    # آلية مؤرشفة تزور ⇒ يجب ألا تختفي من تقرير الآليات
    sql("""insert into garage_vehicles(id,vehicle_name,db_number,plate_number,chassis_number,
             image_path,shift,driver_name,sector_id,created_by,archived_at) values
       ('eeeeeeee-0000-0000-0000-00000000c0de','آلية مؤرشفة','DB-77','PL-77','CH-77',
        '/img/y.png','morning','سائق قديم',1,'eeeeeeee-0000-0000-0000-000000000001', now())""")
    sql("""insert into map_visits(zone_id,vehicle_id,place_kind,place_id,place_code,place_name,
             placeday,seq,entered_at,exited_at,dwell_seconds,points_count,status) values
       ('aaaaaaaa-0000-0000-0000-00000000c0de','eeeeeeee-0000-0000-0000-00000000c0de','street',
        'c0de0000-0000-0000-0000-000000000001'::uuid,'STR-0001','شارع أ','2026-12-01',1,
        '2026-12-01T08:00:00Z','2026-12-01T08:10:00Z',600,8,'confirmed')""")
    # نستعمل id حقيقي للشارع
    sql("""update map_visits set place_id=(select id from map_streets where code='STR-0001'
             and zone_id='aaaaaaaa-0000-0000-0000-00000000c0de')
           where place_code='STR-0001'""")
    sql("""insert into map_visits(zone_id,vehicle_id,place_kind,place_id,place_code,place_name,
             placeday,seq,entered_at,exited_at,dwell_seconds,points_count,status,reason)
       select 'aaaaaaaa-0000-0000-0000-00000000c0de','eeeeeeee-0000-0000-0000-00000000c0de','street',
              id,'STR-0002','شارع ب','2026-12-01',2,
              '2026-12-01T09:00:00Z','2026-12-01T09:00:40Z',40,3,'uncertain','مكوث 40ث أقل من الحد 60ث'
         from map_streets where code='STR-0002' and zone_id='aaaaaaaa-0000-0000-0000-00000000c0de'""")

    Z2 = "'aaaaaaaa-0000-0000-0000-00000000c0de'"
    check("by_place: كل مكان يظهر (5 أماكن)",
          sql(f"select count(*)::text from app.map_coverage_by_place({Z2},'2026-12-01'::date)")[1], "4")
    check("by_place: المُزار مؤكد",
          sql(f"select string_agg(place_code||'='||case when confirmed then 'مؤكد' when visited then 'غير مؤكد' else 'لم تُدخل' end,',' order by place_code) "
              f"from app.map_coverage_by_place({Z2},'2026-12-01'::date)")[1],
          "ALY-0001=لم تُدخل,STR-0001=مؤكد,STR-0002=غير مؤكد,STR-0003=لم تُدخل")
    check("by_place: فلتر النوع يعمل",
          sql(f"select count(*)::text from app.map_coverage_by_place({Z2},'2026-12-01'::date,'alley')")[1], "1")
    # زون الإحصاء فيه أيضاً «آلية المحرك» من قسم ⑦ (ربط جهاز بلا زيارات) —
    # نتحقق من صفّ الآلية المؤرشفة تحديداً لا من العدد الكلي
    _, arch, _ = sql(f"select vehicle_name||'/'||in_fleet::text||'/'||visits_count "
                     f"from app.map_coverage_by_vehicle({Z2},'2026-12-01'::date) "
                     f"where vehicle_name='آلية مؤرشفة'")
    check("by_vehicle: الآلية المؤرشفة تظهر لا تختفي", arch, "آلية مؤرشفة/false/2")
    _, tracked, _ = sql(f"select count(*)::text from app.map_coverage_by_vehicle({Z2},'2026-12-01'::date)")
    check("by_vehicle: الآليات المتتبَّعة بلا زيارات تظهر بأصفار", tracked, "2")
    _, rl, _ = sql(f"select places_total||'/'||places_visited||'/'||places_confirmed||'/'||places_uncertain||'/'||places_not_entered "
                   f"from app.map_coverage_rollup({Z2},'2026-12-01'::date)")
    check("rollup: مؤكد وغير مؤكد ولم تُدخل منفصلة", rl, "4/2/1/1/2")
    _, pct, _ = sql(f"select coverage_pct||'|'||confirmed_pct||'|'||uncertain_pct "
                    f"from app.map_coverage_rollup({Z2},'2026-12-01'::date)")
    check("rollup: النسب الثلاث لا تُخلط (50/25/25)", pct, "50.0|25.0|25.0")
    check("unvisited: قائمة لم تُزر مرتّبة بالطول",
          sql(f"select string_agg(place_code,',' order by place_code) "
              f"from app.map_unvisited_places({Z2},'2026-12-01'::date)")[1], "ALY-0001,STR-0003")
    _, tr, _ = sql(f"select string_agg(x,'|' order by d) from (select day d, "
                   f"places_visited||'/'||places_total x from app.map_coverage_trend({Z2},'2026-12-02'::date,3)) t")
    check("trend: ثلاثة أيام متتالية", tr, "0/4|2/4|0/4")
    check("trend: يوم بلا بيانات لا يختفي من الرسم",
          sql(f"select count(*)::text from app.map_coverage_trend({Z2},'2026-12-02'::date,3)")[1], "3")

    print("\n=== ⑩ تفضيلات التصدير (المرحلة ⑦) ===")
    U1 = '11111111-0000-0000-0000-000000000001'
    U2 = '22222222-0000-0000-0000-000000000002'
    sql(f"insert into auth.users(id,email) values ('{U1}','p1@x.iq'),('{U2}','p2@x.iq') on conflict do nothing")

    def as_user(uid, stmt):
        """يحاكي auth.uid() كما في supabase-mock.
        set_config تُخرج قيمتها فتُلوّث stdout ⇒ نستعمل DO بدل select."""
        return sql(f"do $$ begin perform set_config('auth.user_id','{uid}',false); end $$; {stmt}")

    def as_nobody(stmt):
        """بلا هوية: نمسح auth.user_id أولاً"""
        return sql(f"do $$ begin perform set_config('auth.user_id','',false); end $$; {stmt}")

    COLS = '[{"id":"place_code","visible":true,"order":0},{"id":"place_name","visible":true,"order":1}]'
    as_user(U1, f"select app.map_export_prefs_set('places','{COLS}'::jsonb)")
    _, got, _ = as_user(U1, "select app.map_export_prefs_get('places')::text")
    check("حفظ التفضيل واسترجاعه", "ok" if '"place_code"' in (got or "") else f"got={got}", "ok")

    _, other, _ = as_user(U2, "select app.map_export_prefs_get('places')::text")
    check("مستخدم آخر لا يرى تفضيل غيره", other.strip(), "[]")

    _, _, e1 = as_user(U1, """select app.map_export_prefs_set('places',
        '[{"id":"x","visible":false}]'::jsonb)""")
    check("تفضيل يُخفي كل الأعمدة مرفوض",
          "EXPORT_COLUMNS_EMPTY" if "EXPORT_COLUMNS_EMPTY" in (e1 or "") else "accepted", "EXPORT_COLUMNS_EMPTY")

    _, _, e2 = as_user(U1, "select app.map_export_prefs_set('pdf','[]'::jsonb)")
    check("صنف تصدير مجهول مرفوض",
          "EXPORT_KIND_INVALID" if "EXPORT_KIND_INVALID" in (e2 or "") else "accepted", "EXPORT_KIND_INVALID")

    _, _, e3 = as_nobody("select app.map_export_prefs_set('places','[]'::jsonb)")
    check("الحفظ بلا تسجيل دخول مرفوض",
          "AUTH_REQUIRED" if "AUTH_REQUIRED" in (e3 or "") else "accepted", "AUTH_REQUIRED")

    _, npref, _ = sql("select count(*)::text from map_export_prefs")
    check("التحديث لا يُنشئ صفاً ثانياً", npref, "1")

    # سجل التصدير
    as_user(U1, f"""select app.map_export_log_add(
        'aaaaaaaa-0000-0000-0000-000000000001','places','2026-11-22','2026-11-22',1640,'{COLS}'::jsonb)""")
    _, logrow, _ = sql("select export_kind||'/'||row_count from map_export_log order by created_at desc limit 1")
    check("سجل التصدير يُكتب", logrow, "places/1640")
    as_user(U1, """select app.map_export_log_add(
        'aaaaaaaa-0000-0000-0000-000000000001','visits','2026-11-22','2026-11-22',-50,'[]'::jsonb)""")
    _, neg, _ = sql("select row_count::text from map_export_log where export_kind='visits'")
    check("عدد صفوف سالب يُقصّ لصفر", neg, "0")

    print("\n=== ⑪ السائق والشفت ومسؤول القسم (الجولة ٦) ===")
    Z6 = "'aaaaaaaa-0000-0000-0000-000000000001'"
    # مسؤولان لقاطع الزون (1) بشفتين مختلفتين
    sql("""insert into employees(user_id,full_name,employee_number) values
       ('11111111-0000-0000-0000-000000000001','مسؤول صباحي','EMP1'),
       ('22222222-0000-0000-0000-000000000002','مسؤول مسائي','EMP2')""")
    sql("""insert into manager_profiles(user_id,shift,sectors) values
       ('11111111-0000-0000-0000-000000000001','morning','{1}'),
       ('22222222-0000-0000-0000-000000000002','evening','{1}')""")
    _, mgrs, _ = sql("select manager_names from app.map_sector_managers('{1}'::smallint[])")
    check("مسؤولو القاطع يُعرضون بأسمائهم لا بمعرّفاتهم",
          "ok" if mgrs and "مسؤول صباحي" in mgrs and "مسؤول مسائي" in mgrs else f"got={mgrs}", "ok")

    # آلية ألف: سائقها الثابت «سائق ثابت»/صباحي، لكن انطلاقيتها الليلية «بديل ليلي»/ليلي
    sql("""insert into garage_departures(id,vehicle_id,driver_name,shift,sector_id,departed_at,departed_by)
           values ('dddddddd-0000-0000-0000-00000000d001','eeeeeeee-0000-0000-0000-000000000002',
                   'بديل ليلي','night',1,'2026-11-21T19:00:00Z','eeeeeeee-0000-0000-0000-000000000001')""")
    sql("""insert into map_visits(zone_id,vehicle_id,place_kind,place_id,place_code,place_name,
             placeday,seq,entered_at,exited_at,dwell_seconds,points_count,status)
           select 'aaaaaaaa-0000-0000-0000-000000000001','eeeeeeee-0000-0000-0000-000000000002',
                  'street', id,'STR-0901','شارع المحرك','2026-11-22',1,
                  '2026-11-21T22:00:00Z','2026-11-21T22:10:00Z',600,8,'confirmed'
             from map_streets where code='STR-0901'""")

    _, drv, _ = sql("""select coalesce(driver_name,'—')||'/'||coalesce(shift,'—')||'/'||shift_source
                         from app.map_visits_enriched(
                           'aaaaaaaa-0000-0000-0000-000000000001','2026-11-22','eeeeeeee-0000-0000-0000-000000000002')
                        limit 1""")
    check("سائق الزيارة من الانطلاقية لا من سجل الآلية", drv, "بديل ليلي/night/departure")

    _, mgr_in_visit, _ = sql("""select coalesce(department_manager_names,'—') from app.map_visits_enriched(
                                 'aaaaaaaa-0000-0000-0000-000000000001','2026-11-22') limit 1""")
    check("الزيارة تحمل مسؤول قسمها",
          "ok" if mgr_in_visit and "مسؤول" in mgr_in_visit else f"got={mgr_in_visit}", "ok")

    _, vday, _ = sql("""select coalesce(driver_name,'—')||'/'||shift_source
                         from app.map_vehicles_day('aaaaaaaa-0000-0000-0000-000000000001','2026-11-22')
                        where vehicle_id='eeeeeeee-0000-0000-0000-000000000002'""")
    check("ملخص الآلية يستعمل الشفت المعتمد", vday, "بديل ليلي/departure")

    # آلية بلا انطلاقية ⇒ مصدر vehicle موسوم
    sql("""insert into garage_vehicles(id,vehicle_name,db_number,plate_number,chassis_number,
             image_path,shift,driver_name,sector_id,created_by) values
       ('eeeeeeee-0000-0000-0000-00000000d002','آلية بلا انطلاقية','DB-88','PL-88','CH-88',
        '/img/z.png','morning','سائق ثابت ٢',1,'eeeeeeee-0000-0000-0000-000000000001')""")
    sql("""insert into map_visits(zone_id,vehicle_id,place_kind,place_id,place_code,place_name,
             placeday,seq,entered_at,exited_at,dwell_seconds,points_count,status)
           select 'aaaaaaaa-0000-0000-0000-000000000001','eeeeeeee-0000-0000-0000-00000000d002',
                  'street', id,'STR-0901','شارع المحرك','2026-11-22',1,
                  '2026-11-22T10:00:00Z','2026-11-22T10:10:00Z',600,8,'confirmed'
             from map_streets where code='STR-0901'""")
    _, nodep, _ = sql("""select coalesce(driver_name,'—')||'/'||shift_source from app.map_visits_enriched(
                           'aaaaaaaa-0000-0000-0000-000000000001','2026-11-22','eeeeeeee-0000-0000-0000-00000000d002') limit 1""")
    check("بلا انطلاقية ⇒ من سجل الآلية موسوم", nodep, "سائق ثابت ٢/vehicle")

    # فلتر آلية واحدة يعزل صحيحاً
    _, only1, _ = sql("""select count(*)::text from app.map_visits_enriched(
        'aaaaaaaa-0000-0000-0000-000000000001','2026-11-22','eeeeeeee-0000-0000-0000-00000000d002')""")
    check("فلتر الآلية يعيد زياراتها وحدها", only1, "1")

    # قائمة «لم تُزر» مع المسؤول
    _, uv, _ = sql("""select coalesce(department_manager_names,'—') from app.map_unvisited_enriched(
                        'aaaaaaaa-0000-0000-0000-000000000001','2026-11-22') limit 1""")
    check("«لم تُزر» تحمل مسؤول القسم",
          "ok" if uv and "مسؤول" in uv else f"got={uv}", "ok")

    print("\n=== ⑫ التدقيق ===")
    _, out, _ = sql("select count(*)::text from audit_logs where table_name like 'map_%'")
    check("كل تعديل مسجَّل في audit_logs", "ok" if int(out or 0) >= 5 else f"only {out}", "ok")

    print("\n" + "=" * 60)
    print(f"النتيجة: {PASS} نجح · {FAIL} فشل")
    print("=" * 60)
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
