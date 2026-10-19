/** 00249 · تقارير سلوك الموظفين — تسميات، ألوان، فترات، وتحليلات نصية مشتقة من أرقام قاعدة البيانات (بلا منطق احتساب مكرر) */
import type { BehaviorDepartment, BehaviorEmployeeReport, BehaviorEmployeeRow, BehaviorGrade, BehaviorIndices, BehaviorPeriodKind, BehaviorSummary, BehaviorWeekday } from '../types'

export const BEHAVIOR_KINDS: ReadonlyArray<{ key: BehaviorPeriodKind; label: string; short: string }> = [
  { key: 'monthly', label: 'تقرير شهري', short: 'شهري' },
  { key: 'quarterly', label: 'تقرير ربع سنوي', short: 'ربع سنوي' },
  { key: 'half_yearly', label: 'تقرير نصف سنوي', short: 'نصف سنوي' },
  { key: 'yearly', label: 'تقرير سنوي', short: 'سنوي' },
]
export const GRADE_META: Record<BehaviorGrade, { label: string; color: string; bg: string; min: number }> = {
  excellent: { label: 'ممتاز', color: '#047857', bg: 'bg-emerald-100 text-emerald-800', min: 90 },
  very_good: { label: 'جيد جداً', color: '#1d4ed8', bg: 'bg-blue-100 text-blue-800', min: 80 },
  good: { label: 'جيد', color: '#0e7490', bg: 'bg-cyan-100 text-cyan-800', min: 70 },
  fair: { label: 'مقبول', color: '#b45309', bg: 'bg-amber-100 text-amber-800', min: 60 },
  poor: { label: 'ضعيف', color: '#b91c1c', bg: 'bg-rose-100 text-rose-800', min: 0 },
}
export const GRADE_ORDER: BehaviorGrade[] = ['excellent', 'very_good', 'good', 'fair', 'poor']
export const INDEX_META: Record<keyof BehaviorIndices, { label: string; short: string; hint: string; color: string }> = {
  attendance: { label: 'الالتزام بالحضور', short: 'الحضور', hint: '1 − 2 × (أيام الغياب بلا إجازة ÷ أيام الدوام المتوقعة). الإجازات والزمنيات المعتمدة محايدة.', color: '#1d4ed8' },
  punctuality: { label: 'الانضباط بوقت الدخول', short: 'الدخول', hint: '1 − (أيام التأخير ÷ أيام الحضور)، مخفَّضاً بمتوسط دقائق التأخير فوق السماحية.', color: '#7c3aed' },
  early: { label: 'الالتزام بوقت الخروج', short: 'الخروج', hint: '1 − (أيام الخروج المبكر ÷ أيام الحضور)، مخفَّضاً بمتوسط دقائق الخروج المبكر.', color: '#0e7490' },
  complete: { label: 'اكتمال البصمة', short: 'الاكتمال', hint: '1 − (أيام بصمة واحدة فقط ÷ أيام الحضور).', color: '#b45309' },
  consistency: { label: 'استقرار وقت الحضور', short: 'الاستقرار', hint: '1 − (الانحراف المعياري لوقت الدخول بالدقائق ÷ 60). ثبات الموظف على وقت وصول واحد.', color: '#047857' },
}
export const INDEX_ORDER: Array<keyof BehaviorIndices> = ['attendance', 'punctuality', 'early', 'complete', 'consistency']
export const DOW_LABELS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

export const gradeOf = (score: number | null | undefined): BehaviorGrade | null =>
  score == null ? null : score >= 90 ? 'excellent' : score >= 80 ? 'very_good' : score >= 70 ? 'good' : score >= 60 ? 'fair' : 'poor'
export const scoreColor = (score: number | null | undefined): string => (score == null ? '#94a3b8' : GRADE_META[gradeOf(score)!].color)

/** تحريك مرساة الفترة للأمام/الخلف */
export function shiftAnchor(kind: BehaviorPeriodKind, anchor: string, dir: 1 | -1): string {
  const d = new Date(anchor + 'T00:00:00Z')
  const months = kind === 'monthly' ? 1 : kind === 'quarterly' ? 3 : kind === 'half_yearly' ? 6 : 12
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + dir * months)
  return d.toISOString().slice(0, 10)
}
export function defaultAnchor(kind: BehaviorPeriodKind, today = new Date()): string {
  // الفترة المكتملة الأخيرة: الشهر الماضي للشهري، وآخر ربع/نصف/سنة مكتملة لغيرها
  const d = new Date(Date.UTC(today.getFullYear(), today.getMonth(), 1))
  const months = kind === 'monthly' ? 1 : kind === 'quarterly' ? 3 : kind === 'half_yearly' ? 6 : 12
  const m = d.getUTCMonth(), start = m - (m % months)
  d.setUTCMonth(start - months)
  return d.toISOString().slice(0, 10)
}
const AR_MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول']
export function periodTitle(kind: BehaviorPeriodKind, from: string): string {
  const y = from.slice(0, 4), m = Number(from.slice(5, 7))
  if (kind === 'monthly') return `${AR_MONTHS[m - 1]} ${y}`
  if (kind === 'quarterly') return `الربع ${['الأول', 'الثاني', 'الثالث', 'الرابع'][Math.floor((m - 1) / 3)]} ${y}`
  if (kind === 'half_yearly') return `النصف ${m <= 6 ? 'الأول' : 'الثاني'} ${y}`
  return `سنة ${y}`
}

export interface BehaviorInsight { tone: 'good' | 'warn' | 'bad' | 'info'; text: string }
const pct = (v: number | null | undefined) => `${Number(v ?? 0).toLocaleString('en-US', { maximumFractionDigits: 1 })}٪`

/** استنتاجات عامة للفترة — تُولَّد من الملخص وأيام الأسبوع والأقسام */
export function reportInsights(s: BehaviorSummary | null, weekdays: BehaviorWeekday[], departments: BehaviorDepartment[], employees: BehaviorEmployeeRow[]): BehaviorInsight[] {
  if (!s || !s.employees) return []
  const out: BehaviorInsight[] = []
  if (s.prev_avg_score != null && s.avg_score != null) {
    const d = Math.round((s.avg_score - s.prev_avg_score) * 10) / 10
    if (Math.abs(d) >= 1) out.push({ tone: d > 0 ? 'good' : 'bad', text: `متوسط درجة الانضباط ${d > 0 ? 'تحسّن' : 'تراجع'} ${Math.abs(d)} نقطة مقارنة بالفترة السابقة (${s.prev_avg_score} ← ${s.avg_score}).` })
    else out.push({ tone: 'info', text: `متوسط درجة الانضباط مستقر عند ${s.avg_score} (الفترة السابقة ${s.prev_avg_score}).` })
  }
  if (s.chronic_late > 0) out.push({ tone: 'bad', text: `${s.chronic_late} موظفاً متأخرون بشكل مزمن (≥ 30٪ من أيام حضورهم) — يحتاجون متابعة مباشرة.` })
  if (s.perfect > 0) out.push({ tone: 'good', text: `${s.perfect} موظفاً حققوا الدرجة الكاملة: لا تأخير ولا خروج مبكر ولا غياب ولا بصمة ناقصة.` })
  const wd = weekdays.filter((w) => w.worked_days >= 3)
  if (wd.length >= 2) {
    const worst = [...wd].sort((a, b) => (b.late_days / Math.max(1, b.worked_days)) - (a.late_days / Math.max(1, a.worked_days)))[0]!
    const rate = (100 * worst.late_days) / Math.max(1, worst.worked_days)
    if (rate >= 10) out.push({ tone: 'warn', text: `يوم ${DOW_LABELS[worst.dow]} هو الأعلى تأخيراً (${pct(rate)} من بصمات ذلك اليوم متأخرة).` })
    const absWorst = [...wd].sort((a, b) => b.absent_days - a.absent_days)[0]!
    if (absWorst.absent_days >= 3) out.push({ tone: 'warn', text: `أكثر الغياب يقع يوم ${DOW_LABELS[absWorst.dow]} (${absWorst.absent_days} يوم غياب).` })
  }
  const deps = departments.filter((d) => d.employees >= 2 && d.avg_score != null)
  if (deps.length >= 2) {
    const best = deps[0]!, worst = deps[deps.length - 1]!
    if ((best.avg_score ?? 0) - (worst.avg_score ?? 0) >= 5) out.push({ tone: 'info', text: `أعلى قسم انضباطاً «${best.name}» (${best.avg_score}) وأدناها «${worst.name}» (${worst.avg_score}).` })
  }
  if (s.improved || s.declined) out.push({ tone: s.improved >= s.declined ? 'good' : 'warn', text: `${s.improved} موظفاً تحسّنوا (≥ 2 نقطة) و${s.declined} تراجعوا مقارنة بالفترة السابقة.` })
  if ((s.incomplete_rate ?? 0) >= 5) out.push({ tone: 'warn', text: `${pct(s.incomplete_rate)} من أيام الحضور ببصمة واحدة فقط — راجعوا تذكير الموظفين ببصمة الخروج أو حالة الأجهزة.` })
  const top = employees.filter((e) => e.rank === 1).slice(0, 3)
  if (top.length) out.push({ tone: 'good', text: `المرتبة الأولى: ${top.map((e) => e.full_name).join('، ')} (${top[0]!.score}).` })
  return out
}

/** استنتاجات بطاقة موظف واحد */
export function employeeInsights(r: BehaviorEmployeeReport): BehaviorInsight[] {
  const c = r.current; if (!c) return [{ tone: 'info', text: 'لا بصمات لهذا الموظف في الفترة المختارة.' }]
  const out: BehaviorInsight[] = []
  const p = r.previous
  if (p) {
    const d = Math.round((c.score - p.score) * 10) / 10
    out.push(d >= 2 ? { tone: 'good', text: `تحسّن ${d} نقطة عن الفترة السابقة (${p.score} ← ${c.score}).` } : d <= -2 ? { tone: 'bad', text: `تراجع ${Math.abs(d)} نقطة عن الفترة السابقة (${p.score} ← ${c.score}).` } : { tone: 'info', text: `أداء مستقر مقارنة بالفترة السابقة (${p.score} ← ${c.score}).` })
  }
  if (r.rank && r.population) out.push({ tone: r.rank <= Math.max(1, Math.ceil(r.population * 0.1)) ? 'good' : 'info', text: `المرتبة ${r.rank} من ${r.population} موظفاً لديهم بصمة في هذه الفترة.` })
  const lateRate = c.worked_days ? (100 * c.late_days) / c.worked_days : 0
  if (lateRate >= 30) out.push({ tone: 'bad', text: `تأخير مزمن: ${c.late_days} يوم تأخير من ${c.worked_days} (${pct(lateRate)})، بمتوسط ${Math.round(c.late_minutes / Math.max(1, c.late_days))} دقيقة فوق السماحية — الدرجة محدودة بـ 69.9 حتى يتحسن النمط.` })
  else if (c.late_days > 0) out.push({ tone: 'warn', text: `${c.late_days} يوم تأخير (${pct(lateRate)}) بمجموع ${c.late_minutes} دقيقة فوق السماحية.` })
  if (c.absent_days >= Math.max(2, Math.ceil(c.expected_days * 0.1))) out.push({ tone: 'bad', text: `غياب مرتفع: ${c.absent_days} يوم بلا إجازة من ${c.expected_days} يوم متوقع — الدرجة محدودة بـ 69.9.` })
  else if (c.absent_days > 0) out.push({ tone: 'warn', text: `${c.absent_days} يوم غياب بلا إجازة.` })
  if (c.early_days > 0) out.push({ tone: 'warn', text: `${c.early_days} يوم خروج مبكر بمجموع ${c.early_minutes} دقيقة.` })
  if (c.incomplete_days > 0) out.push({ tone: 'warn', text: `${c.incomplete_days} يوم ببصمة واحدة فقط.` })
  if (c.avg_in_offset != null && c.worked_days >= 3) {
    const o = Number(c.avg_in_offset)
    out.push({ tone: o <= 0 ? 'good' : o <= 10 ? 'info' : 'warn', text: o <= 0 ? `يصل قبل موعده بمتوسط ${Math.abs(Math.round(o))} دقيقة.` : `يصل بعد موعده بمتوسط ${Math.round(o)} دقيقة.` })
    const sd = Number(c.sd_in_offset ?? 0)
    out.push({ tone: sd <= 10 ? 'good' : sd <= 30 ? 'info' : 'warn', text: sd <= 10 ? `وقت وصول ثابت جداً (تذبذب ±${sd} د).` : `تذبذب وقت الوصول ±${sd} دقيقة${sd > 30 ? ' — نمط غير منتظم.' : '.'}` })
  }
  if (c.max_perfect_streak >= 10) out.push({ tone: 'good', text: `أطول سلسلة أيام مثالية متتالية: ${c.max_perfect_streak} يوم.` })
  const wd = r.weekdays.filter((w) => w.worked_days >= 2 && w.late_days >= 2)
  if (wd.length) { const w = [...wd].sort((a, b) => b.late_days / b.worked_days - a.late_days / a.worked_days)[0]!; out.push({ tone: 'warn', text: `أكثر أيام التأخير تكراراً: ${DOW_LABELS[w.dow]} (${w.late_days} من ${w.worked_days}).` }) }
  if (c.extra_minutes >= 120) out.push({ tone: 'info', text: `بقي بعد نهاية الدوام ما مجموعه ${Math.round(c.extra_minutes / 60)} ساعة في الفترة.` })
  return out
}

/** محاور الرادار (0–100) للفترتين */
export function radarData(r: BehaviorEmployeeReport): Array<{ axis: string; current: number; previous: number | null }> {
  const pick = (m: BehaviorEmployeeReport['current'], k: keyof BehaviorIndices) => (m ? Math.round(Number(m[`idx_${k}` as const]) * 100) : null)
  return INDEX_ORDER.map((k) => ({ axis: INDEX_META[k].short, current: pick(r.current, k) ?? 0, previous: pick(r.previous, k) }))
}
