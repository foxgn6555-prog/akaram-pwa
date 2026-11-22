/**
 * ألوان OSM القياسية — مطابقة بصرية لطبقة Overpass Turbo الافتراضية.
 *
 * ── لماذا هذا الملف ──────────────────────────────────────────────────────
 * القياس (docs/plans/map-import-shape-mismatch-diagnosis.md، السبب ②):
 * المسارات متطابقة تقريباً، لكن **الألوان والسماكات مختلفة تماماً**:
 *
 *   عندنا (قبل)        OSM القياسي
 *   primary  #dc2626   #fcd6a4  (خوخي فاتح)
 *   secondary #ea580c  #f7fabf  (أصفر فاتح)
 *   tertiary #ca8a04   #ffffff  (أبيض)
 *   local    #0d9488   #ffffff  (أبيض)
 *   alley    #7c3aed   #ffffff / #fa8072 (حسب الوسم)
 *
 * ألواننا صالبة داكنة وألوان OSM فاتحة جداً ⇒ العين تقرأ الأولى خطوطاً ثقيلة
 * والثانية شبكة ناعمة، فتظنّ الخريطتين مختلفتين. هذا الملف يُلغي الاختلاف.
 *
 * ── المصدر (مُتحقَّق منه، لا محفوظ من الذاكرة) ────────────────────────────
 * `github.com/gravitystorm/openstreetmap-carto`:
 *   · `style/road-colors-generated.mss` — fill/casing للطرق السريعة:
 *     motorway #e892a2/#dc2a67 · trunk #f9b29c/#c84e2f ·
 *     primary #fcd6a4/#a06b00 · secondary #f7fabf/#707d05
 *   · `style/roads.mss` — الباقي:
 *     tertiary #ffffff/#8f8f8f · residential #ffffff/#bbb ·
 *     service #ffffff (casing @residential) · living_street #ededed ·
 *     pedestrian #dddde8/#999 · road #ddd · track #996600 (casing أبيض) ·
 *     footway/steps salmon (#fa8072) بلا casing مرئي
 *
 * **لماذا casing إلزامي:** الشارع المحلي أبيض على خلفية #f2efe9 الفاتحة.
 * بلاه يصبح غير مرئي — وهو ما ظهر فعلياً في أول رسم للمعاينة (خريطة شبه
 * فارغة). OSM يرسم إطاراً رمادياً تحت الأبيض فيُرى الطريق.
 *
 * ── القاعدة ──────────────────────────────────────────────────────────────
 * دالة نقية بلا React وبلا Leaflet: تُختبر وحدها وتُستخدم في العرض.
 */

/** نمط رسم مسار */
export interface OsmStroke {
  /** لون CSS — من لوحة osm-carto */
  color: string
  /** سماكة بالبكسل — تُنقص عند التصغير لتفادي التلاصق */
  weight: number
  /** نمط التقطيع (SVG dasharray) أو undefined للصلب */
  dashArray?: string
  /** الشفافية — 1 لمعظم الطرق، أقل للممرات */
  opacity: number
  /**
   * الإطار الخارجي (casing) — يُرسم **تحت** الخط بسماكة أكبر.
   *
   * لماذا لا مفرّ منه: في osm-carto الشارع المحلي أبيض (`#ffffff`) وخلفية
   * الخريطة فاتحة أيضاً. بلاه يصبح الخط غير مرئي تقريباً — وهو ما ظهر فعلياً
   * عند رسم المعاينة قبل إضافته. OSM يرسم إطاراً رمادياً رفيعاً تحت الأبيض
   * فيُرى الطريق ويظهر «محدَّداً» كما يعرفه المستخدم.
   *
   * `weight` هنا سماكة الإطار الكلية (أكبر من سماكة الخط ببكسل واحد عادة).
   */
  casing?: { color: string; weight: number }
}

/**
 * لوحة osm-carto — أسماء الوسوم كما هي في OSM، لا كما في تصنيفنا.
 *
 * الترتيب من الأثقل إلى الأخفّ. أي وسم غير مذكور يأخذ `DEFAULT_STROKE`.
 */
const OSM_PALETTE: Readonly<Record<string, OsmStroke>> = {
  // ── الطرق السريعة ──
  motorway: { color: '#e892a2', weight: 4, opacity: 1, casing: { color: '#dc2a67', weight: 5.5 } },
  motorway_link: { color: '#e892a2', weight: 3, opacity: 1, casing: { color: '#dc2a67', weight: 4.5 } },
  trunk: { color: '#f9b29c', weight: 3.5, opacity: 1, casing: { color: '#c84e2f', weight: 5 } },
  trunk_link: { color: '#f9b29c', weight: 2.5, opacity: 1, casing: { color: '#c84e2f', weight: 4 } },

  // ── الطرق الرئيسية ──
  primary: { color: '#fcd6a4', weight: 3.5, opacity: 1, casing: { color: '#a06b00', weight: 5 } },
  primary_link: { color: '#fcd6a4', weight: 2.5, opacity: 1, casing: { color: '#a06b00', weight: 4 } },
  secondary: { color: '#f7fabf', weight: 3, opacity: 1, casing: { color: '#707d05', weight: 4.5 } },
  secondary_link: { color: '#f7fabf', weight: 2.5, opacity: 1, casing: { color: '#707d05', weight: 4 } },
  tertiary: { color: '#ffffff', weight: 2.5, opacity: 1, casing: { color: '#8f8f8f', weight: 4 } },
  tertiary_link: { color: '#ffffff', weight: 2, opacity: 1, casing: { color: '#8f8f8f', weight: 3.5 } },

  // ── الطرق المحلية (بيضاء في OSM) ──
  residential: { color: '#ffffff', weight: 2, opacity: 1, casing: { color: '#bbb', weight: 3.2 } },
  unclassified: { color: '#ffffff', weight: 2, opacity: 1, casing: { color: '#bbb', weight: 3.2 } },
  living_street: { color: '#ededed', weight: 2, opacity: 1, casing: { color: '#bbb', weight: 3.2 } },
  road: { color: '#ffffff', weight: 2, opacity: 1, casing: { color: '#bbb', weight: 3.2 } },
  pedestrian: { color: '#dddde8', weight: 2, opacity: 1, casing: { color: '#999', weight: 3.2 } },
  track: { color: '#996600', weight: 1.5, opacity: 0.9, casing: { color: '#ffffff', weight: 2.5 } },

  // ── الممرات والخدمات (رفيعة) ──
  service: { color: '#ffffff', weight: 1.2, opacity: 0.95, casing: { color: '#bbb', weight: 2.2 } },

  // ── ممرات المشاة: وردية متقطّعة في osm-carto ──
  footway: { color: '#fa8072', weight: 1.2, opacity: 0.95, dashArray: '3 3' },
  path: { color: '#fa8072', weight: 1.2, opacity: 0.9, dashArray: '3 3' },
  corridor: { color: '#fa8072', weight: 1.2, opacity: 0.9, dashArray: '3 3' },
  steps: { color: '#fa8072', weight: 1.4, opacity: 0.95, dashArray: '2 2' },
  alley: { color: '#fa8072', weight: 1.2, opacity: 0.9, dashArray: '3 3' },
}

/** ما لا نعرفه يُرسم رفيعاً محايداً بدل الاختفاء */
const DEFAULT_STROKE: OsmStroke = { color: '#bfbfbf', weight: 1.2, opacity: 0.9 }

/**
 * يختار شكل الرسم لصف استيراد.
 *
 * الأولوية: `osmHighway` (الوسم الأصلي) ← ثم `kind` (تصنيفنا) ← ثم محايد.
 *
 * السبب: تصنيفنا يجمع `residential` و`service` و`footway` و`steps` في «زقاق»
 * واحد. لو رسمنا بـ`kind` لأصبحت كلها لوناً واحداً — وهو **بالضبط** الاختلاف
 * البصري مع Overpass. الوسم الأصلي هو المرجع.
 */
export function osmStrokeFor(row: {
  osmHighway?: string | null
  kind?: string | null
}): OsmStroke {
  const hw = row.osmHighway?.trim()
  if (hw && OSM_PALETTE[hw]) return OSM_PALETTE[hw]!

  // الوسم غير المذكور (construction، raceway…): تصنيفنا أصدق من لا شيء
  if (row.kind) {
    const byKind = KIND_FALLBACK[row.kind]
    if (byKind) return byKind
  }
  return DEFAULT_STROKE
}

/**
 * تراجع عندما لا يحمل الصف `osmHighway` (صفوف قديمة، أو مصدر غير OSM).
 * يربط تصنيفنا الخمسة بأقرب مقابل في لوحة osm-carto.
 */
const KIND_FALLBACK: Readonly<Record<string, OsmStroke>> = {
  primary: OSM_PALETTE.primary!,
  secondary: OSM_PALETTE.secondary!,
  tertiary: OSM_PALETTE.tertiary!,
  local: OSM_PALETTE.residential!,
  // الزقاق: لا نعرف هل كان service أم footway ⇒ الأفتح والأخفّ
  alley: OSM_PALETTE.service!,
}

/** هل يملك الصف شكلاً مطابقاً لوسمه الأصلي؟ (للتقرير في الواجهة) */
export function hasOsmMatch(row: { osmHighway?: string | null }): boolean {
  const hw = row.osmHighway?.trim()
  return !!hw && hw in OSM_PALETTE
}

/**
 * لوحة المنصة السابقة — تبقى لمن يفضّلها (زر «نمط المنصة»).
 * نفس القيم القديمة حرفياً كي لا يتغيّر شيء لمن اختارها.
 */
export const BRAND_PALETTE = {
  primary: '#dc2626',
  secondary: '#ea580c',
  tertiary: '#ca8a04',
  local: '#0d9488',
  alley: '#7c3aed',
} as const

/** شكل رسم بنمط المنصة (السماكات القديمة: ٣ للشوارع، ٢ للأزقة) */
export function brandStrokeFor(row: { kind?: string | null }): OsmStroke {
  const k = row.kind ?? 'local'
  const color = (BRAND_PALETTE as Record<string, string>)[k] ?? BRAND_PALETTE.local
  return {
    color,
    weight: k === 'alley' ? 2 : 3,
    opacity: 0.9,
  }
}

/** نمط العرض المختار للمعاينة */
export type PreviewStyle = 'overpass' | 'brand'

/** يُرجع الشكل حسب النمط — نقطة واحدة تحكم كل الرسم */
export function strokeFor(
  style: PreviewStyle,
  row: { osmHighway?: string | null; kind?: string | null },
  /**
   * خلفية الخريطة الحالية.
   *
   * **لماذا يهمّ:** لوحة osm-carto مُعايَرة على أرضية `#f2efe9` فاتحة —
   * الشوارع المحلية فيها **بيضاء**. على البلاطات الداكنة تصبح الشوارع
   * البيضاء غير مرئية تماماً (وكذلك casing الرمادي). فحين تكون الخلفية
   * داكنة نُبدّل الطرفين: الأرضية داكنة والخطوط فاتحة — نفس التمييز
   * والتباين، معكوس الإضاءة. هذا ليس «نمطاً آخر»، بل نفس اللوحة في وضع ليلي.
   *
   * نمط `brand` لا يتأثر: ألوانه صالبة مقروءة على الخلفيتين.
   */
  theme: 'light' | 'dark' = 'light',
): OsmStroke {
  if (style !== 'overpass') return brandStrokeFor(row)

  const base = osmStrokeFor(row)
  if (theme === 'light') return base

  // ── وضع ليلي: نعكس الإضاءة مع الحفاظ على تمييز الأصناف ──
  const NIGHT: Record<string, OsmStroke> = {
    // الطرق السريعة: ألوان osm-carto الفعلية مقروءة على الداكن — نُغمّق قليلاً
    motorway: { color: '#b8546a', weight: 4, opacity: 1, casing: { color: '#4a1a28', weight: 5.5 } },
    trunk: { color: '#c4705c', weight: 3.5, opacity: 1, casing: { color: '#4a2a20', weight: 5 } },
    primary: { color: '#c98a52', weight: 3.5, opacity: 1, casing: { color: '#3d2a00', weight: 5 } },
    secondary: { color: '#b8bb6a', weight: 3, opacity: 1, casing: { color: '#2d3300', weight: 4.5 } },
    // الشوارع العادية: كانت بيضاء ⇒ تصبح رمادية فاتحة مرئية على الداكن
    tertiary: { color: '#d4d4d4', weight: 2.5, opacity: 1, casing: { color: '#6a6a6a', weight: 4 } },
    residential: { color: '#c8c8c8', weight: 2, opacity: 1, casing: { color: '#5c5c5c', weight: 3.2 } },
    unclassified: { color: '#c8c8c8', weight: 2, opacity: 1, casing: { color: '#5c5c5c', weight: 3.2 } },
    living_street: { color: '#bdbdbd', weight: 2, opacity: 1, casing: { color: '#5c5c5c', weight: 3.2 } },
    pedestrian: { color: '#b0b0c8', weight: 2, opacity: 1, casing: { color: '#55556a', weight: 3.2 } },
    road: { color: '#c0c0c0', weight: 2, opacity: 1, casing: { color: '#5c5c5c', weight: 3.2 } },
    service: { color: '#b4b4b4', weight: 1.2, opacity: 0.95, casing: { color: '#4f4f4f', weight: 2.2 } },
    track: { color: '#8a5c1e', weight: 1.5, opacity: 0.9, casing: { color: '#3a2a10', weight: 2.5 } },
    // الممرات: الوردي الفاتح غير مقروء على الداكن ⇒ وردي مُشبع
    footway: { color: '#e06c5c', weight: 1.2, opacity: 0.95, dashArray: '3 3' },
    path: { color: '#e06c5c', weight: 1.2, opacity: 0.95, dashArray: '3 3' },
    corridor: { color: '#e06c5c', weight: 1.2, opacity: 0.95, dashArray: '3 3' },
    alley: { color: '#e06c5c', weight: 1.2, opacity: 0.9, dashArray: '3 3' },
    steps: { color: '#e06c5c', weight: 1.4, opacity: 0.95, dashArray: '2 2' },
  }

  // الروابط ترث صنف أصلها
  const hw = (row.osmHighway ?? '').replace(/_link$/, '')
  const night = NIGHT[hw]
  if (!night) {
    // مجهول: نُبقي القاعدة لكن نُفتّحها كي تُرى
    return { ...base, color: '#9a9a9a', opacity: Math.min(base.opacity, 0.9) }
  }
  // الروابط أنحف من أصلها بدرجة
  if (/_link$/.test(row.osmHighway ?? '')) {
    return {
      ...night,
      weight: Math.max(1, night.weight - 0.5),
      casing: night.casing ? { ...night.casing, weight: Math.max(1, night.casing.weight - 0.5) } : undefined,
    }
  }
  return night
}

/**
 * يحوّل `OsmStroke` إلى خيارات `Leaflet.Polyline` وحدها.
 *
 * **لماذا دالة لا تمرير مباشر:** `casing` حقل لنا لا يعرفه Leaflet، وتمريره
 * ضمن `pathOptions` يعني حقن مفتاح غريب في `options` الطبقة — لا يكسر اليوم
 * لكنه يعتمد على تسامح Leaflet، ويُصعّب تتبّع أي خطأ لاحق. الدالة تُبقي
 * العقد صريحاً: ما يراه Leaflet معلوم ومحدود.
 */
export function leafletPath(stroke: OsmStroke): {
  color: string
  weight: number
  opacity: number
  dashArray?: string
} {
  return {
    color: stroke.color,
    weight: stroke.weight,
    opacity: stroke.opacity,
    ...(stroke.dashArray ? { dashArray: stroke.dashArray } : {}),
  }
}
