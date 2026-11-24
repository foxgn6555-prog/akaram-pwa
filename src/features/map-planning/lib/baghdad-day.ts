/**
 * «يوم بغداد» — مصدر واحد لكل الصفحات.
 *
 * ## المشكلة
 * كان اليوم يُحسب في خمسة مواضع بثلاث طرق مختلفة:
 *
 *     new Date(Date.now() + 3 * 60 * 60_000).toISOString().slice(0, 10)   // ٣ صفحات
 *     new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' })        // TripRoutesPage
 *     Intl…formatToParts                                                    // baghdad-date.ts
 *
 * الفرق ليس أكاديمياً. الطريقة الأولى (إضافة ٣ ساعات إلى UTC) صحيحة **الآن**
 * لأن بغداد UTC+3 بلا توقيت صيفي، لكنها تُنتج يوماً مختلفاً لو قورنت بطريقة
 * `Intl` عند حدود اليوم: `toISOString()` يُقرَّب إلى UTC، فالسيارة التي سُجّلت
 * ٢١:٠٠ UTC = ٠٠:٠٠ بغداد تظهر في يوم غير الذي تظهر فيه على شاشة أخرى.
 *
 * والأخطر: **صفحتان تعرضان اليوم نفسه بأرقام مختلفة** لأن إحداهما تحسبه
 * بإضافة ساعات والأخرى بـ`Intl`. من يفتح «التغطية» و«زيارات الآلية» على
 * تاريخ محدَّد يجب أن يرى نفس اليوم، دائماً.
 *
 * ## القاعدة
 * - `baghdadDayKey()` — اليوم الحالي بتوقيت بغداد، من `Intl` (لا إضافة ساعات).
 * - `isBaghdadDayKey()` — تحقق صارم قبل استعمال قيمة من الرابط.
 * - `shiftBaghdadDay()` — إضافة/طرح أيام على مفتاح يوم بلا الانزلاق عبر
 *   التوقيت الصيفي (بغداد لا تطبّقه، لكن الدالة صحيحة لأي منطقة).
 *
 * كل الدوال نقية (تأخذ `now` اختيارياً) فتُختبر بلا تجميد الساعة العالميّة.
 */

const BAGHDAD_TIME_ZONE = 'Asia/Baghdad'
const DAY_MS = 86_400_000
const KEY_RE = /^\d{4}-\d{2}-\d{2}$/

/** مُنسّق واحد — إنشاء `Intl.DateTimeFormat` متكرّراً مكلف نسبياً */
const KEY_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: BAGHDAD_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** اليوم الحالي (أو يوم `at`) بتوقيت بغداد، بصيغة `YYYY-MM-DD`. */
export function baghdadDayKey(at: Date | number = new Date()): string {
  const date = typeof at === 'number' ? new Date(at) : at
  if (Number.isNaN(date.getTime())) return ''
  // en-CA يُنتج YYYY-MM-DD أصلاً، لكن نقرأ الأجزاء صراحةً كي لا نعتمد على صيغة
  const parts = KEY_FORMATTER.formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? ''
  const y = get('year')
  const m = get('month')
  const d = get('day')
  return y && m && d ? `${y}-${m}-${d}` : ''
}

/** هل النصّ مفتاح يوم صالح؟ (يُستعمل على كل قيمة قادمة من الرابط) */
export function isBaghdadDayKey(value: unknown): value is string {
  if (typeof value !== 'string' || !KEY_RE.test(value)) return false
  // نرفض 2026-02-31 ونظائرها: التاريخ غير الموجود يجب ألا يصل إلى استعلام
  const [y, m, d] = value.split('-').map(Number) as [number, number, number]
  const probe = new Date(Date.UTC(y, m - 1, d))
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d
}

/**
 * يزيح مفتاح يوم بعدد أيام.
 *
 * الإزاحة تجري على منتصف ليل UTC ثم يُعاد التنسيق — وبهذا لا تعتمد النتيجة
 * على ساعة الجهاز ولا على منطقة المتصفّح. مفتاح غير صالح يُرجَع كما هو بدل
 * إنتاج تاريخ عشوائي (الفشل الصامت أسوأ من قيمة واضحة خاطئة).
 */
export function shiftBaghdadDay(key: string, days: number): string {
  if (!isBaghdadDayKey(key)) return key
  const [y, m, d] = key.split('-').map(Number) as [number, number, number]
  const shifted = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS)
  return shifted.toISOString().slice(0, 10)
}
