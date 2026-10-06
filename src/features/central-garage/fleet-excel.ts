/**
 * قاعدة بيانات الآليات ⇄ Excel (00182) — غرفة العمليات فقط
 * ─────────────────────────────────────────────────────────
 * • التصدير: كل الآليات بأعمدة عربية؛ الملف نفسه هو قالب الاستيراد (استرداد كامل بعد أي عطل).
 * • الاستيراد: يقبل أي ملف Excel — يكتشف صف الرؤوس تلقائياً، يقبل مرادفات الرؤوس، رقم DB وحده إلزامي (والمنطقة)،
 *   ويطبّع القيم العربية. التحقق النهائي وربط السائقين في قاعدة البيانات (fleet_vehicles_import).
 */
import type { Workbook } from 'exceljs'

export interface FleetExportRow {
  db_number: string; vehicle_name: string; vehicle_category: string; plate_number: string; chassis_number: string; sector_id: number; area_name: string; parent_sector: string; shift: string
  driver_name: string; driver_employee_number: string | null; ownership_type: string; lessor_name: string | null; rental_contract_no: string | null; rental_start_date: string | null; rental_end_date: string | null
  model_year: number | null; vehicle_color: string | null; specifications: string | null; has_photo: boolean; created_at: string
}
export interface FleetImportRow {
  db_number: string; vehicle_name?: string; vehicle_category?: string; plate_number?: string; chassis_number?: string; area?: string; shift?: string
  driver?: string; driver_employee_number?: string; ownership_type?: string; lessor_name?: string; rental_contract_no?: string; rental_start_date?: string; rental_end_date?: string
  model_year?: string; vehicle_color?: string; specifications?: string
}
export interface FleetImportResultRow { row: number; db_number: string | null; vehicle_name: string | null; area: string | null; driver: string | null; driver_linked: boolean; action: 'inserted' | 'updated' | 'skipped'; ok: boolean; id: string | null; errors: string[]; warnings: string[] }
export interface FleetImportResult { dry_run: boolean; total: number; inserted: number; updated: number; skipped: number; failed: number; rows: FleetImportResultRow[] }

export const FLEET_COLUMNS: Array<{ key: keyof FleetImportRow; header: string; required?: boolean; hint: string; width: number }> = [
  { key: 'db_number', header: 'رقم DB', required: true, hint: 'المعرّف الفريد للآلية', width: 12 },
  { key: 'vehicle_name', header: 'اسم الآلية', hint: 'مثال: كابسة 12 م³', width: 22 },
  { key: 'vehicle_category', header: 'التصنيف', hint: 'كابسة صغيرة / كابسة كبيرة / كميون / شفل / قلاب / تنكر / كناسة / استرات / أخرى', width: 14 },
  { key: 'plate_number', header: 'رقم اللوحة', hint: 'يُولَّد مؤقتاً إن فُقد', width: 14 },
  { key: 'chassis_number', header: 'رقم الشاصي', hint: 'يُولَّد مؤقتاً إن فُقد', width: 18 },
  { key: 'area', header: 'المنطقة', required: true, hint: 'رقم المنطقة أو اسمها', width: 16 },
  { key: 'shift', header: 'الشفت', hint: 'صباحي / مسائي / ليلي', width: 10 },
  { key: 'driver', header: 'السائق', hint: 'الاسم الكامل أو الرقم الوظيفي أو رقم البصمة', width: 22 },
  { key: 'driver_employee_number', header: 'الرقم الوظيفي للسائق', hint: 'يُفضَّل للربط الدقيق', width: 14 },
  { key: 'ownership_type', header: 'الملكية', hint: 'آلية ذاتية / آلية مؤجرة', width: 12 },
  { key: 'lessor_name', header: 'المؤجّر', hint: 'إلزامي للمؤجرة', width: 18 },
  { key: 'rental_contract_no', header: 'رقم عقد الإيجار', hint: '', width: 14 },
  { key: 'rental_start_date', header: 'بداية الإيجار', hint: 'YYYY-MM-DD', width: 12 },
  { key: 'rental_end_date', header: 'نهاية الإيجار', hint: 'YYYY-MM-DD', width: 12 },
  { key: 'model_year', header: 'الموديل', hint: 'سنة الصنع', width: 9 },
  { key: 'vehicle_color', header: 'اللون', hint: '', width: 10 },
  { key: 'specifications', header: 'المواصفات', hint: '', width: 28 },
]
const CATEGORY_AR: Record<string, string> = { compactor_small: 'كابسة صغيرة', compactor_large: 'كابسة كبيرة', truck: 'كميون', shovel: 'شفل', tipper: 'قلاب', tanker: 'تنكر', sweeper: 'كناسة', strat: 'استرات', other: 'أخرى' }
const SHIFT_AR: Record<string, string> = { morning: 'صباحي', evening: 'مسائي', night: 'ليلي' }
const OWN_AR: Record<string, string> = { owned: 'آلية ذاتية', rented: 'آلية مؤجرة' }
const PARENT_AR: Record<string, string> = { karrada: 'الكرادة', zaafaraniya: 'الزعفرانية' }

export const FLEET_IMPORT_MESSAGES: Record<string, string> = {
  FLEET_IMPORT_DB_REQUIRED: 'رقم DB مفقود', FLEET_IMPORT_DUP_IN_FILE: 'رقم DB مكرر في الملف', FLEET_IMPORT_AREA_UNKNOWN: 'المنطقة غير معروفة (اكتب رقم المنطقة أو اسمها)',
  FLEET_IMPORT_SHIFT_INVALID: 'الشفت غير صالح (صباحي/مسائي/ليلي)', FLEET_IMPORT_OWNERSHIP_INVALID: 'الملكية غير صالحة (ذاتية/مؤجرة)', GARAGE_LESSOR_REQUIRED: 'اسم المؤجّر إلزامي للآلية المؤجرة',
  FLEET_IMPORT_DATE_INVALID: 'تاريخ إيجار غير صالح', FLEET_IMPORT_YEAR_INVALID: 'سنة الموديل غير صالحة', FLEET_IMPORT_DB_ARCHIVED: 'رقم DB يعود لآلية مؤرشفة — استرجعها من الأرشيف أولاً',
  GARAGE_VEHICLE_IDENTIFIER_DUPLICATE: 'اللوحة أو الشاصي مستخدم لآلية أخرى', FLEET_IMPORT_EMPTY: 'الملف بلا صفوف', FLEET_IMPORT_TOO_LARGE: 'الملف أكبر من 3000 صف',
  FLEET_IMPORT_CATEGORY_UNKNOWN: 'تصنيف غير معروف → «أخرى»', FLEET_IMPORT_NAME_GENERATED: 'اسم الآلية وُلّد من التصنيف ورقم DB', FLEET_IMPORT_PLATE_PLACEHOLDER: 'بلا لوحة — وُضعت قيمة مؤقتة',
  FLEET_IMPORT_CHASSIS_PLACEHOLDER: 'بلا شاصي — وُضعت قيمة مؤقتة', FLEET_IMPORT_DRIVER_MISSING: 'بلا سائق', FLEET_IMPORT_DRIVER_NOT_LINKED: 'السائق غير موجود في الموارد البشرية — حُفظ الاسم نصاً',
  FLEET_IMPORT_PHOTO_MISSING: 'بلا صورة — أضفها لاحقاً من صفحة الآلية', FLEET_IMPORT_EXISTS_SKIPPED: 'موجود مسبقاً — تُجوهل (التحديث معطّل)', FLEET_IMPORT_VEHICLE_IN_FIELD: 'الآلية في الميدان — لم يُغيَّر السائق',
}
export const fleetImportMessage = (code: string) => FLEET_IMPORT_MESSAGES[code] ?? code

const HEAD_FILL = 'FF083344'
const thin = () => { const s = { style: 'thin' as const, color: { argb: 'FFCBD5E1' } }; return { top: s, bottom: s, left: s, right: s } }

/** صفوف التصدير → قيم الأعمدة (بنفس ترتيب FLEET_COLUMNS) */
export function fleetExportValues(r: FleetExportRow): string[] {
  return [r.db_number, r.vehicle_name, CATEGORY_AR[r.vehicle_category] ?? r.vehicle_category, r.plate_number, r.chassis_number, `${r.sector_id} - ${r.area_name}`, SHIFT_AR[r.shift] ?? r.shift,
    r.driver_name, r.driver_employee_number ?? '', OWN_AR[r.ownership_type] ?? r.ownership_type, r.lessor_name ?? '', r.rental_contract_no ?? '', r.rental_start_date ?? '', r.rental_end_date ?? '',
    r.model_year == null ? '' : String(r.model_year), r.vehicle_color ?? '', r.specifications ?? '']
}

export async function buildFleetWorkbook(rows: FleetExportRow[], opts: { template?: boolean } = {}): Promise<Workbook> {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook(); wb.creator = 'شركة جزيرة الأكارم — غرفة العمليات'; wb.created = new Date()
  const ws = wb.addWorksheet('الآليات', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 2 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } })
  const head = ws.addRow(FLEET_COLUMNS.map((c) => c.header + (c.required ? ' *' : '')))
  head.height = 24
  head.eachCell((c, i) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FLEET_COLUMNS[i - 1]?.required ? 'FFB91C1C' : HEAD_FILL } }; c.alignment = { horizontal: 'center', vertical: 'middle' }; c.border = thin() })
  const hints = ws.addRow(FLEET_COLUMNS.map((c) => c.hint)); hints.eachCell((c) => { c.font = { italic: true, size: 9, color: { argb: 'FF64748B' } }; c.alignment = { wrapText: true, vertical: 'top' } }); hints.height = 30
  FLEET_COLUMNS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width })
  if (opts.template && rows.length === 0) {
    const ex = ws.addRow(['DB-101', 'كابسة 12 م³', 'كابسة كبيرة', '12345 بغداد', 'CH1234567', '4', 'صباحي', 'علي حسين كاظم', 'E-1001', 'آلية ذاتية', '', '', '', '', '2019', 'أبيض', ''])
    ex.eachCell((c) => { c.font = { color: { argb: 'FF94A3B8' } } })
  }
  rows.forEach((r, i) => {
    const row = ws.addRow(fleetExportValues(r))
    row.eachCell((c) => { c.border = thin(); c.alignment = { vertical: 'middle', horizontal: 'center' }; if (i % 2) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } } })
  })
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(2, 2 + rows.length), column: FLEET_COLUMNS.length } }
  if (rows.length) {
    const sum = wb.addWorksheet('ملخص', { views: [{ rightToLeft: true }] })
    sum.addRow(['القاطع', 'المنطقة', 'عدد الآليات']).font = { bold: true }
    const groups = new Map<string, number>()
    rows.forEach((r) => { const k = `${PARENT_AR[r.parent_sector] ?? r.parent_sector}|${r.area_name}`; groups.set(k, (groups.get(k) ?? 0) + 1) })
    ;[...groups.entries()].forEach(([k, n]) => { const [p, a] = k.split('|'); sum.addRow([p, a, n]) })
    sum.addRow(['الإجمالي', '', rows.length]).font = { bold: true }
    ;[16, 22, 12].forEach((w, i) => { sum.getColumn(i + 1).width = w })
  }
  return wb
}

export async function downloadWorkbook(wb: Workbook, fileName: string) {
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = fileName; a.click(); URL.revokeObjectURL(url)
}

// ─── التحليل ───
const norm = (s: string) => s.replace(/\s*\*$/, '').replace(/[\u0610-\u061A\u064B-\u065F]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim().toLowerCase()
const SYNONYMS_RAW: Record<string, keyof FleetImportRow> = {
  'رقم db': 'db_number', 'db': 'db_number', 'db number': 'db_number', 'db_number': 'db_number', 'رقم الاليه': 'db_number', 'رقم الآلية': 'db_number', 'الرقم': 'db_number', 'رقم دي بي': 'db_number', 'دي بي': 'db_number', 'رقم الدائرة': 'db_number',
  'اسم الاليه': 'vehicle_name', 'الاليه': 'vehicle_name', 'الاسم': 'vehicle_name', 'name': 'vehicle_name', 'vehicle': 'vehicle_name', 'vehicle_name': 'vehicle_name',
  'التصنيف': 'vehicle_category', 'النوع': 'vehicle_category', 'نوع الاليه': 'vehicle_category', 'الصنف': 'vehicle_category', 'category': 'vehicle_category', 'type': 'vehicle_category',
  'رقم اللوحه': 'plate_number', 'اللوحه': 'plate_number', 'رقم السياره': 'plate_number', 'plate': 'plate_number', 'plate_number': 'plate_number',
  'رقم الشاصي': 'chassis_number', 'الشاصي': 'chassis_number', 'الشاسيه': 'chassis_number', 'رقم الشاسيه': 'chassis_number', 'chassis': 'chassis_number', 'vin': 'chassis_number',
  'المنطقه': 'area', 'رقم المنطقه': 'area', 'القاطع': 'area', 'القاطع والمنطقه': 'area', 'area': 'area', 'sector': 'area', 'sector_id': 'area',
  'الشفت': 'shift', 'الوجبه': 'shift', 'shift': 'shift',
  'السائق': 'driver', 'اسم السائق': 'driver', 'driver': 'driver', 'driver_name': 'driver',
  'الرقم الوظيفي للسائق': 'driver_employee_number', 'رقم السائق': 'driver_employee_number', 'الرقم الوظيفي': 'driver_employee_number', 'رقم بصمة السائق': 'driver_employee_number', 'driver_employee_number': 'driver_employee_number',
  'الملكيه': 'ownership_type', 'نوع الملكيه': 'ownership_type', 'ownership': 'ownership_type', 'ownership_type': 'ownership_type',
  'المؤجر': 'lessor_name', 'الموجر': 'lessor_name', 'اسم المؤجر': 'lessor_name', 'شركه الايجار': 'lessor_name', 'lessor': 'lessor_name',
  'رقم عقد الايجار': 'rental_contract_no', 'رقم العقد': 'rental_contract_no', 'العقد': 'rental_contract_no',
  'بدايه الايجار': 'rental_start_date', 'بداية العقد': 'rental_start_date', 'من': 'rental_start_date',
  'نهايه الايجار': 'rental_end_date', 'نهاية العقد': 'rental_end_date', 'الى': 'rental_end_date',
  'الموديل': 'model_year', 'سنه الصنع': 'model_year', 'سنة الموديل': 'model_year', 'model': 'model_year', 'year': 'model_year',
  'اللون': 'vehicle_color', 'لون الاليه': 'vehicle_color', 'color': 'vehicle_color',
  'المواصفات': 'specifications', 'ملاحظات': 'specifications', 'الملاحظات': 'specifications', 'notes': 'specifications',
}
const SYNONYMS = Object.fromEntries(Object.entries(SYNONYMS_RAW).map(([k, v]) => [norm(k), v])) as Record<string, keyof FleetImportRow>
const IGNORED = new Set(['ت', '#', 'الحاله', 'صوره', 'تاريخ الاضافه'].map(norm))
const cellText = (v: unknown): string => {
  if (v == null) return ''
  if (v instanceof Date) return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`
  if (typeof v === 'object') { const o = v as { text?: string; result?: unknown; richText?: Array<{ text: string }> }; if (o.richText) return o.richText.map((t) => t.text).join(''); if (o.text != null) return String(o.text); if (o.result != null) return cellText(o.result) }
  return String(v).trim()
}
export const matchFleetHeader = (h: string): keyof FleetImportRow | null => {
  const n = norm(h); if (!n) return null
  return FLEET_COLUMNS.find((c) => norm(c.header) === n || c.key === n)?.key ?? SYNONYMS[n] ?? null
}
export function normalizeDate(v: string): string | null {
  const t = v.trim(); if (!t) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  let m = t.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/); if (m) return `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`
  if (/^\d{5}$/.test(t)) return new Date(Date.UTC(1899, 11, 30) + Number(t) * 86400000).toISOString().slice(0, 10)
  return null
}
/** «4 - القاطع الرابع» (صيغة تصديرنا) → «4» */
const areaValue = (v: string) => { const m = v.match(/^\s*(\d+)\s*[-–]/); return m ? m[1]! : v }
export interface ParsedFleetImport { rows: FleetImportRow[]; mapped: Array<{ header: string; key: keyof FleetImportRow }>; unknownHeaders: string[]; headerRow: number; skippedEmpty: number; missingRequired: string[]; localErrors: Array<{ row: number; errors: string[] }> }

export async function parseFleetFile(file: Blob | ArrayBuffer | Uint8Array): Promise<ParsedFleetImport> {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  const buf = file instanceof Blob ? await file.arrayBuffer() : file
  await wb.xlsx.load(buf as ArrayBuffer)
  const ws = wb.worksheets.find((w) => w.rowCount > 0) ?? wb.worksheets[0]
  const base: ParsedFleetImport = { rows: [], mapped: [], unknownHeaders: [], headerRow: 0, skippedEmpty: 0, missingRequired: ['رقم DB'], localErrors: [] }
  if (!ws) return base
  let best = { row: 0, score: 0, map: [] as Array<keyof FleetImportRow | null>, headers: [] as string[] }
  for (let rn = 1; rn <= Math.min(15, ws.rowCount); rn++) {
    const row = ws.getRow(rn); const map: Array<keyof FleetImportRow | null> = []; const headers: string[] = []; let score = 0
    row.eachCell({ includeEmpty: true }, (c, col) => { const h = cellText(c.value); headers[col] = h; const k = matchFleetHeader(h); map[col] = k; if (k) score++ })
    if (score > best.score && map.includes('db_number')) best = { row: rn, score, map, headers }
  }
  if (!best.row) return base
  const { map, headers } = best
  const seen = new Set<string>(); const mapped: ParsedFleetImport['mapped'] = []; const unknown = new Set<string>()
  headers.forEach((h, col) => { const k = map[col]; if (k) { if (seen.has(k)) map[col] = null; else { seen.add(k); mapped.push({ header: h, key: k }) } } else if (h && !IGNORED.has(norm(h))) unknown.add(h) })
  const rows: FleetImportRow[] = []; const localErrors: ParsedFleetImport['localErrors'] = []; let skipped = 0
  ws.eachRow((row, rn) => {
    if (rn <= best.row) return
    const rec: Record<string, string> = {}
    row.eachCell({ includeEmpty: false }, (c, col) => { const k = map[col]; if (k) { const t = cellText(c.value); if (t) rec[k] = t } })
    if (Object.keys(rec).length === 0) return
    if (rn === best.row + 1 && Object.entries(rec).every(([k, v]) => FLEET_COLUMNS.find((c) => c.key === k)?.hint === v)) return
    if (!rec.db_number) { skipped++; return }
    if (rec.area) rec.area = areaValue(rec.area)
    const errs: string[] = []
    for (const k of ['rental_start_date', 'rental_end_date'] as const) if (rec[k]) { const d = normalizeDate(rec[k]!); if (d) rec[k] = d; else errs.push('FLEET_IMPORT_DATE_INVALID') }
    if (!rec.area) errs.push('FLEET_IMPORT_AREA_UNKNOWN')
    if (errs.length) localErrors.push({ row: rows.length + 1, errors: errs })
    rows.push(rec as unknown as FleetImportRow)
  })
  return { rows, mapped, unknownHeaders: [...unknown], headerRow: best.row, skippedEmpty: skipped, missingRequired: seen.has('area') ? [] : ['المنطقة'], localErrors }
}
