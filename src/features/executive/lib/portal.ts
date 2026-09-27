/** ثوابت ومنطق البوابات التنفيذية (بلا JSX): العناوين، نطاق الاستنتاجات لكل رتبة، بنود القرار، أقسام التقارير */
import type { ExecOverview } from '../types'
import type { Insight } from './insights'
import { fmtMoney } from './insights'
import type { ExecScope } from './execExcel'

export type ExecPortalKind = 'admin' | 'executive' | 'deputy' | 'finance'

export const PORTAL_TITLES: Record<ExecPortalKind, { title: string; subtitle: string; who: string }> = {
  admin: { title: 'المدير المفوض — الرئيسية', subtitle: 'صورة الشركة كاملة: ما يحتاج قرارك، ثم قراءة الفترة، ثم بطاقة لكل وحدة', who: 'المدير المفوض' },
  executive: { title: 'المدير التنفيذي — الرئيسية', subtitle: 'متابعة تنفيذية لعمليات الشركة: الشكاوى، الأسطول، المحطة، القوى العاملة', who: 'المدير التنفيذي' },
  deputy: { title: 'معاون المدير المفوض — الرئيسية', subtitle: 'الميدان أولاً: القواطع، الكشوفات، المحطة التحويلية، التجهيز', who: 'معاون المدير المفوض' },
  finance: { title: 'الشؤون المالية — الرئيسية', subtitle: 'الرواتب والاستقطاعات والإنفاق والموازنة — بيانات مالية فقط', who: 'الشؤون المالية' },
}

export const FINANCE_DOMAINS = new Set(['المالية'])
const FIELD_DOMAINS = new Set(['الشكاوى', 'المحطة التحويلية', 'الكشوفات', 'الأسطول', 'التجهيز', 'الإعلام'])

/** استنتاجات المالية: المالية أولاً، ثم ما يمسّ الرواتب من الموارد البشرية (الحضور/حركة الملاك) فقط */
export function financeInsights(all: Insight[]): Insight[] {
  return [...all.filter((i) => FINANCE_DOMAINS.has(i.domain)), ...all.filter((i) => i.domain === 'الموارد البشرية' && (i.id === 'attendance' || i.id === 'hr_moves'))]
}

/** الاستنتاجات المناسبة لكل رتبة */
export function insightsFor(kind: ExecPortalKind, all: Insight[]): Insight[] {
  if (kind === 'finance') return financeInsights(all)
  if (kind === 'executive') return all.filter((i) => !FINANCE_DOMAINS.has(i.domain))
  if (kind === 'deputy') { const f = all.filter((i) => FIELD_DOMAINS.has(i.domain)); return f.length ? f : all }
  return all
}

export const scopeOf = (kind: ExecPortalKind): ExecScope => (kind === 'finance' ? 'finance' : 'all')

export type DecisionTone = 'red' | 'amber' | 'blue' | 'violet' | 'emerald'
export type DecisionIcon = 'wallet' | 'calendar' | 'settings' | 'clipboard' | 'alert-triangle' | 'truck'
export interface Decision { count: number; text: string; tone: DecisionTone; icon: DecisionIcon }

/** ما يحتاج قرار/انتباه المدير المفوض — أرقام حالة حيّة */
export function buildDecisions(o: ExecOverview): Decision[] {
  const list: Decision[] = []
  if (o.finance.payroll && o.finance.payroll.status !== 'approved') list.push({ count: 1, text: `كشف رواتب ${o.finance.payroll.month.slice(0, 7)} بانتظار اعتماد المالية (${fmtMoney(o.finance.payroll.final_total)})`, tone: 'amber', icon: 'wallet' })
  if (o.workforce.leaves.pending) list.push({ count: o.workforce.leaves.pending, text: 'طلب إجازة/زمنية معلّق لدى المدراء المباشرين', tone: 'blue', icon: 'calendar' })
  if (o.complaints.open) list.push({ count: o.complaints.open, text: 'شكوى قيد المعالجة لم تُرسل بعد', tone: 'red', icon: 'clipboard' })
  if (o.fleet.maintenance.open_now) list.push({ count: o.fleet.maintenance.open_now, text: 'آلية متوقفة في الصيانة الآن', tone: 'amber', icon: 'settings' })
  if (o.fleet.open_now) list.push({ count: o.fleet.open_now, text: 'آلية في الميدان لم تعُد بعد', tone: 'emerald', icon: 'truck' })
  if (o.workforce.alerts) list.push({ count: o.workforce.alerts, text: 'تنبيه تأخير/غياب متكرر يحتاج مراجعة', tone: 'violet', icon: 'alert-triangle' })
  return list.slice(0, 8)
}

export type SectionKey = 'insights' | 'summary' | 'scorecards' | 'kpis' | 'complaints' | 'fleet' | 'station' | 'workforce' | 'sectors' | 'disclosures' | 'supplies' | 'finance' | 'support' | 'payroll' | 'budget' | 'spend' | 'workforce_cost'
/** أقسام التقرير لكل بوابة — المالية أقسام مالية فقط */
export const REPORT_SECTIONS: Record<ExecPortalKind, Array<{ key: SectionKey; label: string }>> = {
  admin: [
    { key: 'insights', label: 'قراءة تحليلية' }, { key: 'summary', label: 'جدول المؤشرات' }, { key: 'scorecards', label: 'بطاقات الوحدات' }, { key: 'complaints', label: 'الشكاوى' }, { key: 'fleet', label: 'الأسطول والصيانة' },
    { key: 'station', label: 'المحطة التحويلية' }, { key: 'workforce', label: 'القوى العاملة' }, { key: 'sectors', label: 'مقارنة القواطع' }, { key: 'disclosures', label: 'الكشوفات' }, { key: 'finance', label: 'المالية' }, { key: 'support', label: 'الإعلام والتجهيز' },
  ],
  executive: [
    { key: 'insights', label: 'قراءة تحليلية' }, { key: 'kpis', label: 'مؤشرات التشغيل' }, { key: 'summary', label: 'جدول المؤشرات' }, { key: 'complaints', label: 'الشكاوى' }, { key: 'fleet', label: 'الأسطول والصيانة' },
    { key: 'station', label: 'المحطة التحويلية' }, { key: 'workforce', label: 'القوى العاملة' }, { key: 'sectors', label: 'مقارنة القواطع' }, { key: 'support', label: 'الإعلام والتجهيز' },
  ],
  deputy: [
    { key: 'insights', label: 'قراءة الميدان' }, { key: 'summary', label: 'جدول المؤشرات' }, { key: 'sectors', label: 'مقارنة القواطع' }, { key: 'disclosures', label: 'الكشوفات' }, { key: 'station', label: 'المحطة التحويلية' },
    { key: 'complaints', label: 'الشكاوى' }, { key: 'supplies', label: 'التجهيز' }, { key: 'fleet', label: 'الأسطول' }, { key: 'workforce', label: 'الحضور' },
  ],
  finance: [
    { key: 'insights', label: 'قراءة مالية' }, { key: 'summary', label: 'جدول المؤشرات المالية' }, { key: 'payroll', label: 'الرواتب' }, { key: 'budget', label: 'الموازنة' }, { key: 'spend', label: 'الإنفاق التشغيلي' }, { key: 'workforce_cost', label: 'أثر الحضور على الرواتب' },
  ],
}
