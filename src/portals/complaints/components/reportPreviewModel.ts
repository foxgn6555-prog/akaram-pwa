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

export { authorityLineFor } from '@lib/pptx/complaintPptx'

/** مفتاح مجموعة «البريد + مسؤول القسم» — مطابق لتجميع مولّد PowerPoint. */
export const entryGroupKey = (entry: ReportEntry) =>
  `${entry.item.inboxMessageId ?? entry.item.complaintId}:${entry.item.assignedTo ?? 'unassigned'}`

export interface SlidePlanStep { kind: 'cover' | 'table' | 'photo'; label: string }

/**
 * خطة شرائح ملف PowerPoint الناتج (نفس ترتيب المولّد):
 * غلاف ← مؤشرات تنفيذية ← صفحات الجدول ← لكل مجموعة فاصل ثم شريحة لكل موقع.
 */
export function buildSlidePlan(entries: ReportEntry[]): SlidePlanStep[] {
  const steps: SlidePlanStep[] = [{ kind: 'cover', label: 'الغلاف' }]
  const TABLE_ROWS_PER_SLIDE = 11
  const tablePages = Math.max(1, Math.ceil(entries.length / TABLE_ROWS_PER_SLIDE))
  for (let page = 0; page < tablePages; page += 1) {
    steps.push({ kind: 'table', label: tablePages === 1 ? 'جدول بيانات التلكؤات' : `جدول بيانات التلكؤات ${page + 1}/${tablePages}` })
  }
  entries.forEach(entry => {
    steps.push({ kind: 'photo', label: `قبل/بعد ${entry.item.referenceNo} / ${entry.item.sequenceNo}` })
  })
  return steps
}
