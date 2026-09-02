/**
 * أدوات تصدير دفتر الأوزان — المحطة التحويلية:
 *  · toExcel: ملف .xlsx منسّق — ترويسة مدموجة، رؤوس أعمدة، صفوف متناوبة،
 *    حدود، صف إجمالي، مرشحات، RTL، وطباعة A4 جاهزة (موحّد مع تصدير الكشوفات)
 *  · printPdf: نافذة طباعة منسّقة A4 (عربي RTL) → «حفظ كـ PDF» من المتصفح
 * المكتبة الثقيلة (xlsx) تُحمَّل كسولة وقت الحاجة فقط.
 */
import type { WorkSheet } from 'xlsx'
import { SHIFT_LABELS, type Shift, type WeightRecord } from '../types'

const T = 'ت'
const DB = 'DB'
const DRIVER = 'اسم السائق'
const TYPE = 'صنف الآلية'
const GROSS = 'الوزن الكلي (بالطن)'
const TARE = 'الوزن الفارغ (بالطن)'
const NET = 'الوزن الصافي (بالطن)'
const ENTRY = 'وقت الدخول'

/* ── نظام التنسيق — موحّد مع تصدير وحدة الكشوفات ── */
const BRAND_RGB = '005F8D'
const SOFT_FILL = 'F1F5F9'
const HEAD_FILL = 'E2E8F0'
const BORDER_LINE = { style: 'thin', color: { rgb: 'CBD5E1' } }
const BORDER = { top: BORDER_LINE, bottom: BORDER_LINE, left: BORDER_LINE, right: BORDER_LINE }

/** صافي دفتر = مجموع الصافي (أو الكلي−الفارغ عند غياب الصافي) */
export function netOf(r: WeightRecord): number | null {
  if (typeof r.net_weight === 'number') return r.net_weight
  if (typeof r.gross_weight === 'number' && typeof r.tare_weight === 'number') {
    return +(r.gross_weight - r.tare_weight).toFixed(2)
  }
  return null
}

export function sheetTitle(date: string, shift: Shift): string {
  return `سجل الأوزان ${SHIFT_LABELS[shift]} - ${date}`
}

/** حرف العمود من رقمه (0 → A) — لمرجع المرشحات */
function colLetter(i: number): string {
  let s = ''
  let n = i
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  }
  return s
}

/** تطبيق تنسيق على خلية معيّنة دون فكّ ترتيب الصفوف */
function paint(
  ws: WorkSheet,
  r: number,
  c: number,
  utils: { encode_cell: (cell: { r: number; c: number }) => string },
  s: Record<string, unknown>,
): void {
  const key = utils.encode_cell({ r, c })
  const cell = ws[key]
  if (cell && typeof cell === 'object') ws[key] = { ...cell, s }
}

/** تصدير Excel منسّق — البيانات تُملأ في جدول مرتب تحت رؤوس أعمدة واضحة */
export async function toExcel(records: WeightRecord[], date: string, shift: Shift): Promise<void> {
  const XLSX = await import('xlsx')

  const HEADERS = [T, DB, DRIVER, TYPE, GROSS, TARE, NET, ENTRY] as const
  const NCOLS = HEADERS.length
  const today = new Date().toISOString().slice(0, 10)

  const aoa: (string | number)[][] = [
    ['شركة جزيرة الأكرام — سجل الأوزان الداخل إلى المحطة التحويلية'],
    [`${sheetTitle(date, shift)}   •   تاريخ التصدير: ${today}   •   عدد السجلات: ${records.length}`],
    [...HEADERS],
    ...records.map((r, i) => [
      i + 1,
      r.db_number,
      r.driver_name,
      r.vehicle_type ?? '',
      r.gross_weight ?? '',
      r.tare_weight ?? '',
      netOf(r) ?? '',
      r.entry_time ?? '',
    ]),
  ]

  // صف الإجمالي أسفل الجدول مباشرة
  const totalNet = records.reduce((s, r) => s + (netOf(r) ?? 0), 0)
  aoa.push(['', '', 'الإجمالي (طن)', '', '', '', +totalNet.toFixed(2), ''])

  const ws: WorkSheet = XLSX.utils.aoa_to_sheet(aoa)

  const headerRow = 2
  const firstData = 3
  const lastData = firstData + records.length - 1
  const totalRow = lastData + 1

  // الترويسة الرئيسية المدموجة
  paint(ws, 0, 0, XLSX.utils, {
    font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' }, name: 'Segoe UI' },
    fill: { patternType: 'solid', fgColor: { rgb: BRAND_RGB } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: BORDER,
  })
  // السطر التعريفي (التاريخ/الشفت/العدد)
  paint(ws, 1, 0, XLSX.utils, {
    font: { sz: 10, italic: true, color: { rgb: '475569' } },
    alignment: { horizontal: 'right', vertical: 'center' },
  })
  // رؤوس الأعمدة
  for (let c = 0; c < NCOLS; c++) {
    paint(ws, headerRow, c, XLSX.utils, {
      font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' }, name: 'Segoe UI' },
      fill: { patternType: 'solid', fgColor: { rgb: BRAND_RGB } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: BORDER,
    })
  }
  // صفوف البيانات — تناوب لوني + أسماء السائقين يميناً
  records.forEach((_, i) => {
    const r = firstData + i
    for (let c = 0; c < NCOLS; c++) {
      const style: Record<string, unknown> = {
        font: { sz: 11, name: 'Segoe UI' },
        alignment: { horizontal: c === 2 ? 'right' : 'center', vertical: 'center' },
        border: BORDER,
      }
      if (i % 2 === 1) style.fill = { patternType: 'solid', fgColor: { rgb: SOFT_FILL } }
      paint(ws, r, c, XLSX.utils, style)
    }
  })
  // صف الإجمالي
  for (let c = 0; c < NCOLS; c++) {
    paint(ws, totalRow, c, XLSX.utils, {
      font: { bold: true, sz: 11, name: 'Segoe UI', color: { rgb: '0F172A' } },
      fill: { patternType: 'solid', fgColor: { rgb: HEAD_FILL } },
      alignment: { horizontal: c === 2 ? 'right' : 'center', vertical: 'center' },
      border: BORDER,
    })
  }

  // عروض الأعمدة وارتفاعات الصفوف
  ws['!cols'] = [
    { wch: 5 }, { wch: 14 }, { wch: 24 }, { wch: 16 },
    { wch: 17 }, { wch: 17 }, { wch: 18 }, { wch: 12 },
  ]
  ws['!rows'] = [{ hpt: 30 }, { hpt: 18 }, { hpt: 26 }]

  // دمج العنوان والسطر التعريفي + مرشحات + هوامش + RTL
  if (NCOLS > 1) {
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: NCOLS - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: NCOLS - 1 } },
    ]
  }
  ws['!autofilter'] = {
    ref: `A${headerRow + 1}:${colLetter(NCOLS - 1)}${Math.max(lastData, headerRow) + 1}`,
  }
  ws['!margins'] = { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5 }
  ws['!rightToLeft'] = true

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'دفتر الأوزان')
  XLSX.writeFile(wb, `سجل-الأوزان-${SHIFT_LABELS[shift]}-${date}.xlsx`)
}

/** فتح نافذة طباعة منسّقة A4 (عربي RTL) — المستخدم يختار «حفظ كـ PDF» */
export function printPdf(records: WeightRecord[], date: string, shift: Shift): void {
  const win = window.open('', '_blank', 'width=1000,height=760')
  if (!win) {
    throw new Error('تعذّر فتح نافذة الطباعة — اسمح بالنوافذ المنبثقة')
  }

  const totalNet = records.reduce((s, r) => s + (netOf(r) ?? 0), 0)
  const rowsHtml = records
    .map(
      (r, i) => `
      <tr${i % 2 === 1 ? ' class="alt"' : ''}>
        <td>${i + 1}</td>
        <td class="num">${escapeHtml(r.db_number)}</td>
        <td>${escapeHtml(r.driver_name)}</td>
        <td>${escapeHtml(r.vehicle_type ?? '')}</td>
        <td class="num">${r.gross_weight ?? ''}</td>
        <td class="num">${r.tare_weight ?? ''}</td>
        <td class="num strong">${netOf(r) ?? ''}</td>
        <td class="num">${escapeHtml(r.entry_time ?? '')}</td>
      </tr>`,
    )
    .join('')

  win.document.write(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${sheetTitle(date, shift)}</title>
<style>
  * { box-sizing: border-box; }
  @page { size: A4 landscape; margin: 10mm; }
  body { font-family: 'Segoe UI', 'Cairo', Tahoma, sans-serif; margin: 16px; color: #0f172a; }

  .masthead { display: flex; align-items: center; gap: 14px; border-bottom: 3px solid #005f8d; padding-bottom: 10px; }
  .masthead img { width: 46px; height: 46px; object-fit: contain; }
  .org { flex: 1; text-align: center; }
  .org .name { font-size: 19px; font-weight: 800; color: #005f8d; }
  .org .sub { font-size: 12px; color: #64748b; margin-top: 2px; }
  .titlebar { margin: 12px 0 4px; text-align: center; font-size: 17px; font-weight: 800; }
  .meta-row { display: flex; justify-content: space-between; font-size: 12.5px; color: #334155; margin-bottom: 10px; }

  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #94a3b8; padding: 7px 6px; font-size: 12.5px; text-align: center; }
  thead th { background: #005f8d; color: #fff; font-weight: 700; }
  tbody tr.alt { background: #f1f5f9; }
  .num { direction: ltr; }
  .strong { font-weight: 700; color: #005f8d; }
  tfoot td { font-weight: 700; background: #e2e8f0; }

  .sign { margin-top: 34px; display: flex; justify-content: space-between; font-size: 13px; }
  .sign span { min-width: 220px; }
  .foot { margin-top: 14px; text-align: center; font-size: 10.5px; color: #94a3b8; }
  @media print { body { margin: 0; } .noprint { display: none !important; } }
</style>
</head>
<body>
  <div class="masthead">
    <img src="/icons/logo.png" alt="شعار جزيرة الأكرام" />
    <div class="org">
      <div class="name">شركة جزيرة الأكرام</div>
      <div class="sub">المحطة التحويلية — سجل الأوزان الداخل</div>
    </div>
    <div style="width:46px"></div>
  </div>
  <div class="titlebar">سجل الأوزان — الشفت ${SHIFT_LABELS[shift]}</div>
  <div class="meta-row">
    <span>التاريخ: ${date}</span>
    <span>عدد السجلات: ${records.length}</span>
    <span>الإجمالي: ${totalNet.toFixed(2)} طن</span>
  </div>
  <table>
    <thead>
      <tr>
        <th>${T}</th><th>DB</th><th>${DRIVER}</th><th>${TYPE}</th>
        <th>${GROSS}</th><th>${TARE}</th><th>${NET}</th><th>${ENTRY}</th>
      </tr>
    </thead>
    <tbody>${rowsHtml || '<tr><td colspan="8">لا توجد سجلات في هذا الدفتر</td></tr>'}</tbody>
    <tfoot>
      <tr><td colspan="6" style="text-align:left">إجمالي الوزن الصافي (طن)</td>
          <td class="num">${totalNet.toFixed(2)}</td><td></td></tr>
    </tfoot>
  </table>
  <div class="sign">
    <span>توقيع مسؤول المحطة: ______________</span>
    <span>التدقيق (غرفة العمليات): ______________</span>
  </div>
  <p class="foot">وُلِّد آلياً من نظام بلدية جزيرة الأكرام — ${new Date().toLocaleString('ar')}</p>
  <p class="noprint" style="margin-top:14px;text-align:center">
    <button onclick="window.print()" style="padding:10px 26px;font-size:15px;cursor:pointer;border:none;border-radius:8px;background:#005f8d;color:#fff">
      طباعة / حفظ كـ PDF
    </button>
  </p>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 300); }</script>
</body>
</html>`)
  win.document.close()
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
