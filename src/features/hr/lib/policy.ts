/** منطق شرائح الاستقطاع (مشترك بين صفحة السياسة والاختبارات) */
import type { DeductionTier } from '../types'

/** تحقق محلي للشرائح مطابق لتحقق الخادم: متتالية من 1 بلا فجوات، آخرها مفتوح، لكل شريحة دقائق أو كسر يوم */
export function validateTiers(tiers: DeductionTier[]): string | null {
  if (tiers.length === 0) return 'أضف شريحة واحدة على الأقل'
  let prev = 0
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i]!
    if (t.from !== prev + 1) return `الشريحة ${i + 1}: يجب أن تبدأ من الدقيقة ${prev + 1}`
    if (t.to != null && t.to < t.from) return `الشريحة ${i + 1}: النهاية قبل البداية`
    if (t.to == null && i !== tiers.length - 1) return `الشريحة ${i + 1}: الشريحة المفتوحة يجب أن تكون الأخيرة`
    if ((t.minutes == null || t.minutes === 0) && (t.day_fraction == null || t.day_fraction === 0) && i > 0) return `الشريحة ${i + 1}: حدد دقائق استقطاع أو كسر يوم`
    if (t.to != null) prev = t.to
  }
  if (tiers[tiers.length - 1]!.to != null) return 'الشريحة الأخيرة يجب أن تكون مفتوحة (بلا نهاية)'
  return null
}
/** تطبيق الشرائح على نقص محدد — للمعاينة الحيّة */
export function applyTiers(tiers: DeductionTier[], shortfall: number): { minutes: number; days: number } {
  if (shortfall <= 0) return { minutes: 0, days: 0 }
  const t = tiers.find((x) => shortfall >= x.from && (x.to == null || shortfall <= x.to))
  return { minutes: t?.minutes ?? 0, days: t?.day_fraction ?? 0 }
}

