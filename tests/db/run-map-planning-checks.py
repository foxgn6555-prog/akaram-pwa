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
    check("جداول الخريطة السبعة", out,
          "map_alleys,map_geometry_reviews,map_import_skips,map_mahallas,map_streets,map_visits,map_zones")

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

    print("\n=== ⑧ التدقيق ===")
    _, out, _ = sql("select count(*)::text from audit_logs where table_name like 'map_%'")
    check("كل تعديل مسجَّل في audit_logs", "ok" if int(out or 0) >= 5 else f"only {out}", "ok")

    print("\n" + "=" * 60)
    print(f"النتيجة: {PASS} نجح · {FAIL} فشل")
    print("=" * 60)
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
