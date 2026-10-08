/** منطق شرائح الاستقطاع (مشترك بين صفحة السياسة والاختبارات) */
import type { DeductionTier, ShortfallMethod } from '../types'

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


/** 00196: احتساب نقص اليوم بأي طريقة (مطابق لـ app.hr_shortfall_for_rule) — السماحية يطبّقها المستدعي */
export interface ShortfallRule { shortfall_method?: ShortfallMethod; shortfall_multiplier?: number; shortfall_block_minutes?: number; deduction_tiers: DeductionTier[] }
export function applyShortfall(rule: ShortfallRule, shortfall: number, shiftMinutes = 480): { minutes: number; days: number; note: string } {
  const method = rule.shortfall_method ?? 'tiers'
  if (shortfall <= 0) return { minutes: 0, days: 0, note: '' }
  if (method === 'tiers') return { ...applyTiers(rule.deduction_tiers, shortfall), note: 'شريحة النقص المطابقة' }
  const mult = rule.shortfall_multiplier ?? 1
  const block = Math.max(1, rule.shortfall_block_minutes ?? 30)
  const raw = method === 'blocks' ? Math.ceil(shortfall / block) * block : shortfall
  let minutes = Math.ceil(raw * (method === 'actual' ? 1 : mult))
  let note = method === 'actual' ? 'دقيقة بدقيقة' : method === 'multiplier' ? `دقيقة بدقيقة × ${mult}` : `تقريب لأعلى إلى كتل ${block} د${mult !== 1 ? ` × ${mult}` : ''}`
  if (minutes >= Math.max(1, shiftMinutes)) { minutes = 0; note += ' (بلغ سقف اليوم الكامل)'; return { minutes, days: 1, note } }
  return { minutes, days: 0, note }
}
export const SHORTFALL_METHOD_LABEL: Record<ShortfallMethod, string> = {
  tiers: 'شرائح: نقص من..إلى ⇒ دقائق محددة أو كسر يوم',
  actual: 'دقيقة بدقيقة: يُستقطع نفس عدد دقائق النقص',
  multiplier: 'دقيقة بدقيقة × مضاعف (مثلاً ×2)',
  blocks: 'كتل زمنية: يُقرَّب النقص لأعلى إلى أقرب كتلة (مثلاً 30 د) ثم × المضاعف',
}
