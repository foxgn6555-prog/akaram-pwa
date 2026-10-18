/** منطق «بيانات وحدة البث المباشر» (00288): فلاتر الأيام، تنسيق الصفوف، الملخص، ومصنّف Excel. */
import type { Workbook } from 'exceljs'
import type { LiveKind, LiveSessionRow } from '@sdk/live-tracking.sdk'
import { LIVE_KIND_LABEL, timeHM, type LiveFilter } from './live-map.logic'

export type DayPreset = 'today' | 'yesterday' | 'week' | 'month' | 'custom'
export const DAY_PRESETS: { id: DayPreset; label: string }[] = [
  { id: 'today', label: 'اليوم' }, { id: 'yesterday', label: 'أمس' }, { id: 'week', label: 'آخر 7 أيام' }, { id: 'month', label: 'آخر 30 يوماً' }, { id: 'custom', label: 'مدة مخصصة' },
]
export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export function presetRange(preset: Exclude<DayPreset, 'custom'>, today: Date = new Date()): { from: string; to: string } {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const back = (n: number) => { const d = new Date(t); d.setDate(d.getDate() - n); return d }
  if (preset === 'today') return { from: isoDay(t), to: isoDay(t) }
  if (preset === 'yesterday') return { from: isoDay(back(1)), to: isoDay(back(1)) }
  if (preset === 'week') return { from: isoDay(back(6)), to: isoDay(t) }
  return { from: isoDay(back(29)), to: isoDay(t) }
}

export const dayOf = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit' })
export const inZoneText = (v: boolean | null) => v === true ? 'داخل الزون' : v === false ? 'خارج الزون' : 'لا زون محدد'
export const endText = (r: Pick<LiveSessionRow, 'ended_at' | 'end_reason'>) => !r.ended_at ? 'جارٍ' : r.end_reason === 'shift_end' ? 'انتهى الشفت' : 'أوقفه المستخدم'
export const durationText = (m: number) => m < 60 ? `${m} د` : `${Math.floor(m / 60)} س ${m % 60} د`

export function filterSessions(rows: LiveSessionRow[], filter: LiveFilter, search = ''): LiveSessionRow[] {
  const q = search.trim()
  return rows.filter((r) => filter === 'all' || r.kind === filter).filter((r) => !q || r.full_name.includes(q) || (r.area_names ?? '').includes(q) || (r.manager_name ?? '').includes(q))
}

export interface SessionsSummary { sessions: number; people: number; managers: number; contractors: number; firstInZone: number; firstOutZone: number; outOfZonePoints: number; active: number }
export function summarizeSessions(rows: LiveSessionRow[]): SessionsSummary {
  return {
    sessions: rows.length, people: new Set(rows.map((r) => r.user_id)).size,
    managers: rows.filter((r) => r.kind === 'manager').length, contractors: rows.filter((r) => r.kind === 'contractor').length,
    firstInZone: rows.filter((r) => r.first_in_zone === true).length, firstOutZone: rows.filter((r) => r.first_in_zone === false).length,
    outOfZonePoints: rows.reduce((s, r) => s + r.out_of_zone_count, 0), active: rows.filter((r) => !r.ended_at).length,
  }
}

export const LIVE_DATA_COLUMNS = ['اليوم', 'اسم الحساب', 'النوع', 'القسم / المنطقة', 'مسؤول القسم', 'الشفت', 'أول موقع مشارَك', 'وقت أول مشاركة', 'داخل/خارج الزون المُسنَد (أول موقع)', 'آخر موقع', 'وقت آخر تحديث', 'الحالة عند آخر تحديث', 'عدد النقاط', 'نقاط خارج الزون', 'المدة', 'انتهاء البث'] as const
const coord = (lat: number | null, lng: number | null) => lat == null || lng == null ? '—' : `${lat.toFixed(6)}, ${lng.toFixed(6)}`
export const sessionValues = (r: LiveSessionRow): (string | number)[] => [
  dayOf(r.started_at), r.full_name, LIVE_KIND_LABEL[r.kind as LiveKind] ?? r.kind, r.area_names || '—', r.manager_name ?? (r.kind === 'manager' ? '—' : '—'),
  `${r.shift_name ?? ''} ${timeHM(r.shift_start)}–${timeHM(r.shift_end)}`.trim(), coord(r.first_lat, r.first_lng), timeHM(r.started_at), inZoneText(r.first_in_zone),
  coord(r.last_lat, r.last_lng), timeHM(r.last_seen_at), inZoneText(r.last_in_zone), r.point_count, r.out_of_zone_count, durationText(r.duration_minutes), endText(r),
]

export interface LiveExportMeta { from: string; to: string; filter: LiveFilter; search?: string }
const FILTER_AR: Record<LiveFilter, string> = { all: 'الكل', manager: 'مسؤولو الأقسام', contractor: 'المتعهدون' }
const thin = () => ({ top: { style: 'thin' as const }, left: { style: 'thin' as const }, bottom: { style: 'thin' as const }, right: { style: 'thin' as const } })

/** مصنّف Excel: ورقة البيانات (بفلتر تلقائي) + ورقة «ملخص» حسب الشخص + ورقة «الفلاتر» الموثِّقة لما صُدِّر. */
export async function buildLiveDataWorkbook(rows: LiveSessionRow[], meta: LiveExportMeta): Promise<Workbook> {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook(); wb.creator = 'شركة جزيرة الأكارم — غرفة العمليات'; wb.created = new Date()
  const ws = wb.addWorksheet('بيانات البث المباشر', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 3 }] })
  ws.mergeCells(1, 1, 1, LIVE_DATA_COLUMNS.length)
  const title = ws.getCell(1, 1); title.value = `شركة جزيرة الأكارم — بيانات وحدة البث المباشر · من ${meta.from} إلى ${meta.to} · ${FILTER_AR[meta.filter]}${meta.search ? ` · بحث: ${meta.search}` : ''}`
  title.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }; title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B3D6B' } }; title.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 26
  ws.addRow([`صُدِّر في ${new Date().toLocaleString('en-GB', { timeZone: 'Asia/Baghdad' })} · عدد الصفوف: ${rows.length}`]).font = { italic: true, size: 9, color: { argb: 'FF64748B' } }
  const head = ws.addRow([...LIVE_DATA_COLUMNS])
  head.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E7490' } }; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = thin() })
  head.height = 32
  rows.forEach((r, i) => {
    const row = ws.addRow(sessionValues(r))
    row.eachCell((c, col) => {
      c.border = thin(); c.alignment = { horizontal: 'center' }
      if (i % 2) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
      if (col === 9 || col === 12) { const out = String(c.value).startsWith('خارج'); c.font = { bold: true, color: { argb: out ? 'FFB91C1C' : 'FF047857' } } }
    })
  })
  ;[12, 22, 12, 22, 18, 20, 22, 12, 22, 22, 12, 18, 10, 12, 10, 14].forEach((w, i) => { ws.getColumn(i + 1).width = w })
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: Math.max(3, 3 + rows.length), column: LIVE_DATA_COLUMNS.length } }

  const sum = wb.addWorksheet('ملخص حسب الشخص', { views: [{ rightToLeft: true }] })
  const sh = sum.addRow(['اسم الحساب', 'النوع', 'القسم / المنطقة', 'عدد الجلسات', 'أول موقع داخل الزون', 'أول موقع خارج الزون', 'مجموع النقاط', 'نقاط خارج الزون', 'مجموع المدة (دقائق)'])
  sh.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B3D6B' } }; c.alignment = { horizontal: 'center' }; c.border = thin() })
  const g = new Map<string, { r: LiveSessionRow; n: number; inz: number; outz: number; pts: number; outPts: number; min: number }>()
  rows.forEach((r) => { const o = g.get(r.user_id) ?? { r, n: 0, inz: 0, outz: 0, pts: 0, outPts: 0, min: 0 }; o.n++; o.inz += r.first_in_zone === true ? 1 : 0; o.outz += r.first_in_zone === false ? 1 : 0; o.pts += r.point_count; o.outPts += r.out_of_zone_count; o.min += r.duration_minutes; g.set(r.user_id, o) })
  ;[...g.values()].sort((a, b) => a.r.kind.localeCompare(b.r.kind) || a.r.full_name.localeCompare(b.r.full_name, 'ar')).forEach((o) => { sum.addRow([o.r.full_name, LIVE_KIND_LABEL[o.r.kind as LiveKind] ?? o.r.kind, o.r.area_names || '—', o.n, o.inz, o.outz, o.pts, o.outPts, o.min]).eachCell((c) => { c.border = thin(); c.alignment = { horizontal: 'center' } }) })
  const s = summarizeSessions(rows)
  sum.addRow(['الإجمالي', '', '', s.sessions, s.firstInZone, s.firstOutZone, rows.reduce((a, r) => a + r.point_count, 0), s.outOfZonePoints, rows.reduce((a, r) => a + r.duration_minutes, 0)]).font = { bold: true }
  ;[22, 12, 22, 12, 18, 18, 14, 16, 18].forEach((w, i) => { sum.getColumn(i + 1).width = w })

  const f = wb.addWorksheet('الفلاتر', { views: [{ rightToLeft: true }] })
  f.addRow(['من', meta.from]); f.addRow(['إلى', meta.to]); f.addRow(['النوع', FILTER_AR[meta.filter]]); f.addRow(['بحث', meta.search || '—']); f.addRow(['عدد الصفوف', rows.length])
  f.getColumn(1).width = 14; f.getColumn(2).width = 30; f.getColumn(1).font = { bold: true }
  return wb
}
