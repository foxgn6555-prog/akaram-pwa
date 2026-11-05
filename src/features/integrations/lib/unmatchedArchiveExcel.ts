import type { Workbook, Worksheet } from 'exceljs'
import type { ArchivePeopleFilters, ArchivePersonCursor, ArchivePunchCursor, UnmatchedArchivePerson, UnmatchedArchivePunch } from '../types'
import { biometric } from '@sdk/biometric.sdk'

const PAGE = 250
const MAX_EXPORT = 30_000

export function archiveLocalTime(at: string, offset?: string | null): string {
  const m = /^([+-])(0\d|1[0-4]):([0-5]\d)$/.exec(offset ?? '')
  const tz = m ? offset! : '+00:00'
  const minutes = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0
  const d = new Date(new Date(at).getTime() + minutes * 60_000)
  if (Number.isNaN(d.getTime())) return '—'
  const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  const hour = d.getUTCHours()
  const second = String(d.getUTCSeconds()).padStart(2, '0')
  const ms = d.getUTCMilliseconds() ? `.${String(d.getUTCMilliseconds()).padStart(3, '0')}` : ''
  return `${date} ${String(hour % 12 || 12).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${second}${ms} ${hour < 12 ? 'صباحاً' : 'مساءً'} (${m ? tz : 'UTC'})`
}
export const archiveDirection = (direction?: string) => direction === 'in' ? 'دخول' : direction === 'out' ? 'خروج' : 'غير محدد'

const samePersonCursor = (c: ArchivePersonCursor | null, r: UnmatchedArchivePerson) => c !== null && c.device === r.device_serial && c.pin === r.pin
const samePunchCursor = (c: ArchivePunchCursor | null, r: UnmatchedArchivePunch) => c !== null && c.at === r.punched_at && c.id === r.source_punch_id

/** لا يصدّر صفحة واحدة على أنها جميع النتائج. */
export async function collectArchivePeople(filters: ArchivePeopleFilters): Promise<UnmatchedArchivePerson[]> {
  const result: UnmatchedArchivePerson[] = []
  let cursor: ArchivePersonCursor | null = null
  for (;;) {
    const data = await biometric.unmatchedArchivePeople(filters, cursor, PAGE + 1)
    const page = data.slice(0, PAGE)
    result.push(...page)
    if (data.length <= PAGE) return result
    if (result.length >= MAX_EXPORT) throw new Error('النتائج كثيرة للتصدير دفعة واحدة؛ ضيّق البحث ثم حاول مجدداً.')
    const last = page[page.length - 1]!
    if (samePersonCursor(cursor, last)) throw new Error('تعذر متابعة صفحات الأرشيف؛ حاول مجدداً.')
    cursor = { device: last.device_serial, pin: last.pin }
  }
}
export async function collectArchivePunches(person: UnmatchedArchivePerson, from: string, to: string): Promise<UnmatchedArchivePunch[]> {
  const result: UnmatchedArchivePunch[] = []
  let cursor: ArchivePunchCursor | null = null
  for (;;) {
    const data = await biometric.unmatchedArchivePunches(person.device_serial, person.pin, from, to, cursor, PAGE + 1)
    const page = data.slice(0, PAGE)
    result.push(...page)
    if (data.length <= PAGE) return result
    if (result.length >= MAX_EXPORT) throw new Error('البصمات كثيرة للتصدير دفعة واحدة؛ اختر فترة أقصر ثم حاول مجدداً.')
    const last = page[page.length - 1]!
    if (samePunchCursor(cursor, last)) throw new Error('تعذر متابعة صفحات البصمات؛ حاول مجدداً.')
    cursor = { at: last.punched_at, id: last.source_punch_id }
  }
}

async function sheet(title: string, subtitle: string, columns: string[]): Promise<{ wb: Workbook; ws: Worksheet }> {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook(); wb.creator = 'شركة جزيرة الأكارم — الموارد البشرية'; wb.created = new Date()
  const ws = wb.addWorksheet(title, { views: [{ rightToLeft: true, state: 'frozen', ySplit: 3 }] })
  ws.mergeCells(1, 1, 1, columns.length); ws.getCell('A1').value = title; ws.getCell('A1').font = { bold: true, size: 15 }
  ws.mergeCells(2, 1, 2, columns.length); ws.getCell('A2').value = subtitle
  ws.getRow(3).values = columns
  ws.getRow(3).eachCell(cell => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }; cell.alignment = { horizontal: 'center' } })
  return { wb, ws }
}
export async function buildArchivePeopleWorkbook(rows: UnmatchedArchivePerson[], filters: ArchivePeopleFilters, branches: Array<{ id: string; name: string }>): Promise<Workbook> {
  const branchName = branches.find(b => b.id === filters.branchId)?.name ?? (filters.branchId || 'الكل')
  const { wb, ws } = await sheet('أشخاص الأرشيف', `بحث: ${filters.search || 'الكل'} · جهاز: ${filters.deviceSerial || 'الكل'} · الفرع عند الأرشفة: ${branchName}`, ['ت', 'الاسم على الجهاز', 'PIN', 'الجهاز', 'الرقم التسلسلي', 'الفرع عند الأرشفة', 'عدد البصمات'])
  rows.forEach((r, i) => ws.addRow([i + 1, r.device_person_name || '—', r.pin, r.device_name || '—', r.device_serial, r.branch_id ? (branches.find(b => b.id === r.branch_id)?.name ?? 'فرع غير متاح') : '—', Number(r.punch_count)]))
  ;[7, 28, 16, 25, 24, 25, 16].forEach((w, i) => { ws.getColumn(i + 1).width = w })
  return wb
}
export async function buildArchivePunchWorkbook(person: UnmatchedArchivePerson, rows: UnmatchedArchivePunch[], from: string, to: string): Promise<Workbook> {
  const { wb, ws } = await sheet('بصمات الأرشيف', `${person.device_person_name || '—'} · PIN ${person.pin} · ${person.device_serial} · من ${from || 'البداية'} إلى ${to || 'النهاية'}`, ['ت', 'وقت الجهاز المحفوظ', 'الاتجاه الأصلي', 'طريقة الاستلام', 'معرّف البصمة', 'الوقت الأصلي UTC'])
  rows.forEach((p, i) => ws.addRow([i + 1, archiveLocalTime(p.punched_at, p.original_device?.timezone_offset), archiveDirection(p.original_punch?.direction), p.original_punch?.method || '—', p.source_punch_id, p.punched_at]))
  ;[7, 38, 18, 20, 40, 34].forEach((w, i) => { ws.getColumn(i + 1).width = w })
  return wb
}
