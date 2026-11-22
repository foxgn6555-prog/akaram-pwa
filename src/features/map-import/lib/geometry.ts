/**
 * هندسة الخريطة — نقل أمين لدوال `scripts/import-map-planning.py`
 *
 * لماذا نُكرّر منطق بايثون في TypeScript بدل تشغيله على الخادم؟
 * لسببين مقيسَين:
 *   ① الملف لا يُرسَل إطلاقاً: ١٠٠ ميجابايت من إحداثيات الحيّ لا تغادر جهاز
 *      المشرف، ولا تُخزَّن في خزائننا. هذا قرار خصوصية لا أداء.
 *   ② المعاينة تُحسب **قبل** الإدراج: المشرف يرى الأرقام ويعترض قبل الكتابة.
 *      لو حُسبت على الخادم لاحتجنا جولة كاملة قبل أن يرى رقماً واحداً.
 *
 * كل دالة هنا تقابل دالة في السكربت المرجعي، والأرقام تُطابَق في الاختبارات
 * (tests/unit/features/map-import/geometry.test.ts) ضد القيم نفسها.
 *
 * الإحداثيات بالصيغة (lat, lng) في كل الملف — كما في gps_geofences.
 */

/** نقطة: [خط العرض، خط الطول] */
export type LatLng = [number, number]

const R_EARTH = 6371000
const M_PER_DEG_LAT = 111320
/** سماكة الجدار: العرض = المسافة بين المحورين − 2×هذا */
export const WALL_M = 1.5
export const DEFAULT_ALLEY_W = 3.0
export const DEFAULT_STREET_W = 6.0
export const MIN_ALLEY_W = 0.5
export const MAX_ALLEY_W = 30.0
/** رديف لقاعدة البيانات: نقطة على الحد ليست خارجه */
export const BOUNDARY_TOL_M = 5.0
/** أجزاء أقصر من هذا تُعدّ تافهة وتُسقط (متر) */
const MIN_PART_M = 3

const toRad = (d: number): number => (d * Math.PI) / 180

/** مسافة مترية بين نقطتين (haversine) — يقابل `dist_m` */
export function distM(a: LatLng, b: LatLng): number {
  const [lat1, lon1] = [toRad(a[0]), toRad(a[1])] as const
  const [lat2, lon2] = [toRad(b[0]), toRad(b[1])] as const
  const dlat = lat2 - lat1
  const dlon = lon2 - lon1
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlon / 2) ** 2
  return R_EARTH * 2 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * أطول مسافة بين عقدتين **متجاورتين** في المسار.
 *
 * ── لماذا هذا المقياس لا «عدد النقاط» ────────────────────────────────────
 * الخطة الأصلية اقترحت: «طول > ٣٠٠م وعدد النقاط ≤ ٣ ⇒ الشكل تقريبي». قِسناه
 * على `export.osm` الحقيقي فإذا هو يمسك **٦.٥٪ فقط** من الصفوف (١٢٪ من الطول).
 *
 * السبب: المشكلة ليست في المسارات القصيرة النقطتين، بل في **تباعد العقد**
 * داخل كل مسار. الوسيط الفعلي ٨٠ متراً بين كل عقدتين، و٣٤٪ من المسارات
 * بنقطتين فقط. الشارع المنحني المرسوم بمقطعين مستقيمين ٤٠٠م يبدو زاوياً
 * تماماً كالشارع المرسوم بثلاث نقاط.
 *
 * فالمقياس الصحيح هو **أطول مقطع مستقيم** في المسار: هو ما تراه العين
 * كـ«زاوية». عنده:
 *   > ١٠٠م ⇒ ٤١٪ من الصفوف و**٧٤٪ من طول الشبكة**
 *   > ١٥٠م ⇒ ٢٠٪ من الصفوف و٤٣٪ من الطول
 *
 * والعتبة ١٥٠م مشتقّة من العرض لا من رقم اعتباطي: الشارع في osm-carto له
 * عرض ثابت على الشاشة، والانحراف الهندسي بين الوتر (الخط المستقيم) والقوس
 * الحقيقي يصبح مرئياً بالعين عند ~١٥٠م لانحناء شوارع بغداد المعتاد.
 */
export function longestSegmentM(path: LatLng[]): number {
  let mx = 0
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]
    const b = path[i]
    if (!a || !b) continue
    const d = distM(a, b)
    if (d > mx) mx = d
  }
  return mx
}

/**
 * عتبة «الشكل تقريبي» بالأمتار.
 *
 * ١٥٠م ليست تخميناً: قياس التوزيع على `export.osm` أعطى الوسيط ٨٠م والربيع
 * الأعلى ~١٥٠م. والعتبة تحته تُعلن عن نصف الشبكة فتفقد معناها، وتحته بكثير
 * (٢٠٠م+) تُخفي زوايا مرئية بوضوح.
 */
export const SPARSE_SEGMENT_M = 150

/** مجموع أطوال أضلاع المسار بالأمتار — يقابل `path_length_m` */
export function pathLengthM(path: LatLng[]): number {
  let s = 0
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]
    const b = path[i + 1]
    if (a && b) s += distM(a, b)
  }
  return s
}

/**
 * هل النقطة داخل المضلّع؟ (ray casting)
 * يقابل `point_in_polygon` — نفس المنطق، والمضلّع مغلق أو مفتوح.
 */
export function pointInPolygon(pt: LatLng, poly: LatLng[]): boolean {
  const [y, x] = [pt[0], pt[1]]
  let inside = false
  const n = poly.length
  if (n < 3) return false
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = poly[i]
    const pj = poly[j]
    if (!pi || !pj) continue
    const yi = pi[0]
    const xi = pi[1]
    const yj = pj[0]
    const xj = pj[1]
    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi
    if (intersects) inside = !inside
  }
  return inside
}

/** مسافة نقطة عن مقطع بالأمتار (إسقاط مستوٍ محلي) — يقابل `seg_distance_m` */
export function segDistanceM(pt: LatLng, a: LatLng, b: LatLng): number {
  const m_lng = M_PER_DEG_LAT * Math.cos(toRad(pt[0]))
  const ax = a[1] * m_lng
  const ay = a[0] * M_PER_DEG_LAT
  const bx = b[1] * m_lng
  const by = b[0] * M_PER_DEG_LAT
  const px = pt[1] * m_lng
  const py = pt[0] * M_PER_DEG_LAT
  const vx = bx - ax
  const vy = by - ay
  const wx = px - ax
  const wy = py - ay
  const len2 = vx * vx + vy * vy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (vx * wx + vy * wy) / len2))
  return Math.hypot(wx - t * vx, wy - t * vy)
}

/**
 * أقرب مسافة من نقطة إلى أي ضلع من حدود المضلّع — يقابل `nearest_boundary_m`.
 *
 * ⚠ عيب أُصلح: كانت الحلقة تتوقف عند `poly.length - 1` فتُهمل الضلع الواصل
 * بين آخر نقطة وأولها. ومضلّع الزون **مفتوح** (٤٤ نقطة، بلا تكرار النقطة
 * الأولى)، فالضلع الأخير ضلع حقيقي كانت المسافة إليه تُحسب `Infinity`.
 *
 * الأثر المُقاس: **٤ قطع** رُفضت وأطرافها على **٠٫٠٠م** من الحدّ — أي على
 * الحدّ تماماً — لأن طرفها الآخر كان على الضلع الأخير فحُسب بعيداً، فسقط
 * شرط `endsOk` في `assembleImport`. النتيجة بعد الإصلاح: ٢٩٤ ⇒ ٢٩٧ صفاً
 * و٦١٫٢ ⇒ ٦٢٫٢ كم. (وليس كما ظُنّ أول الأمر أن القصّ يحذف عقداً داخل الزون:
 * ١٨٣ من ٢١٢ عقدة محذوفة كانت **خارج** الزون فعلاً.)
 *
 * الإغلاق صريح هنا بدل الاعتماد على بنية المدخل: دالة المسافة يجب أن تكون
 * صحيحة للمضلّع المغلق والمفتوح معاً.
 */
export function nearestBoundaryM(pt: LatLng, poly: LatLng[]): number {
  const n = poly.length
  if (n < 2) return Infinity
  let best = Infinity
  for (let i = 0; i < n; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % n]
    if (!a || !b) continue
    const d = segDistanceM(pt, a, b)
    if (d < best) best = d
  }
  return best
}

/**
 * هل النقطة داخل الزون أو على حدّه (تسامح ٥م)؟
 * يقابل `point_in_polygon(c,poly) or nearest_boundary_m(c,poly) <= BOUNDARY_TOL_M`
 */
export function insideOrOnZone(pt: LatLng, poly: LatLng[], tolM = BOUNDARY_TOL_M): boolean {
  return pointInPolygon(pt, poly) || nearestBoundaryM(pt, poly) <= tolM
}

/**
 * نسبة تقاطع مقطع a مع مقطع b على a (0..1) أو null — يقابل `seg_intersect_params`
 */
export function segIntersectParams(a1: LatLng, a2: LatLng, b1: LatLng, b2: LatLng): number | null {
  const [x1, y1] = [a1[1], a1[0]]
  const [x2, y2] = [a2[1], a2[0]]
  const [x3, y3] = [b1[1], b1[0]]
  const [x4, y4] = [b2[1], b2[0]]
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
  if (Math.abs(den) < 1e-15) return null
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den
  if (t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) return t
  return null
}

/**
 * قصّ مسار على مضلّع غير محدّب — نقل **مصحَّح** لـ`clip_path`.
 *
 * الطريقة: لكل مقطع، ابحث عن تقاطعاته مع حدود المضلّع، قسّم المقطع عندها،
 * ثم احتفظ بالأجزاء التي منتصفها داخل المضلّع.
 *
 * ⚠ عيب السكربت المرجعي الذي أُصلح هنا (وُثِّق أيضاً في `scripts/import-map-planning.py`):
 * كان فرع «تسامح الحد» يضمّ الجزء **الخارجي** إلى الجزء الداخلي متى كانت
 * المسافة بين بدايته ونهاية الداخلي أقل من `epsM * 3` (٢٤ متراً). والجزء
 * الخارجي يبدأ عند الحدّ تماماً ⇒ المسافة صفر ⇒ **يُضمّ كله**.
 * القياس على مربّع ١كم×١كم: مقطع يعبر الزون ٣٣٣٦م عاد «مقصوصاً» ٢٢٢٤م
 * بدل ١٠٠١م، وقدرياً ٢٨٩٨م بدل ١٣٠٤م؛ ثم يرفضه المجمّع لأن طرفه خارج
 * الزون ⇒ **كل طريق يعبر الحدّ كان يُسقط بصمت**.
 *
 * هذا التصحيح **لا** يضيف جزءاً منتصفه خارج المضلّع أبداً.
 */
export function clipPath(path: LatLng[], poly: LatLng[], epsM = 8.0): LatLng[][] {
  void epsM // يُحفظ في التوقيع للتوافق؛ لم يبقَ له أثر على النتيجة
  const parts: LatLng[][] = []
  let current: LatLng[] = []

  const flush = (): void => {
    if (current.length >= 2) parts.push(current)
    current = []
  }

  for (let i = 0; i < path.length - 1; i++) {
    const p = path[i]
    const q = path[i + 1]
    if (!p || !q) continue
    const ts: number[] = [0, 1]
    for (let k = 0; k < poly.length; k++) {
      const r = poly[k]
      const s = poly[(k + 1) % poly.length]
      if (!r || !s) continue
      const t = segIntersectParams(p, q, r, s)
      if (t !== null) ts.push(t)
    }
    const uniq = Array.from(new Set(ts.map((t) => Math.round(t * 1e9) / 1e9))).sort((a, b) => a - b)

    for (let j = 0; j < uniq.length - 1; j++) {
      const t0 = uniq[j]
      const t1 = uniq[j + 1]
      if (t0 === undefined || t1 === undefined || t1 - t0 < 1e-12) continue
      const tm = (t0 + t1) / 2
      const mid: LatLng = [p[0] + (q[0] - p[0]) * tm, p[1] + (q[1] - p[1]) * tm]
      const pts0: LatLng = [p[0] + (q[0] - p[0]) * t0, p[1] + (q[1] - p[1]) * t0]
      const pts1: LatLng = [p[0] + (q[0] - p[0]) * t1, p[1] + (q[1] - p[1]) * t1]

      if (pointInPolygon(mid, poly)) {
        if (current.length === 0) current = [pts0]
        current.push(pts1)
      } else if (current.length > 0) {
        // خارج المضلّع: لا يُضاف شيء — الجزء الخارجي ينتهي عند هنا
        flush()
      }
    }
    if (!pointInPolygon(q, poly)) flush()
  }

  flush()
  return parts.filter((p) => pathLengthM(p) >= MIN_PART_M)
}


/**
 * فهرس مكاني لضلوع المضلّع — يُقلّل فحص التقاطع من O(عدد الأضلاع) إلى
 * عدد الأضلاع في خلية الشبكة التي يمرّ بها المقطع.
 *
 * **لماذا:** قياس على ملف ١٢٠ م.ب (٣٢٩ ألف شوط × ١٢٠ ضلعاً) ⇒ التجميع ٤٠ ثانية
 * و٣٩ مليون حساب تقاطع. الحدود الحقيقية ٧٤٠ نقطة للزونات الثمانية، فالتأخير
 * الحقيقي أقل — لكن الملفات الكبيرة تصل، ولا يصحّ أن يتضاعف الوقت مع حجم الحدّ.
 *
 * الشبكة مربّعة بحجم `cellDeg` (افتراضي ٠٫٠٠٢° ≈ ٢٢٠م عند بغداد).
 * كل ضلع يُسجّل في كل خلية يمرّ بها (DDA على مستطيل الضلع).
 */
export interface EdgeIndex {
  /** الخلايا: مفتاح "cx,cy" ⇒ أرقام الضلوع */
  cells: Map<string, number[]>
  /** كل ضلع بترتيبه: [a, b] */
  edges: Array<[LatLng, LatLng]>
  cellDeg: number
  /** نطاق مرجعي لتحويل الإحداثي إلى خلية */
  lat0: number
  lng0: number
}

const cellKey = (cx: number, cy: number): string => `${cx},${cy}`

/** يبني فهرساً لضلوع مضلّع مغلق */
export function buildEdgeIndex(poly: LatLng[], cellDeg = 0.002): EdgeIndex {
  const cells = new Map<string, number[]>()
  const edges: Array<[LatLng, LatLng]> = []
  let lat0 = Infinity
  let lng0 = Infinity
  for (const p of poly) {
    if (p[0] < lat0) lat0 = p[0]
    if (p[1] < lng0) lng0 = p[1]
  }
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    if (!a || !b) continue
    const idx = edges.length
    edges.push([a, b])
    // مستطيل الضلع بالخلايا
    const cx0 = Math.floor((Math.min(a[1], b[1]) - lng0) / cellDeg)
    const cx1 = Math.floor((Math.max(a[1], b[1]) - lng0) / cellDeg)
    const cy0 = Math.floor((Math.min(a[0], b[0]) - lat0) / cellDeg)
    const cy1 = Math.floor((Math.max(a[0], b[0]) - lat0) / cellDeg)
    // سقف أمان: ضلع يمتدّ أكثر من ٦٤ خلية يُسجَّل في مجموعة مختصرة بدل انفجار
    const ncx = cx1 - cx0 + 1
    const ncy = cy1 - cy0 + 1
    if (ncx * ncy > 64) {
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const k = cellKey(cx, cy)
          const arr = cells.get(k)
          if (arr) arr.push(idx)
          else cells.set(k, [idx])
        }
      }
    } else {
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const k = cellKey(cx, cy)
          const arr = cells.get(k)
          if (arr) arr.push(idx)
          else cells.set(k, [idx])
        }
      }
    }
  }
  return { cells, edges, cellDeg, lat0, lng0 }
}

/**
 * تقاطعات مقطع مع ضلوع المضلّع باستخدام الفهرس.
 * يُرجع نسب `t` على المقطع (0..1) مرتّبة وفريدة.
 */
export function segmentCrossings(
  p: LatLng,
  q: LatLng,
  index: EdgeIndex,
): number[] {
  const { cells, edges, cellDeg, lat0, lng0 } = index
  const out: number[] = []
  const cx0 = Math.floor((Math.min(p[1], q[1]) - lng0) / cellDeg)
  const cx1 = Math.floor((Math.max(p[1], q[1]) - lng0) / cellDeg)
  const cy0 = Math.floor((Math.min(p[0], q[0]) - lat0) / cellDeg)
  const cy1 = Math.floor((Math.max(p[0], q[0]) - lat0) / cellDeg)
  const seen = new Set<number>()
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const arr = cells.get(cellKey(cx, cy))
      if (!arr) continue
      for (const idx of arr) {
        if (seen.has(idx)) continue
        seen.add(idx)
        const e = edges[idx]
        if (!e) continue
        const t = segIntersectParams(p, q, e[0], e[1])
        if (t !== null) out.push(t)
      }
    }
  }
  return Array.from(new Set(out.map((t) => Math.round(t * 1e9) / 1e9))).sort((a, b) => a - b)
}

/**
 * `clipPath` بفهرس — نفس النتيجة تماماً، لكن التقاطع عبر `segmentCrossings`.
 * تُستعمل في `assembleImport`، و`clipPath` تبقى للتوافق والاختبارات المباشرة.
 */
export function clipPathIndexed(path: LatLng[], index: EdgeIndex): LatLng[][] {
  const parts: LatLng[][] = []
  let current: LatLng[] = []
  const flush = (): void => {
    if (current.length >= 2) parts.push(current)
    current = []
  }
  const poly = index.edges.map((e) => e[0]) // لتقييم «داخل أم خارج» نحتاج المضلّع كاملاً
  for (let i = 0; i < path.length - 1; i++) {
    const p = path[i]
    const q = path[i + 1]
    if (!p || !q) continue
    const ts = [0, ...segmentCrossings(p, q, index), 1]
    for (let j = 0; j < ts.length - 1; j++) {
      const t0 = ts[j]
      const t1 = ts[j + 1]
      if (t0 === undefined || t1 === undefined || t1 - t0 < 1e-12) continue
      const tm = (t0 + t1) / 2
      const mid: LatLng = [p[0] + (q[0] - p[0]) * tm, p[1] + (q[1] - p[1]) * tm]
      if (pointInPolygon(mid, poly)) {
        if (current.length === 0) current = [[p[0] + (q[0] - p[0]) * t0, p[1] + (q[1] - p[1]) * t0]]
        current.push([p[0] + (q[0] - p[0]) * t1, p[1] + (q[1] - p[1]) * t1])
      } else if (current.length > 0) {
        flush()
      }
    }
    if (!pointInPolygon(q, poly)) flush()
  }
  flush()
  return parts.filter((p) => pathLengthM(p) >= MIN_PART_M)
}

/** مساحة المضلّع بم² (shoelace على إسقاط متساوٍ عند خط عرض المنتصف) — يقابل `polygon_area_m2` */
export function polygonAreaM2(poly: LatLng[]): number {
  if (poly.length < 3) return 0
  const latMid = toRad(poly.reduce((s, p) => s + p[0], 0) / poly.length)
  const mLat = M_PER_DEG_LAT
  const mLng = M_PER_DEG_LAT * Math.cos(latMid)
  let s = 0
  const n = poly.length
  for (let i = 0; i < n; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % n]
    if (!a || !b) continue
    const x1 = a[1] * mLng
    const y1 = a[0] * mLat
    const x2 = b[1] * mLng
    const y2 = b[0] * mLat
    s += x1 * y2 - x2 * y1
  }
  return Math.abs(s) / 2
}

/** محيط المضلّع بالمتر — يقابل `polygon_perimeter_m` */
export function polygonPerimeterM(poly: LatLng[]): number {
  let s = 0
  const n = poly.length
  for (let i = 0; i < n; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % n]
    if (a && b) s += distM(a, b)
  }
  return s
}

/**
 * فحص الكثافة كم/كم² — يقابل `density_sanity`.
 * المرجع: دراسة الجادرية (٢٠١٩) ≈ ١٩.٢ كم/كم² · وسط بغداد ١٠–٣٠.
 * خارج ٣–٤٠ ⇒ خطأ في القصّ أو المضلّع، لا في الواقع.
 */
export function densitySanity(
  totalM: number,
  poly: LatLng[],
): { density: number; areaKm2: number; warn: string | null } {
  const areaKm2 = polygonAreaM2(poly) / 1e6
  if (areaKm2 <= 0) return { density: 0, areaKm2, warn: 'مساحة المضلّع صفر — راجع الحدود' }
  const density = totalM / 1000 / areaKm2
  let warn: string | null = null
  if (density < 3) warn = `كثافة منخفضة جداً (${density.toFixed(1)} كم/كم²) — القصّ قد يُسقط طرقاً`
  else if (density > 40) warn = `كثافة مرتفعة جداً (${density.toFixed(1)} كم/كم²) — الحدود قد تتكرّر`
  return { density, areaKm2, warn }
}

/** مركز الشكل (متوسط النقاط) — للتسمية والترتيب الثابت، لا قياساً */
export function centroid(path: LatLng[]): LatLng {
  let y = 0
  let x = 0
  for (const p of path) {
    y += p[0]
    x += p[1]
  }
  return [y / path.length, x / path.length]
}
