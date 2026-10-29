/** 00262 — تصدير كشف حضوريات العمال إلى Excel بشكل كشف الشركة (صفان للرؤوس: المتعهد ثم الجهات الثلاث) + ورقة تفصيلية موحّدة القالب. */
import type ExcelJS from 'exceljs'
import { BRAND, buildExcelReport, colLetter, saveWorkbook } from '@lib/export/excel-report'
import { COUNT_SOURCE_AR, type CountSource } from '@sdk/ops-contractor-headcounts.sdk'
import { PARENT_AR, SHIFT_AR } from '@features/contractors/format'
import type { Pivot } from './pivot'
import { workersOf } from './pivot'

export interface HeadcountsExportMeta { month: string; parent: 'karrada' | 'zaafaraniya' | null; approvedSource: CountSource | null; locked: boolean }

export async function exportHeadcountsExcel(pivot: Pivot, meta: HeadcountsExportMeta): Promise<ExcelJS.Workbook> {
  const scope = meta.parent ? PARENT_AR[meta.parent] ?? meta.parent : 'كل القواطع'
  const approval = meta.locked && meta.approvedSource ? `معتمد على جهة «${COUNT_SOURCE_AR[meta.approvedSource]}» (مقفل)` : 'غير معتمد بعد'
  // ① الورقة التفصيلية بالقالب الموحد (صف لكل متعهد × يوم)
  const detailRows = pivot.days.flatMap((d) => pivot.contractors.map((c) => {
    const cell = d.cells[c.id]
    return {
      date: d.date, contractor: c.name, area: c.area, parent: PARENT_AR[c.parent] ?? c.parent, shift: c.shift ? SHIFT_AR[c.shift] ?? c.shift : '—',
      sm: cell?.sector_manager?.value ?? null, ct: cell?.contractor?.value ?? null, fu: cell?.follow_up?.value ?? null,
      checked: cell?.contractor?.checkedIn ? 'نعم' : 'لا',
      reasons: [cell?.sector_manager?.reason, cell?.contractor?.reason, cell?.follow_up?.reason].filter(Boolean).join(' | ') || '',
    }
  }))
  const wb = await buildExcelReport({
    sheetName: 'التفاصيل', title: `حضوريات عمال المتعهدين — ${meta.month}`, companySub: 'غرفة العمليات',
    meta: `${scope} · ${approval} · كل عدد يشمل المتعهد نفسه`,
    columns: [
      { header: 'التاريخ', key: 'date', width: 12, align: 'center' }, { header: 'المتعهد', key: 'contractor', width: 24 }, { header: 'المنطقة', key: 'area', width: 16 },
      { header: 'القاطع', key: 'parent', width: 14 }, { header: 'الشفت', key: 'shift', width: 10, align: 'center' },
      { header: 'عدد القاطع', key: 'sm', width: 11, align: 'center' }, { header: 'عدد المتعهد', key: 'ct', width: 11, align: 'center' }, { header: 'عدد المتابعة', key: 'fu', width: 11, align: 'center' },
      { header: 'أثبت التواجد', key: 'checked', width: 11, align: 'center' }, { header: 'تصحيحات غرفة العمليات', key: 'reasons', width: 40, wrap: true },
    ],
    rows: detailRows,
    totalRow: { date: 'المجموع', sm: pivot.grand.sector_manager, ct: pivot.grand.contractor, fu: pivot.grand.follow_up },
    fileName: `حضوريات-العمال-${meta.month}.xlsx`, orientation: 'landscape', deferSave: true,
  })
  // ② ورقة الكشف بشكل الشركة (أيام × متعهدين × 3 أعمدة) — تُدرج أولاً
  const ws = wb.addWorksheet('الكشف', { views: [{ rightToLeft: true, showGridLines: false, state: 'frozen', xSplit: 1, ySplit: 4 }], pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } })
  // تظهر ورقة الكشف أولاً — exceljs يرتّب الأوراق حسب orderNo (غير معلن في الأنواع)
  type Ordered = ExcelJS.Worksheet & { orderNo: number }
  for (const other of wb.worksheets) if (other !== ws) (other as Ordered).orderNo = ((other as Ordered).orderNo || 0) + 1
  ;(ws as Ordered).orderNo = 0
  const srcs = pivot.sources
  const groups: { label: string; sub: string; key: string }[] = [
    ...pivot.contractors.map((c) => ({ label: c.name, sub: `${c.area} · ${c.shift ? SHIFT_AR[c.shift] ?? c.shift : '—'}`, key: c.id })),
    ...pivot.shifts.map((x) => ({ label: `مجموع ${SHIFT_AR[x] ?? x}`, sub: '', key: `__s:${x}` })),
    { label: 'المجموع الكلي', sub: '', key: '__t' },
  ]
  const totalCols = 1 + groups.length * srcs.length
  const last = colLetter(totalCols - 1)
  ws.mergeCells(`A1:${last}1`); ws.getCell('A1').value = `شركة جزيرة الأكارم — حضوريات عمال المتعهدين — ${meta.month} — ${scope} — ${approval}`
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: `FF${BRAND.primary}` } }; ws.getCell('A1').alignment = { horizontal: 'center' }
  ws.getRow(1).height = 24
  const border: Partial<ExcelJS.Borders> = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
  const fillOf = (s: CountSource) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: s === 'sector_manager' ? 'FFE0F2FE' : s === 'contractor' ? 'FFFEF3C7' : 'FFDCFCE7' } } as ExcelJS.Fill)
  // الصفوف 3-4: رؤوس
  ws.getCell('A3').value = 'التاريخ'; ws.mergeCells('A3:A4')
  let col = 2
  for (const g of groups) {
    const from = colLetter(col - 1), to = colLetter(col - 1 + srcs.length - 1)
    if (srcs.length > 1) ws.mergeCells(`${from}3:${to}3`)
    const hc = ws.getCell(`${from}3`); hc.value = g.sub ? `${g.label}\n${g.sub}` : g.label; hc.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    srcs.forEach((s, i) => { const c = ws.getCell(4, col + i); c.value = COUNT_SOURCE_AR[s]; c.fill = fillOf(s); c.alignment = { horizontal: 'center' }; c.font = { bold: true }; c.border = border; ws.getColumn(col + i).width = 9 })
    col += srcs.length
  }
  for (let c = 1; c <= totalCols; c++) { const h = ws.getCell(3, c); h.font = { bold: true, color: { argb: 'FFFFFFFF' } }; h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND.headerFill}` } }; h.border = border; h.alignment = { ...h.alignment, horizontal: 'center', vertical: 'middle', wrapText: true } }
  ws.getRow(3).height = 34; ws.getColumn(1).width = 13; ws.getCell('A4').border = border; ws.getCell('A4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND.headerFill}` } }
  // الأيام
  let r = 5
  for (const d of pivot.days) {
    ws.getCell(r, 1).value = d.date; ws.getCell(r, 1).font = { bold: true }; ws.getCell(r, 1).border = border
    col = 2
    for (const g of groups) {
      for (const s of srcs) {
        const v = g.key.startsWith('__s:') ? d.shiftTotals[g.key.slice(4)]?.[s] ?? 0 : g.key === '__t' ? d.total[s] : d.cells[g.key]?.[s]?.value ?? null
        const cell = ws.getCell(r, col); cell.value = v; cell.alignment = { horizontal: 'center' }; cell.border = border; cell.fill = fillOf(s)
        if (g.key.startsWith('__')) cell.font = { bold: true }
        if (!g.key.startsWith('__') && d.cells[g.key]?.[s]?.reason) cell.note = `تصحيح غرفة العمليات: ${d.cells[g.key]![s].reason}`
        col++
      }
    }
    r++
  }
  // المجاميع والعمال
  const writeTotal = (label: string, pick: (key: string, s: CountSource) => number) => {
    ws.getCell(r, 1).value = label; ws.getCell(r, 1).font = { bold: true }; ws.getCell(r, 1).border = border; ws.getCell(r, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND.totalFill}` } }
    col = 2
    for (const g of groups) for (const s of srcs) { const c = ws.getCell(r, col++); c.value = pick(g.key, s); c.font = { bold: true }; c.alignment = { horizontal: 'center' }; c.border = border; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND.totalFill}` } } }
    r++
  }
  writeTotal('المجموع', (k, s) => k.startsWith('__s:') ? pivot.days.reduce((a, d) => a + (d.shiftTotals[k.slice(4)]?.[s] ?? 0), 0) : k === '__t' ? pivot.grand[s] : pivot.contractorTotals[k]?.[s] ?? 0)
  writeTotal('عمال (العدد − 1 لكل يوم مسجّل)', (k, s) => k.startsWith('__')
    ? pivot.days.reduce((a, d) => a + pivot.contractors.filter((c) => k === '__t' || c.shift === k.slice(4)).reduce((b, c) => b + (workersOf(d.cells[c.id]?.[s]?.value ?? null) ?? 0), 0), 0)
    : pivot.days.reduce((a, d) => a + (workersOf(d.cells[k]?.[s]?.value ?? null) ?? 0), 0))
  await saveWorkbook(wb, `حضوريات-العمال-${meta.month}.xlsx`)
  return wb
}
