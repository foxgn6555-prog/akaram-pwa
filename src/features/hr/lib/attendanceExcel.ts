/**
 * 00193 · تصدير حضوريات غرفة العمليات إلى Excel بمرحلتين — ورقة «الملخص» ثم ورقة لكل قسم (لا فوضى):
 *   - التفصيلي (المرحلة 1): كل خلية يوم = أول بصمة → آخر بصمة مع لون الحالة، ثم مجاميع (حضور/تأخير/غياب/إجازة/ساعات/تأخير/نقص/إضافي/استقطاع مقترح).
 *   - المعتمد (المرحلة 2): كل خلية يوم = حاضر / غائب / مجاز فقط (راحة للجمعة)، ثم أيام الحضور/الغياب/الإجازة وساعات العمل.
 */
import type { Workbook, Worksheet } from 'exceljs'
import type { AttendanceGridCell, AttendanceGridRow, AttendanceGridStatus } from '../types'

export type ApprovedKind = 'present' | 'absent' | 'leave' | 'rest' | 'none'
export const APPROVED_LABEL: Record<ApprovedKind, string> = { present: 'حاضر', absent: 'غائب', leave: 'مجاز', rest: 'راحة', none: '—' }
export const APPROVED_SHORT: Record<ApprovedKind, string> = { present: 'ح', absent: 'غ', leave: 'م', rest: 'ر', none: '—' }
/** اختزال حالة اليوم إلى حاضر/غائب/مجاز (المرحلة 2): المتأخر والخروج المبكر والبصمة الناقصة = حاضر (تفاصيلها في المرحلة 1 فقط) */
export function approvedKind(s: AttendanceGridStatus): ApprovedKind {
  switch (s) {
    case 'present': case 'late': case 'early_leave': case 'incomplete': return 'present'
    case 'absent': return 'absent'
    case 'leave': case 'time_permit': return 'leave'
    case 'rest': return 'rest'
    default: return 'none'
  }
}
export const fmtHM = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`
export const DETAIL_LABEL: Record<AttendanceGridStatus, string> = {
  present: 'حاضر', late: 'متأخر', early_leave: 'خروج مبكر', absent: 'غائب', incomplete: 'بصمة ناقصة', leave: 'إجازة', time_permit: 'زمنية', pending: 'غير محتسب', future: '—', none: '—', rest: 'راحة',
}
const FILL: Record<string, string> = { present: 'FFDCFCE7', late: 'FFFEF3C7', early_leave: 'FFFFEDD5', incomplete: 'FFEDE9FE', absent: 'FFFEE2E2', leave: 'FFE0F2FE', time_permit: 'FFE0F2FE', rest: 'FFF1F5F9', pending: 'FFFFFFFF', future: 'FFFFFFFF', none: 'FFF8FAFC' }
const FONT: Record<string, string> = { present: 'FF166534', late: 'FF92400E', early_leave: 'FF9A3412', incomplete: 'FF5B21B6', absent: 'FFB91C1C', leave: 'FF075985', time_permit: 'FF075985', rest: 'FF64748B', pending: 'FF94A3B8', future: 'FFCBD5E1', none: 'FFCBD5E1' }
const WEEKDAY_AR = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت']
const thin = () => ({ top: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } }, left: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } }, bottom: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } }, right: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } } })

export interface AttendanceExportMeta { month: string; branchLabel: string; departmentLabel: string; search?: string; confirmedBy?: string | null; confirmedAt?: string | null }

/** يوم الخلية التفصيلية: «08:02→16:05» · ناقصة «08:00→؟» · غائب «غ» · إجازة «إجازة» */
export function detailCellText(c: AttendanceGridCell): string {
  if (c.s === 'absent') return 'غ'
  if (c.s === 'leave') return 'إجازة'
  if (c.s === 'time_permit') return c.in ? `${c.in}→${c.out ?? '؟'} ز` : 'زمنية'
  if (c.s === 'rest') return 'راحة'
  if (c.s === 'pending') return '؟'
  if (c.s === 'future' || c.s === 'none') return ''
  return `${c.in ?? '؟'}→${c.out ?? '؟'}`
}

const safeSheetName = (name: string, used: Set<string>) => {
  let base = name.replace(/[\\/*?:[\]]/g, ' ').trim().slice(0, 28) || 'قسم'
  let n = base; let i = 2
  while (used.has(n)) { n = `${base} (${i++})` }
  used.add(n); return n
}
function header(ws: Worksheet, title: string, subtitle: string, cols: number, color = 'FF1E3A8A') {
  ws.mergeCells(1, 1, 1, cols)
  const t = ws.getCell('A1'); t.value = title; t.font = { bold: true, size: 15, color: { argb: 'FFFFFFFF' } }
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }; t.alignment = { horizontal: 'center', vertical: 'middle' }; ws.getRow(1).height = 28
  ws.mergeCells(2, 1, 2, cols)
  const s = ws.getCell('A2'); s.value = subtitle; s.font = { size: 10, color: { argb: 'FF475569' } }; s.alignment = { horizontal: 'center' }
  ws.getRow(3).height = 6
}
function dayHeaders(ws: Worksheet, fixed: string[], days: string[], totals: string[]) {
  const h1 = ws.getRow(4); const h2 = ws.getRow(5)
  h1.values = [...fixed, ...days.map((d) => String(Number(d.slice(8, 10)))), ...totals]
  h2.values = [...fixed.map(() => ''), ...days.map((d) => WEEKDAY_AR[new Date(`${d}T00:00:00Z`).getUTCDay()] ?? ''), ...totals.map(() => '')]
  for (let c = 1; c <= fixed.length; c++) ws.mergeCells(4, c, 5, c)
  for (let i = 0; i < totals.length; i++) ws.mergeCells(4, fixed.length + days.length + 1 + i, 5, fixed.length + days.length + 1 + i)
  ;[h1, h2].forEach((r) => r.eachCell({ includeEmpty: true }, (cell, col) => {
    const di = col - fixed.length - 1
    const isFriday = di >= 0 && di < days.length && new Date(`${days[di]}T00:00:00Z`).getUTCDay() === 5
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: r === h2 ? 8 : 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isFriday ? 'FF475569' : 'FF334155' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; cell.border = thin()
  }))
  h1.height = 22; h2.height = 16
}
const groupByDepartment = (rows: AttendanceGridRow[]) => {
  const map = new Map<string, AttendanceGridRow[]>()
  for (const r of rows) { const k = r.department_name ?? 'بلا قسم'; if (!map.has(k)) map.set(k, []); map.get(k)!.push(r) }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ar'))
}
const subtitleOf = (meta: AttendanceExportMeta, rows: number) => [`الشهر: ${meta.month.slice(0, 7)}`, `الفرع: ${meta.branchLabel}`, `القسم: ${meta.departmentLabel}`, meta.search ? `بحث: ${meta.search}` : '', `${rows} موظفاً`, `أُنشئ ${new Date().toLocaleString('ar-IQ-u-nu-latn')}`].filter(Boolean).join(' · ')

function summarySheet(wb: Workbook, rows: AttendanceGridRow[], meta: AttendanceExportMeta, title: string, color: string, detailed: boolean) {
  const ws = wb.addWorksheet('الملخص', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 4 }] })
  const cols = detailed ? ['ت', 'القسم', 'الموظفون', 'أيام الحضور', 'أيام التأخير', 'خروج مبكر', 'بصمات ناقصة', 'أيام الغياب', 'أيام الإجازة', 'ساعات العمل', 'دقائق التأخير', 'دقائق النقص', 'إضافي', 'استقطاع مقترح (دقائق)', 'استقطاع مقترح (أيام)']
    : ['ت', 'القسم', 'الموظفون', 'أيام الحضور', 'أيام الغياب', 'أيام الإجازة', 'ساعات العمل']
  header(ws, title, subtitleOf(meta, rows.length) + (meta.confirmedBy ? ` · اعتمده ${meta.confirmedBy}${meta.confirmedAt ? ` في ${new Date(meta.confirmedAt).toLocaleString('ar-IQ-u-nu-latn')}` : ''}` : ''), cols.length, color)
  const h = ws.getRow(4); h.values = cols
  h.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }; c.alignment = { horizontal: 'center', wrapText: true }; c.border = thin() })
  const groups = groupByDepartment(rows)
  const sum = (xs: AttendanceGridRow[], k: keyof AttendanceGridRow) => xs.reduce((a, r) => a + Number(r[k] ?? 0), 0)
  const line = (xs: AttendanceGridRow[]) => detailed
    ? [xs.length, sum(xs, 'present_days') + sum(xs, 'late_days') + sum(xs, 'early_days') + sum(xs, 'incomplete_days'), sum(xs, 'late_days'), sum(xs, 'early_days'), sum(xs, 'incomplete_days'), sum(xs, 'absent_days'), sum(xs, 'leave_days'), fmtHM(sum(xs, 'worked_minutes')), sum(xs, 'late_minutes'), sum(xs, 'shortfall_minutes'), sum(xs, 'overtime_minutes'), sum(xs, 'proposed_minutes'), sum(xs, 'proposed_days')]
    : [xs.length, sum(xs, 'present_days') + sum(xs, 'late_days') + sum(xs, 'early_days') + sum(xs, 'incomplete_days'), sum(xs, 'absent_days'), sum(xs, 'leave_days'), fmtHM(sum(xs, 'worked_minutes'))]
  groups.forEach(([name, xs], i) => {
    const r = ws.addRow([i + 1, name, ...line(xs)])
    r.eachCell({ includeEmpty: true }, (cell, col) => { cell.border = thin(); cell.alignment = { horizontal: col === 2 ? 'right' : 'center' }; if (i % 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } } })
    r.getCell(2).font = { bold: true }
  })
  const tot = ws.addRow(['', 'الإجمالي', ...line(rows)])
  tot.eachCell({ includeEmpty: true }, (cell) => { cell.font = { bold: true }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }; cell.border = thin(); cell.alignment = { horizontal: 'center' } })
  cols.forEach((_, i) => { ws.getColumn(i + 1).width = i === 1 ? 26 : 12 })
  ws.getColumn(1).width = 5
}

/** المرحلة 1 — التفصيلي */
export async function buildAttendanceDetailedWorkbook(rows: AttendanceGridRow[], meta: AttendanceExportMeta): Promise<Workbook> {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook(); wb.creator = 'شركة جزيرة الأكارم — غرفة العمليات'; wb.created = new Date()
  const days = rows[0]?.days.map((d) => d.d) ?? []
  summarySheet(wb, rows, meta, `الحضوريات التفصيلية — ${meta.month.slice(0, 7)} (المرحلة 1: التدقيق)`, 'FF1E3A8A', true)
  const fixed = ['ت', 'الموظف', 'الرقم الوظيفي', 'العنوان الوظيفي']
  const totals = ['أيام الحضور', 'تأخير (أيام)', 'خروج مبكر', 'بصمات ناقصة', 'أيام الغياب', 'أيام الإجازة', 'ساعات العمل', 'دقائق التأخير', 'دقائق النقص', 'إضافي', 'استقطاع مقترح']
  const used = new Set<string>(['الملخص'])
  for (const [dept, xs] of groupByDepartment(rows)) {
    const ws = wb.addWorksheet(safeSheetName(dept, used), { views: [{ rightToLeft: true, state: 'frozen', xSplit: fixed.length, ySplit: 5 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } })
    const colCount = fixed.length + days.length + totals.length
    header(ws, `${dept} — الحضوريات التفصيلية ${meta.month.slice(0, 7)}`, `${xs.length} موظفاً · الخلية: أول بصمة → آخر بصمة · الألوان: أخضر حاضر، أصفر متأخر، برتقالي خروج مبكر، بنفسجي ناقصة، أحمر غياب، أزرق إجازة/زمنية`, colCount)
    dayHeaders(ws, fixed, days, totals)
    xs.forEach((r, i) => {
      const row = ws.addRow([
        i + 1, r.full_name, r.employee_number, r.job_title ?? '—',
        ...r.days.map(detailCellText),
        r.present_days + r.late_days + r.early_days + r.incomplete_days, r.late_days, r.early_days, r.incomplete_days, r.absent_days, r.leave_days, fmtHM(r.worked_minutes), r.late_minutes, r.shortfall_minutes, r.overtime_minutes,
        r.proposed_days > 0 || r.proposed_minutes > 0 ? `${r.proposed_days > 0 ? `${r.proposed_days} يوم` : ''}${r.proposed_days > 0 && r.proposed_minutes > 0 ? ' + ' : ''}${r.proposed_minutes > 0 ? `${r.proposed_minutes} د` : ''}` : '—',
      ])
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.border = thin(); cell.alignment = { vertical: 'middle', horizontal: col === 2 ? 'right' : 'center' }
        const di = col - fixed.length - 1
        if (di >= 0 && di < days.length) {
          const c = r.days[di]!
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[c.s] ?? 'FFFFFFFF' } }
          cell.font = { size: 8, bold: c.s === 'absent' || c.src === 'manual', color: { argb: FONT[c.s] ?? 'FF0F172A' }, italic: c.src === 'manual' }
          if (c.src === 'manual' && c.note) cell.note = `تعديل غرفة العمليات: ${c.note}`
          else if (c.waived) cell.note = 'استقطاع مقترح مُلغى بسبب موثّق'
        } else if (i % 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
      })
      row.getCell(2).font = { bold: true }
    })
    ws.getColumn(1).width = 5; ws.getColumn(2).width = 26; ws.getColumn(3).width = 12; ws.getColumn(4).width = 16
    days.forEach((_, i) => { ws.getColumn(fixed.length + 1 + i).width = 11 })
    totals.forEach((_, i) => { ws.getColumn(fixed.length + days.length + 1 + i).width = 10 })
    const legend = ws.addRow([]); ws.mergeCells(legend.number, 1, legend.number, colCount)
    legend.getCell(1).value = 'الدليل: «08:02→16:05» أول وآخر بصمة · «08:00→؟» بصمة ناقصة · «غ» غائب · «إجازة» إجازة معتمدة · «ز» زمنية معتمدة · «راحة» يوم راحة الشفت · «؟» يوم لم يُحتسب بعد · الخلية المائلة = عدّلتها غرفة العمليات بسبب (انظر التعليق)'
    legend.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF64748B' } }; legend.getCell(1).alignment = { wrapText: true }; legend.height = 28
  }
  return wb
}

/** المرحلة 2 — الكشف المعتمد (حاضر / غائب / مجاز فقط) */
export async function buildAttendanceApprovedWorkbook(rows: AttendanceGridRow[], meta: AttendanceExportMeta): Promise<Workbook> {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook(); wb.creator = 'شركة جزيرة الأكارم — غرفة العمليات'; wb.created = new Date()
  const days = rows[0]?.days.map((d) => d.d) ?? []
  summarySheet(wb, rows, meta, `كشف الحضورية المعتمد — ${meta.month.slice(0, 7)} (المرحلة 2)`, 'FF065F46', false)
  const fixed = ['ت', 'الموظف', 'الرقم الوظيفي', 'العنوان الوظيفي']
  const totals = ['أيام الحضور', 'أيام الغياب', 'أيام الإجازة', 'ساعات العمل']
  const used = new Set<string>(['الملخص'])
  const KF: Record<ApprovedKind, string> = { present: 'FFDCFCE7', absent: 'FFFEE2E2', leave: 'FFE0F2FE', rest: 'FFF1F5F9', none: 'FFFFFFFF' }
  const KC: Record<ApprovedKind, string> = { present: 'FF166534', absent: 'FFB91C1C', leave: 'FF075985', rest: 'FF94A3B8', none: 'FFCBD5E1' }
  for (const [dept, xs] of groupByDepartment(rows)) {
    const ws = wb.addWorksheet(safeSheetName(dept, used), { views: [{ rightToLeft: true, state: 'frozen', xSplit: fixed.length, ySplit: 5 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } })
    const colCount = fixed.length + days.length + totals.length
    header(ws, `${dept} — كشف الحضورية المعتمد ${meta.month.slice(0, 7)}`, `${xs.length} موظفاً · ${meta.confirmedBy ? `اعتمده ${meta.confirmedBy}` : 'معتمد من غرفة العمليات'}${meta.confirmedAt ? ` في ${new Date(meta.confirmedAt).toLocaleString('ar-IQ-u-nu-latn')}` : ''}`, colCount, 'FF065F46')
    dayHeaders(ws, fixed, days, totals)
    xs.forEach((r, i) => {
      const kinds = r.days.map((c) => approvedKind(c.s))
      const row = ws.addRow([
        i + 1, r.full_name, r.employee_number, r.job_title ?? '—',
        ...kinds.map((k) => APPROVED_LABEL[k]),
        r.present_days + r.late_days + r.early_days + r.incomplete_days, r.absent_days, r.leave_days, fmtHM(r.worked_minutes),
      ])
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.border = thin(); cell.alignment = { vertical: 'middle', horizontal: col === 2 ? 'right' : 'center' }
        const di = col - fixed.length - 1
        if (di >= 0 && di < days.length) {
          const k = kinds[di]!
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KF[k] } }
          cell.font = { size: 9, bold: k !== 'none' && k !== 'rest', color: { argb: KC[k] } }
        } else if (i % 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
      })
      row.getCell(2).font = { bold: true }
    })
    ws.getColumn(1).width = 5; ws.getColumn(2).width = 26; ws.getColumn(3).width = 12; ws.getColumn(4).width = 16
    days.forEach((_, i) => { ws.getColumn(fixed.length + 1 + i).width = 7 })
    totals.forEach((_, i) => { ws.getColumn(fixed.length + days.length + 1 + i).width = 11 })
    const legend = ws.addRow([]); ws.mergeCells(legend.number, 1, legend.number, colCount)
    legend.getCell(1).value = 'الدليل: حاضر (أخضر) · غائب (أحمر) · مجاز (أزرق) · راحة (رمادي) — التفاصيل (الأوقات، التأخير، البصمات الناقصة) في كشف المرحلة الأولى'
    legend.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF64748B' } }; legend.getCell(1).alignment = { wrapText: true }; legend.height = 22
  }
  return wb
}

export async function downloadWorkbook(wb: Workbook, filename: string) {
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
