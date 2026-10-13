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
  if (method === 'hour_bank') return { minutes: 0, days: 0, note: 'يُصفّى شهرياً ضمن بنك الساعات' }
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
  hour_bank: 'بنك الساعات الشهري: لا استقطاع يومي؛ يُصفّى صافي الساعات آخر الشهر (العجز يُستقطع، الفائض رصيد إجازة)',
}

/** 00216: ميزان بنك الساعات لشهر (مطابق لـ app.hr_hour_bank) — يُستخدم للمعاينة الحية في وحدة الاستقطاعات */
export interface HourBankInput {
  shiftMinutes: number; daysInMonth: number; coveredDays?: number; restDays?: number
  offDaysPerMonth: number; creditCapDays: number; graceMinutes: number
  /** أيام الحضور الفعلي: المطلوب والمعمول والنقص (بعد الزمنية المدفوعة) لكل يوم */
  days: Array<{ required: number; worked: number; shortfall?: number; waived?: boolean }>
}
export interface HourBankResult {
  requiredDays: number; requiredMinutes: number; creditedMinutes: number; netMinutes: number
  deductionMinutes: number; surplusMinutes: number; creditDays: number; creditCapped: boolean
}
export function computeHourBank(i: HourBankInput): HourBankResult {
  const covered = i.coveredDays ?? i.daysInMonth
  const rest = i.restDays ?? 0
  const shift = Math.max(1, i.shiftMinutes)
  const pool = Math.round((i.offDaysPerMonth * covered / Math.max(1, i.daysInMonth)) * 10000) / 10000
  const requiredDays = Math.max(0, Math.min(covered - rest - pool, i.days.length))
  const requiredMinutes = Math.round(requiredDays * shift)
  const creditedMinutes = i.days.reduce((acc, d) => {
    const short = d.shortfall ?? Math.max(0, d.required - d.worked)
    const credit = d.required - short + Math.max(0, d.worked - d.required)
    return acc + (short <= i.graceMinutes || d.waived ? Math.max(d.required, credit) : credit)
  }, 0)
  const netMinutes = creditedMinutes - requiredMinutes
  const rawDays = Math.round((Math.max(0, netMinutes) / shift) * 1000) / 1000
  return {
    requiredDays, requiredMinutes, creditedMinutes, netMinutes,
    deductionMinutes: Math.max(0, -netMinutes), surplusMinutes: Math.max(0, netMinutes),
    creditDays: Math.min(rawDays, i.creditCapDays), creditCapped: rawDays > i.creditCapDays,
  }
}
