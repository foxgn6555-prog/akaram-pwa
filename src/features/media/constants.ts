/**
 * ثوابت بوابة الإعلام: طرق الإرسال، أنواع العمل، دورات التصميم
 */

export type MediaMode = 'street' | 'campaign' | 'school'
export type SectorParent = 'karrada' | 'zaafaraniya'
export type PeriodType = 'daily' | 'weekly' | 'first_half' | 'second_half' | 'monthly'

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
  { value: 'daily', label: 'تقرير يومي', hint: 'اليوم نفسه — يُكتب اسم اليوم وتاريخه تلقائياً' },
  { value: 'weekly', label: 'تقرير أسبوعي', hint: 'السبت → الجمعة من الأسبوع الحالي' },
  { value: 'first_half', label: 'النصف الأول (1–14)', hint: 'الدورة الأولى من الشهر' },
  { value: 'second_half', label: 'النصف الثاني (15–آخر يوم)', hint: 'الدورة الثانية من الشهر' },
  { value: 'monthly', label: 'شهري كامل', hint: 'الشهر كاملاً' },
]

export const PERIOD_LABEL: Record<PeriodType, string> = {
  daily: 'يومي',
  weekly: 'أسبوعي',
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
  const withDay = (d: Date, day: number) => {
    const copy = new Date(d)
    copy.setDate(day)
    return copy
  }
  if (type === 'daily') return { start: iso(ref), end: iso(ref) }
  if (type === 'weekly') {
    // أسبوع العمل العراقي: السبت → الجمعة (بتقويم بغداد)
    const dow = new Date(`${iso(ref)}T12:00:00`).getDay() // 0 أحد … 6 سبت
    const sinceSat = (dow + 1) % 7
    const sat = new Date(`${iso(ref)}T12:00:00`)
    sat.setDate(sat.getDate() - sinceSat)
    const fri = new Date(sat)
    fri.setDate(sat.getDate() + 6)
    return { start: iso(sat), end: iso(fri) }
  }
  if (type === 'first_half') return { start: iso(first), end: iso(withDay(first, 14)) }
  if (type === 'second_half') return { start: iso(withDay(first, 15)), end: iso(endMonth) }
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
  const s = new Date(`${start}T12:00:00`)
  const e = new Date(`${end}T12:00:00`)
  const monthName = AR_MONTHS[s.getMonth()]
  const year = s.getFullYear()
  const range =
    type === 'monthly'
      ? `شهر ${monthName} ${year}`
      : type === 'daily'
        ? `${AR_WEEKDAYS[s.getDay()]} ${s.getDate()} ${monthName} ${year}`
        : `${s.getDate()}–${e.getDate()} ${monthName} ${year}`
  const kind = type === 'daily' ? 'التقرير اليومي المصور' : type === 'weekly' ? 'التقرير الأسبوعي المصور' : 'التقرير المصور'
  return `${kind} — ${SECTOR_LABEL[sector]} (${range})`
}

export const AR_WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

/** «يوم الخميس» من تاريخ ISO (YYYY-MM-DD) */
export const arWeekday = (iso: string): string => `يوم ${AR_WEEKDAYS[new Date(`${iso}T12:00:00`).getDay()]}`

/** تاريخ بصيغة التقرير اليومي: 2026\10\1 */
export const slashDate = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number)
  return `${y}\\${m}\\${d}`
}

export const designStatusLabel = (status: string): string =>
  status === 'completed' ? 'مكتمل' : 'مسودة'

/** تاريخ اليوم في بغداد YYYY-MM-DD (مع إزاحة اختيارية بالأيام) */
export const baghdadDay = (offset = 0) => {
  const d = new Date(Date.now() + offset * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(d)
}

/** يوم التذكرة الفعلي YYYY-MM-DD: تاريخ التنفيذ ← تاريخ الحدث ← يوم الإنشاء محوَّلاً إلى توقيت بغداد
 *  (كان يُقتطع من الطابع الزمني UTC فتُنسب تذاكر ما بعد منتصف الليل إلى اليوم السابق). */
export const ticketDay = (t: { exec_date?: string | null; event_date?: string | null; created_at?: string | null }): string => {
  const d = t.exec_date || t.event_date
  if (d) return d.slice(0, 10)
  if (!t.created_at) return baghdadDay()
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(new Date(t.created_at))
}

/** عرض التاريخ بالعربية (تقويم بغداد) */
export const fmtDayAr = (iso: string) =>
  new Intl.DateTimeFormat('ar-IQ-u-nu-latn', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Baghdad',
  }).format(new Date(iso))

export const submissionModeTitleField: Record<MediaMode, { label: string; placeholder: string }> = {
  street: { label: 'اسم الشارع', placeholder: 'مثال: شارع الكرادة داخل' },
  campaign: { label: 'اسم الحملة', placeholder: 'مثال: حملة نظافة الشوارع' },
  school: { label: 'اسم المدرسة', placeholder: 'مثال: مدرسة الكرادة الابتدائية' },
}

/* ═══ 00164: تفاصيل الحملة + تقرير غرفة العمليات ═══ */
export type VehicleKind = 'tipper' | 'tanker' | 'compactor' | 'loader' | 'sweeper'
export const VEHICLE_KINDS: Array<{ key: VehicleKind; label: string }> = [
  { key: 'tipper', label: 'قلاب' },
  { key: 'tanker', label: 'تنكر' },
  { key: 'compactor', label: 'كابسة' },
  { key: 'loader', label: 'شفل' },
  { key: 'sweeper', label: 'كناسة' },
]
export const VEHICLE_COL: Record<VehicleKind, 'veh_tipper' | 'veh_tanker' | 'veh_compactor' | 'veh_loader' | 'veh_sweeper'> = {
  tipper: 'veh_tipper', tanker: 'veh_tanker', compactor: 'veh_compactor', loader: 'veh_loader', sweeper: 'veh_sweeper',
}
/** اسم التقرير الموحّد + العنوان الفرعي حسب النوع */
export const CAMPAIGN_REPORT_TITLE = 'تقرير متابعة وتوثيق حملات التنظيف والخدمات'
export const CAMPAIGN_REPORT_SUBTITLE: Record<MediaMode, string> = { campaign: 'الحملات', school: 'حملات المدارس', street: 'تنظيف الشوارع' }
/** تسميات الأعمدة التي تتغير حسب النوع (الباقي ثابت) */
export const CAMPAIGN_FIELD_LABEL: Record<MediaMode, { title: string; location: string; date: string }> = {
  campaign: { title: 'اسم الحملة', location: 'موقع الحملة', date: 'تاريخ تنفيذ الحملة' },
  school: { title: 'اسم المدرسة', location: 'موقع المدرسة', date: 'تاريخ التنفيذ' },
  street: { title: 'اسم الشارع', location: 'الموقع / أقرب نقطة دالة', date: 'تاريخ التنظيف' },
}
/** اسم المجموعة في التصميم: للشارع اسم الشارع نفسه (لا «عام»)، ولغيره نوع العمل ثم العنوان */
export const designGroupLabel = (t: { mode: string; title: string; work_type: string | null }) =>
  t.mode === 'street' ? t.title : (t.work_type?.trim() || t.title)

/** المسودة التي يقع فيها اليوم المرجعي (نفس النوع، الحالة مسودة، period_start ≤ يوم ≤ period_end) — أحدثها أولاً */
export function findDraftForDay<T extends { id: string; period_type: string; status: string; period_start: string; period_end: string; created_at?: string }>(
  designs: T[], periodType: PeriodType, day: string,
): T | undefined {
  return designs
    .filter((d) => d.status === 'draft' && d.period_type === periodType && d.period_start <= day && day <= d.period_end)
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))[0]
}
