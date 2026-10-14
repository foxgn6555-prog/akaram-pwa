/**
 * أغلفة تقارير الشكاوى — تعريف مشترك بين المعاينة المرئية في المتصفح ومولّد
 * PowerPoint (متصفح + دالة الحافة) حتى يخرج الملف مطابقاً للمعاينة حرفياً.
 *
 * - `official`: التصميم الرسمي الحالي (إطار أبيض بلون الهوية وشعارات حية).
 * - `k1..k6`: ملصقات المستخدم بعد تفريغ منطقة النصوص؛ الشعارات مطبوعة داخل
 *   الصورة والنصوص كلها حية وقابلة للتعديل لكل تقرير.
 *
 * الملف خالٍ من React وواجهات المتصفح ليعمل في Deno أيضاً.
 */

export type ComplaintCoverId = 'official' | 'k1' | 'k2' | 'k3' | 'k4' | 'k5' | 'k6'
export type CoverDigits = 'latin' | 'arabic'

export interface ComplaintCoverPalette {
  /** اللون الرئيسي (ترويسات الجدول، أشرطة الصور، العناوين). */
  primary: string
  /** لون التمييز الذهبي (الخطوط الفاصلة، الزوايا المائلة). */
  gold: string
  /** لون النصوص الداكنة فوق الغلاف. */
  ink: string
  /** لون سطر القاطع على الغلاف. */
  sector: string
}

export interface ComplaintCoverDef {
  id: ComplaintCoverId
  title: string
  /** اسم ملف الخلفية داخل `public/report-assets/complaints-covers/` (null = التصميم الرسمي بلا صورة). */
  bg: string | null
  palette: ComplaintCoverPalette
  /** منطقة النص المفرّغة كنِسب من ارتفاع الشريحة (أعلى/أسفل) وعرضها (يسار/يمين). */
  zone: { top: number; bottom: number; left: number; right: number }
}

export const COMPLAINT_COVER_ASSET_DIR = '/report-assets/complaints-covers'

const navy: ComplaintCoverPalette = { primary: '#0D2C4F', gold: '#C9A24A', ink: '#0B1F36', sector: '#B3261E' }
const green: ComplaintCoverPalette = { primary: '#0F4C45', gold: '#C9A24A', ink: '#0B2B27', sector: '#B3261E' }

/** الأغلفة المتاحة — ترتيب العرض في الإعدادات ومحرر التقرير. */
export const COMPLAINT_COVERS: ComplaintCoverDef[] = [
  { id: 'official', title: 'التصميم الرسمي (إطار بلون الهوية)', bg: null, palette: { primary: '#CF63C6', gold: '#CF63C6', ink: '#111111', sector: '#111111' }, zone: { top: 0.3, bottom: 0.8, left: 0.1, right: 0.9 } },
  { id: 'k1', title: 'نصب الحرية — فاتح كحلي/ذهبي', bg: 'k1.jpg', palette: navy, zone: { top: 0.31, bottom: 0.79, left: 0.2, right: 0.8 } },
  { id: 'k2', title: 'نصب الحرية — إطار ذهبي منحنٍ', bg: 'k2.jpg', palette: navy, zone: { top: 0.31, bottom: 0.8, left: 0.2, right: 0.8 } },
  { id: 'k3', title: 'دجلة — أخضر/ذهبي', bg: 'k3.jpg', palette: green, zone: { top: 0.31, bottom: 0.77, left: 0.2, right: 0.8 } },
  { id: 'k4', title: 'دجلة — كحلي/ذهبي (غروب)', bg: 'k4.jpg', palette: navy, zone: { top: 0.31, bottom: 0.77, left: 0.2, right: 0.8 } },
  { id: 'k5', title: 'نصب الشهيد والعلم', bg: 'k5.jpg', palette: navy, zone: { top: 0.3, bottom: 0.74, left: 0.2, right: 0.8 } },
  { id: 'k6', title: 'المئذنة والجسر — غروب', bg: 'k6.jpg', palette: navy, zone: { top: 0.28, bottom: 0.69, left: 0.2, right: 0.8 } },
]

export const DEFAULT_COVER_TITLE = 'تقرير معالجة التلكؤات ليوم'
export const DEFAULT_CONTRACTOR_LINE = 'تحالف شركات جزيرة الأكارم وفيرست ترايد'
export const DEFAULT_SLOGAN = 'معاً.. لمدينة أجمل'

export const isCoverId = (value: unknown): value is ComplaintCoverId =>
  COMPLAINT_COVERS.some(cover => cover.id === value)

/** يرجع تعريف الغلاف المحفوظ في `layout.cover` أو الرسمي عند غياب القيمة. */
export const coverFor = (layout: Record<string, unknown>): ComplaintCoverDef =>
  COMPLAINT_COVERS.find(cover => cover.id === layout.cover) ?? COMPLAINT_COVERS[0]!

/** مسار صورة الخلفية في المتصفح (null للتصميم الرسمي). */
export const coverBackgroundUrl = (cover: ComplaintCoverDef) =>
  cover.bg ? `${COMPLAINT_COVER_ASSET_DIR}/${cover.bg}` : null

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'
export const toArabicDigits = (value: string) => value.replace(/[0-9]/g, digit => ARABIC_DIGITS[Number(digit)] ?? digit)

export const coverDigits = (layout: Record<string, unknown>): CoverDigits =>
  layout.coverDateDigits === 'arabic' ? 'arabic' : 'latin'

/**
 * سطر التاريخ على الغلاف كما في الملصقات: «التاريخ : 2026/10/2» (دون أصفار بادئة)
 * مع إمكانية الأرقام العربية حسب اختيار التقرير.
 */
export function formatCoverDate(reportDate: string, digits: CoverDigits): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(reportDate)
  const plain = match ? `${match[1]}/${Number(match[2])}/${Number(match[3])}` : reportDate
  const text = `التاريخ : ${plain}`
  return digits === 'arabic' ? toArabicDigits(text) : text
}

export const sectorLabelFor = (sector: string) => (sector === 'karrada' ? 'قاطع الكرادة' : 'قاطع الزعفرانية')

export const authorityLineFor = (layout: Record<string, unknown>, sector: string) => {
  const configured = String(layout.authorityLine ?? '')
  return !configured || configured === 'أمانة بغداد / دائرة بلدية الكرادة'
    ? `أمانة بغداد / دائرة بلدية ${sector === 'karrada' ? 'الكرادة' : 'الزعفرانية'}`
    : configured
}

export interface CoverTexts {
  authorityLine: string
  contractorLine: string
  title: string
  dateLine: string
  sectorLine: string
  slogan: string
}

const text = (layout: Record<string, unknown>, key: string, fallback: string) => {
  const value = layout[key]
  return typeof value === 'string' && value.trim() ? value : fallback
}

/**
 * النصوص الحية الست على الغلاف: الافتراضيات من بيانات التقرير، وكل سطر قابل
 * للتجاوز من تخطيط التقرير (`layout.*`). نص فارغ صراحةً يعني إخفاء السطر.
 */
export function coverTexts(layout: Record<string, unknown>, context: { sector: string; reportDate: string }): CoverTexts {
  return {
    authorityLine: authorityLineFor(layout, context.sector),
    contractorLine: text(layout, 'contractorLine', DEFAULT_CONTRACTOR_LINE),
    title: text(layout, 'title', DEFAULT_COVER_TITLE),
    dateLine: typeof layout.coverDateText === 'string' && layout.coverDateText.trim() ? layout.coverDateText : formatCoverDate(context.reportDate, coverDigits(layout)),
    sectorLine: text(layout, 'coverSectorLine', sectorLabelFor(context.sector)),
    slogan: layout.coverSlogan === '' ? '' : text(layout, 'coverSlogan', DEFAULT_SLOGAN),
  }
}

export interface ReportTheme {
  cover: ComplaintCoverDef
  /** لون الترويسات والعناوين (سداسي مع #). */
  primary: string
  gold: string
  ink: string
  sector: string
  /** هل الصفحات الداخلية تأخذ لمسات الملصق (زاوية مائلة + خط ذهبي)؟ */
  styled: boolean
}

/** سمة الصفحات الداخلية: الرسمي يتبع `layout.accent`، والملصقات تفرض لوحتها. */
export function reportTheme(layout: Record<string, unknown>): ReportTheme {
  const cover = coverFor(layout)
  if (cover.id === 'official') {
    const accent = /^#[0-9a-fA-F]{6}$/.test(String(layout.accent ?? '')) ? String(layout.accent).toUpperCase() : '#CF63C6'
    return { cover, primary: accent, gold: accent, ink: '#111111', sector: '#111111', styled: false }
  }
  return { cover, primary: cover.palette.primary, gold: cover.palette.gold, ink: cover.palette.ink, sector: cover.palette.sector, styled: true }
}
