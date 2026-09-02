/**
 * منشئ تقارير Excel احترافي (exceljs) — موحّد لكل بوابات المنظومة:
 *  · ترويسة مؤسسية بشعار الشركة (نفس شعار التطبيق) + اسم الشركة + عنوان التقرير
 *  · صف معلومات (تاريخ التصدير · العدد · مُولّد آلياً)
 *  · رؤوس أعمدة ملوّنة بعلامة الشركة · صفوف متناوبة · حدود · التفاف نص
 *  · صف إجمالي اختياري · تجميد الأعمدة · مرشّحات تلقائية · RTL · إعداد طباعة A4
 *  · ورقة «رسوم بيانية» اختيارية تُضمَّن فيها صور الرسوم (canvas → PNG)
 *
 * الشعار يُقرأ من /icons/logo.png وقت التشغيل (متاح في الخادم المحلي والـ PWA).
 */
import ExcelJS from 'exceljs'
import { renderBarChartPng, renderDonutChartPng, type ChartDatum } from './chart-image'

/** ألوان العلامة التجارية (مطابقة للشعار والأزرار) */
export const BRAND = {
  primary: '005F8D',
  dark: '0B4261',
  gold: 'F5B400',
  headerFill: '005F8D',
  altFill: 'F1F7FB',
  totalFill: 'E2E8F0',
  border: 'CBD5E1',
  white: 'FFFFFF',
  ink: '0F172A',
  muted: '64748B',
}

export interface ReportColumn {
  /** ترويسة العمود */
  header: string
  /** مفتاح القيمة في صف البيانات */
  key: string
  width?: number
  /** محاذاة أفقية */
  align?: 'center' | 'left' | 'right'
  /** تنسيق رقم Excel (مثل 0.00) */
  numFmt?: string
  /** عمود نص طويل يُلتفّ */
  wrap?: boolean
}

export interface ChartSheet {
  title: string
  kind: 'bar' | 'donut'
  data: ChartDatum[]
  valueLabel?: string
}

export interface BuildReportOptions {
  sheetName: string
  /** اسم الشركة — الافتراضي «شركة جزيرة الأكرام» */
  company?: string
  /** السطر التعريفي تحت الاسم (القسم/الوحدة) */
  companySub?: string
  /** عنوان التقرير (يظهر كبيراً) */
  title: string
  /** سطر معلومات إضافي (تاريخ/عدد/شفت…) */
  meta?: string
  columns: ReportColumn[]
  rows: Record<string, unknown>[]
  /** اسم ملف التنزيل */
  fileName: string
  /** صف إجمالي: خريطة key → قيمة (يُدمج ويُلوَّن) */
  totalRow?: Record<string, unknown>
  /** أوراق رسوم بيانية تُضاف بعد ورقة البيانات */
  charts?: ChartSheet[]
  /** اتجاه الطباعة: عمودي (portrait) أو أفقي (landscape) */
  orientation?: 'portrait' | 'landscape'
}

const thin: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: `FF${BRAND.border}` } },
  bottom: { style: 'thin', color: { argb: `FF${BRAND.border}` } },
  left: { style: 'thin', color: { argb: `FF${BRAND.border}` } },
  right: { style: 'thin', color: { argb: `FF${BRAND.border}` } },
}

const RTL_VIEW = { rightToLeft: true, showGridLines: false } as const

/** أساس المسار العام — Vite يوفّر import.meta.env.BASE_URL، والاحتياطي «/» */
const PUBLIC_BASE: string =
  (typeof import.meta !== 'undefined' &&
    (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL) ||
  '/'

/** قراءة الشعار من مسار عام → ArrayBuffer (تُتجاهل الأخطاء بأمان عند غيابه) */
async function fetchLogo(): Promise<ArrayBuffer | null> {
  try {
    if (typeof fetch !== 'function') return null
    const res = await fetch(`${PUBLIC_BASE}icons/logo.png`)
    if (!res.ok) return null
    // نسخة طازجة مستقلة لضمان توافق exceljs في المتصفح وNode
    const buf = await res.arrayBuffer()
    return buf.slice(0)
  } catch {
    return null // الشعار غير متاح (اختبار/غير متصل) — نُكمل التقرير بدونه
  }
}

/**
 * تنقية اسم ورقة Excel:
 *  · يستبدل المحارف الممنوعة في Excel: \ / * ? : [ ]  (سبّبت فشل التصدير: «مسودة / مرفوعة»)
 *  · يقصّ الاسم إلى 31 حرفاً (حد Excel) ويضمن عدم تكرار الأسماء داخل المصنف
 *  · يعيد اسم احتياطي عند الفراغ — التصدير لا ينبغي أن يفشل أبداً بسبب عنوان
 */
function sanitizeSheetName(raw: string, used: Set<string>): string {
  const base =
    raw
      .replace(/[\\/*?:[\]]/g, '–')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 31) || 'ورقة'
  if (!used.has(base)) {
    used.add(base)
    return base
  }
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`
    const name = base.slice(0, 31 - suffix.length) + suffix
    if (!used.has(name)) {
      used.add(name)
      return name
    }
  }
}

/**
 * يبني المصنف ويُفعّل التنزيل في المتصفح. يعيد المصنف للاختبارات/المعاينة.
 */
export async function buildExcelReport(opts: BuildReportOptions): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'نظام بلدية جزيرة الأكرام'
  wb.created = new Date()

  const usedNames = new Set<string>()
  const ws = wb.addWorksheet(sanitizeSheetName(opts.sheetName, usedNames), {
    views: [{ ...RTL_VIEW }],
    properties: { defaultRowHeight: 20 },
    pageSetup: {
      paperSize: 9, // A4
      orientation: opts.orientation ?? 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  })

  const ncols = opts.columns.length
  const lastCol = colLetter(ncols - 1)

  // ── صف 1: شعار + اسم الشركة ──
  ws.getRow(1).height = 52
  const logo = await fetchLogo()
  if (logo) {
    const imgId = wb.addImage({ buffer: logo, extension: 'png' })
    // الشعار في أقصى يمين الصفحة (RTL) داخل العمود A، مع إزاحة لطيفة
    ws.addImage(imgId, { tl: { col: 0.12, row: 0.3 }, ext: { width: 40, height: 40 } })
  }
  // ندمج من العمود C عند وجود شعار: عمود A للشعار، وعمود B فراغ بصري يفصل الشعار عن النص
  const brandStart = logo ? 'C1' : 'A1'
  ws.mergeCells(`${brandStart}:${lastCol}1`)
  const titleBrand = ws.getCell(brandStart)
  titleBrand.value = opts.company ?? 'شركة جزيرة الأكرام'
  titleBrand.font = { name: 'Segoe UI', bold: true, size: 18, color: { argb: `FF${BRAND.primary}` } }
  titleBrand.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 }

  // ── صف 2: السطر التعريفي للوحدة ──
  ws.mergeCells(`A2:${lastCol}2`)
  const subCell = ws.getCell('A2')
  subCell.value = opts.companySub ?? ''
  subCell.font = { name: 'Segoe UI', size: 11, color: { argb: `FF${BRAND.muted}` } }
  subCell.alignment = { horizontal: 'right', vertical: 'middle' }
  ws.getRow(2).height = 18

  // ── صف 3: عنوان التقرير (شريط العلامة) ──
  ws.mergeCells(`A3:${lastCol}3`)
  ws.getRow(3).height = 34
  const c3 = ws.getCell('A3')
  c3.value = opts.title
  c3.font = { name: 'Segoe UI', bold: true, size: 15, color: { argb: `FF${BRAND.white}` } }
  c3.alignment = { horizontal: 'center', vertical: 'middle' }
  c3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND.headerFill}` } }

  // ── صف 4: سطر المعلومات ──
  ws.mergeCells(`A4:${lastCol}4`)
  const c4 = ws.getCell('A4')
  c4.value = opts.meta ?? ''
  c4.font = { name: 'Segoe UI', size: 10, italic: true, color: { argb: `FF${BRAND.muted}` } }
  c4.alignment = { horizontal: 'right', vertical: 'middle' }
  ws.getRow(4).height = 18

  // ── صف 5: رؤوس الأعمدة ──
  const headerRowIdx = 5
  const hr = ws.getRow(headerRowIdx)
  hr.height = 26
  opts.columns.forEach((col, i) => {
    const cell = hr.getCell(i + 1)
    cell.value = col.header
    cell.font = { name: 'Segoe UI', bold: true, size: 11, color: { argb: `FF${BRAND.white}` } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND.dark}` } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = thin
    ws.getColumn(i + 1).width = col.width ?? 16
  })

  // ── صفوف البيانات ──
  const firstData = headerRowIdx + 1
  opts.rows.forEach((row, ri) => {
    const excelRow = ws.getRow(firstData + ri)
    opts.columns.forEach((col, ci) => {
      const cell = excelRow.getCell(ci + 1)
      const v = row[col.key]
      cell.value =
        v === null || v === undefined || v === ''
          ? col.key === '#'
            ? ri + 1
            : ''
          : (v as ExcelJS.CellValue)
      cell.font = { name: 'Segoe UI', size: 10.5, color: { argb: `FF${BRAND.ink}` } }
      cell.alignment = {
        horizontal: col.align ?? (col.wrap ? 'right' : 'center'),
        vertical: col.wrap ? 'top' : 'middle',
        wrapText: true,
      }
      cell.border = thin
      if (col.numFmt) cell.numFmt = col.numFmt
      if (ri % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND.altFill}` } }
      }
    })
  })

  const lastDataRow = Math.max(firstData + opts.rows.length - 1, headerRowIdx)

  // ── صف الإجمالي ──
  if (opts.totalRow) {
    const tr = ws.getRow(lastDataRow + 1)
    tr.height = 24
    opts.columns.forEach((col, ci) => {
      const cell = tr.getCell(ci + 1)
      const v = opts.totalRow?.[col.key]
      cell.value = (v ?? '') as ExcelJS.CellValue
      cell.font = { name: 'Segoe UI', bold: true, size: 11, color: { argb: `FF${BRAND.ink}` } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND.totalFill}` } }
      cell.alignment = { horizontal: col.align ?? 'center', vertical: 'middle' }
      cell.border = thin
    })
  }

  // ── مرشّحات + تجميد + ترويسة/تذييل طباعة ──
  ws.autoFilter = {
    from: { row: headerRowIdx, column: 1 },
    to: { row: lastDataRow, column: ncols },
  }
  ws.views = [{ ...RTL_VIEW, state: 'frozen', ySplit: headerRowIdx }]
  ws.headerFooter = {
    oddHeader: '&Cشركة جزيرة الأكرام',
    oddFooter: `&Lوُلّد آلياً — ${new Date().toLocaleDateString('ar')}&Cصفحة &P من &N`,
  }

  // ── أوراق الرسوم البيانية ──
  for (const chart of opts.charts ?? []) {
    const png =
      chart.kind === 'donut'
        ? renderDonutChartPng(chart.data, { title: chart.title, valueLabel: chart.valueLabel })
        : renderBarChartPng(chart.data, { title: chart.title, valueLabel: chart.valueLabel })
    if (!png) continue
    const cws = wb.addWorksheet(sanitizeSheetName(chart.title, usedNames), {
      views: [{ ...RTL_VIEW }],
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    })
    const imgId = wb.addImage({ buffer: png as unknown as ArrayBuffer, extension: 'png' })
    cws.addImage(imgId, { tl: { col: 1, row: 1 }, ext: { width: 880, height: 410 } })
  }

  // ── تنزيل المتصفح ──
  await saveWorkbook(wb, opts.fileName)
  return wb
}

/** حفظ وتنزيل — يستخدم writeBuffer ثم Blob (متصفح). يفشل بهدوء في بيئة الاختبار. */
async function saveWorkbook(wb: ExcelJS.Workbook, fileName: string): Promise<void> {
  const buffer = await wb.xlsx.writeBuffer()
  // بيئات بلا DOM أو بلا createObjectURL (jsdom/node): نكتفي ببناء المصنف
  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') return
  try {
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  } catch {
    // تجاهل أخطاء التنزيل في بيئات الاختبار — المصنف بُني بنجاح
  }
}

/** حرف العمود من رقمه (0 → A) */
export function colLetter(i: number): string {
  let s = ''
  let n = i
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  }
  return s
}
