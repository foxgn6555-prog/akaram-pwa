/**
 * تصنيف طرق OSM وعرضها وأرقام محلاتها — نقل أمين من `import-map-planning.py`.
 *
 * القاعدة الحاكمة: **لا تخمين**. ما لا نعرفه يبقى `null` ويُعلَن، ولا يُعطى
 * اسماً ولا عرضاً صناعياً بلا وسم صريح (`default` / `manual`).
 */

/** نوع الوسم `highway` → بادئة الكود */
const CLASS_LETTER: Record<string, ClassCode> = {
  motorway: 'STR',
  trunk: 'STR',
  primary: 'STR',
  secondary: 'SEC',
  tertiary: 'TRC',
}

/** طرق سكنية — تُصنَّف شارعاً محلياً إلا إن كان اسمها بصيغة رقم محلة */
const LOCAL_HIGHWAY = new Set([
  'residential',
  'unclassified',
  'living_street',
  'service',
  'road',
  'track',
  'pedestrian',
])

/** أزقة صريحة في OSM */
const ALLEY_HIGHWAY = new Set(['footway', 'path', 'alley', 'steps', 'corridor'])

export type ClassCode = 'STR' | 'SEC' | 'TRC' | 'LOC' | 'ALY'
export type StreetKind = 'primary' | 'secondary' | 'tertiary' | 'local'

const KIND_OF: Record<Exclude<ClassCode, 'ALY'>, StreetKind> = {
  STR: 'primary',
  SEC: 'secondary',
  TRC: 'tertiary',
  LOC: 'local',
}

/**
 * بادئات أسماء ليست شوارع: «ساحة» مضلّع مرور، و«مجسر/جسر/نفق» منشأ لا مسار.
 * وسمها `highway=primary` في OSM لا يجعلها شارعاً — والتصنيف الخاطئ يضخّم
 * الكثافة ويضلّل محرّك الزيارات (زيارات وهمية داخل ساحة).
 */
/**
 * ⚠ عيب أُصلح في الجولة ٩: القائمة كانت كلها بصيغة «كلمة + مسافة»، فاسم
 * مجرّد مثل «المجسر» أو «النفق» أو «الساحة» **لا يُطابق** شيئاً ⇒ يُقبل
 * شارعاً كاملاً. والأسماء المجرّدة شائعة فعلاً في OSM (منشأ بلا وصف).
 * الحل: نطابق الكلمة كلمةً كاملة (متبوعة بنهاية الاسم أو مسافة).
 */
const NON_STREET_WORDS = ['ساحة', 'مجسر', 'جسر', 'نفق'] as const

/**
 * روابط الطرق — `primary_link` وأخواتها.
 *
 * **ماذا تكون فعلياً:** منحدرات ومنعطفات توصّل طريقاً سريعاً بطريق آخر. ليست
 * شوارع مستقلة لها اسم ومحلة، لذلك تُسقط من الاستيراد عمداً منذ الجولة ٩
 * (تصنيفها كشارع يضخّم الكثافة ويولّد زيارات وهمية).
 *
 * **لكن Overpass يرسمها** بلون الطريق الذي تخدمه. فإسقاطها يجعل خريطتنا تبدو
 * أقل كثافة عند التقاطعات الكبرى — وهو جزء من «الشكل لا يطابق».
 *
 * الحلّ: `includeLinks` خيار **عرض فقط**. عند تفعيله تُقرأ وتُرسم بألوانها،
 * لكنها لا تدخل `map_streets` ولا تُحسب في الكثافة ولا في الزيارات. الفصل
 * بين «ما يُعرض» و«ما يُستورد» مقصود: المشغّل يتحقق بصرياً بلا تلويث البيانات.
 */
export const LINK_HIGHWAY_TAGS: readonly string[] = [
  'motorway_link',
  'trunk_link',
  'primary_link',
  'secondary_link',
  'tertiary_link',
]

/** وسوم `highway` المقبولة كبداية — تُستخدم لتصفية القراءة من الملف */
export const ROUTE_HIGHWAY_TAGS: readonly string[] = [
  ...Object.keys(CLASS_LETTER),
  ...LOCAL_HIGHWAY,
  ...ALLEY_HIGHWAY,
  ...LINK_HIGHWAY_TAGS,
]

/** روابط الطرق كما تُقرأ عند طلب `includeLinks` */
const LINK_SET = new Set(LINK_HIGHWAY_TAGS)

export interface ClassifyOptions {
  /**
   * إظهار روابط الطرق (`*_link`) للعرض وحده — لا تُدرج في القاعدة.
   * الافتراضي `false`: نفس السلوك السابق بالحرف.
   */
  includeLinks?: boolean
}

/**
 * هل الاسم بصيغة «رقم محلة-رقم زقاق»؟ (905-16)
 * النمط الوحيد الموثوق لاستخراج المحلة من الاسم — حدود OSM للمحلات مفتوحة.
 */
export function isMahallaNumbered(name: string | null | undefined): boolean {
  if (!name) return false
  const head = (name.split('-')[0] ?? '').trim()
  const rest = name.includes('-') ? (name.split('-')[1] ?? '').trim() : ''
  return /^\d+$/.test(head) && (head.length === 2 || head.length === 3 || head.length === 4) && /^\d+$/.test(rest)
}

/**
 * يستخرج رقم المحلة من اسم الزقاق. الأنماط المقبولة (كلها موجودة فعلياً):
 *   `905-16` → 905 · `زقاق 905-16` → 905 · `حارة 905-16` → 905
 */
export function mahallaOf(name: string | null | undefined): string | null {
  if (!name) return null
  const n = name.trim()
  if (isMahallaNumbered(n)) return (n.split('-')[0] ?? '').trim()
  const parts = n.split(/\s+/)
  if (parts.length >= 2) {
    const tail = parts[parts.length - 1]
    if (tail && isMahallaNumbered(tail)) return (tail.split('-')[0] ?? '').trim()
  }
  for (const w of parts) if (isMahallaNumbered(w)) return (w.split('-')[0] ?? '').trim()
  return null
}

export interface ClassifyInput {
  highway: string | undefined
  name: string | null | undefined
}

/**
 * يُرجع البادئة (STR/SEC/TRC/LOC/ALY) أو null لما لا نريده.
 * يقابل `classify` في السكربت المرجعي حرفياً.
 */
export function classify(way: ClassifyInput, opts?: ClassifyOptions): ClassCode | null {
  const hw = way.highway
  if (!hw) return null

  /*
   * روابط الطرق: تُسقط افتراضياً — سلوك الجولة ٩ بالحرف، لا تلويث للكثافة.
   *
   * عند `includeLinks` تُمنح فئة الطريق الذي تخدمه (primary_link ⇒ STR).
   * لماذا لا فئة خاصة: `kind` مشتقّ من `cls` ولا يوجد «نوع رابط» في نموذج
   * البيانات. والفئة الموروثة تجعل `kind` معقولاً لو رآه أحد، بينما **لون
   * العرض يأتي من `osmHighway`** لا من هنا. الاستثناء من الإدراج والإحصاء
   * يتمّ بـ`excludeFromImport`، لا بهذه الفئة.
   */
  if (LINK_SET.has(hw)) {
    if (!opts?.includeLinks) return null
    const base = hw.replace(/_link$/, '')
    const letter = CLASS_LETTER[base]
    return letter ?? 'LOC'
  }

  const direct = CLASS_LETTER[hw]
  if (direct) {
    if (way.name && isNonStreetName(way.name)) return null
    return direct
  }

  // روابط الطرق ليست مسارات مستقلة — تُسقط لتفادي التكرار
  if (hw === 'tertiary_link' || hw === 'primary_link' || hw === 'secondary_link') return null

  if (ALLEY_HIGHWAY.has(hw)) return 'ALY'

  if (LOCAL_HIGHWAY.has(hw)) {
    // أزقة سكنية ضيقة تُوسم residential؛ نفرّق بالاسم لا بالوسم
    if (isMahallaNumbered(way.name)) return 'ALY'
    return 'LOC'
  }

  return null
}

/**
 * هل الاسم لمنشأ لا لشارع؟ يطابق «ساحة»/«مجسر»/«جسر»/«نفق» بصيغتها
 * المعرّفة («الساحة»…) وكلمةً كاملة، مع أو بلا «ال» التعريف.
 */
export function isNonStreetName(name: string): boolean {
  const nm = name.trim()
  // أول كلمة، مع أو بلا «ال» التعريف
  const first = nm.split(/\s+/)[0] ?? ''
  const bare = first.startsWith('ال') ? first.slice(2) : first
  return (NON_STREET_WORDS as readonly string[]).includes(bare)
}

/** نوع الشارع المُخزَّن في `map_streets.kind` */
export function kindOf(cls: ClassCode): StreetKind | 'alley' {
  return cls === 'ALY' ? 'alley' : KIND_OF[cls]
}

/** الطول المتري ليُدرج `numeric(10,1)` — تقريب منزلة واحدة */
export const round1 = (n: number): number => Math.round(n * 10) / 10

/** تقريب ٧ منازل — دقة ~١سم، نفس ما يكتبه المستورد المرجعي */
export const round7 = (n: number): number => Math.round(n * 1e7) / 1e7
