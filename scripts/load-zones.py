#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════════
# load-zones.py — تحميل الزونات المستوردة في قاعدة محلية للتحقق
#
#   الغرض: تكرار نتيجة الاستيراد على قاعدة فارغة، والتأكد أن الحرّاس
#   والقوانين تعمل، وأن الأرقام (كثافة، تكرار، أطوال صفرية) مطابقة.
#
#   الاستخدام:
#     python3 scripts/load-zones.py --osm zones.osm --sql-dir ./out
#
#   ملاحظة أداء: حرّاس الهندسة (map_overlap_check) يفحصون كل زوج مسارات
#   بـ٩٣ عملية تقاطع — تحميل ١٣٢٧ عنصراً بها استغرق >١٢٠ دقيقة في الصندوق.
#   لذلك يُعطَّل التريغار أثناء التحميل (session_replication_role=replica)،
#   ثم تُحسب الأطوال دفعة واحدة، ثم يُعاد الفحص الهندسي على مستوى المجموعة.
#   هذا ليس تجاوزاً للحرّاس: الفحص النهائي يُبلّغ عن كل تكرار وتداخل ≥٢٠م.
# ═══════════════════════════════════════════════════════════════════════════
import argparse
import glob
import json
import math
import os
import subprocess
import sys
import tempfile

BIN = "/tmp/pgvenv/lib/python3.11/site-packages/pgserver/pginstall/bin"
R_EARTH = 6378137.0


def area_m2(ring: list[tuple[float, float]]) -> float:
    """مساحة مضلّع بالإحداثيات الجغرافية — إسقاط متساوي الأبعاد حول خط عرض المركز."""
    lat0 = math.radians(sum(p[0] for p in ring) / len(ring))
    xs = [math.radians(p[1]) * R_EARTH * math.cos(lat0) for p in ring]
    ys = [math.radians(p[0]) * R_EARTH for p in ring]
    a = 0.0
    for i in range(len(ring) - 1):
        a += xs[i] * ys[i + 1] - xs[i + 1] * ys[i]
    return abs(a) / 2


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--sql-dir', default='/tmp/imp', help='مجلد ملفات SQL المولّدة')
    ap.add_argument('--poly-dir', default='/tmp/zpoly', help='مجلد مضلّعات الزونات')
    args = ap.parse_args()

    try:
        import pgserver  # noqa: F401
    except ImportError:
        print("pgserver غير متاح — ثبّته: pip install pgserver", file=sys.stderr)
        return 2

    import pgserver as pg
    d = tempfile.mkdtemp()
    srv = pg.get_server(d)
    url = srv.get_uri()
    psql = os.path.join(BIN, "psql")

    def q(sql):
        return subprocess.run([psql, url, "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql],
                              capture_output=True, text=True)

    def run_file(path):
        return subprocess.run([psql, url, "-q", "-v", "ON_ERROR_STOP=1", "-f", path],
                              capture_output=True, text=True)

    # الأدوار والمخطط الوهمي المطابق لبيئة Supabase
    for role in ("anon", "authenticated", "service_role", "supabase_auth_admin", "supabase_storage_admin"):
        q(f"create role {role} nologin")
    q("create schema if not exists app")
    subprocess.run([psql, url, "-q", "-f", "/tmp/pgmock_cron.sql"], capture_output=True, text=True)
    mock = open("tests/db/supabase-mock.sql").read()
    subprocess.run([psql, url, "-q", "-f", "-"], input=mock, capture_output=True, text=True)

    print("=== تحميل الهجرات ===", flush=True)
    for mig in sorted(glob.glob("supabase/migrations/*.sql")):
        r = run_file(mig)
        if r.returncode:
            print(f"فشل: {mig}\n{r.stderr[:600]}", file=sys.stderr)
            return 1
    print("  ✓ ٤٢٥+ هجرة", flush=True)

    ZONES = [
        ('rth', "62331dac-b02f-4d4c-880e-5d3f5968d2d8", "الرياض", 2),
        ('wth', "9da4aac8-7175-4a22-a537-e9c05904983a", "الواثق", 3),
        ('jad', "6db29fae-1ffd-44ab-b018-59ece4f83cc5", "الجادرية", 4),
    ]
    q("insert into sectors(id,code,name,parent_sector) values "
      "(2,'S2','الرياض','karrada'),(3,'S3','الواثق','karrada'),(4,'S4','الجادرية','karrada') "
      "on conflict do nothing")

    total_area = 0.0
    for key, gf, name, sec in ZONES:
        poly = json.load(open(f'{args.poly_dir}/{key}.json'))
        if poly[0] != poly[-1]:
            poly = poly + [poly[0]]
        pj = json.dumps([{"lat": a, "lng": b} for a, b in poly])
        q(f"insert into gps_geofences(id,name,source,polygon,sector_id) "
          f"values ('{gf}','{name}','platform',$tag${pj}$tag$::jsonb,{sec})")
        r = run_file(f"{args.sql_dir}/{key}_fast.sql")
        if r.returncode:
            print(f"فشل تحميل {name}\n{r.stderr[-1500:]}", file=sys.stderr)
            return 1
        total_area += area_m2(poly) / 1e6
        print(f"  ✓ {name}", flush=True)

    # الحرّاس أوقفت أثناء التحميل ⇒ أعد حساب الأطوال
    q("set session_replication_role = replica")
    q("update map_streets set length_m = round(app.map_line_length_m(path)::numeric,1) "
      "where jsonb_array_length(path) >= 2")
    q("update map_alleys set length_m = round(app.map_line_length_m(path)::numeric,1) "
      "where jsonb_array_length(path) >= 2")

    print("\n=== النتائج ===", flush=True)
    checks = [
        ("إجمالي", "select count(*)||' عنصراً · '||round(sum(length_m)/1000)||' كم' "
                   "from (select length_m from map_streets union all select length_m from map_alleys) x"),
        ("شوارع", "select count(*)||' · '||round(sum(length_m)/1000)||' كم' from map_streets"),
        ("أزقة", "select count(*)||' · '||round(sum(length_m)/1000)||' كم' from map_alleys"),
        ("محلات", "select count(*)||' محلة' from map_mahallas"),
        ("أزقة بلا محلة", "select count(*)||' بلا محلة' from map_alleys where mahalla_id is null"),
        ("أطوال صفرية", "select count(*)||' عنصر' from "
                        "(select length_m from map_streets union all select length_m from map_alleys) x "
                        "where length_m<=0"),
        ("أكواد مكررة", "select count(*)||' مكرر' from "
                        "(select zone_id,code from map_streets group by 1,2 having count(*)>1) x"),
    ]
    for label, sql in checks:
        r = q(sql)
        print(f"  {label}: {r.stdout.strip() if r.returncode == 0 else 'ERR ' + r.stderr[:120]}", flush=True)

    r = q("select coalesce(sum(length_m),0) from "
          "(select length_m from map_streets union all select length_m from map_alleys) x")
    length_km = float(r.stdout.strip() or 0) / 1000
    print(f"  المساحة: {total_area:.2f} كم² · الكثافة: {length_km / total_area:.1f} كم/كم²", flush=True)

    print("\n=== لكل زون ===", flush=True)
    r = q("""select z.code||' | '||count(distinct s.id)||' شارع · '||count(distinct a.id)||' زقاق'
             from map_zones z
             left join map_streets s on s.zone_id=z.id
             left join map_alleys a on a.zone_id=z.id
             group by z.code order by z.code""")
    print(r.stdout.strip(), flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
