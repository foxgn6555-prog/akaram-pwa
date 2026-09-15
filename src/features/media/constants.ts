/**
 * ثوابت بوابة الإعلام: طرق الإرسال، أنواع العمل، دورات التصميم
 */

export type MediaMode = 'street' | 'campaign' | 'school'
export type SectorParent = 'karrada' | 'zaafaraniya'
export type PeriodType = 'first_half' | 'second_half' | 'monthly'

export const MEDIA_MODES: Array<{ value: MediaMode; label: string; hint: string }> = [
  { value: 'street', label: 'صورة شارع', hint: 'اسم الشارع فقط — القاطع والقسم تلقائياً من حسابك' },
  { value: 'campaign', label: 'حملة', hint: 'اسم الحملة + نوع العمل — التاريخ تلقائي' },
  { value: 'school', label: 'حملة مدارس', hint: 'اسم المدرسة + نوع عمل مدرسي — التاريخ تلقائي' },
]

export const MODE_LABEL: Record<MediaMode, string> = {
  street: 'صورة شارع',
  campaign: 'حملة',
  school: 'حملة مدارس',
}

export const SECTOR_LABEL: Record<SectorParent, string> = {
  karrada: 'قاطع الكرادة',
  zaafaraniya: 'قاطع الزعفرانية',
}

/** أنواع العمل العامة (الشارع + الحملات) */
export const GENERAL_WORK_TYPES = [
  'رفع حاويات',
  'غسل الشارع',
  'رفع مخلفات',
  'كنس الشوارع',
  'غسل المصارف والسيول',
  'رفع الإطارات والمياه',
  'إزالة اللافتات والكتابات',
  'صيانة الإنارة والأرصفة',
  'نظافة المرافق العامة',
] as const

/** أنواع إضافية لحملات المدارس */
export const SCHOOL_WORK_TYPES = ['غسل المدرسة', 'تنظيف محيط المدرسة'] as const

export const WORK_TYPES: string[] = [...GENERAL_WORK_TYPES, ...SCHOOL_WORK_TYPES]

export const workTypesForMode = (mode: MediaMode): string[] =>
  mode === 'school' ? WORK_TYPES : [...GENERAL_WORK_TYPES]

export const CUSTOM_WORK_TYPE = 'مخصص'

export const PERIODS: Array<{ value: PeriodType; label: string; hint: string }> = [
  { value: 'first_half', label: 'النصف الأول (1–14)', hint: 'الدورة الأولى من الشهر' },
  { value: 'second_half', label: 'النصف الثاني (15–آخر يوم)', hint: 'الدورة الثانية من الشهر' },
  { value: 'monthly', label: 'شهري كامل', hint: 'الشهر كاملاً' },
]

export const PERIOD_LABEL: Record<PeriodType, string> = {
  first_half: 'النصف الأول',
  second_half: 'النصف الثاني',
  monthly: 'شهري كامل',
}

/** أقصى عدد صور في الإرسال الواحد */
export const MAX_PHOTOS = 500

const AR_MONTHS = [
  'كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران',
  'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول',
]

/** نطاق دورة التصميم للشهر الحالي (تقويم بغداد) — مطابق لدالة app.media_period_range */
export function periodRange(type: PeriodType, ref: Date = new Date()): { start: string; end: string } {
  const first = new Date(ref)
  first.setDate(1)
  const endMonth = new Date(first)
  endMonth.setMonth(endMonth.getMonth() + 1)
  endMonth.setDate(0) // آخر يوم في الشهر
  const iso = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(d)
  if (type === 'first_half') return { start: iso(first), end: iso(new Date(first).setDate(14)) }
  if (type === 'second_half') return { start: iso(new Date(first).setDate(15)), end: iso(endMonth) }
  return { start: iso(first), end: iso(endMonth) }
}

/** الدورة التلقائية حسب اليوم: 1–14 نصف أول، 15–آخر نصف ثاني */
export function autoPeriodType(ref: Date = new Date()): PeriodType {
  const day = new Intl.DateTimeFormat('en-GB', { day: '2-digit', timeZone: 'Asia/Baghdad' }).format(ref)
  return Number(day) <= 14 ? 'first_half' : 'second_half'
}

/** عنوان تقرير مقترح: «التقرير المصور — قاطع الكرادة (1–14 أيلول 2026)» */
export function suggestedDesignTitle(sector: SectorParent, type: PeriodType, ref: Date = new Date()): string {
  const { start, end } = periodRange(type, ref)
  const s = new Date(start)
  const e = new Date(end)
  const monthName = AR_MONTHS[s.getMonth()]
  const year = s.getFullYear()
  const range =
    type === 'monthly'
      ? `شهر ${monthName} ${year}`
      : `${s.getDate()}–${e.getDate()} ${monthName} ${year}`
  return `التقرير المصور — ${SECTOR_LABEL[sector]} (${range})`
}

export const designStatusLabel = (status: string): string =>
  status === 'completed' ? 'مكتمل' : 'مسودة'

export const submissionModeTitleField: Record<MediaMode, { label: string; placeholder: string }> = {
  street: { label: 'اسم الشارع', placeholder: 'مثال: شارع الكرادة داخل' },
  campaign: { label: 'اسم الحملة', placeholder: 'مثال: حملة نظافة الشوارع' },
  school: { label: 'اسم المدرسة', placeholder: 'مثال: مدرسة الكرادة الابتدائية' },
}
