/** تصدير كشف الرواتب الشهري (المالية) إلى Excel احترافي — RTL، ترويسة، مجاميع، تنسيق أرقام */
import type { Borders } from 'exceljs'
import type { PayrollSheetRow } from '../types'

const CONTRACT: Record<string, string> = { monthly: 'شهري', daily: 'أجر يومي' }

export interface DeptGroup { name: string; rows: PayrollSheetRow[]; present: number; absent: number; ops: number; auto: number; proposed: number; final: number }
/** تجميع صفوف الكشف حسب القسم (بترتيب الاسم، «بلا قسم» آخراً) مع مجاميع فرعية */
export function groupByDepartment(rows: PayrollSheetRow[]): DeptGroup[] {
  const map = new Map<string, PayrollSheetRow[]>()
  for (const r of rows) { const k = r.department_name ?? 'بلا قسم'; map.set(k, [...(map.get(k) ?? []), r]) }
  const names = [...map.keys()].sort((a, b) => (a === 'بلا قسم' ? 1 : b === 'بلا قسم' ? -1 : a.localeCompare(b, 'ar')))
  return names.map((name) => {
    const g = (map.get(name) ?? []).slice().sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? '', 'ar'))
    const sum = (f: (r: PayrollSheetRow) => number) => g.reduce((s, r) => s + (f(r) || 0), 0)
    return { name, rows: g, present: sum((r) => r.days_present), absent: sum((r) => r.days_absent), ops: sum((r) => r.ops_deduction_amount), auto: sum((r) => r.auto_deduction_amount ?? 0), proposed: sum((r) => r.proposed_net ?? 0), final: sum((r) => r.final_net ?? r.proposed_net ?? 0) }
  })
}

export function payrollFileName(month: string) { return `كشف-الرواتب-${month.slice(0, 7)}.xlsx` }

export async function buildPayrollWorkbook(month: string, rows: PayrollSheetRow[]) {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'شركة جزيرة الأكارم — الشؤون المالية'; wb.created = new Date()
  const ws = wb.addWorksheet(`رواتب ${month.slice(0, 7)}`, { views: [{ rightToLeft: true, state: 'frozen', ySplit: 4 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } })
  const headers = ['ت', 'الرقم الوظيفي', 'الاسم', 'القسم', 'الفرع', 'العنوان الوظيفي', 'نوع التعاقد', 'أيام العمل', 'حاضر', 'متأخر', 'غائب', 'ناقص', 'إجازة', 'دقائق التأخير', 'الراتب الأساسي', 'أجر اليوم', 'المخصصات', 'الاستقطاعات الثابتة', 'استقطاع العمليات (مبلغ)', 'استقطاع العمليات (أيام)', 'استقطاع تلقائي (دقائق)', 'استقطاع تلقائي (أيام)', 'استقطاع تلقائي (مبلغ)', 'الصافي المقترح', 'الصافي المعتمد', 'ملاحظة المالية', 'أسباب استقطاعات العمليات']
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
    const row = ws.addRow([i + 1, r.employee_number, r.full_name, r.department_name, r.branch_name, r.job_title, CONTRACT[r.pay_type ?? r.contract_type ?? ''] ?? '—',
      r.working_days, r.days_present, r.days_late, r.days_absent, r.days_incomplete, r.days_leave, r.late_minutes,
      r.base_salary ?? 0, r.daily_rate ?? 0, r.allowances_total ?? 0, r.fixed_deductions_total ?? 0, r.ops_deduction_amount, r.ops_deduction_days,
      r.auto_deduction_minutes ?? 0, r.auto_deduction_days ?? 0, r.auto_deduction_amount ?? 0,
      r.proposed_net ?? 0, r.final_net ?? r.proposed_net ?? 0, r.finance_note ?? '', r.ops_deduction_reasons ?? ''])
    row.eachCell((c, col) => { c.border = thin(); c.alignment = { horizontal: col <= 7 || col >= 26 ? 'right' : 'center', vertical: 'middle', wrapText: col >= 26 }; if ([15, 16, 17, 18, 19, 23, 24, 25].includes(col)) c.numFmt = '#,##0'; if (i % 2) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } } })
    if (r.final_net != null && r.final_net !== r.proposed_net) row.getCell(25).font = { bold: true, color: { argb: 'FFB45309' } }
    if (r.pay_type == null) row.getCell(24).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }
  })
  const first = 5, last = 4 + rows.length
  const tot = ws.addRow(['', '', 'الإجمالي', '', '', '', '', '', '', '', '', '', '', ''])
  ;[15, 17, 18, 19, 23, 24, 25].forEach((col) => { tot.getCell(col).value = rows.length ? { formula: `SUM(${colL(col)}${first}:${colL(col)}${last})`, result: 0 } : 0; tot.getCell(col).numFmt = '#,##0' })
  tot.eachCell((c) => { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }; c.border = thin() })
  const widths = [5, 12, 26, 16, 14, 16, 10, 8, 7, 7, 7, 7, 7, 9, 13, 11, 12, 13, 13, 11, 10, 10, 13, 14, 14, 24, 34]
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: last, column: headers.length } }

  // ورقة 2: ملخص الأقسام — عدد الموظفين، حاضر/غائب، استقطاعات، صافي مقترح/معتمد
  const ds = wb.addWorksheet('ملخص الأقسام', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 2 }] })
  const dh = ['القسم', 'عدد الموظفين', 'أيام حاضر', 'أيام غائب', 'استقطاع العمليات', 'استقطاع تلقائي', 'الصافي المقترح', 'الصافي المعتمد']
  ds.mergeCells(1, 1, 1, dh.length); ds.getCell('A1').value = `ملخص الأقسام — ${month.slice(0, 7)}`; ds.getCell('A1').font = { bold: true, size: 14 }; ds.getCell('A1').alignment = { horizontal: 'center' }
  const dhr = ds.getRow(2); dhr.values = dh
  dhr.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }; c.alignment = { horizontal: 'center' }; c.border = thin() })
  const groups = groupByDepartment(rows)
  groups.forEach((g) => { const r = ds.addRow([g.name, g.rows.length, g.present, g.absent, g.ops, g.auto, g.proposed, g.final]); r.eachCell((c, col) => { c.border = thin(); c.alignment = { horizontal: col === 1 ? 'right' : 'center' }; if (col >= 5) c.numFmt = '#,##0' }) })
  const dt = ds.addRow(['الإجمالي', rows.length, groups.reduce((s, g) => s + g.present, 0), groups.reduce((s, g) => s + g.absent, 0), groups.reduce((s, g) => s + g.ops, 0), groups.reduce((s, g) => s + g.auto, 0), groups.reduce((s, g) => s + g.proposed, 0), groups.reduce((s, g) => s + g.final, 0)])
  dt.eachCell((c, col) => { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }; c.border = thin(); if (col >= 5) c.numFmt = '#,##0' })
  ;[22, 12, 10, 10, 16, 16, 16, 16].forEach((w, i) => { ds.getColumn(i + 1).width = w })
  return wb
}

export async function downloadPayrollExcel(month: string, rows: PayrollSheetRow[]) {
  const wb = await buildPayrollWorkbook(month, rows)
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = payrollFileName(month); a.click(); URL.revokeObjectURL(url)
}

function thin(): Partial<Borders> { const s = { style: 'thin' as const, color: { argb: 'FFCBD5E1' } }; return { top: s, bottom: s, left: s, right: s } }
function colL(n: number) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) } return s }
