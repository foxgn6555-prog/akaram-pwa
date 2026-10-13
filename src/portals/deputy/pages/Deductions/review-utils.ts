/** 00248 — أدوات مراجعة الاستقطاعات (تسميات + مجاميع) */
import type { DeputyDeductionKind, DeputyReviewRow } from '@features/hr'

export const KIND_LABELS: Record<DeputyDeductionKind, string> = { shortfall: 'نقص ساعات / تأخير', absence: 'غياب', ops: 'استقطاع غرفة العمليات', fines: 'غرامات الكشوفات' }
export const KINDS: DeputyDeductionKind[] = ['shortfall', 'absence', 'ops', 'fines']
export const ACTION_LABELS: Record<string, string> = { waive: 'إعفاء كامل', amount: 'تعديل مبلغ', clear: 'إلغاء تخفيف', percent: 'تخفيض عام %', approve: 'اعتماد', reopen: 'إعادة فتح' }
export const monthLabel = (m: string) => m.slice(0, 7)
export const pctOf = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0)

export function reviewTotals(rows: DeputyReviewRow[]) {
  return rows.reduce((a, r) => {
    a.count += 1; if (r.reviewable_total > 0) a.withDeductions += 1
    a.shortfall += r.shortfall_amount; a.absence += r.absence_amount; a.ops += r.ops_amount; a.fines += r.fines_amount
    a.before += r.reviewable_total; a.relief += r.relief_total; a.after += Math.max(0, r.reviewable_total - r.relief_total)
    a.net += r.final_net ?? 0; if (r.relief_total > 0) a.relieved += 1
    return a
  }, { count: 0, withDeductions: 0, shortfall: 0, absence: 0, ops: 0, fines: 0, before: 0, relief: 0, after: 0, net: 0, relieved: 0 })
}

