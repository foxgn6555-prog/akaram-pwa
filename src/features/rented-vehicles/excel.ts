/**
 * تصدير Excel احترافي لحضوريات الآليات المؤجرة (20261203000100–000400).
 *
 * ملفان:
 *  ① كشف الحضور الشهري — **ورقة لكل سائق**، كل صف يوم من الشهر:
 *      اليوم | الحالة (حاضر/غائب) | عدد الانطلاقات | أول انطلاقة | طن مفّرغ | ملاحظة
 *     مع ترويسة السائق والآلية والمتعهد والخليص أعلى الورقة، وصف مجاميع في الأسفل.
 *  ② كشف المستحقات (المالية) — ورقة واحدة: الأساسي، الغياب، الضريبة، الصافي + مجاميع.
 *
 * RTL، ترويسة مدمجة، تجميد، حدود، تنسيق أرقام ومبالغ، وطباعة على عرض صفحة واحد.
 */
import type { Borders, Workbook } from 'exceljs'
import type {
  RentedAttendanceMonth,
  RentedAttendanceRow,
  RentedPayroll,
} from '@sdk/rented-vehicles.sdk'

const AR_MONTHS = [
  'كانون الثاني',
  'شباط',
  'آذار',
  'نيسان',
  'أيار',
  'حزيران',
  'تموز',
  'آب',
  'أيلول',
  'تشرين الأول',
  'تشرين الثاني',
  'كانون الأول',
]

const monthLabel = (m: string) => {
  const [y, mo] = m.split('-')
  return `${AR_MONTHS[Number(mo) - 1]} ${y}`
}
const money = (n: number | null | undefined) => Number(n ?? 0)
const fmtMoney = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function thin(): Partial<Borders> {
  const s = { style: 'thin' as const, color: { argb: 'FFCBD5E1' } }
  return { top: s, bottom: s, left: s, right: s }
}

const GREEN = 'FFDCFCE7'
const RED = 'FFFEE2E2'
const SLATE = 'FFF1F5F9'
const HEAD = 'FF0F172A'

/** اسم ورقة صالح: ≤31 حرفاً، بلا \ / ? * [ ] : */
function sheetName(raw: string, used: Set<string>): string {
  const base =
    raw
      .replace(/[\\/?*[\]:]/g, ' ')
      .trim()
      .slice(0, 28) || 'سائق'
  let name = base
  let i = 2
  while (used.has(name)) {
    name = `${base.slice(0, 26)} ${i++}`
  }
  used.add(name)
  return name
}

/** ورقة سائق واحد: كل صف يوم، مع مجاميع */
function driverSheet(
  wb: Workbook,
  row: RentedAttendanceRow,
  month: string,
  daysInMonth: number,
  used: Set<string>,
) {
  const ws = wb.addWorksheet(sheetName(`${row.driver_name}`, used), {
    views: [{ rightToLeft: true, state: 'frozen', xSplit: 0, ySplit: 7 }],
    pageSetup: {
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
    },
  })

  ws.columns = [
    { key: 'day', width: 8 },
    { key: 'date', width: 14 },
    { key: 'status', width: 11 },
    { key: 'dep', width: 12 },
    { key: 'first', width: 13 },
    { key: 'tons', width: 12 },
    { key: 'note', width: 34 },
  ]

  // ── الترويسة ──
  ws.mergeCells('A1:G1')
  const t = ws.getCell('A1')
  t.value = `حضوريات الآليات المؤجرة — ${monthLabel(month)}`
  t.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } }
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD } }
  t.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 30

  const facts: Array<[string, string]> = [
    ['السائق', row.driver_name],
    ['المتعهد / المؤجِّر', row.contractor_name],
    ['الآلية', `${row.db_number} — ${row.vehicle_name}`],
    ['الكراج / المنطقة', `${row.garage_parent_sector ?? '—'} / ${row.sector_name ?? '—'}`],
    ['الحضور / الغياب', `${row.present} حاضر · ${row.absent} غائب`],
    [
      'التفريغ',
      `${fmtMoney(money(row.tons_discharged))} طن من أصل ${fmtMoney(money(row.monthly_target_tons))}${row.trips_required ? ` · يحتاج ${row.trips_required} تفريغة` : ''}`,
    ],
  ]
  facts.forEach(([k, v], i) => {
    const r = 2 + Math.floor(i / 2)
    const c = 1 + (i % 2) * 4
    ws.mergeCells(r, c, r, c + 2)
    const cell = ws.getCell(r, c)
    cell.value = `${k}: ${v}`
    cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF334155' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE } }
    cell.alignment = { horizontal: 'right', vertical: 'middle' }
    cell.border = thin()
  })
  ws.getRow(2).height = 18
  ws.getRow(3).height = 18
  ws.getRow(4).height = 18

  // ── رأس الجدول ──
  const HEADER_ROW = 6
  const headers = ['اليوم', 'التاريخ', 'الحالة', 'الانطلاقات', 'أول انطلاقة', 'طن مفّرغ', 'ملاحظة']
  const hr = ws.getRow(HEADER_ROW)
  headers.forEach((h, i) => {
    const c = hr.getCell(i + 1)
    c.value = h
    c.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD } }
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    c.border = thin()
  })
  hr.height = 24

  // ── الصفوف: يوم لكل صف ──
  for (let d = 1; d <= daysInMonth; d++) {
    const state = row.days[String(d)]
    const isPresent = state === 'present'
    const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, d))
    const r = ws.getRow(HEADER_ROW + d)
    r.getCell(1).value = d
    r.getCell(2).value = date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
    r.getCell(3).value = state ? (isPresent ? 'حاضر' : 'غائب') : '—'
    r.getCell(4).value = isPresent ? null : 0
    r.getCell(5).value = '—'
    r.getCell(6).value = null
    r.getCell(7).value = ''
    r.eachCell((c, i) => {
      c.font = { name: 'Arial', size: 10, color: { argb: 'FF1E293B' } }
      c.alignment = { horizontal: i === 7 ? 'right' : 'center', vertical: 'middle' }
      c.border = thin()
      if (state)
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isPresent ? GREEN : RED } }
    })
    r.getCell(3).font = {
      name: 'Arial',
      size: 10,
      bold: true,
      color: { argb: isPresent ? 'FF166534' : 'FF991B1B' },
    }
    r.height = 17
  }

  // ── صف المجاميع ──
  const totalRow = HEADER_ROW + daysInMonth + 1
  ws.mergeCells(totalRow, 1, totalRow, 2)
  const tr = ws.getRow(totalRow)
  tr.getCell(1).value = 'المجموع'
  tr.getCell(3).value = `${row.present} حاضر`
  tr.getCell(4).value = row.departures_count
  tr.getCell(5).value = ''
  tr.getCell(6).value = money(row.tons_discharged)
  tr.getCell(7).value = `${row.absent} غائب`
  tr.eachCell((c, i) => {
    c.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }
    c.alignment = { horizontal: i === 7 ? 'right' : 'center', vertical: 'middle' }
    c.border = thin()
  })
  tr.getCell(6).numFmt = '#,##0.00'
  tr.height = 20

  // ── تذييل ──
  const foot = ws.getRow(totalRow + 2)
  ws.mergeCells(totalRow + 2, 1, totalRow + 2, 7)
  const f = foot.getCell(1)
  f.value = `القاعدة: الانطلاق = حاضر · اليوم بلا انطلاقة = غائب · اليوم بتوقيت بغداد · صُدِّر في ${new Date().toLocaleString('en-GB', { timeZone: 'Asia/Baghdad' })}`
  f.font = { name: 'Arial', size: 8, italic: true, color: { argb: 'FF64748B' } }
  f.alignment = { horizontal: 'center', vertical: 'middle' }

  return ws
}

/** ① كشف الحضور الشهري — ورقة لكل سائق + ورقة ملخّص أمامية */
export async function buildRentedAttendanceWorkbook(
  data: RentedAttendanceMonth,
  garageLabel: string | null,
) {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'شركة جزيرة الأكارم — غرفة العمليات'
  wb.created = new Date()

  const used = new Set<string>()

  // ── ورقة الملخّص ──
  const sum = wb.addWorksheet(sheetName('ملخّص', used), {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 5 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  sum.columns = [
    { key: 'driver', width: 24 },
    { key: 'contractor', width: 22 },
    { key: 'vehicle', width: 26 },
    { key: 'garage', width: 14 },
    { key: 'present', width: 10 },
    { key: 'absent', width: 10 },
    { key: 'dep', width: 12 },
    { key: 'tons', width: 12 },
    { key: 'target', width: 12 },
  ]
  sum.mergeCells('A1:I1')
  const st = sum.getCell('A1')
  st.value = `حضوريات الآليات المؤجرة — ${monthLabel(data.month)}${garageLabel ? ` — ${garageLabel}` : ''}`
  st.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } }
  st.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD } }
  st.alignment = { horizontal: 'center', vertical: 'middle' }
  sum.getRow(1).height = 30

  sum.mergeCells('A2:I2')
  const s2 = sum.getCell('A2')
  s2.value = `عدد السائقين: ${data.rows.length} · أيام الشهر: ${data.days_in_month} · كل سائق له ورقة تفصيلية`
  s2.font = { name: 'Arial', size: 9, color: { argb: 'FF334155' } }
  s2.alignment = { horizontal: 'center', vertical: 'middle' }

  const sh = sum.getRow(4)
  ;[
    'السائق',
    'المتعهد',
    'الآلية',
    'الكراج',
    'حاضر',
    'غائب',
    'انطلاقات',
    'طن مفّرغ',
    'الطن المطلوب',
  ].forEach((h, i) => {
    const c = sh.getCell(i + 1)
    c.value = h
    c.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD } }
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    c.border = thin()
  })
  sh.height = 22

  data.rows.forEach((r, i) => {
    const rr = sum.getRow(5 + i)
    rr.getCell(1).value = r.driver_name
    rr.getCell(2).value = r.contractor_name
    rr.getCell(3).value = `${r.db_number} — ${r.vehicle_name}`
    rr.getCell(4).value = r.garage_parent_sector ?? '—'
    rr.getCell(5).value = r.present
    rr.getCell(6).value = r.absent
    rr.getCell(7).value = r.departures_count
    rr.getCell(8).value = money(r.tons_discharged)
    rr.getCell(9).value = money(r.monthly_target_tons)
    rr.eachCell((c, ci) => {
      c.font = { name: 'Arial', size: 10 }
      c.alignment = { horizontal: ci <= 3 ? 'right' : 'center', vertical: 'middle' }
      c.border = thin()
      if (ci === 8) c.numFmt = '#,##0.00'
      if (ci === 9) c.numFmt = '#,##0.00'
    })
    rr.height = 17
  })

  // ── ورقة لكل سائق ──
  for (const r of data.rows) driverSheet(wb, r, data.month, data.days_in_month, used)

  return wb
}

export async function downloadRentedAttendanceExcel(
  data: RentedAttendanceMonth,
  garageLabel: string | null,
) {
  const wb = await buildRentedAttendanceWorkbook(data, garageLabel)
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `حضوريات الآليات المؤجرة ${data.month}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

/** ② كشف المستحقات (المالية) — ورقة واحدة */
export async function downloadRentedPayrollExcel(data: RentedPayroll) {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'شركة جزيرة الأكارم — الشؤون المالية'
  wb.created = new Date()

  const ws = wb.addWorksheet(`مستحقات ${data.month}`, {
    views: [{ rightToLeft: true, state: 'frozen', xSplit: 3, ySplit: 6 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  ws.columns = [
    { width: 22 },
    { width: 20 },
    { width: 22 },
    { width: 7 },
    { width: 7 },
    { width: 13 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 11 },
    { width: 12 },
  ]

  ws.mergeCells(1, 1, 1, 11)
  const t = ws.getCell(1, 1)
  t.value = `مستحقات سائقي الآليات المؤجرة — ${monthLabel(data.month)}`
  t.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } }
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD } }
  t.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 30

  ws.mergeCells(2, 1, 2, 11)
  const s = ws.getCell(2, 1)
  s.value = `الإجمالي المستحق: ${fmtMoney(data.totals.net)} · الأساسي: ${fmtMoney(data.totals.base)} · خصم الغياب: ${fmtMoney(data.totals.absence)} · الضريبة: ${fmtMoney(data.totals.tax)}`
  s.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0F172A' } }
  s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } }
  s.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(2).height = 22

  const heads = [
    'السائق',
    'المتعهد',
    'الآلية',
    'حاضر',
    'غائب',
    'نوع الأجر',
    'الأساسي',
    'خصم الغياب',
    'الضريبة',
    'الصافي',
    'ملاحظة',
  ]
  const hr = ws.getRow(4)
  heads.forEach((h, i) => {
    const c = hr.getCell(i + 1)
    c.value = h
    c.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD } }
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    c.border = thin()
  })
  hr.height = 26

  data.rows.forEach((r, i) => {
    const rr = ws.getRow(5 + i)
    rr.getCell(1).value = r.driver_name
    rr.getCell(2).value = r.contractor_name
    rr.getCell(3).value = `${r.db_number} — ${r.vehicle_name}`
    rr.getCell(4).value = r.present_days
    rr.getCell(5).value = r.absent_days
    rr.getCell(6).value =
      r.salary_mode === 'monthly' ? 'شهري' : r.salary_mode === 'daily' ? 'يومي' : '— بلا راتب'
    rr.getCell(7).value = money(r.base_amount)
    rr.getCell(8).value = money(r.absence_deduction)
    rr.getCell(9).value = money(r.tax_amount)
    rr.getCell(10).value = money(r.net_amount)
    rr.getCell(11).value = r.has_salary ? '' : 'بانتظار تحديد المالية'
    rr.eachCell((c, ci) => {
      c.font = { name: 'Arial', size: 10 }
      c.alignment = { horizontal: ci <= 3 ? 'right' : 'center', vertical: 'middle' }
      c.border = thin()
      if (ci >= 7 && ci <= 10) c.numFmt = '#,##0.00'
    })
    if (!r.has_salary)
      rr.eachCell((c) => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED } }
      })
    rr.height = 17
  })

  const tr = ws.getRow(5 + data.rows.length)
  tr.getCell(1).value = 'المجموع'
  tr.getCell(4).value = data.rows.reduce((a, r) => a + r.present_days, 0)
  tr.getCell(5).value = data.rows.reduce((a, r) => a + r.absent_days, 0)
  tr.getCell(7).value = money(data.totals.base)
  tr.getCell(8).value = money(data.totals.absence)
  tr.getCell(9).value = money(data.totals.tax)
  tr.getCell(10).value = money(data.totals.net)
  tr.eachCell((c, ci) => {
    c.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }
    c.alignment = { horizontal: ci <= 3 ? 'right' : 'center', vertical: 'middle' }
    c.border = thin()
    if (ci >= 7 && ci <= 10) c.numFmt = '#,##0.00'
  })
  tr.height = 22

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `مستحقات الآليات المؤجرة ${data.month}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
