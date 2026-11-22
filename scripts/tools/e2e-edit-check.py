#!/usr/bin/env python3
"""إثبات طرف-إلى-طرف للتعديل اليدوي (الجولة ②):
① تغيير التصنيف كان مستحيلاً (قيد kind_prefix) — الآن ممكن
② مسار خارج الزون يُرفض من القاعدة لا من الواجهة فقط
③ سجل تعديلات يوثّق كل تغيير
④ الاسم اليدوي لا يُطغى بالاستيراد

يتطلّب pgserver موضعياً. لا يلمس الإنتاج.
"""
import os, subprocess, tempfile, json
BIN="/tmp/pgvenv/lib/python3.11/site-packages/pgserver/pginstall/bin"
tmp=tempfile.mkdtemp(); d=os.path.join(tmp,"db")
subprocess.run([f"{BIN}/initdb","-D",d,"-U","postgres","-A","trust"],capture_output=True)
subprocess.run([f"{BIN}/pg_ctl","-D",d,"-o","-p 5614 -k /tmp","-l",f"{tmp}/log","start"],capture_output=True)
def Q(sql):
    r=subprocess.run([f"{BIN}/psql","-h","/tmp","-p","5614","-U","postgres","-d","t","-At","-c",sql],capture_output=True,text=True)
    return r.returncode, r.stdout.strip(), r.stderr.strip()
try:
    subprocess.run([f"{BIN}/createdb","-h","/tmp","-p","5614","-U","postgres","t"],capture_output=True)
    Q("""create schema app; create schema auth; create table auth.users(id uuid primary key);
         create role authenticated; create role anon;
         create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
         create table public.sectors(id smallint primary key, name text);
         insert into public.sectors values (5,'السندباد');
         create table public.gps_geofences(id uuid primary key default gen_random_uuid(),name text,
           polygon jsonb not null, sector_id smallint, source text default 'platform', is_active bool default true);
         create or replace function app.has_role(p text[]) returns boolean language sql stable as $$ select true $$;
         create or replace function app.audit_trigger() returns trigger language plpgsql as $$ begin return new; end $$;""")
    Q("""create or replace function app.gps_point_in_polygon(p_lat float8, p_lng float8, p_poly jsonb)
         returns boolean language plpgsql immutable as $$
         declare n int; inside boolean := false; i int; j int;
                 yi float8; yj float8; xi float8; xj float8;
         begin
           n := jsonb_array_length(p_poly);
           if n < 3 then return false; end if;
           j := n - 1;
           for i in 0 .. n-1 loop
             yi := (p_poly->i->>'lat')::float8; xi := (p_poly->i->>'lng')::float8;
             yj := (p_poly->j->>'lat')::float8; xj := (p_poly->j->>'lng')::float8;
             if ((yi > p_lat) <> (yj > p_lat))
                and (p_lng < (xj - xi) * (p_lat - yi) / nullif(yj - yi, 0) + xi) then
               inside := not inside;
             end if;
             j := i;
           end loop;
           return inside;
         end $$;""")
    for f in ['20261122000000_map_planning_core','20261122000100_map_overlap_junction_fix',
              '20261122000200_map_overlap_merge_law','20261122000300_map_boundary_tolerance',
              '20261122000400_map_geofence_format_fix','20261122000500_map_alley_crossing_and_length_fix',
              '20261122000600_map_spatial_index','20261122001300_map_import_batch',
              '20261122001500_map_edit_support']:
        rc,_,err=Q(open(f'supabase/migrations/{f}.sql').read())
        if rc!=0: raise SystemExit(f"{f}: {err[:300]}")

    poly=json.load(open('docs/plans/data/zones/snd.json'))
    pj=json.dumps([{"lat":p[0],"lng":p[1]} for p in poly])
    Q(f"""insert into public.gps_geofences(id,name,polygon,sector_id) values
          ('11111111-1111-1111-1111-111111111111','السندباد','{pj}'::jsonb,5);
          insert into public.map_zones(id,geofence_id,code,name,sector_id) values
          ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','SND','السندباد',5);""")
    # نقطة داخل السندباد فعلاً (مركز تقريبي)
    inside1 = [33.240, 44.470]; inside2 = [33.245, 44.470]
    row=json.dumps([{"code":"STR-0001","kind":"primary","name":"شارع قديم","width_m":7,
       "osm_way_id":1,"path":[inside1, inside2]}])
    rc,out,err=Q(f"select app.map_import_batch('22222222-2222-2222-2222-222222222222','{row}'::jsonb,'[]'::jsonb)::text")
    r=json.loads(out) if rc==0 else {'err':err[:200]}
    print("① إدراج:", {k:r.get(k) for k in ('inserted','skipped')} if 'err' not in r else r)

    print("② تغيير التصنيف primary → secondary:")
    rc,out,err=Q("update public.map_streets set kind='secondary' where code='STR-0001' returning kind")
    print("   ", ("✔ نجح — " + out) if rc==0 else ("✘ "+err[:180]))

    print("   [تشخيص] مضلّع الزون:", out or err[:100])
    print("   [تشخيص] أول نقطة:", out or err[:100])
    print("   [تشخيص] نقاط المسار:", out or err[:100])

    print("③ تعديل مسار خارج الزون (33.300,44.400):")
    rc,out,err=Q("update public.map_streets set path='[[33.300,44.400],[33.301,44.401]]'::jsonb where code='STR-0001'")
    print("   ", ("✔ رُفض" if rc!=0 else "✘ قُبل!") + (": "+err.split('MAP_OUTSIDE_ZONE')[-1][:120] if rc!=0 else ""))

    print("④ تعديل مسار داخل الزون:")
    rc,out,err=Q("update public.map_streets set path='[[33.240,44.470],[33.2435,44.470]]'::jsonb where code='STR-0001' returning length_m")
    print("   ", ("✔ نجح، الطول الجديد " + out + " م") if rc==0 else ("✘ "+err[:150]))

    print("⑤ سجل التعديلات:")
    rc,out,_=Q("select field||': '||coalesce(old_value,'-')||' → '||coalesce(new_value,'-') from public.map_edit_log order by edited_at")
    print("   " + (out.replace("\n","\n   ") if out else "فارغ ✘"))

    print("⑥ الاستيراد بعد تعديل يدوي (يجب ألا يُطغى الاسم):")
    Q("update public.map_streets set name='اسم يدوي محفوظ', name_source='manual' where code='STR-0001'")
    row2=json.dumps([{"code":"STR-0001","kind":"primary","name":"اسم من OSM","width_m":7,
       "osm_way_id":1,"path":[inside1, inside2]}])
    Q(f"select app.map_import_batch('22222222-2222-2222-2222-222222222222','{row2}'::jsonb,'[]'::jsonb)")
    rc,out,_=Q("select name||' | '||name_source from public.map_streets where code='STR-0001'")
    print("   ", out)
finally:
    subprocess.run([f"{BIN}/pg_ctl","-D",d,"stop","-m","immediate"],capture_output=True)
    subprocess.run(["rm","-rf",tmp])
