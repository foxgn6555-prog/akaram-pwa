/** 00250 · تصدير تقارير سلوك الموظفين إلى Excel (قالب الشركة الموحد: ورقة الترتيب + ملخص + اتجاه + أيام الأسبوع + أقسام + رسوم) */
import { buildExcelReport, type ReportColumn } from '@lib/export/excel-report'
import type { BehaviorEmployeeReport, BehaviorReport, BehaviorSeries } from '../types'
import { BEHAVIOR_KINDS, DOW_LABELS, GRADE_META, GRADE_ORDER, INDEX_META, INDEX_ORDER, periodTitle } from './behavior'

const ATT: Record<string, string> = { present: 'حاضر', late: 'متأخر', early_leave: 'خروج مبكر', absent: 'غائب', incomplete: 'بصمة ناقصة', leave: 'إجازة', time_permit: 'زمنية' }
const kindLabel = (k: BehaviorReport['period']['kind']) => BEHAVIOR_KINDS.find((x) => x.key === k)?.label ?? k

export const RANKING_COLUMNS: ReportColumn[] = [
  { header: '#', key: 'rank', width: 6, align: 'center' },
  { header: 'الرقم', key: 'employee_number', width: 10, align: 'center' },
  { header: 'الموظف', key: 'full_name', width: 26 },
  { header: 'القسم', key: 'department_name', width: 18 },
  { header: 'الدرجة', key: 'score', width: 9, align: 'center', numFmt: '0.0' },
  { header: 'التصنيف', key: 'grade', width: 10, align: 'center' },
  { header: 'السابقة', key: 'prev_score', width: 9, align: 'center', numFmt: '0.0' },
  { header: 'التغيّر', key: 'delta', width: 9, align: 'center', numFmt: '+0.0;-0.0;0' },
  { header: 'أيام متوقعة', key: 'expected_days', width: 9, align: 'center' },
  { header: 'حضور', key: 'present_days', width: 8, align: 'center' },
  { header: 'تأخير (يوم)', key: 'late_days', width: 9, align: 'center' },
  { header: 'تأخير (د)', key: 'late_minutes', width: 9, align: 'center' },
  { header: 'غياب', key: 'absent_days', width: 8, align: 'center' },
  { header: 'خروج مبكر', key: 'early_days', width: 9, align: 'center' },
  { header: 'بصمة ناقصة', key: 'incomplete_days', width: 9, align: 'center' },
  { header: 'إجازة', key: 'leave_days', width: 8, align: 'center' },
  { header: 'الحضور %', key: 'i_attendance', width: 9, align: 'center', numFmt: '0' },
  { header: 'الدخول %', key: 'i_punctuality', width: 9, align: 'center', numFmt: '0' },
  { header: 'الخروج %', key: 'i_early', width: 9, align: 'center', numFmt: '0' },
  { header: 'الاكتمال %', key: 'i_complete', width: 9, align: 'center', numFmt: '0' },
  { header: 'الاستقرار %', key: 'i_consistency', width: 9, align: 'center', numFmt: '0' },
  { header: 'متوسط انحراف الدخول (د)', key: 'avg_in_offset', width: 12, align: 'center', numFmt: '0.0' },
  { header: 'أطول سلسلة مثالية', key: 'max_perfect_streak', width: 10, align: 'center' },
  { header: 'ملاحظات', key: 'flags', width: 22, wrap: true },
]

export function rankingRows(r: BehaviorReport): Record<string, unknown>[] {
  return r.employees.map((e) => ({
    ...e, department_name: e.department_name ?? '—', grade: GRADE_META[e.grade].label, prev_score: e.prev_score ?? '', delta: e.delta ?? '',
    i_attendance: Math.round(e.indices.attendance * 100), i_punctuality: Math.round(e.indices.punctuality * 100), i_early: Math.round(e.indices.early * 100), i_complete: Math.round(e.indices.complete * 100), i_consistency: Math.round(e.indices.consistency * 100),
    flags: [e.chronic_late ? 'تأخير مزمن (بوابة 69.9)' : '', e.high_absence ? 'غياب مرتفع (بوابة 69.9)' : '', e.score >= 99.5 ? 'درجة كاملة' : ''].filter(Boolean).join(' · '),
  }))
}

export async function exportBehaviorExcel(r: BehaviorReport, scope?: string): Promise<void> {
  const s = r.summary!; const title = periodTitle(r.period.kind, r.period.period_from)
  const kv: ReportColumn[] = [{ header: 'المؤشر', key: 'k', width: 34 }, { header: 'القيمة', key: 'v', width: 16, align: 'center' }, { header: 'الفترة السابقة', key: 'p', width: 16, align: 'center' }]
  await buildExcelReport({
    sheetName: 'الترتيب', companySub: 'الموارد البشرية — تقارير سلوك الموظفين', title: `${kindLabel(r.period.kind)} لسلوك الموظفين — ${title}`,
    meta: `${r.period.period_from} → ${r.period.period_to_effective}${scope ? ` · ${scope}` : ''} · ${s.employees} موظف ببصمة · متوسط الدرجة ${s.avg_score ?? '—'}`,
    columns: RANKING_COLUMNS, rows: rankingRows(r), fileName: `behavior-${r.period.kind}-${r.period.period_from}.xlsx`, orientation: 'landscape',
    totalRow: { full_name: 'الإجمالي / المتوسط', score: s.avg_score ?? 0, prev_score: s.prev_avg_score ?? '', late_days: r.employees.reduce((a, e) => a + e.late_days, 0), late_minutes: s.late_minutes, absent_days: s.absent_days, early_days: r.employees.reduce((a, e) => a + e.early_days, 0), incomplete_days: r.employees.reduce((a, e) => a + e.incomplete_days, 0) },
    extraSheets: [
      { sheetName: 'الملخص', title: `ملخص الفترة — ${title}`, columns: kv, rows: [
        { k: 'الموظفون الذين لديهم بصمة', v: s.employees, p: '' }, { k: 'متوسط درجة الانضباط (من 100)', v: s.avg_score ?? '', p: s.prev_avg_score ?? '' },
        { k: 'نسبة الالتزام بالحضور %', v: s.attendance_rate ?? '', p: '' }, { k: 'نسبة الانضباط بوقت الدخول %', v: s.punctuality_rate ?? '', p: '' }, { k: 'نسبة الخروج المبكر %', v: s.early_leave_rate ?? '', p: '' },
        { k: 'نسبة الغياب بلا إجازة %', v: s.absence_rate ?? '', p: '' }, { k: 'نسبة البصمة الناقصة %', v: s.incomplete_rate ?? '', p: '' }, { k: 'مجموع دقائق التأخير', v: s.late_minutes, p: '' },
        { k: 'متوسط دقائق التأخير في يوم التأخير', v: s.avg_late_minutes_per_late_day ?? '', p: '' }, { k: 'أيام الغياب', v: s.absent_days, p: '' }, { k: 'متأخرون بشكل مزمن', v: s.chronic_late, p: '' }, { k: 'درجة كاملة', v: s.perfect, p: '' },
        { k: 'تحسّنوا (≥2 نقطة)', v: s.improved, p: '' }, { k: 'تراجعوا (≥2 نقطة)', v: s.declined, p: '' },
        ...GRADE_ORDER.map((g) => ({ k: `تصنيف ${GRADE_META[g].label}`, v: s.grades[g] ?? 0, p: '' })),
        ...INDEX_ORDER.map((k) => ({ k: `وزن ${INDEX_META[k].label}`, v: `${r.weights[k]}٪`, p: '' })),
        { k: 'بوابات', v: 'تأخير مزمن ≥30٪ أو غياب ≥10٪ ⇒ حد 69.9', p: '' },
      ] },
      { sheetName: 'الاتجاه', title: `الاتجاه الزمني — ${title}`, columns: [{ header: 'الفترة', key: 'label', width: 12, align: 'center' }, { header: 'من', key: 'from', width: 12, align: 'center' }, { header: 'إلى', key: 'to', width: 12, align: 'center' }, { header: 'متوسط الدرجة', key: 'avg_score', width: 12, align: 'center', numFmt: '0.0' }, { header: 'تأخير %', key: 'late_rate', width: 10, align: 'center', numFmt: '0.0' }, { header: 'غياب %', key: 'absence_rate', width: 10, align: 'center', numFmt: '0.0' }, { header: 'خروج مبكر %', key: 'early_rate', width: 10, align: 'center', numFmt: '0.0' }, { header: 'موظفون', key: 'employees', width: 9, align: 'center' }],
        rows: r.trend.map((t) => ({ ...t, avg_score: t.avg_score ?? '', late_rate: t.late_rate ?? '', absence_rate: t.absence_rate ?? '', early_rate: t.early_rate ?? '' })) },
      { sheetName: 'أيام الأسبوع', title: `النمط الأسبوعي — ${title}`, columns: [{ header: 'اليوم', key: 'day', width: 12 }, { header: 'أيام حضور', key: 'worked_days', width: 10, align: 'center' }, { header: 'أيام تأخير', key: 'late_days', width: 10, align: 'center' }, { header: 'تأخير %', key: 'late_rate', width: 10, align: 'center', numFmt: '0.0' }, { header: 'أيام غياب', key: 'absent_days', width: 10, align: 'center' }, { header: 'خروج مبكر', key: 'early_days', width: 10, align: 'center' }],
        rows: r.weekdays.map((w) => ({ ...w, day: DOW_LABELS[w.dow], late_rate: w.late_rate ?? 0 })) },
      { sheetName: 'الأقسام', title: `الأقسام — ${title}`, columns: [{ header: 'القسم', key: 'name', width: 24 }, { header: 'موظفون', key: 'employees', width: 9, align: 'center' }, { header: 'متوسط الدرجة', key: 'avg_score', width: 12, align: 'center', numFmt: '0.0' }, { header: 'تأخير %', key: 'late_rate', width: 10, align: 'center', numFmt: '0.0' }, { header: 'غياب %', key: 'absence_rate', width: 10, align: 'center', numFmt: '0.0' }],
        rows: r.departments.map((d) => ({ ...d, avg_score: d.avg_score ?? '', late_rate: d.late_rate ?? '', absence_rate: d.absence_rate ?? '' })) },
    ],
    charts: [
      { title: 'توزيع التصنيفات', kind: 'donut', data: GRADE_ORDER.map((g) => ({ label: GRADE_META[g].label, value: s.grades[g] ?? 0, color: GRADE_META[g].color })), valueLabel: 'موظف' },
      { title: 'متوسط الدرجة حسب القسم', kind: 'bar', data: r.departments.slice(0, 12).map((d) => ({ label: d.name, value: d.avg_score ?? 0 })), valueLabel: 'درجة' },
      { title: 'متوسط الدرجة عبر الزمن', kind: 'bar', data: r.trend.map((t) => ({ label: t.label, value: t.avg_score ?? 0 })), valueLabel: 'درجة' },
    ],
  })
}

export async function exportEmployeeExcel(r: BehaviorEmployeeReport): Promise<void> {
  const c = r.current; const title = periodTitle(r.period.kind, r.period.period_from)
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Baghdad' }) : '')
  await buildExcelReport({
    sheetName: 'السجل اليومي', companySub: 'الموارد البشرية — بطاقة سلوك موظف', title: `${r.employee.full_name} (${r.employee.employee_number}) — ${title}`,
    meta: `${r.employee.department_name ?? 'بلا قسم'} · الدرجة ${c?.score ?? '—'} · المرتبة ${r.rank ?? '—'} من ${r.population}${r.previous ? ` · الفترة السابقة ${r.previous.score}` : ''}`,
    columns: [{ header: 'التاريخ', key: 'date', width: 12, align: 'center' }, { header: 'اليوم', key: 'day', width: 10 }, { header: 'الحالة', key: 'status', width: 12 }, { header: 'دخول', key: 'in', width: 8, align: 'center' }, { header: 'خروج', key: 'out', width: 8, align: 'center' }, { header: 'انحراف الدخول (د)', key: 'in_offset', width: 10, align: 'center' }, { header: 'تأخير (د)', key: 'late', width: 9, align: 'center' }, { header: 'خروج مبكر (د)', key: 'early', width: 9, align: 'center' }, { header: 'بقاء (د)', key: 'extra', width: 9, align: 'center' }, { header: 'منجز (د)', key: 'worked', width: 9, align: 'center' }, { header: 'المصدر', key: 'source', width: 8, align: 'center' }],
    rows: r.days.map((d) => ({ ...d, day: DOW_LABELS[d.dow], status: ATT[d.status] ?? d.status, in: fmt(d.in), out: fmt(d.out), in_offset: d.in_offset ?? '', source: d.source === 'manual' ? 'يدوي' : 'بصمة' })),
    fileName: `behavior-${r.employee.employee_number}-${r.period.period_from}.xlsx`,
    totalRow: c ? { date: 'الإجمالي', late: c.late_minutes, early: c.early_minutes, extra: c.extra_minutes } : undefined,
    extraSheets: c ? [{ sheetName: 'الملخص', title: `ملخص — ${r.employee.full_name}`, columns: [{ header: 'المؤشر', key: 'k', width: 30 }, { header: 'الحالية', key: 'v', width: 14, align: 'center' }, { header: 'السابقة', key: 'p', width: 14, align: 'center' }],
      rows: [
        { k: 'الدرجة', v: c.score, p: r.previous?.score ?? '' }, { k: 'التصنيف', v: GRADE_META[c.grade].label, p: r.previous ? GRADE_META[r.previous.grade].label : '' },
        ...INDEX_ORDER.map((k) => ({ k: `${INDEX_META[k].label} (${r.weights[k]}٪)`, v: Math.round(Number(c[`idx_${k}`]) * 100), p: r.previous ? Math.round(Number(r.previous[`idx_${k}`]) * 100) : '' })),
        { k: 'أيام متوقعة', v: c.expected_days, p: r.previous?.expected_days ?? '' }, { k: 'حضور', v: c.present_days, p: r.previous?.present_days ?? '' }, { k: 'تأخير (يوم)', v: c.late_days, p: r.previous?.late_days ?? '' }, { k: 'تأخير (د)', v: c.late_minutes, p: r.previous?.late_minutes ?? '' },
        { k: 'غياب', v: c.absent_days, p: r.previous?.absent_days ?? '' }, { k: 'خروج مبكر', v: c.early_days, p: r.previous?.early_days ?? '' }, { k: 'بصمة ناقصة', v: c.incomplete_days, p: r.previous?.incomplete_days ?? '' },
        { k: 'متوسط انحراف الدخول (د)', v: c.avg_in_offset ?? '', p: r.previous?.avg_in_offset ?? '' }, { k: 'تذبذب الدخول (د)', v: c.sd_in_offset ?? '', p: r.previous?.sd_in_offset ?? '' }, { k: 'أطول سلسلة مثالية', v: c.max_perfect_streak, p: r.previous?.max_perfect_streak ?? '' },
      ] }] : [],
  })
}

export async function exportSeriesExcel(s: BehaviorSeries): Promise<void> {
  const TREND: Record<string, string> = { improving: 'متحسن', declining: 'متراجع', stable: 'مستقر', insufficient: 'بيانات غير كافية' }
  const cols: ReportColumn[] = [{ header: 'الرقم', key: 'employee_number', width: 10, align: 'center' }, { header: 'الموظف', key: 'full_name', width: 26 }, { header: 'القسم', key: 'department_name', width: 18 },
    ...s.periods.map((p, i) => ({ header: p.label, key: `p${i}`, width: 10, align: 'center' as const, numFmt: '0.0' })),
    { header: 'الميل/فترة', key: 'slope', width: 10, align: 'center', numFmt: '+0.00;-0.00;0' }, { header: 'الاتجاه', key: 'trend', width: 14, align: 'center' }]
  await buildExcelReport({
    sheetName: 'المقارنة', companySub: 'الموارد البشرية — تقارير سلوك الموظفين', title: `مقارنة ${s.periods.length} فترات (${kindLabel(s.kind)})`,
    meta: `${s.periods[0]?.label ?? ''} → ${s.periods[s.periods.length - 1]?.label ?? ''} · ${s.employees.length} موظف`,
    columns: cols, rows: s.employees.map((e) => ({ ...e, department_name: e.department_name ?? '—', ...Object.fromEntries(e.scores.map((v, i) => [`p${i}`, v ?? ''])), slope: e.slope ?? '', trend: TREND[e.trend] })),
    fileName: `behavior-series-${s.kind}.xlsx`, orientation: 'landscape',
    extraSheets: [{ sheetName: 'ملخص الفترات', title: 'ملخص كل فترة', columns: [{ header: 'الفترة', key: 'label', width: 12, align: 'center' }, { header: 'موظفون', key: 'employees', width: 9, align: 'center' }, { header: 'متوسط الدرجة', key: 'avg_score', width: 12, align: 'center', numFmt: '0.0' }, { header: 'حضور %', key: 'attendance_rate', width: 10, align: 'center', numFmt: '0.0' }, { header: 'انضباط الدخول %', key: 'punctuality_rate', width: 12, align: 'center', numFmt: '0.0' }, { header: 'غياب %', key: 'absence_rate', width: 10, align: 'center', numFmt: '0.0' }, { header: 'خروج مبكر %', key: 'early_rate', width: 10, align: 'center', numFmt: '0.0' }, { header: 'دقائق تأخير', key: 'late_minutes', width: 10, align: 'center' }, { header: 'مزمنون', key: 'chronic_late', width: 9, align: 'center' }],
      rows: s.periods.map((p) => ({ ...p, avg_score: p.avg_score ?? '', attendance_rate: p.attendance_rate ?? '', punctuality_rate: p.punctuality_rate ?? '', absence_rate: p.absence_rate ?? '', early_rate: p.early_rate ?? '' })) }],
    charts: [{ title: 'متوسط الدرجة عبر الفترات', kind: 'bar', data: s.periods.map((p) => ({ label: p.label, value: p.avg_score ?? 0 })), valueLabel: 'درجة' }],
  })
}
