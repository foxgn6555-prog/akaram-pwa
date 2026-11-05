import type { Workbook, Worksheet } from 'exceljs'
import { biometric } from '@sdk/biometric.sdk'
import type { ArchivePersonCursor, UnmatchedUnitDay, UnmatchedUnitFilters, UnmatchedUnitPerson, UnmatchedUnitStatus } from '../types'

export const UNIT_STATUS: Record<UnmatchedUnitStatus, string> = {
  present: 'حاضر', missing: 'بصمة ناقصة', absent: 'غائب', leave: 'مجاز', review: '—',
  previous_exit: 'خروج لليوم السابق', pending: 'اليوم جارٍ', future: 'مستقبل', unknown: 'غير محدد بعد الربط',
}
export const UNIT_COLOR: Record<UnmatchedUnitStatus, string> = {
  present: 'DCFCE7', missing: 'FEF3C7', absent: 'FEE2E2', leave: 'DBEAFE', review: 'F1F5F9',
  previous_exit: 'E0E7FF', pending: 'F1F5F9', future: 'F1F5F9', unknown: 'E2E8F0',
}
/** الوقت محلي للجهاز كما أعاده الخادم، لا يُحوّل بتوقيت متصفح المستخدم. */
export function unitLocalTime(value: string | null, date?: string): string {
  if (!value) return '—'
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value)
  if (!m) return '—'
  const h = Number(m[2]); if (h > 23 || Number(m[3]) > 59) return '—'
  const suffix = date && m[1] !== date ? ` (${m[1]})` : ''
  return `${String(h % 12 || 12).padStart(2, '0')}:${m[3]} ${h < 12 ? 'صباحاً' : 'مساءً'}${suffix}`
}
/** عند تعدد أو تعارض البصمات نعرض أوقاتها الخام فقط، لا دخولاً وخروجاً مؤكّدين. */
export function unitShownTimes(day: UnmatchedUnitDay): { first: string | null; last: string | null } {
  if (day.status === 'review') return { first: day.raw_first, last: day.raw_last === day.raw_first ? null : day.raw_last }
  if (day.status === 'missing' && !day.entry && !day.exit) return { first: day.raw_first, last: null }
  return { first: day.entry, last: day.exit }
}
export function unitCellText(day: UnmatchedUnitDay): string {
  if (day.status === 'review') {
    const { first, last } = unitShownTimes(day)
    return [first && unitLocalTime(first, day.date), last && unitLocalTime(last, day.date)].filter(Boolean).join('\n') || '—'
  }
  const label = UNIT_STATUS[day.status]
  if (day.entry || day.exit) return `${label}\nد: ${unitLocalTime(day.entry, day.date)}\nخ: ${unitLocalTime(day.exit, day.date)}`
  if (day.status === 'missing' && day.raw_first) return `${label}\n${unitLocalTime(day.raw_first, day.date)}`
  return label
}
export async function collectUnitRows(filters: UnmatchedUnitFilters): Promise<UnmatchedUnitPerson[]> {
  const result: UnmatchedUnitPerson[] = []
  let cursor: ArchivePersonCursor | null = null
  for (;;) {
    const data = await biometric.unmatchedUnitReport(filters, cursor, 201)
    const visible = data.slice(0, 200)
    result.push(...visible)
    if (data.length <= 200) return result
    if (result.length >= 30_000) throw new Error('النتائج كثيرة للتصدير؛ ضيّق الفلاتر وحاول مجدداً.')
    const last = visible[visible.length - 1]!
    if (cursor && cursor.device === last.device_serial && cursor.pin === last.pin) throw new Error('تعذر متابعة صفحات التقرير.')
    cursor = { device: last.device_serial, pin: last.pin }
  }
}
async function sheet(name: string, subtitle: string, cols: number): Promise<{ wb: Workbook; ws: Worksheet }> {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook(); wb.creator = 'شركة جزيرة الأكارم — الموارد البشرية'; wb.created = new Date()
  const ws = wb.addWorksheet(name, { views: [{ rightToLeft: true, state: 'frozen', ySplit: 3 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } })
  ws.mergeCells(1, 1, 1, cols); ws.getCell('A1').value = name; ws.getCell('A1').font = { bold: true, size: 15 }
  ws.mergeCells(2, 1, 2, cols); ws.getCell('A2').value = subtitle; ws.getCell('A2').alignment = { wrapText: true }
  ws.getRow(2).height = 27
  return { wb, ws }
}
function heading(ws: Worksheet) {
  ws.getRow(3).eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true } })
  ws.getRow(3).height = 25
}
export async function buildUnitWorkbook(rows: UnmatchedUnitPerson[], f: UnmatchedUnitFilters, branches: Array<{ id: string; name: string }>, mode: 'grid' | 'details'): Promise<Workbook> {
  const label = f.branch ? branches.find(b => b.id === f.branch)?.name ?? 'فرع غير متاح' : 'كل الفروع'
  const subtitle = `الفترة ${f.from} إلى ${f.to} · ${label} · الجهاز ${f.device || 'الكل'} · الاسم ${f.name || 'الكل'} · PIN ${f.pin || 'الكل'} · الحالة ${f.status ? UNIT_STATUS[f.status] : 'الكل'}`
  const branch = (r: UnmatchedUnitPerson) => r.branch_id ? (branches.find(b => b.id === r.branch_id)?.name ?? 'فرع غير متاح') : '—'
  if (mode === 'grid') {
    const dates = rows[0]?.days.map(d => d.date) ?? []
    const { wb, ws } = await sheet('دخول وخروج', subtitle, 5 + dates.length)
    ws.getRow(3).values = ['ت', 'الاسم', 'PIN', 'الجهاز', 'الفرع', ...dates]; heading(ws)
    rows.forEach((r, i) => {
      const line = ws.addRow([i + 1, r.person_name || '—', r.pin, `${r.device_name || '—'} · ${r.device_serial}`, branch(r), ...r.days.map(unitCellText)])
      line.height = 44
      r.days.forEach((d, j) => { const c = line.getCell(j + 6); c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${UNIT_COLOR[d.status]}` } }; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true } })
    })
    ;[7, 26, 14, 27, 22].forEach((w, i) => { ws.getColumn(i + 1).width = w }); dates.forEach((_, i) => { ws.getColumn(i + 6).width = 24 })
    return wb
  }
  const total = rows.reduce((n, r) => n + r.days.filter(d => !f.status || d.status === f.status).length, 0)
  if (total > 30_000) throw new Error('تفاصيل الأيام كثيرة للتصدير؛ اختر فترة أو فلاتر أضيق.')
  const { wb, ws } = await sheet('تفاصيل يومية', subtitle, 11)
  ws.getRow(3).values = ['ت', 'الاسم', 'PIN', 'الجهاز', 'الفرع', 'اليوم', 'الحالة', 'الوقت الأول المعروض', 'الوقت الأخير المعروض', 'عدد بصمات اليوم الأصلية', 'تعديل يدوي']; heading(ws)
  let i = 0
  for (const r of rows) for (const d of r.days) {
    if (f.status && d.status !== f.status) continue
    const line = ws.addRow([++i, r.person_name || '—', r.pin, `${r.device_name || '—'} · ${r.device_serial}`, branch(r), d.date, UNIT_STATUS[d.status], unitLocalTime(unitShownTimes(d).first, d.date), unitLocalTime(unitShownTimes(d).last, d.date), d.punch_count, d.manual ? 'نعم' : 'لا'])
    line.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${UNIT_COLOR[d.status]}` } }
  }
  ;[7, 24, 14, 28, 20, 14, 22, 26, 26, 22, 16].forEach((w, i) => { ws.getColumn(i + 1).width = w })
  return wb
}
