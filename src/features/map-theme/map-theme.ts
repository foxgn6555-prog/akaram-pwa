/**
 * 00388 — وضع الخريطة الموحّد (نهاري/ليلي) لكل خرائط المنصة: الاختيار محفوظ في المتصفح ويُطبَّق على كل الخرائط.
 * الخلفية الداكنة مضمونة: سلسلة مزوّدين ثم OSM بفلتر CSS داكن (لا يفشل ما دام OSM يعمل).
 */
export type MapTheme = 'light' | 'dark'
export const MAP_THEME_KEY = 'akaram.map-theme'
export const MAP_THEME_EVENT = 'akaram:map-theme'

export interface TileProvider {
  id: string
  url: string
  attribution: string
  filter: boolean
  /** أقصى تكبير **تصريحاً** للمستخدم — سقف الخريطة نفسها */
  maxZoom: number
  /**
   * أقصى تكبير تملك له البلاطات **صوراً حقيقية**.
   *
   * **العيب الذي يُصلحه:** كان `MapTiles` يضبط `maxNativeZoom = maxZoom`،
   * فـEsri (`maxZoom: 16`) كانت **تُكبّر بلاطاتها** من ١٦ إلى ١٩ — هذا
   * سلوك Leaflet الصحيح حين لا يوجد بلاط أصلي، لكنه يعني أن الوضع الليلي
   * يفتح على ١٦ فقط بينما النهاري يفتح على ١٩. فالمشغّل لا يستطيع التكبير
   * للمقارنة التفصيلية بالليل، مع أن الخريطتين تعرضان **نفس البيانات**.
   *
   * الحلّ: نفصل المفهومين. `maxZoom` = ١٩ دائماً (سقف واحد للوضعين)،
   * و`maxNativeZoom` يُعلن هنا صراحةً (١٦ لـEsri) فيُكبّر Leaflet الصورة
   * بسلاسة بدل منع المستخدم. النتيجة: نفس سقف التكبير في الوضعين، والفارق
   * الوحيد أن بلاطات Esri تبدأ بالتحسّب (blur) فوق ١٦ — وهذا صادق.
   */
  maxNativeZoom: number
}
/**
 * بلاطات الوضع الليلي — **OSM أولاً دائماً، وEsri تراجع**.
 *
 * ## العيب الذي رآه المشغّل (لقطة شاشة، ٢٠٢٦-١١)
 *
 * النهاري يعرض شبكة شوارع كاملة بأسمائها (٩٥٨-٢٩ · ٩٠٦-٤٢ · ٩٠٤-٨ …)،
 * والليلي عرض **خطوطاً رمادية صمّاء بلا أسماء ولا تفاصيل**. ووصف المشغّل
 * الفرق بأن «التخطيط يختلف».
 *
 * ## الجذر: خدمة خلفية ظُنّت خريطة
 *
 * `esri-dark` = `World_Dark_Gray_Base`، وهي **خدمة خلفية** أسموتية: أرضية
 * وماء وحدود إدارية. **لا طبقة طرق فيها إطلاقاً** — فلو بحثت فيها عن شارع
 * لن تجده حتى لو كان في OSM. وكانت **أول** عنصر في السلسلة، فتُستعمل أولاً.
 *
 * ## لماذا هذا الثابت لا `DARK_TILES`
 *
 * كان `MapTiles` يقرأ `DARK_TILES` ويقلبها عند `preferOsmDark`:
 *
 *     const darkProviders = preferOsmDark ? [...DARK_TILES].reverse() : DARK_TILES
 *
 * أي أن **سلوك الشاشة يتحدّد بترتيب مصفوفة**. فتبديل الترتيب يُصلح شاشة
 * ويكسر أخرى — وهو بالضبط ما وقع: ٩ اختبارات كشفت أن شاشتين تعكسان.
 * الاعتماد على الترتيب هشّ بطبيعته.
 *
 * الحلّ: `MAP_DARK_PRIMARY` هو **المصدر الوحيد للحقيقة** (OSM المفلتر)،
 * و`MAP_DARK_FALLBACKS` هي البدائل المرتّبة. لا `reverse()` ولا اعتماد على
 * ترتيب. `preferOsmDark` لم يبقَ له معنى — OSM أولاً في كل الشاشات.
 */
export const MAP_DARK_PRIMARY: TileProvider = {
  id: 'osm-filtered',
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; OpenStreetMap contributors',
  filter: true,
  maxZoom: 19,
  maxNativeZoom: 19,
}

/**
 * بدائل الوضع الليلي — تُستخدم فقط عند فشل `MAP_DARK_PRIMARY` (٣ أخطاء بلاط).
 *
 * Esri **أدنى جودة للمقارنة**: بلا أسماء شوارع. لكنها أفضل من شاشة فارغة،
 * ووصفها في `attribution` صريح كي لا يظنّ أحد أنه يرى OSM.
 */
export const MAP_DARK_FALLBACKS: readonly TileProvider[] = [
  {
    id: 'esri-dark',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, HERE, Garmin, OpenStreetMap — خلفية بلا أسماء شوارع',
    filter: false,
    maxZoom: 19,
    maxNativeZoom: 16,
  },
]

/**
 * السلسلة الكاملة للوضع الليلي — الاحتياطي متاح للعرض والاختبار.
 * الترتيب هنا **ليس** عقداً سلوكياً: `MapTiles` يقرأ PRIMARY وFALLBACKS صراحةً.
 */
export const DARK_TILES: readonly TileProvider[] = [MAP_DARK_PRIMARY, ...MAP_DARK_FALLBACKS]

export const LIGHT_TILES: TileProvider = { id: 'osm', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors', filter: false, maxZoom: 19, maxNativeZoom: 19 }

/**
 * سقف التكبير الموحّد لكل الخرائط في المنصة.
 *
 * يُقرأ في كل خريطة تحمل `MapTiles` لتضبط `MapContainer.maxZoom` بنفس
 * الرقم — وإلا بقي الفرق: Leaflet يقبل التكبير حتى ١٩ افتراضياً، لكن
 * الخريطة الأب قد تحدّه. رقم واحد يمنع انحرافاً بين شاشة وأخرى.
 */
export const MAP_MAX_ZOOM = 19
export const TILE_ERRORS_BEFORE_FALLBACK = 3

export function readMapTheme(fallback: MapTheme = 'light'): MapTheme {
  try { const v = localStorage.getItem(MAP_THEME_KEY); return v === 'dark' || v === 'light' ? v : fallback } catch { return fallback }
}
export function writeMapTheme(t: MapTheme): void {
  try { localStorage.setItem(MAP_THEME_KEY, t) } catch { /* خاص/ممتلئ */ }
  try { window.dispatchEvent(new CustomEvent(MAP_THEME_EVENT, { detail: t })) } catch { /* بيئة بلا window */ }
}

/**
 * لون حدّ الزون على الخريطة بحسب الوضع.
 *
 * **العيب:** كان `#0b3d6b` (كحلي داكن) ثابتاً في الشاشتين. تباينه مع
 * أرضية osm-carto الفاتحة (`#f2efe9`) جيد (≈9.7:1)، ومع خلفية Esri
 * الداكنة (`#060b18`) **١.٨:١ فقط** — أي أن حدّ الزون يكاد يختفي بالليل،
 * وهو المرجع البصري الذي يقيس عليه المشغّل عند الاستيراد.
 *
 * الحلّ: لونان متباينان، لكل وضع لونه — لا تخفيف شفافية ولا ظلّ:
 *   نهاري  `#0b3d6b`  (هوية المنصة، تباين ≈9.7:1)
 *   ليلي   `#7dd3fc`  (سماوي فاتح، تباين ≈9.4:1 على #060b18)
 */
export const MAP_ZONE_BORDER = {
  light: '#0b3d6b',
  dark: '#7dd3fc',
} as const

/** لون حدّ الزون للوضع الحالي — نقطة واحدة تحكم الشاشتين */
export function zoneBorderColor(theme: MapTheme): string {
  return theme === 'dark' ? MAP_ZONE_BORDER.dark : MAP_ZONE_BORDER.light
}

/** لوحة ألوان واجهة الخريطة (الأزرار/وسيلة الإيضاح) بحسب الوضع */
export const MAP_UI = {
  light: { panel: 'border-white/60 bg-white/95 text-slate-900', chip: 'bg-slate-100 text-slate-700', chipOn: 'bg-slate-950 text-white', legend: 'bg-white/95 text-slate-800 border-slate-200', container: 'bg-slate-100' },
  dark: { panel: 'border-white/10 bg-slate-900/85 text-white backdrop-blur-md', chip: 'bg-white/10 text-white hover:bg-white/20', chipOn: 'bg-emerald-600 text-white', legend: 'bg-slate-900/85 text-white border-white/10 backdrop-blur-md', container: 'bg-slate-950' },
} as const

/** CSS مشترك: الفلتر الداكن وخلفية الحاوية */
export const MAP_THEME_CSS = `
.akaram-map-dark[data-tiles="esri-dark"] .leaflet-tile-pane { filter: brightness(1.08) contrast(1.12) saturate(.9); }
.akaram-tiles-filtered .leaflet-tile-pane { filter: invert(1) hue-rotate(195deg) brightness(1.1) contrast(.9) saturate(.45); }
.akaram-map-dark .leaflet-container { background: #060b18; }
.akaram-map-light .leaflet-container { background: #e5e7eb; }
.akaram-map-dark .leaflet-control-zoom a { background: #0f172a; color: #fff; border-color: rgba(255,255,255,.15); }
.akaram-map-dark .leaflet-control-attribution { background: rgba(15,23,42,.8); color: #94a3b8; }
.akaram-map-dark .leaflet-control-attribution a { color: #7dd3fc; }
`
