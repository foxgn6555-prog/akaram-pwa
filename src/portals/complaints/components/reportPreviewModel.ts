/**
 * نموذج معاينة تقرير الشكاوى — الصيغ والخطة المشتركة بين المعاينة المرئية
 * ومولّد PowerPoint في `supabase/functions/complaint-generate-report/index.ts`
 * حتى يطابق الملف المنزل المعاينة والتصميم المعتمد.
 */
import type { ComplaintReportDetail } from '@features/complaints'

export type ReportEntry = ComplaintReportDetail['items'][number]
export type ReportLayout = Record<string, unknown>

export const sectorLabel = (sector: string) => (sector === 'karrada' ? 'قاطع الكرادة' : 'قاطع الزعفرانية')

/** سطر الموقع أسفل شريحة قبل/بعد — مطابق لشريط التذييل في ملف PowerPoint. */
export const siteCaption = (entry: ReportEntry) =>
  `محلة ${entry.item.neighborhood || '—'} - زقاق ${entry.item.alley || '—'} - ${entry.item.title || 'نوع غير محدد'}`

/** سطر التاريخ على الغلاف — مطابق لسطر الغلاف في ملف PowerPoint. */
export const coverDateLine = (sector: string, reportDate: string) => `${sectorLabel(sector)} - ${reportDate}`

/** القاعدة المشتركة بين المعاينة والمولّد لسطر الجهة الحكومية حسب القطاع. */
export const authorityLineFor = (layout: ReportLayout, sector: string) => {
  const configured = String(layout.authorityLine ?? '')
  return !configured || configured === 'أمانة بغداد / دائرة بلدية الكرادة'
    ? `أمانة بغداد / دائرة بلدية ${sector === 'karrada' ? 'الكرادة' : 'الزعفرانية'}`
    : configured
}

/** مفتاح مجموعة «البريد + مسؤول القسم» — مطابق لتجميع مولّد PowerPoint. */
export const entryGroupKey = (entry: ReportEntry) =>
  `${entry.item.inboxMessageId ?? entry.item.complaintId}:${entry.item.assignedTo ?? 'unassigned'}`

export interface SlidePlanStep { kind: 'cover' | 'summary' | 'table' | 'group' | 'photo'; label: string }

/**
 * خطة شرائح ملف PowerPoint الناتج (نفس ترتيب المولّد):
 * غلاف ← مؤشرات تنفيذية ← صفحات الجدول ← لكل مجموعة فاصل ثم شريحة لكل موقع.
 */
export function buildSlidePlan(entries: ReportEntry[], managerNames: Map<string, string>): SlidePlanStep[] {
  const steps: SlidePlanStep[] = [
    { kind: 'cover', label: 'الغلاف' },
    { kind: 'summary', label: 'المؤشرات التنفيذية' },
  ]
  const TABLE_ROWS_PER_SLIDE = 11
  const tablePages = Math.max(1, Math.ceil(entries.length / TABLE_ROWS_PER_SLIDE))
  for (let page = 0; page < tablePages; page += 1) {
    steps.push({ kind: 'table', label: tablePages === 1 ? 'جدول بيانات التلكؤات' : `جدول بيانات التلكؤات ${page + 1}/${tablePages}` })
  }
  let lastKey = ''
  entries.forEach(entry => {
    const key = entryGroupKey(entry)
    if (key !== lastKey) {
      lastKey = key
      const manager = managerNames.get(entry.item.assignedTo ?? '') ?? 'مسؤول القسم'
      steps.push({ kind: 'group', label: `مجموعة: ${entry.item.ticketName || 'بريد دون موضوع'} / ${manager}` })
    }
    steps.push({ kind: 'photo', label: `قبل/بعد ${entry.item.referenceNo} / ${entry.item.sequenceNo}` })
  })
  return steps
}
