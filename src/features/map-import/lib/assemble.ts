/**
 * مجمّع الاستيراد — من ملف OSM إلى عناصر جاهزة للمعاينة والإدراج.
 * يقابل `build()` في `scripts/import-map-planning.py`، بأمانة في النتائج.
 *
 * قرارات محفوظة من الجولة ٢ وموثّقة بقياسات:
 *   · القصّ على الحدود **إلزامي** (بلا قصّ تتضخّم الأطوال ٤× — رُصد فعلاً).
 *   · العقد بلا إحداثيات تُسقط الشوط كله (لا نُخمّن موقعاً).
 *   · الترتيب ثابت (y ثم x) ⇒ الأكواد متطابقة في كل تشغيل. هذا ما يجعل
 *     إعادة الاستيراد آمنة بدل أن تُعيد الترقيم وتفقد التتبّع.
 *   · الأزقة بلا اسم تُنسب إلى محلة «غير محدّدة» مُعلنة الزيف، لا تُسقط
 *     (١٥٣ زقاقاً كانت ستضيع في الأرخيته وحدها).
 */

import {
  BOUNDARY_TOL_M,
  DEFAULT_ALLEY_W,
  DEFAULT_STREET_W,
  MAX_ALLEY_W,
  MIN_ALLEY_W,
  WALL_M,
  buildEdgeIndex,
  centroid,
  clipPathIndexed,
  densitySanity,
  distM,
  insideOrOnZone,
  longestSegmentM,
  nearestBoundaryM,
  pathLengthM,
  pointInPolygon,
  polygonAreaM2,
  segmentCrossings,
  segDistanceM,
  segIntersectParams,
  SPARSE_SEGMENT_M,
  type EdgeIndex,
  type LatLng,
} from './geometry'
import { classify, kindOf, mahallaOf, nonStreetWord, round1, round7, type ClassCode } from './classify'
import type { OsmWay } from './osm-stream'

export interface ImportRow {
  cls: ClassCode
  code: string
  kind: 'primary' | 'secondary' | 'tertiary' | 'local' | 'alley'
  name: string | null
  pts: LatLng[]
  lengthM: number
  widthM: number
  widthSource: 'measured' | 'default'
  osmWayId: number
  mahallaNum?: string | null
  linkSource?: 'osm_name' | 'manual'
  /**
   * وسم `highway` الأصلي كما في OSM — **لا للتصنيف بل للعرض**.
   *
   * التصنيف عندنا خمسة أنواع (STR/SEC/TRC/LOC/ALY) وهذا صحيح عملياً: المشغّل
   * يريد شوارع وأزقة لا ٢٠ نوعاً. لكن **Overpass يلوّن بالوسم الأصلي**:
   * `service` أبيض رفيع · `footway` وردي متقطّع · `residential` أبيض.
   * فبلا هذا الحقل تُرسم كل الأزقة بلون واحد بينما Overpass يفرّقها ⇒
   * خريطتان مختلفتان رغم تطابق المسارات (docs/plans/map-import-shape-mismatch-diagnosis.md).
   *
   * اختياري: الصفوف القديمة في القاعدة لا تحمله، والواجهة تتراجع إلى `kind`.
   */
  osmHighway?: string
  /**
   * `true` لروابط الطرق عند تفعيل `includeLinks`: تُرسم للمقارنة البصرية
   * **ولا تُدرَج** في القاعدة ولا تُحسب في الكثافة ولا في الزيارات.
   */
  excludeFromImport?: boolean
  /**
   * أطول مسافة بين عقدتين متجاورتين (بالمتر).
   *
   * **لماذا يُحفظ في الصف:** هو المقياس الذي يحدّد إن كان الشكل المرسوم
   * يمثّل الشارع الحقيقي أم لا. فوق `SPARSE_SEGMENT_M` (١٥٠م) يكون
   * الخط المستقيم بديلاً مرئياً عن منحنٍ ⇒ «الشكل تقريبي».
   *
   * يُحسب في `assembleImport` لا في الواجهة: هو خاصية هندسية للبيانات،
   * وقد تحتاجه أي واجهة مستقبلاً (إحصاء، تصدير، تقارير جودة).
   */
  maxSegmentM?: number
}

export interface ImportMahalla {
  code: string
  osmNumber: string | null
  name: string
  boundaryState: 'open'
}

export interface SkippedItem {
  osmWayId: number
  name: string | null
  reason: string
}

export interface ImportPreview {
  rows: ImportRow[]
  mahallas: Record<string, ImportMahalla>
  /** العناصر التي لم تُدرج، وسبب كل واحد بلا اختصار */
  skipped: SkippedItem[]
  stats: {
    streets: number
    alleys: number
    mahallas: number
    totalLengthKm: number
    areaKm2: number
    density: number
    densityWarn: string | null
    unnamedAlleys: number
    /** أشواط داخل الزون لكن القصّ فشل — يلزم معرفتها */
    clipFallbacks: number
    /**
     * التباعد الهندسي — كم من الشبكة مرسومة بمقاطع أطول من العتبة.
     *
     * `km` و`pct` من **الطول** لا من عدد الصفوف: الطول هو ما يحدّد كيف تبدو
     * الخريطة. صفّ واحد طويل زاوٍ يفسد المنظر أكثر من عشرة قصار.
     */
    sparse: {
      /** عدد الصفوف التي فيها مقطع أطول من SPARSE_SEGMENT_M */
      rows: number
      /** طولها الكلي بالكيلومتر */
      km: number
      /** نسبتها من الطول الكلي (٠..١٠٠) */
      pct: number
      /** أطول مقطع في الملف كله — للسياق في التحذير */
      worstM: number
    }
  }
  zonePolygon: LatLng[]
}

export interface AssembleOptions {
  /** يُستدعى كل ~٢٠٠ شوط لإظهار تقدّم خلال التحليل */
  onProgress?: (done: number) => void
  signal?: AbortSignal
  /**
   * سقف الأشواط المقبولة (مرشّحات `highway`) قبل التوقف بخطأ صريح.
   *
   * **لماذا:** قياس على ملف صناعي ١٢٠ م.ب (٣٢٩ ألف شوط) ⇒ ذروة كومة ٩٧٤ م.ب.
   * على جهاز مشرف بـ٤ ج.ب قد ينهار التبويب بلا رسالة. الحدّ الافتراضي ١٢٠ ألف
   * يغطّي أكبر زون حقيقي (٨٠٠ شوط/كم² × ٤٠ كم² ≈ ٣٢ ألف) بثلاثة أضعاف،
   * ويوقف الملفات الشاذّة برسالة مفهومة بدل انهيار صامت.
   */
  maxRouteWays?: number
  /**
   * إظهار روابط الطرق (`*_link`) — **عرض فقط**.
   *
   * الافتراضي `false` = السلوك السابق بالحرف (تُسقط). عند `true` تُقرأ وتُرسم
   * بألوانها كي تُقارن بـOverpass، لكن `assembleImport` يضع عليها
   * `excludeFromImport: true` فلا تدخل القاعدة ولا الإحصاءات.
   */
  includeLinks?: boolean
}

/** السقف الافتراضي — مُقتبس من القياس أعلاه لا من التخمين */
export const DEFAULT_MAX_ROUTE_WAYS = 120_000

const UNASSIGNED_KEY = '__UNASSIGNED__'

/**
 * يبني المعاينة من أشواط OSM وعُقدها.
 * `lookupNode` يقرأ من الخريطة — نستخدم دالة لا الخريطة نفسها ليمكن
 * اختبار الحالات الحدّية (عقدة ناقصة) بلا بناء خريطة ضخمة.
 */
export function assembleImport(params: {
  ways: Iterable<OsmWay>
  lookupNode: (ref: number) => LatLng | undefined
  zonePolygon: LatLng[]
  opts?: AssembleOptions
}): ImportPreview {
  const { ways, lookupNode, zonePolygon, opts } = params
  const maxWays = opts?.maxRouteWays ?? DEFAULT_MAX_ROUTE_WAYS
  const skipped: SkippedItem[] = []
  let clipFallbacks = 0
  let processed = 0
  let routeWays = 0

  const poly = zonePolygon
  /**
   * فهرس ضلوع الحدود — يُبنى مرة واحدة ويُستخدم في كل شوط.
   * قبل هذا: كل شوط يمرّ على كل ضلع مرّتين (فحص اجتياز + قصّ) ⇒ O(n·m).
   */
  const edgeIndex: EdgeIndex = buildEdgeIndex(poly)
  const zlat0 = Math.min(...poly.map((p) => p[0]))
  const zlat1 = Math.max(...poly.map((p) => p[0]))
  const zlng0 = Math.min(...poly.map((p) => p[1]))
  const zlng1 = Math.max(...poly.map((p) => p[1]))

  interface Clipped {
    cls: ClassCode
    way: OsmWay
    pts: LatLng[]
  }
  const clipped: Clipped[] = []

  for (const way of ways) {
    if (opts?.signal?.aborted) throw new DOMException('أُلغيت المعالجة', 'AbortError')
    processed++
    if (processed % 200 === 0) opts?.onProgress?.(processed)

    const cls = classify(
      { highway: way.tags.highway, name: way.tags.name },
      { includeLinks: opts?.includeLinks },
    )
    if (cls === null) {
      /*
       * ⚠ هنا كان `continue` صامتاً — أسوأ أنواع الإسقاط.
       *
       * القياس على `export.osm`: ٢٣١ شوطاً يسقط في `classify`. روابط
       * `*_link` منها معروضة (`excludeFromImport`) فيراها المشغّل على
       * الخريطة. أما **٧٢ شوطاً رئيسياً** (٣٧ primary · ٢٦ secondary ·
       * ٦ trunk · ٣ tertiary) فأسماءُها منشآت — «ساحة الفتح»، «مجسر ملعب
       * الشعب»، «جسر 14 تموز» — كانت تختفي بلا ذكر. المشغّل يرى خريطته
       * أنقص مما في ملفه ولا يجد في التقرير ما يفسّر الفرق.
       *
       * الآن: تُسجَّل بوسمها واسمها وسبب الإسقاط. والروابط تُستثنى من
       * السجل لأنها **ليست مفقودة**: تُرسم وتُعرض. تسجيلها كان سيزيد
       * الضجيج ١٥٩ صفاً على ٧٢ مفيدة.
       */
      const isLink = way.tags.highway ? /_link$/.test(way.tags.highway) : false
      if (!isLink && way.tags.highway) {
        const word = nonStreetWord(way.tags.name)
        skipped.push({
          osmWayId: way.id,
          name: way.tags.name ?? null,
          reason: word
            ? `اسم منشأة لا شارع («${word}») — أُسقط عن قصد`
            : `وسم highway=${way.tags.highway} لا يقابله تصنيف لدينا — أُسقط`,
        })
      }
      continue
    }
    routeWays++
    if (routeWays > maxWays) {
      throw new Error(
        `MAP_TOO_MANY_WAYS: الملف يحوي أكثر من ${maxWays.toLocaleString('ar-IQ-u-nu-latn')} شوطاً — ` +
          `قسّمه أو ارفع السقف صراحةً. (حماية من نفاد الذاكرة على جهاز المشرف)`,
      )
    }

    // العقد بلا إحداثيات: لا تُخمَّن — الشوط يسقط بالسبب
    const coords: LatLng[] = []
    let missing = 0
    for (const ref of way.nodes) {
      const c = lookupNode(ref)
      if (c) coords.push(c)
      else missing++
    }
    if (coords.length < 2) {
      skipped.push({
        osmWayId: way.id,
        name: way.tags.name ?? null,
        reason: `عقد ناقصة في الملف (${missing} من ${way.nodes.length}) — لا يُخمَّن موقع`,
      })
      continue
    }
    /**
     * عقد ناقصة **جزئياً**: نُدرج ما يمكن رسمه، لكن لا نمرّ على الأمر بصمت.
     * ⚠ عيب أُصلح في الجولة ٩: كان الشوط يُقصّ على العقد الصالحة فقط بلا
     * إعلام أحد، فيظهر المشرف أمام خط أقصر من الحقيقة ولا يعرف لماذا.
     * (ملفات Overpass قد تُسقط عقداً عند حدود bbox — شائع لا نادر.)
     */
    if (missing > 0) {
      skipped.push({
        osmWayId: way.id,
        name: way.tags.name ?? null,
        reason: `عقد ناقصة (${missing} من ${way.nodes.length}) — رُسم الجزء الصالح فقط`,
      })
    }

    // تسريع: تخطَّ الأشواط البعيدة عن نطاق الزون قبل أي حساب
    let lat0 = Infinity
    let lat1 = -Infinity
    let lng0 = Infinity
    let lng1 = -Infinity
    for (const c of coords) {
      if (c[0] < lat0) lat0 = c[0]
      if (c[0] > lat1) lat1 = c[0]
      if (c[1] < lng0) lng0 = c[1]
      if (c[1] > lng1) lng1 = c[1]
    }
    if (lat1 < zlat0 || lat0 > zlat1 || lng1 < zlng0 || lng0 > zlng1) continue

    /**
     * هل للمسار صلة بالزون؟
     *
     * ⚠ عيب أُصلح في الجولة ٩: كان الفحص `coords.some(c => insideOrOnZone(c))`
     * فقط. فالطريق الذي يعبر الزون كاملاً بنقطتي عقد فقط **خارجهما جميعاً**
     * (شائع في OSM: عقدة عند التقاطع قبل الحدّ وأخرى بعده) كان يُسقط هنا
     * قبل أن يصل إلى `clipPath` ⇒ يضيع الطريق العابر بلا أثر.
     * الآن نقبل أيضاً: أي مقطع يجتاز ضلعاً من حدود الزون.
     */
    /**
     * ⚡ فحص الاجتياز يمرّ على الفهرس لا على كل ضلع: يكفي أن يُصادَف تقاطع واحد.
     * هذا يُلغي التكرار السابق (كان `pathCrossesPolygon` يفحص كل الأضلاع ثم
     * تُعيد `clipPath` الفحص نفسه من البداية).
     */
    let touchesZone = coords.some((c) => insideOrOnZone(c, poly))
    if (!touchesZone) {
      for (let i = 0; i < coords.length - 1 && !touchesZone; i++) {
        const a = coords[i]
        const b = coords[i + 1]
        if (a && b && segmentCrossings(a, b, edgeIndex).length > 0) touchesZone = true
      }
    }
    if (!touchesZone) continue

    const parts = clipPathIndexed(coords, edgeIndex)
    for (const part of parts) {
      const firstPt = part[0]
      const lastPt = part[part.length - 1]
      const endsOk =
        !!firstPt && !!lastPt && insideOrOnZone(firstPt, poly) && insideOrOnZone(lastPt, poly)
      if (endsOk) {
        clipped.push({ cls, way, pts: part })
      } else {
        skipped.push({
          osmWayId: way.id,
          name: way.tags.name ?? null,
          reason: 'طرف خارج الزون بعد القصّ — أُسقط',
        })
      }
    }
    if (parts.length === 0 && coords.some((c) => pointInPolygon(c, poly))) {
      clipFallbacks++
      skipped.push({
        osmWayId: way.id,
        name: way.tags.name ?? null,
        reason: 'داخل الزون ولم يُقصّ (حالة حدّية) — أُسقط',
      })
    }
  }

  // ② الأكواد: ترتيب ثابت (y ثم x) ⇒ تكرار آمن
  const sorted = [...clipped].sort((a, b) => {
    const ca = centroid(a.pts)
    const cb = centroid(b.pts)
    const ay = Math.round(ca[0] * 1e5) / 1e5
    const by = Math.round(cb[0] * 1e5) / 1e5
    if (ay !== by) return ay - by
    return Math.round(ca[1] * 1e5) / 1e5 - Math.round(cb[1] * 1e5) / 1e5
  })

  const counters: Partial<Record<ClassCode, number>> = {}
  const rows: ImportRow[] = sorted.map((row) => {
    const n = (counters[row.cls] ?? 0) + 1
    counters[row.cls] = n
    return {
      cls: row.cls,
      code: `${row.cls}-${String(n).padStart(4, '0')}`,
      kind: kindOf(row.cls),
      name: row.way.tags.name?.trim() || null,
      pts: row.pts.map((p) => [round7(p[0]), round7(p[1])] as LatLng),
      lengthM: round1(pathLengthM(row.pts)),
      widthM: DEFAULT_STREET_W,
      widthSource: 'default',
      osmWayId: row.way.id,
      mahallaNum: null,
      // الوسم الأصلي للعرض وحده — لا يغيّر `kind` ولا `cls` ولا أي حساب
      osmHighway: row.way.tags.highway,
      // أطول مقطع مستقيم — يقيس «التقريب» الهندسي لا عدد النقاط
      maxSegmentM: round1(longestSegmentM(row.pts)),
      // رابط طريق: يُعرض ولا يُستورد (يراه المشغّل ويفهم لماذا)
      ...(row.way.tags.highway && /_link$/.test(row.way.tags.highway)
        ? { excludeFromImport: true as const }
        : {}),
    }
  })

  // ③ المحلات من بادئات الأسماء
  const mahNumbers = new Set<string>()
  for (const r of rows) {
    if (!r.name) continue
    const m = mahallaOf(r.name)
    if (m) mahNumbers.add(m)
  }
  const mahallas: Record<string, ImportMahalla> = {}
  const sortedNums = [...mahNumbers].sort((a, b) => (a.length - b.length || a.localeCompare(b)))
  sortedNums.forEach((num, i) => {
    mahallas[num] = {
      code: `MHL-${String(i + 1).padStart(4, '0')}`,
      osmNumber: num,
      name: `محلة ${num}`,
      boundaryState: 'open',
    }
  })

  // ④ ربط الأزقة بمحلاتها من الاسم فقط
  let unnamedAlleys = 0
  for (const r of rows) {
    if (r.kind !== 'alley') continue
    const num = mahallaOf(r.name)
    if (num && mahallas[num]) {
      r.mahallaNum = num
      r.linkSource = 'osm_name'
    } else {
      r.mahallaNum = null
      r.linkSource = 'manual'
      unnamedAlleys++
    }
  }
  if (unnamedAlleys > 0) {
    mahallas[UNASSIGNED_KEY] = {
      code: 'MHL-0000',
      osmNumber: null,
      name: 'غير محدّدة — تحتاج ربطاً بمحلة',
      boundaryState: 'open',
    }
  }

  // ⑤ عرض الأزقة من المسافة إلى أقرب محور زقاق آخر
  //    O(n²) على الأزقة فقط؛ الزون الواحد ≈ ٤٠٠ زقاق ⇒ ١٦٠ ألف فحص، مقبول.
  //    للزونات الضخمة نستخدم عيّنة المحاور لتجنّب الانفجار — انظر أدناه.
  const alleys = rows.filter((r) => r.kind === 'alley')
  if (alleys.length > 0) {
    // عيّنة كثيفة كافية: كل محور زقاق يُقارَب بنقاطه، لكن نحدّ العدد لِـO(n·m)
    const MAX_AXES = alleys.length > 1200 ? 1200 : alleys.length
    const step = Math.max(1, Math.floor(alleys.length / MAX_AXES))
    const axes: LatLng[][] = []
    for (let i = 0; i < alleys.length; i += step) {
      const a = alleys[i]
      if (a) axes.push(a.pts)
    }

    for (const row of alleys) {
      const mid = row.pts[Math.floor(row.pts.length / 2)]
      if (!mid) continue
      let best = Infinity
      for (let a = 0; a < axes.length; a++) {
        if (axes[a] === row.pts) continue
        const pts = axes[a]
        if (!pts) continue
        for (let k = 0; k < pts.length - 1; k++) {
          const seg0 = pts[k]
          const seg1 = pts[k + 1]
          if (!seg0 || !seg1) continue
          const d = segDistanceM(mid, seg0, seg1)
          if (d < best) best = d
        }
      }
      if (Number.isFinite(best) && best > 2 * WALL_M + MIN_ALLEY_W) {
        row.widthM = round1(Math.min(MAX_ALLEY_W, Math.max(MIN_ALLEY_W, best - 2 * WALL_M)))
        row.widthSource = 'measured'
      } else {
        row.widthM = DEFAULT_ALLEY_W
        row.widthSource = 'default'
      }
    }
  } else {
    void DEFAULT_ALLEY_W
  }

  /*
   * ⑥ الإحصاء — **من الصفوف القابلة للاستيراد فقط**.
   *
   * روابط الطرق (`*_link` عند `includeLinks`) تُرسم للمقارنة البصرية ولا
   * تُدرَج في القاعدة. لو حسبناها في الكثافة لَظهر للمشغّل رقم أعلى من
   * الحقيقة (والمرجع ٢١.٣ كم/كم² مُعاير على الشوارع وحدها). فالإسقاط هنا
   * مقصود: الإحصاء يصف **ما سيُستورد** لا ما يُرسم.
   */
  const importableRows = rows.filter((r) => !r.excludeFromImport)
  const streets = importableRows.filter((r) => r.kind !== 'alley').length
  const totalLengthM = importableRows.reduce((s, r) => s + r.lengthM, 0)

  /*
   * التباعد: من الصفوف القابلة للاستيراد وحدها — الروابط لا تُدرَج فلا تهمّ
   * للجودة، وإحصاؤها كان سيُنذر المشغّل عن شكل لن يراه في البيانات.
   */
  const sparseRows = importableRows.filter((r) => (r.maxSegmentM ?? 0) > SPARSE_SEGMENT_M)
  const sparseLenM = sparseRows.reduce((s, r) => s + r.lengthM, 0)
  const { density, areaKm2, warn } = densitySanity(totalLengthM, poly)

  return {
    rows,
    mahallas,
    skipped,
    stats: {
      streets,
      // الأزقة من الصفوف القابلة للاستيراد — لا من `alleys` الكامل
      alleys: importableRows.filter((r) => r.kind === 'alley').length,
      mahallas: Object.keys(mahallas).filter((k) => k !== UNASSIGNED_KEY).length,
      totalLengthKm: Math.round((totalLengthM / 1000) * 10) / 10,
      areaKm2: Math.round(areaKm2 * 100) / 100,
      density: Math.round(density * 10) / 10,
      densityWarn: warn,
      unnamedAlleys,
      clipFallbacks,
      sparse: {
        rows: sparseRows.length,
        km: Math.round((sparseLenM / 1000) * 10) / 10,
        pct: totalLengthM > 0 ? Math.round((sparseLenM / totalLengthM) * 1000) / 10 : 0,
        worstM: Math.round(importableRows.reduce((m, r) => Math.max(m, r.maxSegmentM ?? 0), 0)),
      },
    },
    zonePolygon: poly,
  }
}

/**
 * هل يخترق المسار حدّ المضلّع؟ (مقطع واحد يكفي)
 * يكشف حالة الطريق العابر بعقدتين خارجيتين — التي كان الفحص السابق يُسقطها.
 */
export function pathCrossesPolygon(path: LatLng[], poly: LatLng[]): boolean {
  for (let i = 0; i < path.length - 1; i++) {
    const p = path[i]
    const q = path[i + 1]
    if (!p || !q) continue
    for (let k = 0; k < poly.length; k++) {
      const r = poly[k]
      const s = poly[(k + 1) % poly.length]
      if (r && s && segIntersectParams(p, q, r, s) !== null) {
        return true
      }
    }
  }
  return false
}

/** صيغة `path` التي تفهمها دوال app.map_* — [[lat,lng],…] بـ٧ منازل */
export function pathToJsonb(pts: LatLng[]): string {
  return `[${pts.map(([a, b]) => `[${a},${b}]`).join(',')}]`
}

export { polygonAreaM2, densitySanity, distM, nearestBoundaryM, BOUNDARY_TOL_M }
