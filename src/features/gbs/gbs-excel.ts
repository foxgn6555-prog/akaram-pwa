/**
 * حاويات GBS ⇄ Excel (00183) — غرفة العمليات فقط
 * التصدير = قالب الاستيراد. الاستيراد يقبل أي Excel: يكتشف صف الرؤوس، يفهم المرادفات، ويقبل الإحداثيات في عمودين أو عمود واحد «33.31, 44.42».
 */
import type { Workbook } from 'exceljs'

export interface GbsExportRow { code: string; label: string; latitude: number; longitude: number; status: string; sector_id: number; area_name: string; parent_sector: string; notes: string | null; has_photo: boolean; updated_at: string }
export interface GbsImportRow { code?: string; label: string; latitude?: string; longitude?: string; coords?: string; status?: string; area?: string; notes?: string }
export interface GbsImportResultRow { row: number; code: string | null; label: string | null; area: string | null; status: string | null; latitude: number | null; longitude: number | null; action: 'inserted' | 'updated' | 'skipped'; ok: boolean; id: string | null; errors: string[]; warnings: string[] }
export interface GbsImportResult { dry_run: boolean; total: number; inserted: number; updated: number; skipped: number; failed: number; rows: GbsImportResultRow[] }

export const GBS_COLUMNS: Array<{ key: keyof GbsImportRow; header: string; required?: boolean; hint: string; width: number }> = [
  { key: 'code', header: 'الرمز', hint: 'GBS-0001 — اتركه فارغاً للحاوية الجديدة', width: 12 },
  { key: 'label', header: 'الموقع / الوصف', required: true, hint: 'مثال: أمام مدرسة الرافدين', width: 30 },
  { key: 'latitude', header: 'خط العرض', required: true, hint: '33.3152', width: 12 },
  { key: 'longitude', header: 'خط الطول', required: true, hint: '44.3661', width: 12 },
  { key: 'status', header: 'الحالة', hint: 'سليمة / متضررة / يجب استبدالها / مفقودة', width: 14 },
  { key: 'area', header: 'المنطقة', required: true, hint: 'رقم المنطقة أو اسمها', width: 16 },
  { key: 'notes', header: 'ملاحظات', hint: '', width: 28 },
]
const STATUS_AR: Record<string, string> = { ok: 'سليمة', damaged: 'متضررة', replace: 'يجب استبدالها', missing: 'مفقودة' }
const PARENT_AR: Record<string, string> = { karrada: 'الكرادة', zaafaraniya: 'الزعفرانية' }
export const GBS_IMPORT_MESSAGES: Record<string, string> = {
  GBS_LABEL_INVALID: 'الوصف/الموقع مفقود أو أقصر من حرفين', GBS_POINT_INVALID: 'الإحداثيات مفقودة أو غير صالحة', GBS_STATUS_INVALID: 'الحالة غير معروفة (سليمة/متضررة/يجب استبدالها/مفقودة)',
  GBS_IMPORT_AREA_UNKNOWN: 'المنطقة غير معروفة (رقمها أو اسمها)', GBS_IMPORT_DUP_IN_FILE: 'الرمز مكرر في الملف', GBS_IMPORT_CODE_DUPLICATE: 'الرمز مستخدم', GBS_IMPORT_EMPTY: 'الملف بلا صفوف', GBS_IMPORT_TOO_LARGE: 'أكثر من 5000 صف',
  GBS_IMPORT_POINT_OUTSIDE_IRAQ: 'الإحداثيات خارج العراق — تحقق منها', GBS_IMPORT_LABEL_TRUNCATED: 'الوصف اختُصر إلى 120 حرفاً', GBS_IMPORT_NOTES_TRUNCATED: 'الملاحظات اختُصرت إلى 500 حرف', GBS_IMPORT_EXISTS_SKIPPED: 'موجودة مسبقاً — تُجوهلت (التحديث معطّل)',
}
export const gbsImportMessage = (c: string) => GBS_IMPORT_MESSAGES[c] ?? c
const thin = () => { const s = { style: 'thin' as const, color: { argb: 'FFCBD5E1' } }; return { top: s, bottom: s, left: s, right: s } }

export const gbsExportValues = (r: GbsExportRow): (string | number)[] => [r.code, r.label, r.latitude, r.longitude, STATUS_AR[r.status] ?? r.status, `${r.sector_id} - ${r.area_name}`, r.notes ?? '']

export async function buildGbsWorkbook(rows: GbsExportRow[], opts: { template?: boolean } = {}): Promise<Workbook> {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook(); wb.creator = 'شركة جزيرة الأكارم — غرفة العمليات'; wb.created = new Date()
  const ws = wb.addWorksheet('الحاويات', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 2 }] })
  const head = ws.addRow(GBS_COLUMNS.map((c) => c.header + (c.required ? ' *' : '')))
  head.eachCell((c, i) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GBS_COLUMNS[i - 1]?.required ? 'FFB91C1C' : 'FF0E7490' } }; c.alignment = { horizontal: 'center', vertical: 'middle' }; c.border = thin() })
  const hints = ws.addRow(GBS_COLUMNS.map((c) => c.hint)); hints.eachCell((c) => { c.font = { italic: true, size: 9, color: { argb: 'FF64748B' } } })
  GBS_COLUMNS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width })
  if (opts.template && rows.length === 0) { const ex = ws.addRow(['', 'أمام مدرسة الرافدين', 33.3152, 44.3661, 'سليمة', '4', '']); ex.eachCell((c) => { c.font = { color: { argb: 'FF94A3B8' } } }) }
  rows.forEach((r, i) => { const row = ws.addRow(gbsExportValues(r)); row.eachCell((c) => { c.border = thin(); c.alignment = { horizontal: 'center' }; if (i % 2) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } } }) })
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(2, 2 + rows.length), column: GBS_COLUMNS.length } }
  if (rows.length) {
    const sum = wb.addWorksheet('ملخص', { views: [{ rightToLeft: true }] })
    sum.addRow(['القاطع', 'المنطقة', 'سليمة', 'متضررة', 'يجب استبدالها', 'مفقودة', 'الإجمالي']).font = { bold: true }
    const g = new Map<string, Record<string, number>>()
    rows.forEach((r) => { const k = `${PARENT_AR[r.parent_sector] ?? r.parent_sector}|${r.area_name}`; const o = g.get(k) ?? { ok: 0, damaged: 0, replace: 0, missing: 0 }; o[r.status] = (o[r.status] ?? 0) + 1; g.set(k, o) })
    ;[...g.entries()].forEach(([k, o]) => { const [p, a] = k.split('|'); sum.addRow([p, a, o.ok, o.damaged, o.replace, o.missing, o.ok! + o.damaged! + o.replace! + o.missing!]) })
    sum.addRow(['الإجمالي', '', ...(['ok', 'damaged', 'replace', 'missing'] as const).map((s) => rows.filter((r) => r.status === s).length), rows.length]).font = { bold: true }
    ;[16, 22, 10, 10, 14, 10, 10].forEach((w, i) => { sum.getColumn(i + 1).width = w })
  }
  return wb
}
export async function downloadWorkbook(wb: Workbook, fileName: string) {
  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a'); a.href = url; a.download = fileName; a.click(); URL.revokeObjectURL(url)
}

const norm = (s: string) => s.replace(/\s*\*$/, '').replace(/[\u0610-\u061A\u064B-\u065F]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim().toLowerCase()
const SYN_RAW: Record<string, keyof GbsImportRow> = {
  'الرمز': 'code', 'رمز الحاويه': 'code', 'الكود': 'code', 'code': 'code', 'id': 'code', 'رقم الحاويه': 'code',
  'الموقع': 'label', 'الوصف': 'label', 'الموقع / الوصف': 'label', 'موقع الحاويه': 'label', 'الاسم': 'label', 'العنوان': 'label', 'label': 'label', 'name': 'label', 'location': 'label',
  'خط العرض': 'latitude', 'العرض': 'latitude', 'lat': 'latitude', 'latitude': 'latitude', 'y': 'latitude',
  'خط الطول': 'longitude', 'الطول': 'longitude', 'lng': 'longitude', 'lon': 'longitude', 'longitude': 'longitude', 'x': 'longitude',
  'الاحداثيات': 'coords', 'الإحداثيات': 'coords', 'الموقع الجغرافي': 'coords', 'gps': 'coords', 'coords': 'coords', 'coordinates': 'coords', 'latlng': 'coords',
  'الحاله': 'status', 'حاله الحاويه': 'status', 'status': 'status',
  'المنطقه': 'area', 'رقم المنطقه': 'area', 'القاطع': 'area', 'القاطع والمنطقه': 'area', 'area': 'area', 'sector': 'area',
  'ملاحظات': 'notes', 'الملاحظات': 'notes', 'notes': 'notes',
}
const SYN = Object.fromEntries(Object.entries(SYN_RAW).map(([k, v]) => [norm(k), v])) as Record<string, keyof GbsImportRow>
const IGNORED = new Set(['ت', '#', 'صوره', 'اخر تحديث', 'عدد الطلبات'].map(norm))
const cellText = (v: unknown): string => {
  if (v == null) return ''
  if (typeof v === 'object') { const o = v as { text?: string; result?: unknown; richText?: Array<{ text: string }> }; if (o.richText) return o.richText.map((t) => t.text).join(''); if (o.text != null) return String(o.text); if (o.result != null) return cellText(o.result) }
  return String(v).trim()
}
export const matchGbsHeader = (h: string): keyof GbsImportRow | null => { const n = norm(h); if (!n) return null; return GBS_COLUMNS.find((c) => norm(c.header) === n || c.key === n)?.key ?? SYN[n] ?? null }
const areaValue = (v: string) => { const m = v.match(/^\s*(\d+)\s*[-–]/); return m ? m[1]! : v }
/** يقبل «33.31, 44.42» أو «33.31 44.42» أو رابط خرائط Google فيه @lat,lng أو q=lat,lng */
export function parseCoords(v: string): { lat: string; lng: string } | null {
  const t = v.trim().replace(/[،؛;]/g, ',')
  const link = t.match(/[@=](-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/); if (link) return { lat: link[1]!, lng: link[2]! }
  const m = t.match(/^(-?\d{1,3}(?:\.\d+)?)[\s,]+(-?\d{1,3}(?:\.\d+)?)$/); if (m) return { lat: m[1]!, lng: m[2]! }
  return null
}
export interface ParsedGbsImport { rows: GbsImportRow[]; mapped: Array<{ header: string; key: keyof GbsImportRow }>; unknownHeaders: string[]; headerRow: number; skippedEmpty: number; missingRequired: string[]; localErrors: Array<{ row: number; errors: string[] }> }
export async function parseGbsFile(file: Blob | ArrayBuffer | Uint8Array): Promise<ParsedGbsImport> {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook(); const buf = file instanceof Blob ? await file.arrayBuffer() : file
  await wb.xlsx.load(buf as ArrayBuffer)
  const ws = wb.worksheets.find((w) => w.rowCount > 0) ?? wb.worksheets[0]
  const base: ParsedGbsImport = { rows: [], mapped: [], unknownHeaders: [], headerRow: 0, skippedEmpty: 0, missingRequired: ['الموقع / الوصف'], localErrors: [] }
  if (!ws) return base
  let best = { row: 0, score: 0, map: [] as Array<keyof GbsImportRow | null>, headers: [] as string[] }
  for (let rn = 1; rn <= Math.min(15, ws.rowCount); rn++) {
    const row = ws.getRow(rn); const map: Array<keyof GbsImportRow | null> = []; const headers: string[] = []; let score = 0
    row.eachCell({ includeEmpty: true }, (c, col) => { const h = cellText(c.value); headers[col] = h; const k = matchGbsHeader(h); map[col] = k; if (k) score++ })
    if (score > best.score && map.includes('label')) best = { row: rn, score, map, headers }
  }
  if (!best.row) return base
  const { map, headers } = best
  const seen = new Set<string>(); const mapped: ParsedGbsImport['mapped'] = []; const unknown = new Set<string>()
  headers.forEach((h, col) => { const k = map[col]; if (k) { if (seen.has(k)) map[col] = null; else { seen.add(k); mapped.push({ header: h, key: k }) } } else if (h && !IGNORED.has(norm(h))) unknown.add(h) })
  const rows: GbsImportRow[] = []; const localErrors: ParsedGbsImport['localErrors'] = []; let skipped = 0
  ws.eachRow((row, rn) => {
    if (rn <= best.row) return
    const rec: Record<string, string> = {}
    row.eachCell({ includeEmpty: false }, (c, col) => { const k = map[col]; if (k) { const t = cellText(c.value); if (t) rec[k] = t } })
    if (Object.keys(rec).length === 0) return
    if (rn === best.row + 1 && Object.entries(rec).every(([k, v]) => GBS_COLUMNS.find((c) => c.key === k)?.hint === v)) return
    if (!rec.label) { skipped++; return }
    if (rec.area) rec.area = areaValue(rec.area)
    if (rec.coords && !rec.latitude) { const p = parseCoords(rec.coords); if (p) { rec.latitude = p.lat; rec.longitude = p.lng } }
    delete rec.coords
    const errs: string[] = []
    if (!rec.latitude || !rec.longitude || Number.isNaN(Number(rec.latitude)) || Number.isNaN(Number(rec.longitude))) errs.push('GBS_POINT_INVALID')
    if (!rec.area) errs.push('GBS_IMPORT_AREA_UNKNOWN')
    if (errs.length) localErrors.push({ row: rows.length + 1, errors: errs })
    rows.push(rec as unknown as GbsImportRow)
  })
  const missing: string[] = []; if (!seen.has('latitude') && !seen.has('coords')) missing.push('الإحداثيات'); if (!seen.has('area')) missing.push('المنطقة')
  return { rows, mapped, unknownHeaders: [...unknown], headerRow: best.row, skippedEmpty: skipped, missingRequired: missing, localErrors }
}
