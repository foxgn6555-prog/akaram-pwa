/**
 * تصدير الكشوفات:
 *  · toExcel: ملف .xlsx منسّق بالكامل (ترويسة المؤسسة + صفوف ملوّنة + مرشحات + طباعة جاهزة)
 *  · toWord: مستند Word (.doc) بتصميم النموذج الورقي المرفق (شعار + حقول + تفاصيل + توقيع)
 * المكتبة الثقيلة (xlsx) تُحمَّل كسولة وقت الحاجة فقط.
 */
import type ExcelJS from 'exceljs'
import {
  VIOLATION_LABELS,
  PENALTY_LABELS,
  SHIFT_LABELS,
  type ViolationType,
  type Disclosure,
} from '../types'
import { buildExcelReport, type ReportColumn } from '@lib/export/excel-report'

function esc(s: string): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function refLabel(d: Disclosure): string {
  return d.ref_no || `م/كشف ${d.log_date}`
}

/** مسار الشعار المطلق (يعمل في التطوير والإنتاج ونوافذ الطباعة/Word) */
function logoUrl(): string {
  const env = (typeof import.meta !== 'undefined' ? import.meta : {}) as {
    env?: { BASE_URL?: string }
  }
  const base = env.env?.BASE_URL ?? '/'
  return `${base}icons/logo.png`
}

/** ألوان أنواع المخالفات (مطابقة للوحة) */
const VIOLATION_COLORS: Record<ViolationType, string> = {
  delay: '#f59e0b',
  absence: '#ef4444',
  collection: '#8b5cf6',
  evasion: '#0f7cb0',
  early_withdrawal: '#f97316',
  load_deficiency: '#14b8a6',
}

/** أعمدة سجل الكشوفات */
const COLUMNS: ReportColumn[] = [
  { header: 'م', key: '#', width: 5, align: 'center' },
  { header: 'الرقم', key: 'ref', width: 15, align: 'center' },
  { header: 'DB', key: 'db_number', width: 11, align: 'center' },
  { header: 'اسم السائق', key: 'driver_name', width: 24, align: 'right' },
  { header: 'نوع الآلية', key: 'vehicle_type', width: 16 },
  { header: 'اسم المتعهد', key: 'contractor_name', width: 15 },
  { header: 'القاطع', key: 'sector', width: 13 },
  { header: 'الشفت', key: 'shift', width: 14 },
  { header: 'التاريخ', key: 'log_date', width: 12, align: 'center' },
  { header: 'نوع المخالفة', key: 'violation', width: 18 },
  { header: 'الإجراء التأديبي', key: 'penalty', width: 16 },
  { header: 'التفاصيل', key: 'details', width: 46, wrap: true },
  { header: 'منظم الكشف', key: 'prepared_by', width: 18 },
]

/**
 * تصدير Excel احترافي — شعار الشركة + ترويسة ملوّنة + صفوف متناوبة + حدود
 * + مرشّحات + تجميد + RTL + إعداد طباعة A4، ومعه ورقة «رسوم بيانية» تضم:
 *  · توزيع الكشوفات حسب نوع المخالفة (أعمدة)
 *  · حالة الكشوفات (مسودة/مرفوعة) (دائري)
 */
export async function toExcel(list: Disclosure[]): Promise<ExcelJS.Workbook> {
  const today = new Date().toISOString().slice(0, 10)

  const rows = list.map((d) => ({
    ref: refLabel(d),
    db_number: d.db_number,
    driver_name: d.driver_name,
    vehicle_type: d.vehicle_type ?? '',
    contractor_name: d.contractor_name ?? '',
    sector: d.sector ?? '',
    shift: SHIFT_LABELS[d.shift],
    log_date: d.log_date,
    violation: VIOLATION_LABELS[d.violation_type],
    penalty: d.penalty_type ? PENALTY_LABELS[d.penalty_type] : '—',
    details: d.details,
    prepared_by: d.prepared_by_name ?? '',
  }))

  // تجميع حسب نوع المخالفة للرسم
  const byViolation = (Object.keys(VIOLATION_LABELS) as ViolationType[]).map((k) => ({
    label: VIOLATION_LABELS[k],
    value: list.filter((d) => d.violation_type === k).length,
    color: VIOLATION_COLORS[k],
  }))
  const drafts = list.filter((d) => d.status === 'draft').length
  const submitted = list.filter((d) => d.status === 'submitted_to_deputy').length

  return buildExcelReport({
    sheetName: 'الكشوفات',
    company: 'شركة جزيرة الأكرام',
    companySub: 'وحدة الكشوفات — سجل الكشوفات التأديبية',
    title: 'سجل الكشوفات التأديبية',
    meta: `تاريخ التصدير: ${today}   •   عدد الكشوفات: ${list.length}   •   وُلِّد آلياً من نظام بلدية جزيرة الأكرام`,
    columns: COLUMNS,
    rows,
    fileName: `كشوفات-${today}.xlsx`,
    orientation: 'landscape',
    charts: [
      {
        title: 'توزيع الكشوفات حسب نوع المخالفة',
        kind: 'bar',
        data: byViolation,
        valueLabel: 'عدد الكشوفات',
      },
      {
        title: 'حالة الكشوفات (مسودة / مرفوعة للمعاون)',
        kind: 'donut',
        valueLabel: 'كشف',
        data: [
          { label: 'مسودة', value: drafts, color: '#f59e0b' },
          { label: 'مرفوعة للمعاون', value: submitted, color: '#10b981' },
        ],
      },
    ],
  })
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
        <img src="${logoUrl()}" alt="شعار جزيرة الأكرام" />
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
