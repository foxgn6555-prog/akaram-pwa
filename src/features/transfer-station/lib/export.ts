/**
 * أدوات تصدير دفتر الأوزان — المحطة التحويلية:
 *  · toExcel: ملف .xlsx بأعمدة مطابقة للدفتر الورقي
 *  · printPdf: نافذة طباعة منسّقة (عربي RTL) → «حفظ كـ PDF» من المتصفح
 * المكتبة الثقيلة (xlsx) تُحمَّل كسولة وقت الحاجة فقط.
 */
import { SHIFT_LABELS, type Shift, type WeightRecord } from '../types'

const T = 'ت'
const DB = 'DB'
const DRIVER = 'اسم السائق'
const TYPE = 'صنف الآلية'
const GROSS = 'الوزن الكلي (بالطن)'
const TARE = 'الوزن الفارغ (بالطن)'
const NET = 'الوزن الصافي (بالطن)'
const ENTRY = 'وقت الدخول'

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

/** تصدير ملف Excel (.xlsx) */
export async function toExcel(records: WeightRecord[], date: string, shift: Shift): Promise<void> {
  const XLSX = await import('xlsx')

  const rows = records.map((r, i) => ({
    [T]: i + 1,
    [DB]: r.db_number,
    [DRIVER]: r.driver_name,
    [TYPE]: r.vehicle_type ?? '',
    [GROSS]: r.gross_weight ?? '',
    [TARE]: r.tare_weight ?? '',
    [NET]: netOf(r) ?? '',
    [ENTRY]: r.entry_time ?? '',
  }))

  // صف تواقيع/مجاميع
  const totalNet = records.reduce((s, r) => s + (netOf(r) ?? 0), 0)
  rows.push({
    [T]: '' as never,
    [DB]: '' as never,
    [DRIVER]: 'إجمالي الصافي' as never,
    [TYPE]: '' as never,
    [GROSS]: '' as never,
    [TARE]: '' as never,
    [NET]: +totalNet.toFixed(2) as never,
    [ENTRY]: '' as never,
  })

  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [
    { wch: 5 },  // ت
    { wch: 14 }, // DB
    { wch: 22 }, // اسم السائق
    { wch: 14 }, // صنف
    { wch: 16 }, // كلي
    { wch: 16 }, // فارغ
    { wch: 18 }, // صافي
    { wch: 12 }, // وقت
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'دفتر الأوزان')
  XLSX.writeFile(wb, `سجل-الأوزان-${SHIFT_LABELS[shift]}-${date}.xlsx`)
}

/** فتح نافذة طباعة منسّقة (عربي) — المستخدم يختار «حفظ كـ PDF» */
export function printPdf(records: WeightRecord[], date: string, shift: Shift): void {
  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) {
    throw new Error('تعذّر فتح نافذة الطباعة — اسمح بالنوافذ المنبثقة')
  }

  const totalNet = records.reduce((s, r) => s + (netOf(r) ?? 0), 0)
  const rowsHtml = records
    .map(
      (r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(r.db_number)}</td>
        <td>${escapeHtml(r.driver_name)}</td>
        <td>${escapeHtml(r.vehicle_type ?? '')}</td>
        <td class="num">${r.gross_weight ?? ''}</td>
        <td class="num">${r.tare_weight ?? ''}</td>
        <td class="num">${netOf(r) ?? ''}</td>
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
  body { font-family: 'Segoe UI', 'Cairo', Tahoma, sans-serif; margin: 24px; color: #0f172a; }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 16px;
          border: 2px solid #000; background: #d9f2e6; padding: 12px 18px; margin-bottom: 14px; }
  .head h1 { font-size: 20px; margin: 0; color: #c0392b; text-align: center; flex: 1; }
  .meta { text-align: left; font-weight: bold; font-size: 15px; white-space: nowrap; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #000; padding: 8px 6px; font-size: 13px; text-align: center; }
  thead th { background: #bfe3f2; }
  .num { direction: ltr; }
  tfoot td { font-weight: bold; background: #f1f5f9; }
  .sign { margin-top: 32px; display: flex; justify-content: space-between; font-size: 13px; }
  @media print { body { margin: 8px; } .noprint { display: none; } }
</style>
</head>
<body>
  <div class="head">
    <div class="meta">التاريخ: ${date} — الشفت: ${SHIFT_LABELS[shift]}</div>
    <h1>سجل الأوزان الداخل إلى المحطة التحويلية — الشفت ${SHIFT_LABELS[shift]}</h1>
    <div class="meta">202__/__</div>
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
    <span>توقيع المسؤول: ______________</span>
    <span>التدقيق (غرفة العمليات): ______________</span>
  </div>
  <p class="noprint" style="margin-top:18px;text-align:center">
    <button onclick="window.print()" style="padding:10px 22px;font-size:15px;cursor:pointer">
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
