#!/usr/bin/env python3
"""
الجولة ٢ — مستورد التخطيط من OSM إلى جداول map_* (توليد SQL فقط، بلا اتصال بقاعدة).

الاستخدام:
    python3 scripts/import-map-planning.py --zone ARK --osm /tmp/arkhita.osm --out out/ark.sql
    python3 scripts/import-map-planning.py --zone ARK --osm-dir /tmp/osm --out out/ark.sql

المدخل: ملف (أو مجلد ملفات) OSM XML خام من /api/0.6/map، ومضلّع الزون كـJSON.
المخرج: ملف SQL فيه:
    insert into map_zones ...        (زون واحد)
    insert into map_mahallas ...     (المحلات المستخرجة من بادئات الأسماء)
    insert into map_streets ...      (شوارع مقصوصة على الحدود)
    insert into map_alleys ...       (أزقة مقصوصة على الحدود + محلة إلزامية)

المبادئ:
  · لا تخمين: ما لا نعرفه يبقى null (اسم، عرض، حدود محلة).
  · القص على الحدود إلزامي: أي مقطع خارج المضلّع يُسقط أو يُقص.
  · محلة الزقاق تُستخرج من **اسمه** (905-16 ⇒ 905) — الطريقة الوحيدة الموثوقة
    (حدود OSM للمحلات مفتوحة، فلا يصح الاعتماد على point-in-polygon).
  · العرض: إن لم يكن في OSM (وهو كذلك دائماً) نحسب المسافة إلى أقرب محور موازٍ
    ونطرح سماكة الجدار؛ والقيمة تُوسَم 'measured' أو 'default' بصدق.
  · المخرج idempotent: كل عبارة insert ... on conflict do nothing حتى يمكن
    إعادة التشغيل بلا تكرار، والأكواد تُشتق من ترتيب ثابت (y ثم x) لا عشوائي.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field

# ── ثوابت المشروع ────────────────────────────────────────────────────────────
WALL_M = 1.5              # سماكة الجدار: العرض = المسافة بين المحورين − 2×هذا
DEFAULT_ALLEY_W = 3.0     # أضيق ما وُجد فعلياً في الأرخيته
DEFAULT_STREET_W = 6.0
MIN_ALLEY_W = 0.5
MAX_ALLEY_W = 30.0

CLASS_LETTER = {'motorway': 'STR', 'trunk': 'STR', 'primary': 'STR',
                'secondary': 'SEC', 'tertiary': 'TRC'}
LOCAL_HIGHWAY = {'residential', 'unclassified', 'living_street', 'service',
                 'road', 'track', 'pedestrian'}
ALLEY_HIGHWAY = {'footway', 'path', 'alley', 'steps', 'corridor'}

KIND_OF = {'STR': 'primary', 'SEC': 'secondary', 'TRC': 'tertiary', 'LOC': 'local'}

# أسماء شوارع رئيسية معروفة (لتسمية ما لا اسم له في OSM — تُطبَّق بالتقريب المكاني فقط)
MAJOR_NAMES = {
    'طريق بن زياد', 'ساحة الفتح', 'شارع السعدون', 'شارع خالد بن الوليد',
    'شارع النضال', 'شارع سليمان فائق', 'شارع كرادة داخل',
    'شارع محمد مهدي كبة', 'شارع عمرو بن كلثوم', 'شارع التأخي',
    'شارع فوزي القاوقجي', 'شارع أبي العطية', 'شارع العرصات',
    'شارع المسبح', 'شارع عشتار', 'شارع علي البازركان', 'ساحة المسبح',
    'شارع أبو نؤاس', 'شارع طارق بن زياد',
}


# ── هندسة ───────────────────────────────────────────────────────────────────
def dist_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    """haversine بالأمتار. a,b = (lat, lng)"""
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371000 * 2 * math.asin(min(1.0, math.sqrt(h)))


def point_in_polygon(pt: tuple[float, float], poly: list[tuple[float, float]]) -> bool:
    """ray casting — نفس منطق app.gps_point_in_polygon (lat,lng)"""
    lat, lng = pt
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        yi, xi = poly[i]
        yj, xj = poly[j]
        if (yi > lat) != (yj > lat):
            x_cross = (xj - xi) * (lat - yi) / (yj - yi) + xi if yj != yi else xi
            if lng < x_cross:
                inside = not inside
        j = i
    return inside


def seg_intersect_params(a1, a2, b1, b2) -> float | None:
    """نسبة التقاطع على المقطع a (0..1) أو None"""
    x1, y1 = a1[1], a1[0]
    x2, y2 = a2[1], a2[0]
    x3, y3 = b1[1], b1[0]
    x4, y4 = b2[1], b2[0]
    den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(den) < 1e-15:
        return None
    t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
    u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den
    if -1e-9 <= t <= 1 + 1e-9 and -1e-9 <= u <= 1 + 1e-9:
        return t
    return None


def clip_path(path: list[tuple[float, float]], poly: list[tuple[float, float]],
              eps_m: float = 8.0) -> list[list[tuple[float, float]]]:
    """
    يقصّ مساراً على مضلّع غير محدّب.

    الطريقة: لكل مقطع، ابحث عن تقاطعاته مع حدود المضلّع، قسّم المقطع عندها،
    ثم احتفظ بالأجزاء التي منتصفها داخل المضلّع.

    ⚠ عيب أُصلح في الجولة ٩ (كان يضخّم الأطوال ويُسقط الطرق العابرة كاملاً):

    كان فرع «تسامح الحد» يضمّ الجزء **الخارجي** إلى الجزء الداخلي متى كانت
    المسافة بين بدايته ونهاية الجزء الداخلي أقل من `eps_m * 3` (٢٤ متراً).
    وبما أن الجزء الخارجي يبدأ **عند الحدّ تماماً** بعد القصّ، فالمسافة صفر
    دائماً ⇒ كان الخارج يُضمّ كله. القياس على مربّع ١كم × ١كم:

        مقطع يعبر الزون كاملاً : ٣٣٣٦م أصلاً → ٢٢٢٤م «مقصوصاً» (الصحيح ١٠٠١م)
        قطري                  :             → ٢٨٩٨م (الصحيح ١٣٠٤م)

    ثم يرفضه `build()` لأن طرفه خارج الزون ⇒ **الطريق العابر يُسقط بالكامل**
    ويُسجَّل تحذيراً. أي أن كل طريق يعبر حدّ الزون كان يضيع بصمت.

    الإصلاح: لا يُضاف أي جزء منتصفه خارج المضلّع، أبداً. و`eps_m` صار يُستخدم
    لما وُصف له أصلاً: **إغلاق** الجزء عند حدّ قريب بدل قطعه، لا ضمّ الخارج.
    """
    parts: list[list[tuple[float, float]]] = []
    current: list[tuple[float, float]] = []

    def flush() -> None:
        nonlocal current
        if len(current) >= 2:
            parts.append(current)
        current = []

    for i in range(len(path) - 1):
        p, q = path[i], path[i + 1]
        ts = [0.0, 1.0]
        for k in range(len(poly)):
            r, s = poly[k], poly[(k + 1) % len(poly)]
            t = seg_intersect_params(p, q, r, s)
            if t is not None:
                ts.append(t)
        ts = sorted(set(round(t, 9) for t in ts))

        for j in range(len(ts) - 1):
            t0, t1 = ts[j], ts[j + 1]
            if t1 - t0 < 1e-12:
                continue
            tm = (t0 + t1) / 2
            mid = (p[0] + (q[0] - p[0]) * tm, p[1] + (q[1] - p[1]) * tm)
            pts0 = (p[0] + (q[0] - p[0]) * t0, p[1] + (q[1] - p[1]) * t0)
            pts1 = (p[0] + (q[0] - p[0]) * t1, p[1] + (q[1] - p[1]) * t1)

            if point_in_polygon(mid, poly):
                if not current:
                    current = [pts0]
                current.append(pts1)
            else:
                # خارج المضلّع: لا يُضاف شيء. الجزء الخارجي ينتهي عند هنا.
                if current:
                    flush()
        # نهاية المقطع: إن كانت نقطة النهاية خارج المضلّع نُغلق الجزء
        if not point_in_polygon(q, poly):
            flush()

    flush()
    # استبعاد الأجزاء التافهة (< 3 م)
    return [p for p in parts if sum(dist_m(p[i], p[i + 1]) for i in range(len(p) - 1)) >= 3]


def path_length_m(path: list[tuple[float, float]]) -> float:
    return sum(dist_m(path[i], path[i + 1]) for i in range(len(path) - 1))


def polygon_area_m2(poly: list[tuple[float, float]]) -> float:
    """مساحة مضلّع بالمتر المربع (shoelace على إسقاط متساوي المسافات عند خط عرض المنتصف)."""
    if len(poly) < 3:
        return 0.0
    la_mid = math.radians(sum(p[0] for p in poly) / len(poly))
    m_lat = 111320.0
    m_lng = 111320.0 * math.cos(la_mid)
    s = 0.0
    n = len(poly) if poly[0] == poly[-1] else len(poly)  # يعمل مع المفتوح والمغلق
    for i in range(n):
        x1, y1 = poly[i][1] * m_lng, poly[i][0] * m_lat
        j = (i + 1) % n
        x2, y2 = poly[j][1] * m_lng, poly[j][0] * m_lat
        s += x1 * y2 - x2 * y1
    return abs(s) / 2


def polygon_perimeter_m(poly: list[tuple[float, float]]) -> float:
    n = len(poly) if poly[0] == poly[-1] else len(poly)
    return sum(dist_m(poly[i], poly[(i + 1) % n]) for i in range(n))


def density_sanity(total_m: float, poly: list[tuple[float, float]]) -> tuple[float, float, str | None]:
    """كثافة الشوارع كم/كم² + تحذير منطقي.

    مرجع: دراسة الجادرية (٢٠١٩) ≈ ١٩.٢ كم/كم² · وسط بغداد ١٠–٣٠ كم/كم².
    خارج ٣–٤٠ ⇒ خطأ في القصّ أو المضلّع، لا في الواقع.
    """
    area_km2 = polygon_area_m2(poly) / 1e6
    if area_km2 <= 0:
        return 0.0, area_km2, 'مساحة المضلّع صفر — راجع الحدود'
    dens = (total_m / 1000) / area_km2
    warn = None
    if dens < 3:
        warn = f'كثافة منخفضة جداً ({dens:.1f} كم/كم²) — القصّ قد يُسقط طرقاً'
    elif dens > 40:
        warn = f'كثافة مرتفعة جداً ({dens:.1f} كم/كم²) — القصّ قد لا يعمل أو الحدود تتكرّر'
    return dens, area_km2, warn


BOUNDARY_TOL_M = 5.0   # رديف لقاعدة البيانات: نقطة على الحد ليست خارجه


def nearest_boundary_m(pt, poly) -> float:
    """أقرب مسافة من نقطة إلى أي ضلع من حدود المضلّع."""
    return min(seg_distance_m(pt, poly[i], poly[i + 1]) for i in range(len(poly) - 1))


def seg_distance_m(pt, a, b) -> float:
    """مسافة نقطة عن مقطع بالأمتار (إسقاط مستوٍ محلي)"""
    m_lat = 111320.0
    m_lng = 111320.0 * math.cos(math.radians(pt[0]))
    vx = (b[1] - a[1]) * m_lng
    vy = (b[0] - a[0]) * m_lat
    wx = (pt[1] - a[1]) * m_lng
    wy = (pt[0] - a[0]) * m_lat
    den = vx * vx + vy * vy
    t = 0.0 if den == 0 else max(0.0, min(1.0, (vx * wx + vy * wy) / den))
    return math.hypot(wx - t * vx, wy - t * vy)


# ── قراءة OSM ───────────────────────────────────────────────────────────────
@dataclass
class Way:
    wid: int
    tags: dict[str, str]
    nodes: list[int] = field(default_factory=list)
    name: str = ''

    @property
    def highway(self) -> str:
        return self.tags.get('highway', '')


def read_osm(paths: list[str]) -> tuple[dict[int, tuple[float, float]], dict[int, Way]]:
    nodes: dict[int, tuple[float, float]] = {}
    ways: dict[int, Way] = {}
    for path in paths:
        for _, el in ET.iterparse(path, events=('end',)):
            if el.tag == 'node':
                nodes[int(el.attrib['id'])] = (float(el.attrib['lat']), float(el.attrib['lon']))
                el.clear()
            elif el.tag == 'way':
                wid = int(el.attrib['id'])
                tags = {t.attrib['k']: t.attrib['v'] for t in el.findall('tag')}
                nds = [int(n.attrib['ref']) for n in el.findall('nd')]
                if wid not in ways:
                    ways[wid] = Way(wid, tags, nds, tags.get('name', ''))
                el.clear()
    return nodes, ways


def classify(way: Way) -> str | None:
    """يُرجع STR/SEC/TRC/LOC/ALY أو None لما لا نريده"""
    hw = way.highway
    if not hw:
        return None
    if hw in CLASS_LETTER:
        # «ساحة» و«مجسر» و«جسر» ليست شوارع: الساحة مضلّع مرور، والمجسر جسر.
        # وسمها highway=primary في OSM لا يجعلها شارعاً — والتصنيف الخاطئ
        # يجعل الكثافة مبالغاً فيها ويضلّل محرّك الزيارات.
        if way.name and is_non_street_name(way.name):
            return None   # ليست مساراً قابلاً للزيارة
        return CLASS_LETTER[hw]
    if hw == 'tertiary_link' or hw == 'primary_link' or hw == 'secondary_link':
        return None
    if hw in ALLEY_HIGHWAY:
        return 'ALY'
    if hw in LOCAL_HIGHWAY:
        # في هذه المنطقة الأزقة السكنية الضيقة قد تُوسم residential؛
        # نفرّق بالاسم: إن كان بصيغة «905-16» فهو زقاق بغضّ النظر عن وسمه
        if is_mahalla_numbered(way.name):
            return 'ALY'
        return 'LOC'
    return None


# ⚠ عيب أُصلح في الجولة ٩: كانت البادئات بصيغة «كلمة + مسافة»، فاسم مجرّد
# مثل «المجسر» أو «النفق» لا يُطابق شيئاً ⇒ يُقبل شارعاً كاملاً، فتتضخّم
# الكثافة ويُسجَّل منشأ في محرّك الزيارات. الآن نطابق الكلمة كاملة.
NON_STREET_WORDS = ('ساحة', 'مجسر', 'جسر', 'نفق')


def is_non_street_name(name: str) -> bool:
    """هل الاسم لمنشأ (ساحة/مجسر/جسر/نفق) لا لشارع؟ يقبل «ال» التعريف."""
    nm = name.strip()
    if not nm:
        return False
    first = nm.split()[0]
    bare = first[2:] if first.startswith('ال') else first
    return bare in NON_STREET_WORDS


def is_mahalla_numbered(name: str) -> bool:
    if not name:
        return False
    head = name.split('-')[0].strip()
    rest = name.split('-', 1)[1].strip() if '-' in name else ''
    return head.isdigit() and len(head) in (2, 3, 4) and rest.isdigit()


def mahalla_of(name: str) -> str | None:
    """يستخرج رقم المحلة من اسم الزقاق.

    الأنماط المقبولة (كلها موجودة في OSM فعلياً):
      '905-16'          → 905   (النمط الأساسي)
      'زقاق 905-16'     → 905   (بعد كلمة وصفية)
      'حارة 905-16'     → 905
    """
    if not name:
        return None
    n = name.strip()
    # جرّب النمط المباشر أولاً
    if is_mahalla_numbered(n):
        return n.split('-')[0].strip()
    # جرّب إزالة الكلمة الوصفية الأولى
    parts = n.split()
    if len(parts) >= 2:
        tail = parts[-1]
        if is_mahalla_numbered(tail):
            return tail.split('-')[0].strip()
    # جرّب أي كلمة تحتوي النمط
    for w in parts:
        if is_mahalla_numbered(w):
            return w.split('-')[0].strip()
    return None


# ── التجميع والأكواد ────────────────────────────────────────────────────────
def sql_escape(s: str) -> str:
    return s.replace("'", "''")


def json_path(pts: list[tuple[float, float]]) -> str:
    """[[lat,lng],...] — الصيغة التي تفهمها دوال app.map_*"""
    return '[' + ','.join(f'[{lat:.7f},{lng:.7f}]' for lat, lng in pts) + ']'


def centroid_x(pts):
    return sum(p[1] for p in pts) / len(pts)


def centroid_y(pts):
    return sum(p[0] for p in pts) / len(pts)


def build(zone_code: str, zone_name: str, geofence_id: str, sector_id: int | None,
          polygon: list[tuple[float, float]], nodes, ways) -> dict:
    """يعيد dict بالعناصر المستخرجة (لا SQL بعد)"""
    zone_code = zone_code.upper()

    # 1) قصّ كل طريق على الحدود  ← الخطوة التي تُحدّد الدقة
    clipped: list[dict] = []
    warnings: list[str] = []
    for way in ways.values():
        cls = classify(way)
        if cls is None:
            continue
        coords = [nodes[n] for n in way.nodes if n in nodes]
        if len(coords) < 2:
            continue
        # تسريع: تخطَّ الطرق البعيدة عن نطاق الزون
        lat0, lat1 = min(c[0] for c in coords), max(c[0] for c in coords)
        lng0, lng1 = min(c[1] for c in coords), max(c[1] for c in coords)
        zlat0 = min(p[0] for p in polygon); zlat1 = max(p[0] for p in polygon)
        zlng0 = min(p[1] for p in polygon); zlng1 = max(p[1] for p in polygon)
        if lat1 < zlat0 or lat0 > zlat1 or lng1 < zlng0 or lng0 > zlng1:
            continue
        # هل للمسار أي نقطة داخل الزون أو على حدّه؟ (سريع)
        if not any(point_in_polygon(c, polygon) or nearest_boundary_m(c, polygon) <= BOUNDARY_TOL_M
                   for c in coords):
            continue
        # القصّ إلزامي: الطريق العابر للحد يُقتطع، لا يُؤخذ كاملاً (كان يضخّم الطول 4×)
        parts = clip_path(coords, polygon)
        for part in parts:
            # تحقق رديف لقاعدة البيانات: الطرفان داخل الزون أو على حدّه (٥م)
            ends_ok = all(point_in_polygon(e, polygon) or nearest_boundary_m(e, polygon) <= BOUNDARY_TOL_M
                          for e in (part[0], part[-1]))
            if ends_ok:
                clipped.append({'cls': cls, 'way': way, 'pts': part})
            else:
                warnings.append(f'{way.name or way.wid}: طرف خارج الزون بعد القصّ — أُسقط')
        if not parts and any(point_in_polygon(c, polygon) for c in coords):
            # احتياط: الطريق داخل لكن القصّ فشل (حالة حدّية) — نسجّل تحذيراً
            warnings.append(f'طريق {way.wid} ({way.name or "بلا اسم"}) داخل الزون ولم يُقصّ')

    # 2) الأكواد: ترتيب ثابت (y ثم x) — نفس الترتيب في كل تشغيل
    counters: dict[str, int] = {}
    for row in sorted(clipped, key=lambda r: (round(centroid_y(r['pts']), 5),
                                              round(centroid_x(r['pts']), 5))):
        row['kind'] = KIND_OF.get(row['cls'], 'alley')
        if row['cls'] == 'ALY':
            row['kind'] = 'alley'
        prefix = row['cls']
        counters[prefix] = counters.get(prefix, 0) + 1
        row['code'] = f'{prefix}-{counters[prefix]:04d}'
        row['length_m'] = round(path_length_m(row['pts']), 1)
        row['name'] = row['way'].name or None
        row['osm_way_id'] = row['way'].wid

    # 3) المحلات من البادئات (كل بادئة ظهرت في اسم طريق)
    mah_numbers: set[str] = set()
    for row in clipped:
        if row['name']:
            m = mahalla_of(row['name'])
            if m:
                mah_numbers.add(m)
    mahallas: dict[str, dict] = {}
    for i, num in enumerate(sorted(mah_numbers, key=lambda s: (len(s), s)), start=1):
        mahallas[num] = {
            'code': f'MHL-{i:04d}',
            'osm_number': num,
            'name': f'محلة {num}',
            'boundary_state': 'open',   # حدود OSM مفتوحة — لا ندّعي غير ذلك
        }

    # محلة «غير محدّدة» — وسم صادق لا رقم مخترع.
    # OSM يعطي كثيراً من الأزقة بلا اسم (١٠٣٧ من ١٨٠٢ مرشحاً في الزونات
    # الثلاثة). كانت تُسقط، فتضيع أزقة حقيقية من التغطية. البديل: تُنسب إلى
    # محلة واحدة معلوم الزيف (code MHL-0000، osm_number null، name صريح)،
    # فيراها المشرف كقائمة عمل للربط اليدوي بدل أن تختفي.
    unnamed = [r for r in clipped if r['cls'] == 'ALY' and not r.get('mahalla_num')]
    if unnamed:
        mahallas['__UNASSIGNED__'] = {
            'code': 'MHL-0000',
            'osm_number': None,
            'name': 'غير محدّدة — تحتاج ربطاً بمحلة',
            'boundary_state': 'open',
        }

    # 4) ربط الأزقة بمحلاتها من الاسم (المصدر الوحيد الموثوق)
    for row in clipped:
        if row['cls'] == 'ALY':
            num = mahalla_of(row['name'] or '')
            if num and num in mahallas:
                row['mahalla_num'] = num
                row['link_source'] = 'osm_name'
            else:
                row['mahalla_num'] = None
                row['link_source'] = 'manual'   # يحتاج ربطاً يدوياً — لا نخترع

    # 5) عرض تقديري من المسافة إلى أقرب محور زقاق آخر
    alley_rows = [r for r in clipped if r['cls'] == 'ALY']
    for row in alley_rows:
        mid = row['pts'][len(row['pts']) // 2]
        best = None
        for other in alley_rows:
            if other is row:
                continue
            for k in range(len(other['pts']) - 1):
                d = seg_distance_m(mid, other['pts'][k], other['pts'][k + 1])
                if best is None or d < best:
                    best = d
        if best is not None and best > 2 * WALL_M + MIN_ALLEY_W:
            row['width_m'] = round(min(MAX_ALLEY_W, max(MIN_ALLEY_W, best - 2 * WALL_M)), 1)
            row['width_source'] = 'measured'
        else:
            row['width_m'] = DEFAULT_ALLEY_W
            row['width_source'] = 'default'

    for row in clipped:
        if row['cls'] != 'ALY':
            row.setdefault('width_m', DEFAULT_STREET_W)
            row.setdefault('width_source', 'default')

    return {'zone': {'code': zone_code, 'name': zone_name, 'geofence_id': geofence_id,
                     'sector_id': sector_id},
            'mahallas': mahallas, 'rows': clipped, 'counters': counters,
            'warnings': warnings}


# ── توليد SQL ───────────────────────────────────────────────────────────────
def osm_num_sql(v) -> str:
    """رقم المحلة في OSM: نصّ أو NULL صريح — لا نكتب 'None' في SQL."""
    if not v:
        return 'null'
    return "'" + sql_escape(str(v)) + "'"


def to_sql(data: dict, zone_uuid: str) -> str:
    z = data['zone']
    out: list[str] = []
    out.append('-- مولَّد آلياً بواسطة scripts/import-map-planning.py — لا يُعدَّل يدوياً')
    out.append(f"-- الزون: {z['name']} ({z['code']})")
    # لا نستخدم begin/commit واحداً: كل عنصر يُدرج في معاملة مستقلة
    # حتى لا يُسقط عنصرٌ واحد ٣٠٠ عنصر سليم. الفشل يُسجَّل ويُكمَل.
    out.append('-- كل عبارة مستقلة: فشل عنصر لا يُسقط الباقي')
    out.append(f"""
insert into public.map_zones (id, geofence_id, code, name, sector_id)
values ('{zone_uuid}', '{z['geofence_id']}', '{z['code']}', '{sql_escape(z['name'])}',
        {z['sector_id'] if z['sector_id'] is not None else 'null'})
on conflict (geofence_id) do update
  set code = excluded.code, name = excluded.name, sector_id = excluded.sector_id,
      updated_at = now();
""".strip())

    for num, m in data['mahallas'].items():
        num_sql = osm_num_sql(m['osm_number'])
        out.append(f"""
insert into public.map_mahallas (zone_id, code, osm_number, name, boundary_state)
values ('{zone_uuid}', '{m['code']}', {num_sql}, '{sql_escape(m['name'])}',
        '{m['boundary_state']}')
on conflict (zone_id, code) do update set updated_at = now();
""".strip())

    # الشوارع
    for row in data['rows']:
        if row['cls'] == 'ALY':
            continue
        nm = 'null' if not row['name'] else f"'{sql_escape(row['name'])}'"
        out.append(f"""
do $one$
begin
  insert into public.map_streets (zone_id, code, name, kind, path, width_m, osm_way_id)
  values ('{zone_uuid}', '{row['code']}', {nm}, '{row['kind']}',
          '{json_path(row['pts'])}'::jsonb, {row['width_m']}, {row['osm_way_id']})
  on conflict (zone_id, code) do update
    set path = excluded.path, osm_way_id = excluded.osm_way_id, updated_at = now();
exception when others then
  insert into public.map_import_skips (zone_id, table_name, code, name, error_code, error_msg)
  values ('{zone_uuid}', 'map_streets', '{row['code']}', {nm},
          split_part(sqlerrm, ':', 1), sqlerrm)
  on conflict (zone_id, table_name, code) do update
    set error_msg = excluded.error_msg, created_at = now();
end $one$;
""".strip())

    # الأزقة: تحتاج mahalla_id — نبحث بالكود
    for row in data['rows']:
        if row['cls'] != 'ALY':
            continue
        if not row.get('mahalla_num'):
            # بلا اسم في OSM ⇒ محلة «غير محدّدة» (MHL-0000) — تُرى وتُربط لاحقاً
            mcode = data['mahallas']['__UNASSIGNED__']['code']
        else:
            mcode = data['mahallas'][row['mahalla_num']]['code']
        nm = 'null' if not row['name'] else f"'{sql_escape(row['name'])}'"
        out.append(f"""
do $one$
begin
  insert into public.map_alleys (zone_id, mahalla_id, code, name, path, width_m,
                                 width_source, osm_way_id, link_source)
  select '{zone_uuid}', m.id, '{row['code']}', {nm}, '{json_path(row['pts'])}'::jsonb,
         {row['width_m']}, '{row['width_source']}', {row['osm_way_id']}, '{row['link_source']}'
  from public.map_mahallas m
  where m.zone_id = '{zone_uuid}' and m.code = '{mcode}'
  on conflict (zone_id, code) do update
    set path = excluded.path, mahalla_id = excluded.mahalla_id,
        width_m = excluded.width_m, osm_way_id = excluded.osm_way_id, updated_at = now();
exception when others then
  insert into public.map_import_skips (zone_id, table_name, code, name, error_code, error_msg)
  values ('{zone_uuid}', 'map_alleys', '{row['code']}', {nm},
          split_part(sqlerrm, ':', 1), sqlerrm)
  on conflict (zone_id, table_name, code) do update
    set error_msg = excluded.error_msg, created_at = now();
end $one$;
""".strip())

    return '\n\n'.join(out) + '\n'


def load_zone(poly_json: str) -> list[tuple[float, float]]:
    """يقبل [{lat,lng},...] أو [[lat,lng],...] — ويُغلق الحلقة إن كانت مفتوحة.

    مضلّعات gps_geofences في المنصة حلقة مفتوحة (آخر نقطة ≠ أولها).
    بدون إغلاقها يعتبر ray-casting كل نقطة خارجية «داخلة» أحياناً،
    فتتضخّم الأطوال (رأيت 84 كم بدل 22 كم). الإغلاق هنا إصلاح إلزامي.
    """
    raw = json.loads(poly_json)
    out = []
    for p in raw:
        if isinstance(p, dict):
            out.append((float(p['lat']), float(p['lng'])))
        else:
            out.append((float(p[0]), float(p[1])))
    # إغلاق الحلقة
    if out and out[0] != out[-1]:
        out.append(out[0])
    # إزالة التكرار المتتالي
    dedup = [out[0]] if out else []
    for p in out[1:]:
        if p != dedup[-1]:
            dedup.append(p)
    if len(dedup) >= 2 and dedup[0] != dedup[-1]:
        dedup.append(dedup[0])
    return dedup


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--zone', required=True, help='كود الزون: ARK / JAD / RTH / WTH')
    ap.add_argument('--name', required=True, help='اسم الزون بالعربية')
    ap.add_argument('--geofence', required=True, help='uuid من gps_geofences')
    ap.add_argument('--sector', type=int, default=None)
    ap.add_argument('--zone-uuid', required=True)
    ap.add_argument('--polygon', required=True, help='ملف json فيه مضلّع الزون')
    ap.add_argument('--osm', nargs='+', required=True, help='ملف/ملفات OSM XML')
    ap.add_argument('--out', required=True)
    args = ap.parse_args()

    polygon = load_zone(open(args.polygon).read())
    nodes, ways = read_osm(args.osm)
    data = build(args.zone, args.name, args.geofence, args.sector, polygon, nodes, ways)
    sql = to_sql(data, args.zone_uuid)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    open(args.out, 'w').write(sql)

    # ملخّص
    n = data['counters']
    total_m = sum(r['length_m'] for r in data['rows'])
    orphan = sum(1 for r in data['rows'] if r['cls'] == 'ALY' and not r.get('mahalla_num'))
    print(f"الزون: {args.name} ({args.zone})")
    print(f"  محلات: {len(data['mahallas'])}")
    print(f"  رئيسي {n.get('STR',0)} · ثانوي {n.get('SEC',0)} · ثالثة {n.get('TRC',0)}"
          f" · محلي {n.get('LOC',0)} · زقاق {n.get('ALY',0)}")
    dens, area_km2, dwarn = density_sanity(total_m, polygon)
    print(f"  إجمالي العناصر: {len(data['rows'])} · الطول: {total_m/1000:.1f} كم")
    print(f"  مساحة الزون: {area_km2:.2f} كم² · الكثافة: {dens:.1f} كم/كم²")
    if dwarn:
        print(f"  ⚠ {dwarn}")
    if orphan:
        print(f"  ⚠ أزقة بلا محلة معروفة (تحتاج ربطاً يدوياً): {orphan}")
    for w in data.get('warnings', [])[:5]:
        print(f"  ⚠ {w}")
    print(f"  المخرج: {args.out}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
