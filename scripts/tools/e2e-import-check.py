#!/usr/bin/env python3
"""إثبات طرف-إلى-طرف: صفوف محرّك TS على ملف OSM حقيقي ⇒ قاعدة هجرات كاملة.

يولّد الصفوف بـ  ثم يُدرجها على دفعات ويقارن النتائج.
الاستخدام:
  npx tsx .tmpgen/gen.mts /tmp/arkhita.osm docs/plans/data/zones/ark.json /tmp/rows_ark.json
  /tmp/pgvenv/bin/python scripts/tools/e2e-import-check.py

يتطلّب pgserver موضعياً (بيئة الاختبار فقط) — لا يلمس الإنتاج.
"""
import os, subprocess, tempfile, json
BIN="/tmp/pgvenv/lib/python3.11/site-packages/pgserver/pginstall/bin"
tmp=tempfile.mkdtemp(); d=os.path.join(tmp,"db")
subprocess.run([f"{BIN}/initdb","-D",d,"-U","postgres","-A","trust"],capture_output=True)
subprocess.run([f"{BIN}/pg_ctl","-D",d,"-o","-p 5610 -k /tmp","-l",f"{tmp}/log","start"],capture_output=True)
def Q(sql):
    r=subprocess.run([f"{BIN}/psql","-h","/tmp","-p","5610","-U","postgres","-d","t","-At","-c",sql],capture_output=True,text=True)
    return r.returncode, r.stdout.strip(), r.stderr.strip()
try:
    subprocess.run([f"{BIN}/createdb","-h","/tmp","-p","5610","-U","postgres","t"],capture_output=True)
    Q("""create schema app; create schema auth; create table auth.users(id uuid primary key);
         create role authenticated; create role anon;
         create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
         create table public.sectors(id smallint primary key, name text);
         insert into public.sectors values (1,'أرخيته');
         create table public.gps_geofences(id uuid primary key default gen_random_uuid(),name text,
           polygon jsonb not null, sector_id smallint, source text default 'platform', is_active bool default true);
         create or replace function app.gps_point_in_polygon(a float8,b float8,c jsonb) returns boolean
           language sql immutable as $$ select true $$;
         create or replace function app.audit_trigger() returns trigger language plpgsql as $$ begin return new; end $$;
         create or replace function app.has_role(p text[]) returns boolean language sql stable as $$ select true $$;""")
    for f in ['20261122000000_map_planning_core','20261122000100_map_overlap_junction_fix',
              '20261122000200_map_overlap_merge_law','20261122000300_map_boundary_tolerance',
              '20261122000400_map_geofence_format_fix','20261122000500_map_alley_crossing_and_length_fix',
              '20261122000600_map_spatial_index','20261122001200_map_osm_script',
              '20261122001300_map_import_batch']:
        rc,_,err=Q(open(f'supabase/migrations/{f}.sql').read())
        if rc!=0: raise SystemExit(f"{f}: {err[:400]}")

    poly = json.load(open('docs/plans/data/zones/ark.json'))
    polyj = json.dumps([{"lat":p[0],"lng":p[1]} for p in poly])
    Q(f"""insert into public.gps_geofences(id,name,polygon,sector_id) values
          ('11111111-1111-1111-1111-111111111111','ارخيته','{polyj}'::jsonb,1);
          insert into public.map_zones(id,geofence_id,code,name,sector_id) values
          ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','ARK','ارخيته',1);""")

    data = json.load(open('/tmp/rows_ark.json'))
    rows, mh = data['rows'], data['mahallas']
    print(f"صفوف جاهزة للإدراج: {len(rows)} · محلات: {len(mh)}")

    Z="'22222222-2222-2222-2222-222222222222'::uuid"
    # ④ قارن المساحة من القاعدة بمضلّعنا
    rc,out,err=Q(f"select 0")
    rc,out,err=Q("""select round((sum((p->>'lat')::numeric * lead((p->>'lng')::numeric) over ()
                - (p->>'lng')::numeric * lead((p->>'lat')::numeric) over ()))/2, 8) from 1""")
    print("(المساحة تُحسب في TS — لا دالة SQL لها)")

    # ③ الإدراج على دفعات ٢٠٠
    acc={'inserted':0,'updated':0,'skipped':0,'errors':[]}
    B=200
    for i in range(0,len(rows),B):
        chunk = json.dumps(rows[i:i+B])
        m = json.dumps(mh) if i==0 else '[]'
        rc,out,err = Q(f"select app.map_import_batch({Z},'{chunk}'::jsonb,'{m}'::jsonb)::text")
        if rc!=0: raise SystemExit(f"دفعة {i//B+1} فشلت: {err[:400]}")
        r=json.loads(out)
        for k in ('inserted','updated','skipped'): acc[k]+=r[k]
        acc['errors'].extend(r['errors'])

    print(f"   أُدرج {acc['inserted']} · حُدّث {acc['updated']} · استُبعد {acc['skipped']}")
    if acc['errors']:
        print(f"   أخطاء ({len(acc['errors'])}): {acc['errors'][:3]}")

    # ⑤ المقارنة النهائية
    print("\n⑤ المقارنة النهائية (TS ↔ القاعدة):")
    for lbl, sql, ts in [
        ('شوارع',   "select count(*) from public.map_streets where zone_id="+Z, data['stats']['streets']),
        ('أزقة',    "select count(*) from public.map_alleys  where zone_id="+Z, data['stats']['alleys']),
        ('طول كم',  f"select round((sum(length_m)/1000)::numeric,1) from (select length_m from public.map_streets where zone_id={Z} union all select length_m from public.map_alleys where zone_id={Z}) x", round(data['stats']['totalLengthKm'],1)),
        ('كثافة',   f"select round(((sum(length_m)/1000)/{data['area_km2']})::numeric,2) from (select length_m from public.map_streets where zone_id={Z} union all select length_m from public.map_alleys where zone_id={Z}) x", round(data['stats']['density'],2)),
    ]:
        rc,out,err=Q(sql)
        mark = "✔" if str(out)==str(ts) else "✘"
        print(f"   {mark} {lbl:8s} القاعدة={out or err[:60]:10s} · TS={ts}")
finally:
    subprocess.run([f"{BIN}/pg_ctl","-D",d,"stop","-m","immediate"],capture_output=True)
    subprocess.run(["rm","-rf",tmp])
