/**
 * Excel للموارد البشرية: تصدير احترافي موحّد (RTL، ترويسة، فلاتر مطبّقة، أعمدة مختارة) + قالب استيراد الموظفين وتحليله.
 * لا يحتوي أي عمود راتب — الرواتب في تصدير المالية فقط.
 */
import type { Borders, Workbook, Worksheet } from 'exceljs'
import type { AttendanceDayRow, HrEmployeeFull, HrEmployeeRow, HrLeave, ImportEmployeeRow, ImportRowResult, ShiftAssignment, HrShift } from '../types'
import { ATTENDANCE_STATUS_LABELS, CONTRACT_LABELS, TERMINATION_LABELS, WEEKDAYS_AR } from '../types'

export interface ExcelColumn<T> { key: string; header: string; width?: number; value: (row: T) => string | number | null | undefined; align?: 'right' | 'center' }
export interface ExportSpec<T> { title: string; sheetName: string; fileName: string; columns: ExcelColumn<T>[]; rows: T[]; filters?: Array<[string, string]>; footerNote?: string }

const HEAD_FILL = 'FF334155'
const thin = (): Partial<Borders> => { const s = { style: 'thin' as const, color: { argb: 'FFCBD5E1' } }; return { top: s, bottom: s, left: s, right: s } }

export async function buildWorkbook<T>(spec: ExportSpec<T>): Promise<Workbook> {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook(); wb.creator = 'شركة جزيرة الأكارم — الموارد البشرية'; wb.created = new Date()
  const ws = wb.addWorksheet(spec.sheetName.slice(0, 31), { views: [{ rightToLeft: true, state: 'frozen', ySplit: 4 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } })
  fillHeader(ws, spec)
  spec.rows.forEach((r, i) => {
    const row = ws.addRow([i + 1, ...spec.columns.map((c) => c.value(r) ?? '')])
    row.eachCell((cell, col) => { cell.border = thin(); cell.alignment = { vertical: 'middle', horizontal: col === 1 ? 'center' : (spec.columns[col - 2]?.align ?? 'right'), wrapText: true }; if (i % 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } } })
  })
  ws.getColumn(1).width = 5
  spec.columns.forEach((c, i) => { ws.getColumn(i + 2).width = c.width ?? 16 })
  if (spec.rows.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + spec.rows.length, column: spec.columns.length + 1 } }
  if (spec.footerNote) { const r = ws.addRow([]); ws.mergeCells(r.number, 1, r.number, spec.columns.length + 1); r.getCell(1).value = spec.footerNote; r.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF64748B' } } }
  return wb
}

function fillHeader<T>(ws: Worksheet, spec: ExportSpec<T>) {
  const n = spec.columns.length + 1
  ws.mergeCells(1, 1, 1, n)
  ws.getCell('A1').value = spec.title; ws.getCell('A1').font = { bold: true, size: 15, color: { argb: 'FFFFFFFF' } }
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }; ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }; ws.getRow(1).height = 28
  ws.mergeCells(2, 1, 2, n)
  const filters = (spec.filters ?? []).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ')
  ws.getCell('A2').value = `${filters || 'بلا فلاتر'} · ${spec.rows.length} سجلاً · أُنشئ ${new Date().toLocaleString('ar-IQ-u-nu-latn')}`
  ws.getCell('A2').font = { size: 10, color: { argb: 'FF475569' } }; ws.getCell('A2').alignment = { horizontal: 'center' }
  ws.getRow(3).height = 6
  const hr = ws.getRow(4); hr.values = ['ت', ...spec.columns.map((c) => c.header)]
  hr.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_FILL } }; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = thin() })
  hr.height = 30
}

export async function downloadWorkbook(wb: Workbook, fileName: string) {
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = fileName; a.click(); URL.revokeObjectURL(url)
}
export async function exportToExcel<T>(spec: ExportSpec<T>) { await downloadWorkbook(await buildWorkbook(spec), spec.fileName) }

// ─── أعمدة الموظفين (قابلة للاختيار) ───
const STATUS_AR: Record<string, string> = { active: 'نشط', on_leave: 'في إجازة', suspended: 'موقوف', terminated: 'منتهية خدمته' }
const GENDER_AR: Record<string, string> = { male: 'ذكر', female: 'أنثى' }
const MARITAL_AR: Record<string, string> = { single: 'أعزب/عزباء', married: 'متزوج/ة', divorced: 'مطلق/ة', widowed: 'أرمل/ة' }
type EmpAny = HrEmployeeRow & Partial<HrEmployeeFull>
export const EMPLOYEE_COLUMNS: ExcelColumn<EmpAny>[] = [
  { key: 'employee_number', header: 'الرقم الوظيفي', width: 13, value: (e) => e.employee_number, align: 'center' },
  { key: 'full_name', header: 'الاسم الرباعي', width: 28, value: (e) => e.full_name },
  { key: 'job_title', header: 'العنوان الوظيفي', width: 16, value: (e) => e.job_title },
  { key: 'department_name', header: 'القسم', width: 18, value: (e) => e.department_name },
  { key: 'branch_name', header: 'الفرع', width: 16, value: (e) => e.branch_name },
  { key: 'shift_name', header: 'الشفت', width: 12, value: (e) => e.shift_name, align: 'center' },
  { key: 'contract_type', header: 'نوع التعاقد', width: 11, value: (e) => CONTRACT_LABELS[e.contract_type], align: 'center' },
  { key: 'employment_status', header: 'الحالة', width: 12, value: (e) => STATUS_AR[e.employment_status] ?? e.employment_status, align: 'center' },
  { key: 'hire_date', header: 'تاريخ المباشرة', width: 13, value: (e) => e.hire_date, align: 'center' },
  { key: 'phone', header: 'الهاتف', width: 13, value: (e) => e.phone, align: 'center' },
  { key: 'biometric_pin', header: 'رقم البصمة', width: 10, value: (e) => e.biometric_pin, align: 'center' },
  { key: 'salary_status', header: 'حالة الراتب', width: 14, value: (e) => (e.salary_status === 'defined' ? 'مُعرَّف لدى المالية' : 'بانتظار المالية'), align: 'center' },
  { key: 'mother_name', header: 'اسم الأم', width: 16, value: (e) => e.mother_name },
  { key: 'gender', header: 'الجنس', width: 8, value: (e) => (e.gender ? GENDER_AR[e.gender] : ''), align: 'center' },
  { key: 'birth_date', header: 'تاريخ الولادة', width: 12, value: (e) => e.birth_date, align: 'center' },
  { key: 'birth_place', header: 'محل الولادة', width: 12, value: (e) => e.birth_place },
  { key: 'marital_status', header: 'الحالة الاجتماعية', width: 12, value: (e) => (e.marital_status ? MARITAL_AR[e.marital_status] : ''), align: 'center' },
  { key: 'education', header: 'التحصيل الدراسي', width: 14, value: (e) => e.education },
  { key: 'national_id_number', header: 'البطاقة الموحدة', width: 15, value: (e) => e.national_id_number, align: 'center' },
  { key: 'residence_card_number', header: 'بطاقة السكن', width: 13, value: (e) => e.residence_card_number, align: 'center' },
  { key: 'governorate', header: 'المحافظة', width: 11, value: (e) => e.governorate },
  { key: 'address', header: 'العنوان', width: 24, value: (e) => e.address },
  { key: 'phone2', header: 'هاتف 2', width: 13, value: (e) => e.phone2, align: 'center' },
  { key: 'email', header: 'البريد', width: 20, value: (e) => e.email },
  { key: 'emergency_contact_name', header: 'قريب الطوارئ', width: 16, value: (e) => e.emergency_contact_name },
  { key: 'emergency_contact_phone', header: 'هاتف الطوارئ', width: 13, value: (e) => e.emergency_contact_phone, align: 'center' },
  { key: 'blood_type', header: 'فصيلة الدم', width: 8, value: (e) => e.blood_type, align: 'center' },
  { key: 'terminated_at', header: 'آخر يوم عمل', width: 12, value: (e) => e.terminated_at, align: 'center' },
  { key: 'termination_type', header: 'نوع الإنهاء', width: 12, value: (e) => (e.termination_type ? TERMINATION_LABELS[e.termination_type] : ''), align: 'center' },
]
export const EMPLOYEE_DEFAULT_COLUMNS = ['employee_number', 'full_name', 'job_title', 'department_name', 'branch_name', 'shift_name', 'contract_type', 'employment_status', 'hire_date', 'phone', 'biometric_pin', 'salary_status']

export function employeesSpec(rows: EmpAny[], columnKeys: string[], filters: Array<[string, string]>): ExportSpec<EmpAny> {
  const columns = EMPLOYEE_COLUMNS.filter((c) => columnKeys.includes(c.key))
  return { title: 'كشف الموظفين — الموارد البشرية', sheetName: 'الموظفون', fileName: `الموظفون-${today()}.xlsx`, columns, rows, filters, footerNote: 'لا يتضمن هذا الكشف أي بيانات رواتب — الرواتب من بوابة الشؤون المالية حصراً.' }
}

// ─── الحضور ───
const fmtT = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('ar-IQ-u-nu-latn', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Baghdad' }) : '')
export function attendanceSpec(rows: AttendanceDayRow[], filters: Array<[string, string]>): ExportSpec<AttendanceDayRow> {
  return {
    title: 'سجل الحضور والانصراف', sheetName: 'الحضور', fileName: `الحضور-${filters.find(([k]) => k === 'من')?.[1] ?? today()}.xlsx`, rows, filters,
    columns: [
      { key: 'work_date', header: 'التاريخ', width: 12, value: (r) => r.work_date, align: 'center' },
      { key: 'weekday', header: 'اليوم', width: 9, value: (r) => WEEKDAYS_AR[new Date(r.work_date).getDay()], align: 'center' },
      { key: 'employee_number', header: 'الرقم الوظيفي', width: 12, value: (r) => r.employee_number, align: 'center' },
      { key: 'full_name', header: 'الاسم', width: 26, value: (r) => r.full_name },
      { key: 'department_name', header: 'القسم', width: 16, value: (r) => r.department_name },
      { key: 'branch_name', header: 'الفرع', width: 14, value: (r) => r.branch_name },
      { key: 'shift_name', header: 'الشفت', width: 11, value: (r) => r.shift_name, align: 'center' },
      { key: 'expected', header: 'المتوقع', width: 13, value: (r) => (r.expected_in ? `${fmtT(r.expected_in)}–${fmtT(r.expected_out)}` : ''), align: 'center' },
      { key: 'check_in', header: 'الدخول', width: 9, value: (r) => fmtT(r.check_in), align: 'center' },
      { key: 'check_out', header: 'الخروج', width: 9, value: (r) => fmtT(r.check_out), align: 'center' },
      { key: 'late_minutes', header: 'تأخير (د)', width: 9, value: (r) => r.late_minutes, align: 'center' },
      { key: 'early_minutes', header: 'خروج مبكر (د)', width: 11, value: (r) => r.early_minutes, align: 'center' },
      { key: 'worked_minutes', header: 'مدة العمل (د)', width: 11, value: (r) => r.worked_minutes, align: 'center' },
      { key: 'status', header: 'الحالة', width: 12, value: (r) => ATTENDANCE_STATUS_LABELS[r.status], align: 'center' },
      { key: 'source', header: 'المصدر', width: 10, value: (r) => (r.source === 'manual' ? 'مُعدَّل يدوياً' : 'بصمة'), align: 'center' },
      { key: 'edit_reason', header: 'سبب التعديل', width: 24, value: (r) => r.edit_reason },
    ],
  }
}

// ─── الإجازات ───
export function leavesSpec(rows: HrLeave[], filters: Array<[string, string]>): ExportSpec<HrLeave> {
  return {
    title: 'الإجازات والزمنيات المعتمدة', sheetName: 'الإجازات', fileName: `الإجازات-${today()}.xlsx`, rows, filters,
    columns: [
      { key: 'employee_number', header: 'الرقم الوظيفي', width: 12, value: (l) => l.employees?.employee_number, align: 'center' },
      { key: 'full_name', header: 'الاسم', width: 26, value: (l) => l.employees?.full_name },
      { key: 'kind', header: 'النوع', width: 10, value: (l) => (l.kind === 'leave' ? 'إجازة' : 'زمنية'), align: 'center' },
      { key: 'leave_type', header: 'التصنيف', width: 12, value: (l) => l.leave_type, align: 'center' },
      { key: 'start_date', header: 'من', width: 12, value: (l) => l.start_date, align: 'center' },
      { key: 'end_date', header: 'إلى', width: 12, value: (l) => l.end_date, align: 'center' },
      { key: 'days', header: 'الأيام', width: 7, value: (l) => (l.kind === 'leave' ? Math.round((new Date(l.end_date).getTime() - new Date(l.start_date).getTime()) / 86400000) + 1 : ''), align: 'center' },
      { key: 'time', header: 'الوقت', width: 13, value: (l) => (l.start_time ? `${l.start_time.slice(0, 5)}–${(l.end_time ?? '').slice(0, 5)}` : ''), align: 'center' },
      { key: 'status', header: 'الحالة', width: 9, value: () => 'معتمدة', align: 'center' },
      { key: 'notes', header: 'ملاحظات', width: 28, value: (l) => l.notes },
    ],
  }
}

// ─── ملف موظف واحد (ورقتان: البيانات + الشفتات) ───
export async function buildEmployeeProfileWorkbook(e: HrEmployeeFull, assignments: ShiftAssignment[], shifts: HrShift[], attendance: AttendanceDayRow[]) {
  const wb = await buildWorkbook<[string, string]>({
    title: `ملف الموظف — ${e.full_name} (${e.employee_number})`, sheetName: 'البيانات', fileName: '', rows: EMPLOYEE_COLUMNS.map((c) => [c.header, String(c.value(e) ?? '—')] as [string, string]),
    columns: [{ key: 'k', header: 'الحقل', width: 22, value: (r) => r[0] }, { key: 'v', header: 'القيمة', width: 40, value: (r) => r[1] }],
  })
  const byId = Object.fromEntries(shifts.map((s) => [s.id, s]))
  const ws2 = wb.addWorksheet('الشفتات', { views: [{ rightToLeft: true }] })
  ws2.addRow(['يسري من', 'الشفت', 'بداية', 'نهاية', 'سماحية', 'ملاحظة']).font = { bold: true }
  assignments.forEach((a) => ws2.addRow([a.effective_from, byId[a.shift_id]?.name ?? '', (a.start_override ?? byId[a.shift_id]?.start_time ?? '').slice(0, 5), (a.end_override ?? byId[a.shift_id]?.end_time ?? '').slice(0, 5), a.grace_override ?? byId[a.shift_id]?.grace_minutes ?? '', a.note ?? '']))
  const ws3 = wb.addWorksheet('الحضور', { views: [{ rightToLeft: true }] })
  ws3.addRow(['التاريخ', 'الشفت', 'دخول', 'خروج', 'تأخير', 'مبكر', 'الحالة']).font = { bold: true }
  attendance.forEach((r) => ws3.addRow([r.work_date, r.shift_name ?? '', fmtT(r.check_in), fmtT(r.check_out), r.late_minutes, r.early_minutes, ATTENDANCE_STATUS_LABELS[r.status]]))
  return wb
}

// ─── قالب الاستيراد وتحليله ───
export const IMPORT_COLUMNS: Array<{ key: keyof ImportEmployeeRow; header: string; required?: boolean; hint: string; width?: number }> = [
  { key: 'employee_number', header: 'الرقم الوظيفي', required: true, hint: 'فريد', width: 13 },
  { key: 'full_name', header: 'الاسم الرباعي', required: true, hint: 'الاسم الكامل', width: 28 },
  { key: 'department', header: 'القسم', hint: 'اسم القسم أو رمزه كما في الهيكل التنظيمي', width: 18 },
  { key: 'branch', header: 'الفرع', hint: 'اسم الفرع أو رمزه', width: 16 },
  { key: 'shift', header: 'الشفت', hint: 'اسم الشفت كما في قوالب الشفتات', width: 12 },
  { key: 'contract_type', header: 'نوع التعاقد', hint: 'شهري أو يومي', width: 11 },
  { key: 'hire_date', header: 'تاريخ المباشرة', hint: 'YYYY-MM-DD', width: 13 },
  { key: 'job_title', header: 'العنوان الوظيفي', hint: 'كما هو معرَّف في الهيكل التنظيمي (اسم المسمى أو رمزه)', width: 16 },
  { key: 'biometric_pin', header: 'رقم البصمة', hint: 'PIN جهاز البصمة (فريد)', width: 10 },
  { key: 'phone', header: 'الهاتف', hint: '', width: 13 },
  { key: 'phone2', header: 'هاتف 2', hint: '', width: 13 },
  { key: 'mother_name', header: 'اسم الأم', hint: '', width: 16 },
  { key: 'gender', header: 'الجنس', hint: 'ذكر أو أنثى', width: 8 },
  { key: 'birth_date', header: 'تاريخ الولادة', hint: 'YYYY-MM-DD', width: 12 },
  { key: 'birth_place', header: 'محل الولادة', hint: '', width: 12 },
  { key: 'marital_status', header: 'الحالة الاجتماعية', hint: 'أعزب / متزوج / مطلق / أرمل', width: 12 },
  { key: 'education', header: 'التحصيل الدراسي', hint: '', width: 14 },
  { key: 'national_id_number', header: 'البطاقة الموحدة', hint: 'فريد', width: 15 },
  { key: 'residence_card_number', header: 'بطاقة السكن', hint: '', width: 13 },
  { key: 'governorate', header: 'المحافظة', hint: '', width: 11 },
  { key: 'address', header: 'العنوان', hint: '', width: 24 },
  { key: 'emergency_contact_name', header: 'قريب الطوارئ', hint: '', width: 16 },
  { key: 'emergency_contact_phone', header: 'هاتف الطوارئ', hint: '', width: 13 },
  { key: 'blood_type', header: 'فصيلة الدم', hint: 'A+ O- ...', width: 8 },
  { key: 'email', header: 'البريد', hint: '', width: 20 },
]
const CONTRACT_IN_RAW: Record<string, 'monthly' | 'daily'> = { شهري: 'monthly', شهريه: 'monthly', راتب: 'monthly', 'راتب شهري': 'monthly', يومي: 'daily', يوميه: 'daily', 'اجر يومي': 'daily', 'أجر يومي': 'daily', اجور: 'daily', 'اجر': 'daily', monthly: 'monthly', daily: 'daily' }
const GENDER_IN_RAW: Record<string, 'male' | 'female'> = { ذكر: 'male', رجل: 'male', م: 'male', انثي: 'female', انثى: 'female', أنثى: 'female', امراه: 'female', ف: 'female', male: 'male', female: 'female', m: 'male', f: 'female' }
const MARITAL_IN_RAW: Record<string, string> = { اعزب: 'single', أعزب: 'single', عزباء: 'single', 'اعزب/عزباء': 'single', متزوج: 'married', متزوجه: 'married', متزوجة: 'married', 'متزوج/ه': 'married', مطلق: 'divorced', مطلقه: 'divorced', مطلقة: 'divorced', 'مطلق/ه': 'divorced', ارمل: 'widowed', أرمل: 'widowed', ارمله: 'widowed', أرملة: 'widowed', 'ارمل/ه': 'widowed', single: 'single', married: 'married', divorced: 'divorced', widowed: 'widowed' }

export async function buildImportTemplate(ctx: { departments: string[]; branches: string[]; shifts: string[] }) {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook(); wb.creator = 'شركة جزيرة الأكارم — الموارد البشرية'
  const ws = wb.addWorksheet('الموظفون', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 2 }] })
  const head = ws.addRow(IMPORT_COLUMNS.map((c) => c.header + (c.required ? ' *' : '')))
  head.eachCell((c, i) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: IMPORT_COLUMNS[i - 1]?.required ? 'FFB91C1C' : HEAD_FILL } }; c.alignment = { horizontal: 'center' }; c.border = thin() })
  const hints = ws.addRow(IMPORT_COLUMNS.map((c) => c.hint)); hints.eachCell((c) => { c.font = { italic: true, size: 9, color: { argb: 'FF64748B' } } })
  IMPORT_COLUMNS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width ?? 14 })
  const ex = ws.addRow(['E-1001', 'أحمد علي حسن محمد', ctx.departments[0] ?? '', ctx.branches[0] ?? '', ctx.shifts[0] ?? '', 'شهري', '2026-01-15', 'سائق', '1001', '07701234567', '', 'فاطمة', 'ذكر', '1990-05-01', 'بغداد', 'متزوج', 'إعدادية', '199012345678', '', 'بغداد', 'الكرادة', 'محمد', '07709876543', 'O+', ''])
  ex.eachCell((c) => { c.font = { color: { argb: 'FF94A3B8' } } })
  const ref = wb.addWorksheet('القيم المرجعية', { views: [{ rightToLeft: true }] })
  ref.addRow(['الأقسام', 'الفروع', 'الشفتات', 'نوع التعاقد', 'الجنس', 'الحالة الاجتماعية']).font = { bold: true }
  const max = Math.max(ctx.departments.length, ctx.branches.length, ctx.shifts.length, 4)
  for (let i = 0; i < max; i++) ref.addRow([ctx.departments[i] ?? '', ctx.branches[i] ?? '', ctx.shifts[i] ?? '', ['شهري', 'يومي'][i] ?? '', ['ذكر', 'أنثى'][i] ?? '', ['أعزب', 'متزوج', 'مطلق', 'أرمل'][i] ?? ''])
  ;[22, 18, 14, 12, 10, 16].forEach((w, i) => { ref.getColumn(i + 1).width = w })
  return wb
}

const norm = (s: string) => s.replace(/\s*\*$/, '').replace(/[\u0610-\u061A\u064B-\u065F]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim().toLowerCase()
/** مرادفات شائعة لرؤوس الأعمدة (بعد التطبيع) — تُقبل ملفات المستخدم وليس القالب فقط، وكذلك كشوف التصدير نفسها */
const HEADER_SYNONYMS_RAW: Record<string, keyof ImportEmployeeRow> = {
  'الرقم': 'employee_number', 'رقم الموظف': 'employee_number', 'الرقم الوظيفي': 'employee_number', 'رقم وظيفي': 'employee_number', 'الرقم الذاتي': 'employee_number', 'employee_number': 'employee_number', 'id': 'employee_number',
  'الاسم': 'full_name', 'اسم الموظف': 'full_name', 'الاسم الكامل': 'full_name', 'الاسم الرباعي': 'full_name', 'الاسم الثلاثي': 'full_name', 'name': 'full_name', 'full_name': 'full_name',
  'القسم': 'department', 'الشعبة': 'department', 'الدائرة': 'department', 'department': 'department',
  'الفرع': 'branch', 'الموقع': 'branch', 'branch': 'branch',
  'الشفت': 'shift', 'الوجبة': 'shift', 'وجبة العمل': 'shift', 'shift': 'shift',
  'نوع التعاقد': 'contract_type', 'التعاقد': 'contract_type', 'نوع العقد': 'contract_type', 'العقد': 'contract_type', 'صفة التعيين': 'contract_type',
  'تاريخ المباشرة': 'hire_date', 'المباشرة': 'hire_date', 'تاريخ التعيين': 'hire_date', 'تاريخ التعاقد': 'hire_date',
  'العنوان الوظيفي': 'job_title', 'المسمى الوظيفي': 'job_title', 'الوظيفة': 'job_title', 'المهنة': 'job_title',
  'رقم البصمة': 'biometric_pin', 'البصمة': 'biometric_pin', 'pin': 'biometric_pin',
  'الهاتف': 'phone', 'رقم الهاتف': 'phone', 'الموبايل': 'phone', 'الجوال': 'phone', 'الهاتف 1': 'phone', 'هاتف 1': 'phone',
  'هاتف 2': 'phone2', 'الهاتف 2': 'phone2', 'هاتف اخر': 'phone2',
  'اسم الام': 'mother_name', 'الام': 'mother_name',
  'الجنس': 'gender', 'النوع': 'gender',
  'تاريخ الولادة': 'birth_date', 'التولد': 'birth_date', 'المواليد': 'birth_date', 'تاريخ الميلاد': 'birth_date',
  'محل الولادة': 'birth_place', 'مكان الولادة': 'birth_place',
  'الحالة الاجتماعية': 'marital_status', 'الحالة الزوجية': 'marital_status',
  'التحصيل الدراسي': 'education', 'التحصيل': 'education', 'الشهادة': 'education',
  'البطاقة الموحدة': 'national_id_number', 'رقم البطاقة الموحدة': 'national_id_number', 'الموحدة': 'national_id_number', 'رقم الهوية': 'national_id_number',
  'بطاقة السكن': 'residence_card_number', 'رقم بطاقة السكن': 'residence_card_number', 'السكن': 'residence_card_number',
  'المحافظة': 'governorate',
  'العنوان': 'address', 'عنوان السكن': 'address', 'محل السكن': 'address',
  'قريب الطوارئ': 'emergency_contact_name', 'اسم قريب الطوارئ': 'emergency_contact_name', 'شخص للطوارئ': 'emergency_contact_name',
  'هاتف الطوارئ': 'emergency_contact_phone', 'رقم الطوارئ': 'emergency_contact_phone',
  'فصيلة الدم': 'blood_type', 'فصيله الدم': 'blood_type', 'زمرة الدم': 'blood_type',
  'البريد': 'email', 'البريد الالكتروني': 'email', 'الايميل': 'email', 'email': 'email',
}
const normKeys = <V,>(o: Record<string, V>): Record<string, V> => Object.fromEntries(Object.entries(o).map(([k, v]) => [norm(k), v]))
const HEADER_SYNONYMS = normKeys(HEADER_SYNONYMS_RAW)
const CONTRACT_IN = normKeys(CONTRACT_IN_RAW); const GENDER_IN = normKeys(GENDER_IN_RAW); const MARITAL_IN = normKeys(MARITAL_IN_RAW)
/** رؤوس كشوف التصدير التي لا تقابلها حقول استيراد — تُتجاهل بصمت */
const IGNORED_HEADERS = new Set(['ت', '#', 'الحالة', 'حالة الراتب', 'اخر يوم عمل', 'نوع الانهاء', 'الحالة الوظيفية'].map(norm))
const cellText = (v: unknown): string => {
  if (v == null) return ''
  if (v instanceof Date) return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`
  if (typeof v === 'object') { const o = v as { text?: string; result?: unknown; richText?: Array<{ text: string }> }; if (o.richText) return o.richText.map((t) => t.text).join(''); if (o.text != null) return String(o.text); if (o.result != null) return cellText(o.result) }
  return String(v).trim()
}
const matchHeader = (h: string): keyof ImportEmployeeRow | null => {
  const n = norm(h); if (!n) return null
  const exact = IMPORT_COLUMNS.find((x) => norm(x.header) === n || x.key === n)
  return exact?.key ?? HEADER_SYNONYMS[n] ?? null
}
/** يطبّع التاريخ من صيغ شائعة (2026-03-05 · 5/3/2026 · 05-03-2026 · 2026/03/05 · رقم تسلسلي Excel) إلى YYYY-MM-DD أو null إن تعذّر */
export function normalizeDate(v: string): string | null {
  const t = v.trim(); if (!t) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  let m = t.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/); if (m) return `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`
  if (/^\d{5}$/.test(t)) { const d = new Date(Date.UTC(1899, 11, 30) + Number(t) * 86400000); return d.toISOString().slice(0, 10) }
  return null
}
export interface ParsedImport {
  rows: ImportEmployeeRow[]
  /** رؤوس لم نتعرف عليها (بلا تكرار) */
  unknownHeaders: string[]
  /** الأعمدة الإلزامية غير الموجودة (الاسم فقط إلزامي؛ الرقم الوظيفي يمكن توليده) */
  missingRequired: string[]
  /** الأعمدة التي تعرّفنا عليها ورقم صف الرؤوس */
  mapped: Array<{ header: string; key: keyof ImportEmployeeRow }>
  headerRow: number
  /** صفوف تُجوهلت لأنها بلا اسم */
  skippedEmpty: number
  hasEmployeeNumber: boolean
  localErrors: Array<{ row: number; errors: string[] }>
}

/**
 * يحلّل ملف Excel إلى صفوف استيراد بمرونة: يكتشف صف الرؤوس تلقائياً (حتى لو سبقه عنوان مدمج كما في كشوف التصدير)،
 * يقبل مرادفات الرؤوس، يسحب ما هو موجود فقط (الأعمدة الناقصة أو الفارغة ليست مشكلة)، ويطبّع القيم العربية والتواريخ.
 */
export async function parseImportFile(file: Blob | ArrayBuffer | Uint8Array): Promise<ParsedImport> {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  const buf = file instanceof Blob ? await file.arrayBuffer() : file
  await wb.xlsx.load(buf as ArrayBuffer)
  const ws = wb.worksheets.find((w) => w.rowCount > 0) ?? wb.worksheets[0]
  const base: ParsedImport = { rows: [], unknownHeaders: [], missingRequired: ['الاسم'], mapped: [], headerRow: 0, skippedEmpty: 0, hasEmployeeNumber: false, localErrors: [] }
  if (!ws) return base
  // ① اكتشاف صف الرؤوس: أول 15 صفاً، الصف الذي يطابق أكبر عدد من الرؤوس المعروفة (ويتضمن الاسم)
  let best = { row: 0, score: 0, map: [] as Array<keyof ImportEmployeeRow | null>, headers: [] as string[] }
  for (let rn = 1; rn <= Math.min(15, ws.rowCount); rn++) {
    const row = ws.getRow(rn); const map: Array<keyof ImportEmployeeRow | null> = []; const headers: string[] = []; let score = 0
    row.eachCell({ includeEmpty: true }, (c, col) => { const h = cellText(c.value); headers[col] = h; const k = matchHeader(h); map[col] = k; if (k) score++ })
    if (score > best.score && map.includes('full_name')) best = { row: rn, score, map, headers }
  }
  if (!best.row) return base
  const { map, headers } = best
  const seenKeys = new Set<string>(); const mapped: ParsedImport['mapped'] = []; const unknown = new Set<string>()
  headers.forEach((h, col) => {
    const k = map[col]
    if (k) { if (seenKeys.has(k)) map[col] = null; else { seenKeys.add(k); mapped.push({ header: h, key: k }) } }
    else if (h && !IGNORED_HEADERS.has(norm(h))) unknown.add(h)
  })
  const hasNumber = seenKeys.has('employee_number')
  const rows: ImportEmployeeRow[] = []; const localErrors: ParsedImport['localErrors'] = []; let skipped = 0
  ws.eachRow((row, rn) => {
    if (rn <= best.row) return
    const rec: Record<string, string> = {}
    row.eachCell({ includeEmpty: false }, (c, col) => { const k = map[col]; if (k) { const t = cellText(c.value); if (t) rec[k] = t } })
    if (Object.keys(rec).length === 0) return
    const vals = Object.values(rec); if (vals.length >= 3 && new Set(vals).size === 1) return // صف مدمج (عنوان/تذييل) تتكرر قيمته في كل الخلايا
    if (rn === best.row + 1 && Object.entries(rec).every(([k, v]) => IMPORT_COLUMNS.find((c) => c.key === k)?.hint === v)) return // صف تلميحات القالب
    if (!rec.full_name) { skipped++; return }
    const errs: string[] = []
    if (rec.contract_type) { const v = CONTRACT_IN[norm(rec.contract_type)]; if (v) rec.contract_type = v; else errs.push('HR_CONTRACT_INVALID') }
    if (rec.gender) { const v = GENDER_IN[norm(rec.gender)]; if (v) rec.gender = v; else errs.push('HR_GENDER_INVALID') }
    if (rec.marital_status) { const v = MARITAL_IN[norm(rec.marital_status)]; if (v) rec.marital_status = v; else errs.push('HR_MARITAL_INVALID') }
    for (const k of ['hire_date', 'birth_date'] as const) if (rec[k]) { const d = normalizeDate(rec[k]); if (d) rec[k] = d; else errs.push('HR_DATE_INVALID') }
    if (errs.length) localErrors.push({ row: rows.length + 1, errors: errs })
    rows.push(rec as unknown as ImportEmployeeRow)
  })
  return { rows, unknownHeaders: [...unknown], missingRequired: [], mapped, headerRow: best.row, skippedEmpty: skipped, hasEmployeeNumber: hasNumber, localErrors }
}

/** يولّد أرقاماً وظيفية للصفوف التي بلا رقم: بادئة + عدّاد يبدأ بعد أكبر رقم مستخدم بالبادئة نفسها */
export function assignEmployeeNumbers(rows: ImportEmployeeRow[], prefix: string, existing: string[]): ImportEmployeeRow[] {
  const p = prefix.trim() || 'EMP-'
  const used = new Set(existing)
  let counter = existing.filter((n) => n.startsWith(p)).reduce((m, n) => Math.max(m, Number(n.slice(p.length)) || 0), 0)
  return rows.map((r) => {
    if (r.employee_number?.trim()) { used.add(r.employee_number.trim()); return r }
    let next: string; do { counter += 1; next = `${p}${String(counter).padStart(4, '0')}` } while (used.has(next))
    used.add(next); return { ...r, employee_number: next }
  })
}

/** تقرير نتائج الاستيراد (لتنزيله بعد التنفيذ): صف لكل سجل مع الحالة والأخطاء بالعربية */
export function importReportSpec(results: ImportRowResult[], translate: (code: string) => string): ExportSpec<ImportRowResult> {
  return {
    title: 'تقرير استيراد الموظفين', sheetName: 'النتائج', fileName: `تقرير-الاستيراد-${today()}.xlsx`, rows: results,
    columns: [
      { key: 'row', header: 'رقم الصف', width: 8, value: (r) => r.row, align: 'center' },
      { key: 'employee_number', header: 'الرقم الوظيفي', width: 13, value: (r) => r.employee_number, align: 'center' },
      { key: 'full_name', header: 'الاسم', width: 26, value: (r) => r.full_name },
      { key: 'ok', header: 'النتيجة', width: 10, value: (r) => (r.ok ? 'تم' : 'مرفوض'), align: 'center' },
      { key: 'errors', header: 'الأخطاء', width: 60, value: (r) => r.errors.map(translate).join(' · ') },
    ],
  }
}

const today = () => new Date().toISOString().slice(0, 10)
