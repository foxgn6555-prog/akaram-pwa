/** تصدير كشف الرواتب الشهري (المالية) إلى Excel احترافي — RTL، ترويسة، مجاميع، تنسيق أرقام */
import type { Borders } from 'exceljs'
import type { AttendanceDeduction, PayrollSheetRow } from '../types'

const CONTRACT: Record<string, string> = { monthly: 'شهري', daily: 'أجر يومي' }

export interface DeptGroup { name: string; rows: PayrollSheetRow[]; present: number; absent: number; ops: number; auto: number; proposed: number; final: number; gross: number; deductions: number }
/** مفتاح الترتيب الطبيعي للرقم الوظيفي (PF-2 قبل PF-9 قبل PF-10) — مطابق لـ app.hr_employee_sort_key في القاعدة */
export function employeeSortKey(num: string | null | undefined): string {
  const digits = (num ?? '').replace(/\D/g, '') || '0'
  return `${digits.padStart(20, '0')}|${num ?? ''}`
}
/** إجمالي الراتب قبل الاستقطاع (يُحتسب محلياً للصفوف المصدَّرة قبل 00184) */
export function rowGross(r: PayrollSheetRow): number {
  if (r.gross_amount != null) return r.gross_amount
  if (r.pay_type == null) return 0
  if (r.pay_type === 'daily') return (r.daily_rate ?? 0) * (r.payable_days ?? r.days_present + (r.days_leave_paid ?? 0)) + (r.allowances_total ?? 0)
  return (r.base_salary ?? 0) + (r.allowances_total ?? 0)
}
/** إجمالي الاستقطاعات = الإجمالي − الصافي المقترح (أو العمود المخزَّن) */
export function rowDeductions(r: PayrollSheetRow): number {
  if (r.deductions_total != null) return r.deductions_total
  if (r.pay_type == null) return 0
  return Math.max(0, rowGross(r) - (r.proposed_net ?? 0))
}
/** تجميع صفوف الكشف حسب القسم (الأقسام أبجدياً، «بلا قسم» آخراً؛ داخل القسم بالرقم الوظيفي ثم الاسم) مع مجاميع فرعية */
export function groupByDepartment(rows: PayrollSheetRow[]): DeptGroup[] {
  const map = new Map<string, PayrollSheetRow[]>()
  for (const r of rows) { const k = r.department_name ?? 'بلا قسم'; map.set(k, [...(map.get(k) ?? []), r]) }
  const names = [...map.keys()].sort((a, b) => (a === 'بلا قسم' ? 1 : b === 'بلا قسم' ? -1 : a.localeCompare(b, 'ar')))
  return names.map((name) => {
    const g = (map.get(name) ?? []).slice().sort((a, b) => employeeSortKey(a.employee_number).localeCompare(employeeSortKey(b.employee_number)) || (a.full_name ?? '').localeCompare(b.full_name ?? '', 'ar'))
    const sum = (f: (r: PayrollSheetRow) => number) => g.reduce((s, r) => s + (f(r) || 0), 0)
    return { name, rows: g, present: sum((r) => r.days_present), absent: sum((r) => r.days_absent), ops: sum((r) => r.ops_deduction_amount + (r.ops_deduction_days_amount ?? 0)), auto: sum((r) => r.auto_deduction_amount ?? 0), proposed: sum((r) => r.proposed_net ?? 0), final: sum((r) => r.final_net ?? r.proposed_net ?? 0), gross: sum(rowGross), deductions: sum(rowDeductions) }
  })
}

/** أعمدة المبالغ (تنسيق #,##0 ومجاميع) — بترقيم أعمدة الورقة الأولى */
export const MONEY_COLS = [19, 20, 21, 22, 23, 24, 26, 31, 32, 33, 34]

export function payrollFileName(month: string) { return `كشف-الرواتب-${month.slice(0, 7)}.xlsx` }

export async function buildPayrollWorkbook(month: string, rows: PayrollSheetRow[], deductions: AttendanceDeduction[] = []) {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'شركة جزيرة الأكارم — الشؤون المالية'; wb.created = new Date()
  const ws = wb.addWorksheet(`رواتب ${month.slice(0, 7)}`, { views: [{ rightToLeft: true, state: 'frozen', ySplit: 4 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } })
  // ترتيب الأعمدة: هوية ← أيام ← أساس الراتب ← الإجمالي ← الاستقطاعات بالتفصيل ← إجمالي الاستقطاعات ← الصافي
  const headers = ['ت', 'الرقم الوظيفي', 'الاسم', 'القسم', 'الفرع', 'العنوان الوظيفي', 'نوع التعاقد',
    'أيام مجدولة', 'أيام محتسبة', 'غير محتسب', 'حاضر', 'متأخر', 'غائب', 'ناقص', 'إجازة مدفوعة', 'إجازة غير مدفوعة', 'دقائق التأخير', 'الأيام المدفوعة',
    'الراتب الأساسي', 'أجر اليوم', 'المخصصات', 'الإجمالي',
    'الاستقطاعات الثابتة', 'استقطاع العمليات (مبلغ)', 'استقطاع العمليات (أيام)', 'استقطاع العمليات (مبلغ الأيام)',
    'استقطاع تلقائي (دقائق)', 'استقطاع تلقائي (أيام)', 'منها أيام غياب/إجازة غير مدفوعة', 'منها أيام شرائح النقص', 'استقطاع تلقائي (مبلغ)', 'إجمالي الاستقطاعات',
    'الصافي المقترح', 'الصافي المعتمد', 'ملاحظة المالية', 'أسباب استقطاعات العمليات']
  const approved = rows[0]?.export_status === 'approved'
  ws.mergeCells(1, 1, 1, headers.length)
  ws.getCell('A1').value = `كشف رواتب شهر ${month.slice(0, 7)} — ${approved ? 'معتمد ومقفل' : 'مسودة قبل الاعتماد'}`
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: approved ? 'FF065F46' : 'FF1E3A8A' } }
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }; ws.getRow(1).height = 30
  ws.mergeCells(2, 1, 2, headers.length)
  ws.getCell('A2').value = `الإصدار ${rows[0]?.export_version ?? '-'} · صُدّر من غرفة العمليات في ${rows[0] ? new Date(rows[0].exported_at).toLocaleString('ar-IQ-u-nu-latn') : '-'} · أُنشئ ${new Date().toLocaleString('ar-IQ-u-nu-latn')} · العملة: دينار عراقي`
  ws.getCell('A2').alignment = { horizontal: 'center' }; ws.getCell('A2').font = { size: 10, color: { argb: 'FF475569' } }
  ws.getRow(3).height = 6
  const hr = ws.getRow(4); hr.values = headers
  hr.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = thin() })
  hr.height = 32
  rows.forEach((r, i) => {
    const paidLeave = r.days_leave_paid ?? r.days_leave, unpaidLeave = r.days_leave_unpaid ?? 0
    const row = ws.addRow([i + 1, r.employee_number, r.full_name, r.department_name, r.branch_name, r.job_title, CONTRACT[r.pay_type ?? r.contract_type ?? ''] ?? '—',
      r.scheduled_days ?? r.working_days, r.working_days, r.unevaluated_days ?? 0, r.days_present, r.days_late, r.days_absent, r.days_incomplete, paidLeave, unpaidLeave, r.late_minutes, r.pay_type === 'daily' ? (r.payable_days ?? r.days_present + paidLeave) : '',
      r.base_salary ?? 0, r.daily_rate ?? 0, r.allowances_total ?? 0, rowGross(r),
      r.fixed_deductions_total ?? 0, r.ops_deduction_amount, r.ops_deduction_days, r.ops_deduction_days_amount ?? 0,
      r.auto_deduction_minutes ?? 0, r.auto_deduction_days ?? 0, r.auto_absence_days ?? 0, r.auto_shortfall_days ?? 0, r.auto_deduction_amount ?? 0, rowDeductions(r),
      r.proposed_net ?? 0, r.final_net ?? r.proposed_net ?? 0, r.finance_note ?? '', r.ops_deduction_reasons ?? ''])
    row.eachCell((c, col) => { c.border = thin(); c.alignment = { horizontal: col <= 7 || col >= 35 ? 'right' : 'center', vertical: 'middle', wrapText: col >= 35 }; if (MONEY_COLS.includes(col)) c.numFmt = '#,##0'; if (i % 2) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } } })
    row.getCell(22).font = { bold: true }; row.getCell(32).font = { bold: true, color: { argb: 'FFB91C1C' } }; row.getCell(34).font = { bold: true }
    if (r.final_net != null && r.final_net !== r.proposed_net) row.getCell(34).font = { bold: true, color: { argb: 'FFB45309' } }
    if (r.pay_type == null) row.getCell(33).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }
    if ((r.unevaluated_days ?? 0) > 0) row.getCell(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }
  })
  const first = 5, last = 4 + rows.length
  const tot = ws.addRow(['', '', 'الإجمالي'])
  ;[8, 9, 10, 11, 12, 13, 14, 15, 16, 17, ...MONEY_COLS].forEach((col) => { tot.getCell(col).value = rows.length ? { formula: `SUM(${colL(col)}${first}:${colL(col)}${last})`, result: 0 } : 0; if (MONEY_COLS.includes(col)) tot.getCell(col).numFmt = '#,##0' })
  tot.eachCell((c) => { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }; c.border = thin() })
  const widths = [5, 12, 26, 16, 14, 16, 10, 8, 8, 8, 7, 7, 7, 7, 9, 9, 9, 9, 13, 11, 12, 14, 13, 13, 11, 13, 10, 10, 11, 10, 13, 14, 14, 14, 24, 34]
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: last, column: headers.length } }

  // ورقة 2: ملخص الأقسام — عدد الموظفين، حاضر/غائب، استقطاعات، صافي مقترح/معتمد
  const ds = wb.addWorksheet('ملخص الأقسام', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 2 }] })
  const dh = ['القسم', 'عدد الموظفين', 'أيام حاضر', 'أيام غائب', 'الإجمالي', 'استقطاع العمليات', 'استقطاع تلقائي', 'إجمالي الاستقطاعات', 'الصافي المقترح', 'الصافي المعتمد']
  ds.mergeCells(1, 1, 1, dh.length); ds.getCell('A1').value = `ملخص الأقسام — ${month.slice(0, 7)}`; ds.getCell('A1').font = { bold: true, size: 14 }; ds.getCell('A1').alignment = { horizontal: 'center' }
  const dhr = ds.getRow(2); dhr.values = dh
  dhr.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }; c.alignment = { horizontal: 'center' }; c.border = thin() })
  const groups = groupByDepartment(rows)
  groups.forEach((g) => { const r = ds.addRow([g.name, g.rows.length, g.present, g.absent, g.gross, g.ops, g.auto, g.deductions, g.proposed, g.final]); r.eachCell((c, col) => { c.border = thin(); c.alignment = { horizontal: col === 1 ? 'right' : 'center' }; if (col >= 5) c.numFmt = '#,##0' }) })
  const gsum = (f: (g: DeptGroup) => number) => groups.reduce((s, g) => s + f(g), 0)
  const dt = ds.addRow(['الإجمالي', rows.length, gsum((g) => g.present), gsum((g) => g.absent), gsum((g) => g.gross), gsum((g) => g.ops), gsum((g) => g.auto), gsum((g) => g.deductions), gsum((g) => g.proposed), gsum((g) => g.final)])
  dt.eachCell((c, col) => { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }; c.border = thin(); if (col >= 5) c.numFmt = '#,##0' })
  ;[22, 12, 10, 10, 16, 16, 16, 16, 16, 16].forEach((w, i) => { ds.getColumn(i + 1).width = w })

  // ورقة 3 (00185): تفاصيل استقطاعات غرفة العمليات — صف لكل استقطاع مع مرجع الكشف المعتمد إن وُجد
  if (deductions.length > 0) {
    const xs = wb.addWorksheet('تفاصيل الاستقطاعات', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 2 }] })
    const xh = ['ت', 'الرقم الوظيفي', 'الموظف', 'النوع', 'المبلغ', 'الأيام', 'السبب', 'المصدر', 'رقم الكشف', 'التاريخ']
    xs.mergeCells(1, 1, 1, xh.length); xs.getCell('A1').value = `استقطاعات غرفة العمليات — ${month.slice(0, 7)} (يدوية + كشوفات معتمدة)`; xs.getCell('A1').font = { bold: true, size: 14 }; xs.getCell('A1').alignment = { horizontal: 'center' }
    const xhr = xs.getRow(2); xhr.values = xh
    xhr.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }; c.alignment = { horizontal: 'center' }; c.border = thin() })
    const sorted = deductions.slice().sort((a, b) => employeeSortKey(a.employees?.employee_number).localeCompare(employeeSortKey(b.employees?.employee_number)) || a.created_at.localeCompare(b.created_at))
    sorted.forEach((d, i) => {
      const r = xs.addRow([i + 1, d.employees?.employee_number ?? '', d.employees?.full_name ?? '', d.days > 0 ? 'أيام' : 'مبلغ', d.amount, d.days, d.reason, d.source_disclosure_id ? 'كشف معتمد' : 'يدوي (غرفة العمليات)', d.disclosure?.ref_no ?? '', d.created_at.slice(0, 10)])
      r.eachCell((c, col) => { c.border = thin(); c.alignment = { horizontal: col === 3 || col === 7 ? 'right' : 'center', wrapText: col === 7 }; if (col === 5) c.numFmt = '#,##0' })
    })
    const xt = xs.addRow(['', '', 'الإجمالي', '', deductions.length ? { formula: `SUM(E3:E${2 + deductions.length})`, result: 0 } : 0, deductions.length ? { formula: `SUM(F3:F${2 + deductions.length})`, result: 0 } : 0])
    xt.eachCell((c, col) => { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }; c.border = thin(); if (col === 5) c.numFmt = '#,##0' })
    ;[5, 12, 26, 8, 13, 8, 40, 16, 14, 12].forEach((w, i) => { xs.getColumn(i + 1).width = w })
  }
  return wb
}

export async function downloadPayrollExcel(month: string, rows: PayrollSheetRow[], deductions: AttendanceDeduction[] = []) {
  const wb = await buildPayrollWorkbook(month, rows, deductions)
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = payrollFileName(month); a.click(); URL.revokeObjectURL(url)
}

function thin(): Partial<Borders> { const s = { style: 'thin' as const, color: { argb: 'FFCBD5E1' } }; return { top: s, bottom: s, left: s, right: s } }
function colL(n: number) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) } return s }
