#!/usr/bin/env python3
"""يعيد حساب أرقام الاستيراد بالنسختين (قبل/بعد إصلاح clip_path) على ملف OSM حقيقي.
الاستخدام:  python3 scripts/tools/recalc-import-numbers.py /tmp/zones.osm
لا يحتاج شبكة. يقيس بلا كتابة أي شيء على قاعدة."""
import sys, importlib.util, json, re, os
HERE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(HERE)
spec = importlib.util.spec_from_file_location('imp','scripts/import-map-planning.py')
m = importlib.util.module_from_spec(spec); sys.modules['imp']=m; spec.loader.exec_module(m)

# version قديمة من clip_path = النسخة قبل الإصلاح (من git)
import subprocess
old = subprocess.run(['git','show','HEAD:scripts/import-map-planning.py'],capture_output=True,text=True).stdout
ns={}
exec(compile(old.replace('from __future__ import annotations',''), 'old', 'exec'), ns)
clip_old = ns['clip_path']

def run(osm_path, poly_path, clip_fn):
    nodes, ways = m.read_osm([osm_path])
    poly = m.load_zone(open(poly_path).read())
    orig = m.clip_path
    m.clip_path = clip_fn
    try:
        data = m.build('TST','تجربة','00000000-0000-0000-0000-000000000000', None, poly, nodes, ways)
    finally:
        m.clip_path = orig
    rows = data['rows']
    total_m = sum(pathlen(r['pts']) for r in rows)
    area = m.polygon_area_m2(poly)/1e6
    dens = (total_m/1000)/area if area>0 else 0
    return dict(n=len(rows), total_km=total_m/1000, area=area, dens=dens,
                warnings=len(data['warnings']))

def pathlen(pts): return sum(m.dist_m(pts[i], pts[i+1]) for i in range(len(pts)-1))

ZONES_OSM = sys.argv[1] if len(sys.argv) > 1 else '/tmp/zones.osm'
ARK_OSM  = sys.argv[2] if len(sys.argv) > 2 else '/tmp/arkhita.osm'
# أرخيته لها ملفها الخاص (zones.osm يغطي الثلاثة الأخرى فقط)
zones = {
 'أرخيته': (ARK_OSM if os.path.exists(ARK_OSM) else ZONES_OSM,'docs/plans/data/zones/ark.json'),
 'الرياض': (ZONES_OSM,'docs/plans/data/zones/rth.json'),
 'الواثق': (ZONES_OSM,'docs/plans/data/zones/wth.json'),
 'الجادرية':(ZONES_OSM,'docs/plans/data/zones/jad.json'),
}
print(f"{'الزون':10s} {'قبل: عناصر':>12s} {'كم':>8s} {'كثافة':>7s}   {'بعد: عناصر':>12s} {'كم':>8s} {'كثافة':>7s}   {'الفرق':>8s}")
print("-"*88)
totA=totB=0
for name,(osm,poly) in zones.items():
    a = run(osm,poly,clip_old); b = run(osm,poly,m.clip_path)
    totA+=a['n']; totB+=b['n']
    print(f"{name:10s} {a['n']:12d} {a['total_km']:8.1f} {a['dens']:7.1f}   {b['n']:12d} {b['total_km']:8.1f} {b['dens']:7.1f}   {b['n']-a['n']:+8d}")
print("-"*88)
print(f"{'المجموع':10s} {totA:12d} {'':8s} {'':7s}   {totB:12d} {'':8s} {'':7s}   {totB-totA:+8d}")
