/**
 * محرك «الاستنتاجات»: يحوّل أرقام الملخص إلى جمل عربية صافية سهلة الفهم مع اتجاه التغيّر
 * مقارنةً بالفترة السابقة المكافئة — هذا ما يصل للمدير المفوض: نتائج لا جداول خام.
 */
import type { ExecOverview } from '../types'
import { label } from './labels'

export type InsightTone = 'good' | 'bad' | 'neutral' | 'warn'
export interface Insight { id: string; text: string; tone: InsightTone; delta?: number; domain: string }

export function pct(cur: number, prev: number): number | null {
  if (!prev) return cur ? null : 0
  return Math.round(((cur - prev) / prev) * 100)
}
export function fmtInt(n: number | null | undefined): string { return new Intl.NumberFormat('ar-IQ-u-nu-latn', { maximumFractionDigits: 0 }).format(Number(n ?? 0)) }
export function fmtNum(n: number | null | undefined, d = 1): string { return new Intl.NumberFormat('ar-IQ-u-nu-latn', { maximumFractionDigits: d }).format(Number(n ?? 0)) }
export function fmtMoney(n: number | null | undefined): string { return `${new Intl.NumberFormat('ar-IQ-u-nu-latn', { maximumFractionDigits: 0 }).format(Number(n ?? 0))} د.ع` }
export function fmtHours(minutes: number): string { const h = Math.floor(minutes / 60), m = minutes % 60; return h ? `${fmtInt(h)} س ${m ? fmtInt(m) + ' د' : ''}`.trim() : `${fmtInt(m)} د` }

function deltaText(delta: number | null): string {
  if (delta === null) return ' (لا بيانات سابقة للمقارنة)'
  if (delta === 0) return ' دون تغيير عن الفترة السابقة'
  return delta > 0 ? ` بارتفاع ${fmtInt(Math.abs(delta))}٪ عن الفترة السابقة` : ` بانخفاض ${fmtInt(Math.abs(delta))}٪ عن الفترة السابقة`
}
/** الاتجاه: هل الزيادة جيدة (مثل الأطنان) أم سيئة (مثل الشكاوى)؟ */
function tone(delta: number | null, increaseIsGood: boolean): InsightTone {
  if (delta === null || delta === 0) return 'neutral'
  const good = increaseIsGood ? delta > 0 : delta < 0
  if (Math.abs(delta) >= 25) return good ? 'good' : 'bad'
  return good ? 'good' : 'warn'
}

export function attendanceRate(a: ExecOverview['workforce']['attendance']): number | null {
  const total = a.present + a.late + a.absent + a.incomplete
  if (!total) return null
  return Math.round(((a.present + a.late) / total) * 100)
}

export function buildInsights(cur: ExecOverview, prev: ExecOverview | null): Insight[] {
  const out: Insight[] = []
  const P = <T,>(f: (o: ExecOverview) => T, fallback: T): T => (prev ? f(prev) : fallback)

  // الشكاوى
  {
    const c = cur.complaints.total, p = P((o) => o.complaints.total, 0), d = pct(c, p)
    const top = cur.complaints.by_sector[0]
    out.push({ id: 'complaints', domain: 'الشكاوى', delta: d ?? undefined, tone: c === 0 ? 'good' : tone(d, false),
      text: c === 0 ? 'لم تُسجَّل أي شكوى خلال الفترة.' : `وردت ${fmtInt(c)} شكوى${deltaText(d)}؛ ما زال ${fmtInt(cur.complaints.open)} منها قيد المعالجة${top ? `، وأكثرها من ${label(top.name)} (${fmtInt(top.count)})` : ''}.` })
    if (c > 0) {
      const rr = Math.round((cur.complaints.resolved / c) * 100)
      out.push({ id: 'complaints_rate', domain: 'الشكاوى', tone: rr >= 70 ? 'good' : rr >= 40 ? 'warn' : 'bad', text: `نسبة إنجاز الشكاوى ${fmtInt(rr)}٪ (${fmtInt(cur.complaints.resolved)} من ${fmtInt(c)} أُرسلت أو أُرشفت).` })
    }
  }
  // الأسطول
  {
    const c = cur.fleet.departures, p = P((o) => o.fleet.departures, 0), d = pct(c, p)
    out.push({ id: 'fleet', domain: 'الأسطول', delta: d ?? undefined, tone: tone(d, true),
      text: c === 0 ? 'لم تُسجَّل انطلاقات للآليات خلال الفترة.' : `نُفّذت ${fmtInt(c)} انطلاقة${deltaText(d)}، بمتوسط ${fmtNum(cur.fleet.avg_hours)} ساعة للرحلة${cur.fleet.open_now ? `، و${fmtInt(cur.fleet.open_now)} آلية في الميدان الآن` : ''}.` })
    const m = cur.fleet.maintenance, pm = P((o) => o.fleet.maintenance.opened, 0), dm = pct(m.opened, pm)
    if (m.opened || m.open_now) out.push({ id: 'maint', domain: 'الصيانة', delta: dm ?? undefined, tone: tone(dm, false),
      text: `دخلت ${fmtInt(m.opened)} آلية إلى الصيانة${deltaText(dm)}؛ ${fmtInt(m.open_now)} ما تزال فيها، ومتوسط الإصلاح ${fmtNum(m.avg_hours)} ساعة${m.cost ? ` بكلفة ${fmtMoney(m.cost)}` : ''}.` })
    if (cur.fleet.breakdowns) out.push({ id: 'breakdowns', domain: 'الأسطول', tone: cur.fleet.breakdowns > P((o) => o.fleet.breakdowns, 0) ? 'warn' : 'neutral', text: `${fmtInt(cur.fleet.breakdowns)} بلاغ عطل ميداني خلال الفترة.` })
  }
  // المحطة
  {
    const c = cur.station.tons, p = P((o) => o.station.tons, 0), d = pct(c, p)
    out.push({ id: 'station', domain: 'المحطة التحويلية', delta: d ?? undefined, tone: tone(d, true),
      text: cur.station.weighings === 0 ? 'لا عمليات وزن في المحطة التحويلية خلال الفترة.' : `تم وزن ${fmtNum(c)} طن عبر ${fmtInt(cur.station.weighings)} عملية${deltaText(d)}.` })
    if (cur.station.violations) {
      const vr = Math.round((cur.station.violations / Math.max(1, cur.station.weighings)) * 100)
      out.push({ id: 'station_viol', domain: 'المحطة التحويلية', tone: vr >= 20 ? 'bad' : 'warn', text: `${fmtInt(cur.station.violations)} مخالفة نقص حمولة (${fmtInt(vr)}٪ من الأوزان) بعجز ${fmtNum(cur.station.deficit_tons)} طن${cur.station.top_violators[0] ? `؛ الأكثر تكراراً: ${cur.station.top_violators[0].name}` : ''}.` })
    }
  }
  // الحضور
  {
    const a = cur.workforce.attendance, rate = attendanceRate(a), prate = prev ? attendanceRate(prev.workforce.attendance) : null
    if (rate !== null) {
      const d = prate === null ? null : rate - prate
      out.push({ id: 'attendance', domain: 'الموارد البشرية', delta: d ?? undefined, tone: rate >= 90 ? 'good' : rate >= 75 ? 'warn' : 'bad',
        text: `نسبة الحضور ${fmtInt(rate)}٪${d === null ? '' : d === 0 ? ' (ثابتة)' : d > 0 ? ` (+${fmtInt(d)} نقطة)` : ` (${fmtInt(d)} نقطة)`}: ${fmtInt(a.absent)} غياب و${fmtInt(a.late)} تأخير، وإجمالي النقص ${fmtHours(a.shortfall_minutes)}${a.deduction_days ? `، باستقطاع مقترح ${fmtNum(a.deduction_days)} يوم` : ''}.` })
    }
    if (cur.workforce.hired || cur.workforce.terminated) out.push({ id: 'hr_moves', domain: 'الموارد البشرية', tone: cur.workforce.terminated > cur.workforce.hired ? 'warn' : 'neutral', text: `حركة الملاك: ${fmtInt(cur.workforce.hired)} تعيين و${fmtInt(cur.workforce.terminated)} إنهاء خدمة، والملاك الفعلي ${fmtInt(cur.workforce.active)} موظفاً.` })
    if (cur.workforce.leaves.pending) out.push({ id: 'leaves_pending', domain: 'الموارد البشرية', tone: 'warn', text: `${fmtInt(cur.workforce.leaves.pending)} طلب إجازة/زمنية بانتظار قرار المدراء المباشرين.` })
  }
  // الكشوفات
  if (cur.disclosures.total) {
    const p = P((o) => o.disclosures.total, 0), d = pct(cur.disclosures.total, p)
    out.push({ id: 'disc', domain: 'الكشوفات', delta: d ?? undefined, tone: tone(d, false), text: `${fmtInt(cur.disclosures.total)} كشف مخالفة ميدانية${deltaText(d)}${cur.disclosures.by_violation[0] ? `، أبرزها «${cur.disclosures.by_violation[0].name}»` : ''}.` })
  }
  // المالية
  {
    const f = cur.finance
    if (f.payroll) out.push({ id: 'payroll', domain: 'المالية', tone: f.payroll.status === 'approved' ? 'good' : 'warn', text: `كشف رواتب ${f.payroll.month.slice(0, 7)}: ${fmtInt(f.payroll.employees)} موظفاً بصافٍ ${fmtMoney(f.payroll.final_total)}${f.payroll.deductions_total ? ` بعد استقطاعات ${fmtMoney(f.payroll.deductions_total)}` : ''} — ${f.payroll.status === 'approved' ? 'معتمد' : 'بانتظار اعتماد المالية'}.` })
    if (f.budget.allocated) {
      const used = Math.round((f.budget.spent / f.budget.allocated) * 100)
      out.push({ id: 'budget', domain: 'المالية', tone: used > 90 ? 'bad' : used > 75 ? 'warn' : 'good', text: `صُرف ${fmtInt(used)}٪ من موازنة ${f.budget.year} (${fmtMoney(f.budget.spent)} من ${fmtMoney(f.budget.allocated)}).` })
    }
    const spend = f.purchases.total + f.maintenance_cost
    const pspend = P((o) => o.finance.purchases.total + o.finance.maintenance_cost, 0), ds = pct(spend, pspend)
    if (spend) out.push({ id: 'spend', domain: 'المالية', delta: ds ?? undefined, tone: tone(ds, false), text: `إنفاق تشغيلي ${fmtMoney(spend)} (مشتريات ${fmtMoney(f.purchases.total)} + صيانة ${fmtMoney(f.maintenance_cost)})${deltaText(ds)}.` })
  }
  // الإعلام والتجهيز
  if (cur.media.submissions) out.push({ id: 'media', domain: 'الإعلام', tone: 'neutral', text: `وثّق الإعلام ${fmtInt(cur.media.submissions)} نشاطاً بـ${fmtInt(cur.media.photos)} صورة.` })
  if (cur.supplies.total) out.push({ id: 'supplies', domain: 'التجهيز', tone: 'neutral', text: `${fmtInt(cur.supplies.total)} طلب تجهيز من القواطع${cur.supplies.by_type[0] ? `، أكثرها «${cur.supplies.by_type[0].name}»` : ''}.` })
  return out
}

/** درجة صحة عامة 0..100 من مؤشرات رئيسية (للعرض الرمزي فقط) */
export function healthScore(o: ExecOverview): { score: number; label: string } {
  let score = 100
  const rate = attendanceRate(o.workforce.attendance)
  if (rate !== null) score -= Math.max(0, 90 - rate) * 1.2
  if (o.complaints.total) score -= Math.max(0, 70 - Math.round((o.complaints.resolved / o.complaints.total) * 100)) * 0.4
  if (o.station.weighings) score -= Math.min(20, Math.round((o.station.violations / o.station.weighings) * 100))
  if (o.fleet.maintenance.open_now) score -= Math.min(15, o.fleet.maintenance.open_now * 1.5)
  score = Math.max(0, Math.min(100, Math.round(score)))
  return { score, label: score >= 85 ? 'ممتاز' : score >= 70 ? 'جيد' : score >= 50 ? 'يحتاج متابعة' : 'حرج' }
}
