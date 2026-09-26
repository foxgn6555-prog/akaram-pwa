/** تصدير كشف الرواتب الشهري (المالية) إلى Excel احترافي — RTL، ترويسة، مجاميع، تنسيق أرقام */
import type { Borders } from 'exceljs'
import type { PayrollSheetRow } from '../types'

const CONTRACT: Record<string, string> = { monthly: 'شهري', daily: 'أجر يومي' }

export function payrollFileName(month: string) { return `كشف-الرواتب-${month.slice(0, 7)}.xlsx` }

export async function buildPayrollWorkbook(month: string, rows: PayrollSheetRow[]) {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'منصة الأكرم — الشؤون المالية'; wb.created = new Date()
  const ws = wb.addWorksheet(`رواتب ${month.slice(0, 7)}`, { views: [{ rightToLeft: true, state: 'frozen', ySplit: 4 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } })
  const headers = ['ت', 'الرقم الوظيفي', 'الاسم', 'القسم', 'الفرع', 'العنوان الوظيفي', 'نوع التعاقد', 'أيام العمل', 'حاضر', 'متأخر', 'غائب', 'ناقص', 'إجازة', 'دقائق التأخير', 'الراتب الأساسي', 'أجر اليوم', 'المخصصات', 'الاستقطاعات الثابتة', 'استقطاع العمليات (مبلغ)', 'استقطاع العمليات (أيام)', 'الصافي المقترح', 'الصافي المعتمد', 'ملاحظة المالية', 'أسباب استقطاعات العمليات']
  const approved = rows[0]?.export_status === 'approved'
  ws.mergeCells(1, 1, 1, headers.length)
  ws.getCell('A1').value = `كشف رواتب شهر ${month.slice(0, 7)} — ${approved ? 'معتمد ومقفل' : 'مسودة قبل الاعتماد'}`
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: approved ? 'FF065F46' : 'FF1E3A8A' } }
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }; ws.getRow(1).height = 30
  ws.mergeCells(2, 1, 2, headers.length)
  ws.getCell('A2').value = `الإصدار ${rows[0]?.export_version ?? '-'} · صُدّر من غرفة العمليات في ${rows[0] ? new Date(rows[0].exported_at).toLocaleString('ar-IQ') : '-'} · أُنشئ ${new Date().toLocaleString('ar-IQ')} · العملة: دينار عراقي`
  ws.getCell('A2').alignment = { horizontal: 'center' }; ws.getCell('A2').font = { size: 10, color: { argb: 'FF475569' } }
  ws.getRow(3).height = 6
  const hr = ws.getRow(4); hr.values = headers
  hr.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = thin() })
  hr.height = 32
  rows.forEach((r, i) => {
    const row = ws.addRow([i + 1, r.employee_number, r.full_name, r.department_name, r.branch_name, r.job_title, CONTRACT[r.pay_type ?? r.contract_type ?? ''] ?? '—',
      r.working_days, r.days_present, r.days_late, r.days_absent, r.days_incomplete, r.days_leave, r.late_minutes,
      r.base_salary ?? 0, r.daily_rate ?? 0, r.allowances_total ?? 0, r.fixed_deductions_total ?? 0, r.ops_deduction_amount, r.ops_deduction_days,
      r.proposed_net ?? 0, r.final_net ?? r.proposed_net ?? 0, r.finance_note ?? '', r.ops_deduction_reasons ?? ''])
    row.eachCell((c, col) => { c.border = thin(); c.alignment = { horizontal: col <= 7 || col >= 23 ? 'right' : 'center', vertical: 'middle', wrapText: col >= 23 }; if (col >= 15 && col <= 22 && col !== 20) c.numFmt = '#,##0'; if (i % 2) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } } })
    if (r.final_net != null && r.final_net !== r.proposed_net) row.getCell(22).font = { bold: true, color: { argb: 'FFB45309' } }
    if (r.pay_type == null) row.getCell(21).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }
  })
  const first = 5, last = 4 + rows.length
  const tot = ws.addRow(['', '', 'الإجمالي', '', '', '', '', '', '', '', '', '', '', ''])
  ;[15, 17, 18, 19, 21, 22].forEach((col) => { tot.getCell(col).value = rows.length ? { formula: `SUM(${colL(col)}${first}:${colL(col)}${last})`, result: 0 } : 0; tot.getCell(col).numFmt = '#,##0' })
  tot.eachCell((c) => { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }; c.border = thin() })
  const widths = [5, 12, 26, 16, 14, 16, 10, 8, 7, 7, 7, 7, 7, 9, 13, 11, 12, 13, 13, 11, 14, 14, 24, 34]
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: last, column: headers.length } }
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
