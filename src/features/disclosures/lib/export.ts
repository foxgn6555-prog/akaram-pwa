/**
 * تصدير الكشوفات:
 *  · toExcel: ملف .xlsx منسّق بالكامل (ترويسة المؤسسة + صفوف ملوّنة + مرشحات + طباعة جاهزة)
 *  · toWord: مستند Word (.doc) بتصميم النموذج الورقي المرفق (شعار + حقول + تفاصيل + توقيع)
 * المكتبة الثقيلة (xlsx) تُحمَّل كسولة وقت الحاجة فقط.
 */
import {
  VIOLATION_LABELS,
  PENALTY_LABELS,
  SHIFT_LABELS,
  type Disclosure,
} from '../types'
import type { WorkSheet } from 'xlsx'

const BRAND_RGB = '005F8D'
const SOFT_FILL = 'F1F5F9'

const THIN = { style: 'thin' as const, color: { rgb: '94A3B8' } }
const BORDER = { top: THIN, bottom: THIN, left: THIN, right: THIN }

function esc(s: string): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function refLabel(d: Disclosure): string {
  return d.ref_no || `م/كشف ${d.log_date}`
}

function colLetter(i: number): string {
  let s = ''
  let n = i + 1
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/** أعمدة سجل الكشوفات */
const HEADERS = [
  'م', 'الرقم', 'DB', 'اسم السائق', 'نوع الآلية', 'اسم المتعهد', 'القاطع',
  'الشفت', 'التاريخ', 'نوع المخالفة', 'الإجراء التأديبي', 'التفاصيل', 'منظم الكشف',
] as const
const NCOLS = HEADERS.length

/** تصدير Excel — ملف منسّق: عنوان، ترويسة، صفوف متناوبة، مرشحات، وطباعة جاهزة */
export async function toExcel(list: Disclosure[]): Promise<void> {
  const XLSX = await import('xlsx')

  const today = new Date().toISOString().slice(0, 10)
  const total = list.length

  const aoa: (string | number)[][] = [
    ['شركة جزيرة الأكرام — سجل الكشوفات التأديبية'],
    [`تاريخ التصدير: ${today}   •   عدد الكشوفات: ${total}`],
    [...HEADERS],
    ...list.map((d, i) => [
      i + 1,
      refLabel(d),
      d.db_number,
      d.driver_name,
      d.vehicle_type ?? '',
      d.contractor_name ?? '',
      d.sector ?? '',
      SHIFT_LABELS[d.shift],
      d.log_date,
      VIOLATION_LABELS[d.violation_type],
      d.penalty_type ? PENALTY_LABELS[d.penalty_type] : '',
      d.details,
      d.prepared_by_name ?? '',
    ]),
  ]

  const ws: WorkSheet = XLSX.utils.aoa_to_sheet(aoa)

  const headerRow = 2
  const firstData = 3
  const lastRow = firstData + list.length - 1

  paint(ws, 0, 0, XLSX.utils, {
    font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' }, name: 'Segoe UI' },
    fill: { patternType: 'solid', fgColor: { rgb: BRAND_RGB } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: BORDER,
  })
  paint(ws, 1, 0, XLSX.utils, {
    font: { sz: 10, italic: true, color: { rgb: '475569' } },
    alignment: { horizontal: 'right', vertical: 'center' },
  })

  // صف الترويسة
  for (let c = 0; c < NCOLS; c++) {
    paint(ws, headerRow, c, XLSX.utils, {
      font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' }, name: 'Segoe UI' },
      fill: { patternType: 'solid', fgColor: { rgb: BRAND_RGB } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: BORDER,
    })
  }

  // صفوف البيانات — تناوب لوني + التفاصيل تلتف
  list.forEach((_, i) => {
    const r = firstData + i
    for (let c = 0; c < NCOLS; c++) {
      const style: Record<string, unknown> = {
        font: { sz: 11, name: 'Segoe UI' },
        alignment: {
          horizontal: c === 11 ? 'right' : 'center',
          vertical: c === 11 ? 'top' : 'center',
          wrapText: true,
        },
        border: BORDER,
      }
      if (i % 2 === 1) style.fill = { patternType: 'solid', fgColor: { rgb: SOFT_FILL } }
      paint(ws, r, c, XLSX.utils, style)
    }
  })

  // عروض الأعمدة وارتفاعات الصفوف
  ws['!cols'] = [
    { wch: 5 }, { wch: 14 }, { wch: 10 }, { wch: 24 }, { wch: 16 }, { wch: 16 },
    { wch: 14 }, { wch: 15 }, { wch: 12 }, { wch: 20 }, { wch: 16 }, { wch: 46 }, { wch: 18 },
  ]
  ws['!rows'] = [{ hpt: 30 }, { hpt: 16 }, { hpt: 26 }]

  // دمج العنوان والسطر التعريفي + مرشحات + هوامش + RTL
  if (NCOLS > 1) {
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: NCOLS - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: NCOLS - 1 } },
    ]
  }
  ws['!autofilter'] = {
    ref: `A${headerRow + 1}:${colLetter(NCOLS - 1)}${Math.max(lastRow, headerRow) + 1}`,
  }
  ws['!margins'] = { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5 }
  ws['!rightToLeft'] = true

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'الكشوفات')
  XLSX.writeFile(wb, `كشوفات-${today}.xlsx`)
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

/** بناء HTML بنفس تخطيط النموذج الورقي المرفق — ترويسة مؤسسة + حقول + تفاصيل + توقيع */
export function disclosureHtml(d: Disclosure): string {
  const shiftText = SHIFT_LABELS[d.shift]
  const penalty = d.penalty_type ? PENALTY_LABELS[d.penalty_type] : '—'
  const ref = d.ref_no ? esc(d.ref_no) : `م/كشف ${esc(d.log_date)}`
  const contractor = d.contractor_name ? esc(d.contractor_name) : ''
  return `
  <div class="doc">
    <div class="masthead">
      <div class="brand">
        <img src="/icons/logo.png" alt="شعار جزيرة الأكرام" />
        <div>
          <div class="org">شركة جزيرة الأكرام</div>
          <div class="org-sub">شركة البلدية — نظام الكشوفات التأديبية</div>
        </div>
      </div>
      <div class="doctitle">كشف تأديبي</div>
    </div>

    <div class="refrow">
      <span class="refbox">${ref}</span>
      <span class="dateline">التاريخ: ${esc(d.log_date)}</span>
    </div>

    <p class="to">السيد معاون المدير المفوض المحترم ………</p>

    <table class="fields">
      ${fieldRow('DB', esc(d.db_number))}
      ${fieldRow('اسم السائق', esc(d.driver_name))}
      ${fieldRow('نوع الآلية', esc(d.vehicle_type ?? '—'))}
      ${fieldRow('اسم المتعهد', contractor ? `<span class="dot">● ${contractor}</span>` : '—')}
      ${fieldRow('القاطع', esc(d.sector ?? '—'))}
      ${fieldRow('الشفت', esc(shiftText))}
    </table>

    <div class="sect">نوع الكشف</div>
    <table class="meta">
      ${fieldRow('نوع المخالفة', esc(VIOLATION_LABELS[d.violation_type]))}
      ${fieldRow('الإجراء التأديبي', esc(penalty))}
    </table>

    <div class="sect">تفاصيل الكشف</div>
    <div class="details-box">
      <p class="details-text">${esc(d.details)}</p>
    </div>

    <div class="sign">
      <div class="sign-line"><span>اسم منظم الكشف</span></div>
      <div class="sign-line"><span>التوقيع</span></div>
      <div class="sign-line"><span>التاريخ</span></div>
    </div>
    <p class="preparer">${esc(d.prepared_by_name ?? '')} &nbsp;&nbsp; ${esc(d.log_date)}</p>
  </div>`
}

function fieldRow(label: string, value: string): string {
  return `
    <tr>
      <th>${label}</th>
      <td>${value}</td>
    </tr>`
}

function htmlDoc(body: string): string {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>كشف تأديبي</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', 'Cairo', Tahoma, sans-serif; color: #0f172a; margin: 0; background: #eef2f6; }
  .doc { max-width: 780px; margin: 16px auto; background: #fff; border: 1px solid #e2e8f0;
         border-radius: 12px; padding: 26px 30px; box-shadow: 0 8px 28px rgba(15,23,42,.10); }
  .masthead { display: flex; align-items: center; justify-content: space-between; gap: 12px;
              border-bottom: 3px solid #005f8d; padding-bottom: 14px; margin-bottom: 14px; }
  .brand { display: flex; align-items: center; gap: 12px; }
  .brand img { width: 58px; height: 58px; object-fit: contain; }
  .org { font-size: 19px; font-weight: 800; color: #0f172a; }
  .org-sub { font-size: 12px; color: #64748b; }
  .doctitle { font-size: 20px; font-weight: 800; color: #005f8d; border: 2px solid #005f8d;
              border-radius: 10px; padding: 6px 18px; letter-spacing: .4px; white-space: nowrap; }
  .refrow { display: flex; align-items: center; justify-content: space-between; margin: 4px 0 10px; }
  .refbox { background: #e9f6ee; border: 1.5px solid #2f855a; color: #1e6b4a;
            font-weight: 800; border-radius: 8px; padding: 5px 16px; font-size: 13px; }
  .dateline { font-size: 13px; color: #334155; font-weight: 600; }
  .to { text-align: right; font-size: 14px; margin: 8px 0 14px; color: #1e293b; }
  table.fields, table.meta { width: 100%; border-collapse: collapse; margin: 4px 0 12px; }
  table.fields th, table.fields td, table.meta th, table.meta td {
    border: 1.2px solid #cbd5e1; padding: 9px 12px; font-size: 14px; }
  table.fields th, table.meta th { background: #eef6fc; color: #005f8d;
    text-align: right; font-weight: 700; width: 32%; }
  table.fields td, table.meta td { background: #fff; font-weight: 600; }
  .dot { font-size: 13px; color: #166534; font-weight: 700; }
  .sect { display: inline-block; background: #005f8d; color: #fff; border-radius: 8px;
          padding: 5px 18px; font-size: 13px; font-weight: 700; margin: 8px 0 10px; }
  .details-box { border: 1.5px solid #94a3b8; border-radius: 10px; min-height: 190px;
                 padding: 14px 16px; font-size: 14px; line-height: 2.1; background: #f8fafc; }
  .details-text { margin: 0; white-space: pre-wrap; }
  .sign { display: flex; justify-content: space-around; gap: 12px; margin-top: 34px; }
  .sign-line { border-bottom: 1.5px solid #334155; width: 160px; text-align: center; padding-bottom: 2px; }
  .sign-line span { background: #eef6fc; border: 1px solid #005f8d; color: #005f8d;
                    border-radius: 5px; padding: 3px 12px; font-size: 12px; position: relative; top: 15px; }
  .preparer { text-align: center; margin-top: 36px; font-size: 13px; color: #334155; }
  .noprint { text-align: center; margin-top: 16px; }
  @media print {
    body { background: #fff; }
    .doc { box-shadow: none; border: none; border-radius: 0; margin: 0; padding: 0; }
    .noprint { display: none; }
  }
</style>
</head>
<body>
  ${body}
  <div class="noprint"><button onclick="window.print()"
    style="padding:10px 24px;font-size:15px;cursor:pointer;border:none;border-radius:8px;background:#005f8d;color:#fff">طباعة / حفظ PDF</button></div>
  <script>window.onload=function(){setTimeout(function(){window.print();},300);}</script>
</body>
</html>`
}

/** تصدير كشف واحد إلى Word (يُفتح في Word بنفس التصميم) */
export function toWord(d: Disclosure): void {
  const html = htmlDoc(disclosureHtml(d))
  // Word يقرأ HTML كامل بامتداد .doc
  const blob = new Blob(['﻿', html], { type: 'application/msword;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `كشف-${VIOLATION_LABELS[d.violation_type]}-${d.driver_name}.doc`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/** طباعة/معاينة كشف بنفس التصميم (PDF عبر المتصفح) */
export function printDisclosure(d: Disclosure): void {
  const win = window.open('', '_blank', 'width=850,height=900')
  if (!win) throw new Error('تعذّر فتح نافذة الطباعة — اسمح بالنوافذ المنبثقة')
  win.document.write(htmlDoc(disclosureHtml(d)))
  win.document.close()
}
