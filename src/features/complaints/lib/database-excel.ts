/**
 * «قاعدة بيانات الشكاوى» → Excel بصيغة السجل المعتمد (00180)
 * ─────────────────────────────────────────────────────────
 * صف 1: شعاران + العنوان الكبير «قاعدة بيانات الشكاوى» · صف 2: ترويسة خضراء بالأعمدة الأربعة عشر مع فلاتر
 * ثم صف لكل شكوى؛ أرقام إنكليزية؛ RTL؛ تجميد الترويسة؛ عرض مناسب للطباعة.
 */
import type { Borders } from 'exceljs'
import type { ComplaintDatabaseRow } from '../types'

export const DATABASE_COLUMNS: { header: string; key: keyof ComplaintDatabaseRow | 'ack'; width: number }[] = [
  { header: 'التاريخ', key: 'received_date', width: 12 },
  { header: 'وقت استلام الشكوى', key: 'received_time', width: 12 },
  { header: 'اسم مرسل الشكوى', key: 'sender_name', width: 20 },
  { header: 'المركز البلدي', key: 'municipal_center', width: 14 },
  { header: 'القاطع', key: 'sector', width: 12 },
  { header: 'الشفت', key: 'shift', width: 10 },
  { header: 'رقم المحلة', key: 'neighborhood', width: 10 },
  { header: 'اسم الشارع', key: 'street', width: 20 },
  { header: 'نوع التلكؤ', key: 'delay_type', width: 18 },
  { header: 'مصدر الشكوى', key: 'source', width: 15 },
  { header: 'المسؤول عن المعالجة', key: 'handler_name', width: 18 },
  { header: 'هل يعتبر منجز ام متأخر', key: 'completion', width: 14 },
  { header: 'ما نوع المرفقات', key: 'attachments', width: 14 },
  { header: 'هل تم تأكيد الأستلام', key: 'ack', width: 12 },
]

/** قيمة الخلية لعمود معيّن — تُستخدم في الصفحة والـExcel معاً حتى يتطابقا حرفياً */
export function databaseCell(row: ComplaintDatabaseRow, key: (typeof DATABASE_COLUMNS)[number]['key']): string {
  if (key === 'ack') return row.ack_confirmed ? 'نعم' : 'لا'
  const v = row[key]
  return v == null || v === '' ? '—' : String(v)
}

export function databaseFileName(from: string, to: string) {
  return from.slice(0, 7) === to.slice(0, 7) ? `قاعدة-بيانات-الشكاوى-${from.slice(0, 7)}.xlsx` : `قاعدة-بيانات-الشكاوى-${from}-${to}.xlsx`
}

async function loadLogo(path: string): Promise<ArrayBuffer | null> {
  try {
    if (typeof fetch !== 'function') return null
    const res = await fetch(path)
    if (!res.ok) return null
    return await res.arrayBuffer()
  } catch { return null }
}

export async function buildComplaintDatabaseWorkbook(rows: ComplaintDatabaseRow[], meta: { from: string; to: string; sectorLabel: string }) {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'شركة جزيرة الأكارم — وحدة الشكاوى'; wb.created = new Date()
  const ws = wb.addWorksheet('قاعدة بيانات الشكاوى', {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 2 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  })
  const n = DATABASE_COLUMNS.length
  // صف 1: الشعاران + العنوان
  ws.getRow(1).height = 58
  ws.mergeCells(1, 1, 1, n)
  const title = ws.getCell(1, 1)
  title.value = 'قاعدة بيانات الشكاوى'
  title.font = { name: 'Arial', bold: true, size: 26, color: { argb: 'FF9ACD32' } }
  title.alignment = { horizontal: 'center', vertical: 'middle' }
  const [logoCompany, logoA, logoB] = await Promise.all([loadLogo('/icons/logo.png'), loadLogo('/icons/alliance.png'), loadLogo('/icons/baghdad-municipality.png')])
  if (logoCompany) ws.addImage(wb.addImage({ buffer: logoCompany, extension: 'png' }), { tl: { col: 0.2, row: 0.1 }, ext: { width: 56, height: 56 } })
  if (logoA) ws.addImage(wb.addImage({ buffer: logoA, extension: 'png' }), { tl: { col: 1.1, row: 0.1 }, ext: { width: 56, height: 56 } })
  if (logoB) ws.addImage(wb.addImage({ buffer: logoB, extension: 'png' }), { tl: { col: 2.0, row: 0.1 }, ext: { width: 56, height: 56 } })
  // صف 2: الترويسة الخضراء
  const hr = ws.getRow(2)
  hr.values = DATABASE_COLUMNS.map((c) => c.header)
  hr.height = 54
  hr.eachCell((c) => {
    c.font = { name: 'Arial', bold: true, size: 11, color: { argb: 'FF1F2937' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6E0A5' } }
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    c.border = thin()
  })
  rows.forEach((r, i) => {
    const row = ws.addRow(DATABASE_COLUMNS.map((c) => databaseCell(r, c.key)))
    row.height = 20
    row.eachCell((c, col) => {
      c.border = thin()
      c.font = { name: 'Arial', size: 10, bold: true }
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      if (col === 12) {
        const v = String(c.value ?? '')
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: v === 'منجز' ? 'FFD9F2D0' : v === 'قيد المعالجة' ? 'FFFFF4CC' : 'FFFAD4D4' } }
      }
      if (i % 2 && col !== 12) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
    })
  })
  DATABASE_COLUMNS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width })
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: Math.max(2, 2 + rows.length), column: n } }
  ws.headerFooter.oddFooter = `&R${meta.sectorLabel} · ${meta.from} → ${meta.to} · ${rows.length} شكوى&Lصفحة &P من &N`
  return wb
}

export async function downloadComplaintDatabaseExcel(rows: ComplaintDatabaseRow[], meta: { from: string; to: string; sectorLabel: string }) {
  const wb = await buildComplaintDatabaseWorkbook(rows, meta)
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = databaseFileName(meta.from, meta.to); a.click(); URL.revokeObjectURL(url)
}

function thin(): Partial<Borders> { const s = { style: 'thin' as const, color: { argb: 'FF94A3B8' } }; return { top: s, bottom: s, left: s, right: s } }
