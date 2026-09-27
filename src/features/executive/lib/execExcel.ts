/**
 * تصدير التقرير التنفيذي إلى Excel متعدد الأوراق (RTL): غلاف + استنتاجات + ورقة لكل وحدة + السلاسل اليومية.
 * الأرقام صافية؛ لا أعمدة فردية للرواتب (تبقى في بوابة المالية).
 */
import type { Workbook, Worksheet } from 'exceljs'
import type { ExecOverview, NamedCount, KeyedCount } from '../types'
import type { Insight } from './insights'
import { attendanceRate } from './insights'
import { periodLabel, reportKindLabel } from './period'
import { STATUS_LABELS } from './labels'

export interface ExecSheet { name: string; title: string; columns: string[]; rows: Array<Array<string | number | null>> }

const kv = (pairs: Array<[string, string | number | null]>): Array<Array<string | number | null>> => pairs.map(([k, v]) => [k, v])
const nc = (items: NamedCount[], extra?: 'tons' | 'qty' | 'deficit') => items.map((i) => [i.name, i.count, ...(extra ? [Number(i[extra] ?? 0)] : [])])
const kc = (items: KeyedCount[]) => items.map((i) => [STATUS_LABELS[i.key] ?? i.key, i.count])

/** يبني أوراق التقرير كبيانات صافية (قابلة للاختبار دون exceljs) */
export type ExecScope = 'all' | 'finance'

/** أوراق المالية فقط: ملخص مالي مقارن + استنتاجات مالية + الرواتب الشهرية + الموازنة + الإنفاق + أثر الحضور على الرواتب */
export function buildFinanceSheets(o: ExecOverview, insights: Insight[], prev?: ExecOverview | null): ExecSheet[] {
  const f = o.finance, pf = prev?.finance, a = o.workforce.attendance
  const cmp = (cur: number, p?: number) => (prev ? [cur, p ?? 0, p ? Math.round(((cur - p) / p) * 100) + '٪' : '—'] : [cur])
  const cmpCols = prev ? ['المؤشر', 'الفترة الحالية', 'الفترة السابقة', 'التغيّر'] : ['المؤشر', 'القيمة']
  const spend = f.purchases.total + f.maintenance_cost
  const summary: Array<Array<string | number | null>> = [
    ['صافي كشف الرواتب (د.ع)', ...cmp(f.payroll?.final_total ?? 0, pf?.payroll?.final_total)],
    ['الراتب المقترح (د.ع)', ...cmp(f.payroll?.proposed_total ?? 0, pf?.payroll?.proposed_total)],
    ['الاستقطاعات (د.ع)', ...cmp(f.payroll?.deductions_total ?? 0, pf?.payroll?.deductions_total)],
    ['المخصصات (د.ع)', ...cmp(f.payroll?.allowances_total ?? 0, pf?.payroll?.allowances_total)],
    ['موظفو الكشف', ...cmp(f.payroll?.employees ?? 0, pf?.payroll?.employees)],
    ['الإنفاق التشغيلي (د.ع)', ...cmp(spend, pf ? pf.purchases.total + pf.maintenance_cost : undefined)],
    ['مشتريات الصيانة (د.ع)', ...cmp(f.purchases.total, pf?.purchases.total)],
    ['أوامر الشراء', ...cmp(f.purchases.orders, pf?.purchases.orders)],
    ['كلفة أعمال الصيانة (د.ع)', ...cmp(f.maintenance_cost, pf?.maintenance_cost)],
    [`موازنة ${f.budget.year}: المخصص (د.ع)`, ...cmp(f.budget.allocated, pf?.budget.allocated)],
    [`موازنة ${f.budget.year}: المصروف (د.ع)`, ...cmp(f.budget.spent, pf?.budget.spent)],
    ['الملاك الفعلي', ...cmp(o.workforce.active, prev?.workforce.active)],
    ['أيام الاستقطاع المقترحة', ...cmp(a.deduction_days, prev?.workforce.attendance.deduction_days)],
  ]
  const fin = insights.filter((i) => i.domain === 'المالية' || i.id === 'attendance' || i.id === 'hr_moves')
  return [
    { name: 'الملخص المالي', title: `${reportKindLabel(o.period.from, o.period.to)} (مالي) — ${periodLabel(o.period.from, o.period.to)}`, columns: cmpCols, rows: summary },
    { name: 'الاستنتاجات', title: 'قراءة مالية للفترة', columns: ['الوحدة', 'الاستنتاج', 'الاتجاه'], rows: fin.map((i) => [i.domain, i.text, i.tone === 'good' ? 'إيجابي' : i.tone === 'bad' ? 'سلبي' : i.tone === 'warn' ? 'يحتاج انتباهاً' : 'محايد']) },
    { name: 'الرواتب', title: 'كشوف الرواتب الشهرية', columns: ['الشهر', 'الحالة', 'الصافي (د.ع)'], rows: [...(f.payroll ? [[`${f.payroll.month.slice(0, 7)} (الأحدث)`, STATUS_LABELS[f.payroll.status] ?? f.payroll.status, f.payroll.final_total]] : []), ...f.payroll_months.map((m) => [m.month.slice(0, 7), STATUS_LABELS[m.status] ?? m.status, Number(m.total)])] },
    { name: 'الموازنة', title: `موازنة ${f.budget.year} حسب البند`, columns: ['البند', 'المخصص (د.ع)', 'المصروف (د.ع)', 'نسبة الصرف'], rows: [['الإجمالي', f.budget.allocated, f.budget.spent, f.budget.allocated ? Math.round((f.budget.spent / f.budget.allocated) * 100) + '٪' : '—'], ...f.budget.by_category.map((b) => [b.name, Number(b.allocated), Number(b.spent), Number(b.allocated) ? Math.round((Number(b.spent) / Number(b.allocated)) * 100) + '٪' : '—'])] },
    { name: 'الإنفاق', title: 'الإنفاق التشغيلي', columns: ['البند', 'القيمة'], rows: kv([['مشتريات الصيانة (د.ع)', f.purchases.total], ['عدد أوامر الشراء', f.purchases.orders], ['عدد المواد', f.purchases.items], ['كلفة أعمال الصيانة (د.ع)', f.maintenance_cost], ['حالات صيانة منجزة', o.fleet.maintenance.closed], ['متوسط كلفة الحالة (د.ع)', o.fleet.maintenance.closed ? Math.round(f.maintenance_cost / o.fleet.maintenance.closed) : 0]]) },
    { name: 'أثر الحضور', title: 'أثر الحضور على الرواتب', columns: ['البند', 'القيمة'], rows: kv([['الملاك الفعلي', o.workforce.active], ['تعيينات', o.workforce.hired], ['إنهاء خدمة', o.workforce.terminated], ['أيام الغياب', a.absent], ['أيام التأخير', a.late], ['دقائق النقص', a.shortfall_minutes], ['دقائق الإضافي', a.overtime_minutes], ['أيام الاستقطاع المقترحة', a.deduction_days], ['إجازات معتمدة (أيام)', o.workforce.leaves.days]]) },
  ]
}

export function buildExecSheets(o: ExecOverview, insights: Insight[], prev?: ExecOverview | null, scope: ExecScope = 'all'): ExecSheet[] {
  if (scope === 'finance') return buildFinanceSheets(o, insights, prev)
  const rate = attendanceRate(o.workforce.attendance)
  const a = o.workforce.attendance
  const cmp = (cur: number, p?: number) => (prev ? [cur, p ?? 0, p ? Math.round(((cur - p) / p) * 100) + '٪' : '—'] : [cur])
  const cmpCols = prev ? ['المؤشر', 'الفترة الحالية', 'الفترة السابقة', 'التغيّر'] : ['المؤشر', 'القيمة']
  const summary: Array<Array<string | number | null>> = [
    ['الشكاوى الواردة', ...cmp(o.complaints.total, prev?.complaints.total)],
    ['شكاوى قيد المعالجة', ...cmp(o.complaints.open, prev?.complaints.open)],
    ['انطلاقات الآليات', ...cmp(o.fleet.departures, prev?.fleet.departures)],
    ['متوسط ساعات الرحلة', ...cmp(o.fleet.avg_hours, prev?.fleet.avg_hours)],
    ['حالات صيانة جديدة', ...cmp(o.fleet.maintenance.opened, prev?.fleet.maintenance.opened)],
    ['كلفة الصيانة (د.ع)', ...cmp(o.fleet.maintenance.cost, prev?.fleet.maintenance.cost)],
    ['أطنان المحطة التحويلية', ...cmp(o.station.tons, prev?.station.tons)],
    ['مخالفات نقص الحمولة', ...cmp(o.station.violations, prev?.station.violations)],
    ['كشوفات المخالفات', ...cmp(o.disclosures.total, prev?.disclosures.total)],
    ['نسبة الحضور ٪', ...cmp(rate ?? 0, prev ? (attendanceRate(prev.workforce.attendance) ?? 0) : undefined)],
    ['أيام الغياب', ...cmp(a.absent, prev?.workforce.attendance.absent)],
    ['الملاك الفعلي', ...cmp(o.workforce.active, prev?.workforce.active)],
    ['مشتريات الصيانة (د.ع)', ...cmp(o.finance.purchases.total, prev?.finance.purchases.total)],
    ['أنشطة الإعلام', ...cmp(o.media.submissions, prev?.media.submissions)],
    ['طلبات التجهيز', ...cmp(o.supplies.total, prev?.supplies.total)],
  ]
  return [
    { name: 'الملخص', title: `${reportKindLabel(o.period.from, o.period.to)} — ${periodLabel(o.period.from, o.period.to)}`, columns: cmpCols, rows: summary },
    { name: 'الاستنتاجات', title: 'قراءة تحليلية للفترة', columns: ['الوحدة', 'الاستنتاج', 'الاتجاه'], rows: insights.map((i) => [i.domain, i.text, i.tone === 'good' ? 'إيجابي' : i.tone === 'bad' ? 'سلبي' : i.tone === 'warn' ? 'يحتاج انتباهاً' : 'محايد']) },
    { name: 'الشكاوى', title: 'الشكاوى', columns: ['البند', 'العدد'], rows: [...kv([['الإجمالي', o.complaints.total], ['قيد المعالجة', o.complaints.open], ['منجزة', o.complaints.resolved]]), ['— حسب الحالة —', null], ...kc(o.complaints.by_status), ['— حسب القطاع —', null], ...nc(o.complaints.by_sector.map((s) => ({ ...s, name: STATUS_LABELS[s.name] ?? s.name }))), ['— حسب النوع —', null], ...nc(o.complaints.by_type)] },
    { name: 'الأسطول والصيانة', title: 'الأسطول والانطلاقات والصيانة', columns: ['البند', 'العدد'], rows: [...kv([['الآليات', o.fleet.vehicles], ['الانطلاقات', o.fleet.departures], ['العائدة', o.fleet.returned], ['في الميدان الآن', o.fleet.open_now], ['متوسط ساعات الرحلة', o.fleet.avg_hours], ['بلاغات الأعطال', o.fleet.breakdowns], ['تنبيهات GPS', o.fleet.gps_alerts], ['صيانة: جديدة', o.fleet.maintenance.opened], ['صيانة: منجزة', o.fleet.maintenance.closed], ['صيانة: مفتوحة الآن', o.fleet.maintenance.open_now], ['صيانة: متوسط الساعات', o.fleet.maintenance.avg_hours], ['صيانة: الكلفة (د.ع)', o.fleet.maintenance.cost]]), ['— حسب الشفت —', null], ...nc(o.fleet.by_shift.map((s) => ({ ...s, name: STATUS_LABELS[s.name] ?? s.name }))), ['— حسب القاطع —', null], ...nc(o.fleet.by_sector), ['— حسب نوع العطل —', null], ...nc(o.fleet.maintenance.by_fault)] },
    { name: 'المحطة التحويلية', title: 'المحطة التحويلية', columns: ['البند', 'العدد', 'الأطنان'], rows: [['عمليات الوزن', o.station.weighings, o.station.tons], ['مخالفات نقص الحمولة', o.station.violations, o.station.deficit_tons], ['— حسب نوع الآلية —', null, null], ...nc(o.station.by_kind, 'tons'), ['— حسب الوجهة —', null, null], ...nc(o.station.by_destination, 'tons'), ['— الأكثر مخالفة —', null, null], ...nc(o.station.top_violators, 'deficit')] },
    { name: 'الموارد البشرية', title: 'القوى العاملة والحضور', columns: ['البند', 'القيمة'], rows: [...kv([['الملاك الفعلي', o.workforce.active], ['تعيينات', o.workforce.hired], ['إنهاء خدمة', o.workforce.terminated], ['نسبة الحضور ٪', rate ?? '—'], ['حاضر', a.present], ['متأخر', a.late], ['غائب', a.absent], ['بصمة ناقصة', a.incomplete], ['إجازة/زمنية', a.leave], ['دقائق النقص', a.shortfall_minutes], ['دقائق الإضافي', a.overtime_minutes], ['استقطاع مقترح (أيام)', a.deduction_days], ['إجازات معلّقة', o.workforce.leaves.pending], ['إجازات معتمدة', o.workforce.leaves.approved], ['أيام الإجازات', o.workforce.leaves.days], ['تنبيهات', o.workforce.alerts]]), ['— حسب القسم —', null], ...nc(o.workforce.by_department)] },
    { name: 'الكشوفات', title: 'كشوفات المخالفات الميدانية', columns: ['البند', 'العدد'], rows: [['الإجمالي', o.disclosures.total], ['— حسب نوع المخالفة —', null], ...nc(o.disclosures.by_violation.map((s) => ({ ...s, name: STATUS_LABELS[s.name] ?? s.name }))), ['— حسب المتعهد —', null], ...nc(o.disclosures.by_contractor), ['— حسب الحالة —', null], ...kc(o.disclosures.by_status)] },
    { name: 'المالية', title: 'المالية (إجماليات)', columns: ['البند', 'القيمة'], rows: [...kv([['كشف الرواتب (الشهر)', o.finance.payroll?.month?.slice(0, 7) ?? '—'], ['حالة الكشف', o.finance.payroll ? (STATUS_LABELS[o.finance.payroll.status] ?? o.finance.payroll.status) : '—'], ['موظفو الكشف', o.finance.payroll?.employees ?? 0], ['صافي الرواتب (د.ع)', o.finance.payroll?.final_total ?? 0], ['الاستقطاعات (د.ع)', o.finance.payroll?.deductions_total ?? 0], ['مشتريات الصيانة (د.ع)', o.finance.purchases.total], ['عدد أوامر الشراء', o.finance.purchases.orders], ['كلفة الصيانة (د.ع)', o.finance.maintenance_cost], [`موازنة ${o.finance.budget.year}: مخصص`, o.finance.budget.allocated], ['موازنة: مصروف', o.finance.budget.spent]]), ['— الموازنة حسب البند —', null], ...o.finance.budget.by_category.map((b) => [b.name, `${b.spent} / ${b.allocated}`]), ['— الرواتب الشهرية —', null], ...o.finance.payroll_months.map((m) => [m.month.slice(0, 7), m.total])] },
    { name: 'الإعلام والتجهيز', title: 'الإعلام وتجهيز القواطع وحاويات GBS', columns: ['البند', 'العدد', 'الكمية'], rows: [['أنشطة الإعلام', o.media.submissions, null], ['صور موثقة', o.media.photos, null], ...nc(o.media.by_work_type).map((r) => [...r, null]), ['طلبات التجهيز', o.supplies.total, null], ...nc(o.supplies.by_type, 'qty'), ['حاويات GBS', o.gbs.total, null], ...kc(o.gbs.by_status).map((r) => [...r, null])] },
    { name: 'السلاسل اليومية', title: 'الحركة اليومية', columns: ['اليوم', 'شكاوى', 'انطلاقات', 'أطنان', 'حاضر', 'غائب', 'متأخر'], rows: mergeSeries(o) },
  ]
}

function mergeSeries(o: ExecOverview): Array<Array<string | number | null>> {
  const days = new Map<string, { c: number; f: number; t: number; p: number; ab: number; l: number }>()
  const get = (d: string) => { let x = days.get(d); if (!x) { x = { c: 0, f: 0, t: 0, p: 0, ab: 0, l: 0 }; days.set(d, x) } return x }
  o.complaints.series.forEach((s) => { get(s.d).c = s.count })
  o.fleet.series.forEach((s) => { get(s.d).f = s.count })
  o.station.series.forEach((s) => { get(s.d).t = Number(s.tons) })
  o.workforce.attendance_series.forEach((s) => { const x = get(s.d); x.p = s.present; x.ab = s.absent; x.l = s.late })
  return [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([d, x]) => [d, x.c, x.f, x.t, x.p, x.ab, x.l])
}

export async function buildExecWorkbook(o: ExecOverview, insights: Insight[], prev: ExecOverview | null, orgName = 'منصة الأكرم', scope: ExecScope = 'all'): Promise<Workbook> {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook(); wb.creator = `${orgName} — الإدارة العليا`; wb.created = new Date()
  const sheets = buildExecSheets(o, insights, prev, scope)
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31), { views: [{ rightToLeft: true, state: 'frozen', ySplit: 3 }], pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } })
    head(ws, s, o)
    s.rows.forEach((r, i) => {
      const row = ws.addRow(r)
      const isSection = typeof r[0] === 'string' && r[0].startsWith('—')
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.alignment = { vertical: 'middle', horizontal: col === 1 ? 'right' : 'center', wrapText: true }
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFCBD5E1' } } }
        if (isSection) { cell.font = { bold: true, color: { argb: 'FF1E3A8A' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } } }
        else if (i % 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
        if (typeof cell.value === 'number') cell.numFmt = Number.isInteger(cell.value) ? '#,##0' : '#,##0.0'
      })
    })
    ws.getColumn(1).width = s.name === 'الاستنتاجات' ? 18 : 34
    for (let c = 2; c <= s.columns.length; c++) ws.getColumn(c).width = s.name === 'الاستنتاجات' && c === 2 ? 90 : 18
  }
  return wb
}

function head(ws: Worksheet, s: ExecSheet, o: ExecOverview) {
  const n = s.columns.length
  ws.mergeCells(1, 1, 1, n)
  ws.getCell('A1').value = s.title; ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }; ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }; ws.getRow(1).height = 26
  ws.mergeCells(2, 1, 2, n)
  ws.getCell('A2').value = `${periodLabel(o.period.from, o.period.to)}${o.period.sector ? ' · قاطع ' + o.period.sector : ''}${o.period.shift ? ' · شفت ' + (STATUS_LABELS[o.period.shift] ?? o.period.shift) : ''} · أُنشئ ${new Date().toLocaleString('ar-IQ')}`
  ws.getCell('A2').font = { size: 9, color: { argb: 'FF475569' } }; ws.getCell('A2').alignment = { horizontal: 'center' }
  const hr = ws.getRow(3); hr.values = s.columns
  hr.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }; c.alignment = { horizontal: 'center', vertical: 'middle' } })
}

export async function downloadExecWorkbook(o: ExecOverview, insights: Insight[], prev: ExecOverview | null, fileName: string, scope: ExecScope = 'all') {
  const wb = await buildExecWorkbook(o, insights, prev, undefined, scope)
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = fileName; a.click(); URL.revokeObjectURL(url)
}
