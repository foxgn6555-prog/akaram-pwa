/**
 * 00175 · تصدير «الأشخاص غير المطابقين» إلى Excel احترافي:
 * صف واحد لكل شخص، عمود لكل يوم من الفترة (ح = حاضر مع الساعات، ن = بصمة ناقصة مع وقتها، غ = غائب)،
 * ثم مجاميع الحضور/النقص/الغياب وإجمالي الساعات — خلايا ملوّنة، ترويسة مجمّدة، ورقة ثانية بالتفاصيل اليومية.
 */
import type { Workbook, Worksheet } from 'exceljs'
import type { UnmatchedDay, UnmatchedPersonRow } from '../types'
import { UNMATCHED_STATUS_LABELS, UNMATCHED_STATUS_SHORT } from '../types'

const FILL = { present: 'FFDCFCE7', missing: 'FFFEF3C7', absent: 'FFFEE2E2' } as const
const FONT = { present: 'FF166534', missing: 'FF92400E', absent: 'FFB91C1C' } as const
const WEEKDAY_AR = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت']

export const fmtHours = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`
export function dayCellText(d: UnmatchedDay): string {
  if (d.status === 'present') return `${UNMATCHED_STATUS_SHORT.present} ${fmtHours(d.minutes)}`
  if (d.status === 'missing') return `${UNMATCHED_STATUS_SHORT.missing} ${d.first ?? ''}`.trim()
  return UNMATCHED_STATUS_SHORT.absent
}

const thin = () => ({ top: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } }, left: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } }, bottom: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } }, right: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } } })

function header(ws: Worksheet, title: string, subtitle: string, cols: number) {
  ws.mergeCells(1, 1, 1, cols)
  const t = ws.getCell('A1'); t.value = title; t.font = { bold: true, size: 15, color: { argb: 'FFFFFFFF' } }
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }; t.alignment = { horizontal: 'center', vertical: 'middle' }; ws.getRow(1).height = 28
  ws.mergeCells(2, 1, 2, cols)
  const s = ws.getCell('A2'); s.value = subtitle; s.font = { size: 10, color: { argb: 'FF475569' } }; s.alignment = { horizontal: 'center' }
  ws.getRow(3).height = 6
}

export interface UnmatchedExportMeta { from: string; to: string; branchLabel: string; search?: string }

export async function buildUnmatchedWorkbook(rows: UnmatchedPersonRow[], meta: UnmatchedExportMeta): Promise<Workbook> {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook(); wb.creator = 'شركة جزيرة الأكارم — الموارد البشرية'; wb.created = new Date()
  const days = rows[0]?.days.map((d) => d.d) ?? []
  const fixed = ['ت', 'الاسم على الجهاز', 'رقم البصمة (PIN)', 'الفرع', 'الجهاز']
  const totals = ['أيام الحضور', 'بصمات ناقصة', 'أيام الغياب', 'إجمالي الساعات']
  const colCount = fixed.length + days.length + totals.length

  // ── الورقة 1: الشبكة الشهرية ──
  const ws = wb.addWorksheet('غير المطابقين', { views: [{ rightToLeft: true, state: 'frozen', xSplit: fixed.length, ySplit: 5 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } })
  const filters = [`الفترة: ${meta.from} → ${meta.to}`, `الفرع: ${meta.branchLabel}`, meta.search ? `بحث: ${meta.search}` : ''].filter(Boolean).join(' · ')
  header(ws, 'الأشخاص غير المطابقين — سجل الحضور اليومي من أجهزة البصمة', `${filters} · ${rows.length} شخصاً · أُنشئ ${new Date().toLocaleString('ar-IQ')}`, colCount)
  // صفّان للترويسة: اليوم (رقم) + اسم اليوم
  const h1 = ws.getRow(4); const h2 = ws.getRow(5)
  h1.values = [...fixed, ...days.map((d) => String(Number(d.slice(8, 10)))), ...totals]
  h2.values = [...fixed.map(() => ''), ...days.map((d) => WEEKDAY_AR[new Date(`${d}T00:00:00Z`).getUTCDay()] ?? ''), ...totals.map(() => '')]
  for (let c = 1; c <= fixed.length; c++) ws.mergeCells(4, c, 5, c)
  for (let i = 0; i < totals.length; i++) ws.mergeCells(4, fixed.length + days.length + 1 + i, 5, fixed.length + days.length + 1 + i)
  ;[h1, h2].forEach((r) => r.eachCell({ includeEmpty: true }, (cell, col) => {
    const isFriday = col > fixed.length && col <= fixed.length + days.length && new Date(`${days[col - fixed.length - 1]}T00:00:00Z`).getUTCDay() === 5
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: r === h2 ? 8 : 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isFriday ? 'FF475569' : 'FF334155' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; cell.border = thin()
  }))
  h1.height = 22; h2.height = 16

  rows.forEach((r, i) => {
    const row = ws.addRow([
      i + 1, r.person_name ?? '— بلا اسم —', r.pin, r.branch_name ?? '—', r.device_name,
      ...r.days.map(dayCellText),
      r.present_days, r.missing_days, r.absent_days, fmtHours(r.total_minutes),
    ])
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.border = thin(); cell.alignment = { vertical: 'middle', horizontal: col === 2 ? 'right' : 'center', wrapText: false }
      const di = col - fixed.length - 1
      if (di >= 0 && di < days.length) {
        const d = r.days[di]!
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[d.status] } }
        cell.font = { size: 9, bold: d.status !== 'absent', color: { argb: FONT[d.status] } }
      } else if (i % 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
    })
    row.getCell(2).font = { bold: true }
  })
  ws.getColumn(1).width = 5; ws.getColumn(2).width = 26; ws.getColumn(3).width = 12; ws.getColumn(4).width = 14; ws.getColumn(5).width = 16
  days.forEach((_, i) => { ws.getColumn(fixed.length + 1 + i).width = 8 })
  totals.forEach((_, i) => { ws.getColumn(fixed.length + days.length + 1 + i).width = 11 })
  const legend = ws.addRow([]); ws.mergeCells(legend.number, 1, legend.number, colCount)
  legend.getCell(1).value = `الدليل: ${UNMATCHED_STATUS_SHORT.present} = ${UNMATCHED_STATUS_LABELS.present} (ساعات العمل من أول بصمة إلى آخرها) · ${UNMATCHED_STATUS_SHORT.missing} = ${UNMATCHED_STATUS_LABELS.missing} (بصمة واحدة فقط ووقتها) · ${UNMATCHED_STATUS_SHORT.absent} = ${UNMATCHED_STATUS_LABELS.absent} · كل أيام الفترة أيام عمل · هؤلاء لم يُربطوا بموظفين بعد؛ اربط كل PIN من دفتر البصمة لينتقل حضوره إلى سجل الحضور الرسمي`
  legend.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF64748B' } }; legend.getCell(1).alignment = { wrapText: true }; legend.height = 30

  // ── الورقة 2: التفاصيل اليومية (صف لكل شخص/يوم) ──
  const det = wb.addWorksheet('التفاصيل اليومية', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 4 }] })
  header(det, 'التفاصيل اليومية — غير المطابقين', filters, 9)
  const dh = det.getRow(4); dh.values = ['ت', 'الاسم على الجهاز', 'PIN', 'الفرع', 'اليوم', 'الحالة', 'أول بصمة', 'آخر بصمة', 'ساعات العمل']
  dh.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }; c.alignment = { horizontal: 'center' }; c.border = thin() })
  let k = 0
  for (const r of rows) for (const d of r.days) {
    const row = det.addRow([++k, r.person_name ?? '— بلا اسم —', r.pin, r.branch_name ?? '—', d.d, UNMATCHED_STATUS_LABELS[d.status], d.first ?? '', d.last ?? '', d.status === 'present' ? fmtHours(d.minutes) : ''])
    row.eachCell({ includeEmpty: true }, (cell, col) => { cell.border = thin(); cell.alignment = { horizontal: col === 2 ? 'right' : 'center' }; if (col === 6) { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[d.status] } }; cell.font = { color: { argb: FONT[d.status] }, bold: true } } })
  }
  ;[5, 26, 10, 14, 12, 12, 10, 10, 11].forEach((w, i) => { det.getColumn(i + 1).width = w })
  if (k) det.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + k, column: 9 } }
  return wb
}
