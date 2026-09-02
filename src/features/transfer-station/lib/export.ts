/**
 * أدوات تصدير دفتر الأوزان — المحطة التحويلية:
 *  · toExcel: تقرير .xlsx احترافي (exceljs) — شعار الشركة + ترويسة ملوّنة،
 *    رؤوس أعمدة، صفوف متناوبة، حدود، صف إجمالي، مرشّحات، تجميد، RTL،
 *    طباعة A4 جاهزة، وورقة «رسوم بيانية» (مقارنة الكلي/الفارغ/الصافي + الحالات).
 *  · printPdf: نافذة طباعة منسّقة A4 (عربي RTL) → «حفظ كـ PDF» من المتصفح
 */
import type ExcelJS from 'exceljs'
import { SHIFT_LABELS, type Shift, type WeightRecord } from '../types'
import { buildExcelReport, type ReportColumn } from '@lib/export/excel-report'

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

function escapeHtml(s: string): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** مسار الشعار المطلق (يعمل في التطوير والإنتاج وداخل نافذة الطباعة) */
function logoUrl(): string {
  const env = (typeof import.meta !== 'undefined' ? import.meta : {}) as {
    env?: { BASE_URL?: string }
  }
  const base = env.env?.BASE_URL ?? '/'
  return `${base}icons/logo.png`
}

const COLUMNS: ReportColumn[] = [
  { header: 'ت', key: '#', width: 5, align: 'center' },
  { header: 'DB', key: 'db_number', width: 14, align: 'center' },
  { header: 'اسم السائق', key: 'driver_name', width: 26, align: 'right' },
  { header: 'صنف الآلية', key: 'vehicle_type', width: 17 },
  { header: 'الوزن الكلي (طن)', key: 'gross_weight', width: 16, align: 'center', numFmt: '0.00' },
  { header: 'الوزن الفارغ (طن)', key: 'tare_weight', width: 16, align: 'center', numFmt: '0.00' },
  { header: 'الوزن الصافي (طن)', key: 'net_weight', width: 17, align: 'center', numFmt: '0.00' },
  { header: 'وقت الدخول', key: 'entry_time', width: 12, align: 'center' },
]

/** تصدير Excel احترافي — شعار + تنسيق كامل + صف إجمالي + ورقة رسوم بيانية. يعيد المصنف. */
export async function toExcel(
  records: WeightRecord[],
  date: string,
  shift: Shift,
): Promise<ExcelJS.Workbook> {
  const today = new Date().toISOString().slice(0, 10)

  const rows = records.map((r) => ({
    db_number: r.db_number,
    driver_name: r.driver_name,
    vehicle_type: r.vehicle_type ?? '',
    gross_weight: r.gross_weight ?? '',
    tare_weight: r.tare_weight ?? '',
    net_weight: netOf(r) ?? '',
    entry_time: r.entry_time ?? '',
  }))

  const sum = (sel: (r: WeightRecord) => number | null): number =>
    +records.reduce((acc, r) => acc + (sel(r) ?? 0), 0).toFixed(2)
  const totalGross = sum((r) => r.gross_weight)
  const totalTare = sum((r) => r.tare_weight)
  const totalNet = sum((r) => netOf(r))
  const drafts = records.filter((r) => r.status === 'draft').length
  const submitted = records.filter((r) => r.status === 'submitted_to_ops').length

  return buildExcelReport({
    sheetName: 'دفتر الأوزان',
    company: 'شركة جزيرة الأكرام',
    companySub: 'المحطة التحويلية — سجل الأوزان الداخل',
    title: sheetTitle(date, shift),
    meta: `تاريخ التصدير: ${today}   •   عدد السجلات: ${records.length}   •   إجمالي الصافي: ${totalNet.toFixed(2)} طن   •   وُلِّد آلياً من نظام بلدية جزيرة الأكرام`,
    columns: COLUMNS,
    rows,
    fileName: `سجل-الأوزان-${SHIFT_LABELS[shift]}-${date}.xlsx`,
    orientation: 'landscape',
    totalRow: {
      driver_name: 'الإجمالي (طن)',
      gross_weight: totalGross,
      tare_weight: totalTare,
      net_weight: totalNet,
    },
    charts: [
      {
        title: 'ملخص الأوزان (كلي / فارغ / صافي) بالطن',
        kind: 'bar',
        valueLabel: 'طن',
        data: [
          { label: 'الوزن الكلي', value: totalGross, color: '#005F8D' },
          { label: 'الوزن الفارغ', value: totalTare, color: '#94A3B8' },
          { label: 'الوزن الصافي', value: totalNet, color: '#10B981' },
        ],
      },
      {
        title: 'حالة سجلات الدفتر',
        kind: 'donut',
        valueLabel: 'سجل',
        data: [
          { label: 'مسودة (بانتظار التدقيق)', value: drafts, color: '#f59e0b' },
          { label: 'مُرسل لغرفة العمليات', value: submitted, color: '#10b981' },
        ],
      },
    ],
  })
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
    <img src="${logoUrl()}" alt="شعار جزيرة الأكرام" />
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
        <th>ت</th><th>DB</th><th>اسم السائق</th><th>صنف الآلية</th>
        <th>الوزن الكلي (طن)</th><th>الوزن الفارغ (طن)</th><th>الوزن الصافي (طن)</th><th>وقت الدخول</th>
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
