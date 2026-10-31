/**
 * 00283 — تصدير Excel احترافي لسجل تعديلات الحضور (نقي + دالة تصدير واحدة)
 *  · كتالوج أعمدة يختار منها المستخدم ما يريد (مع افتراضي معقول)
 *  · الفرق قبل/بعد إمّا كعمود نصي واحد أو كأعمدة مفصّلة (قبل/بعد لكل حقل متتبَّع)
 *  · أوراق ملخص اختيارية: حسب الإجراء / حسب الموظف / حسب المدقّق + رسم بياني للإجراءات
 *  · أرقام إنكليزية وتوقيت بغداد، نفس قالب الشركة الموحّد (buildExcelReport)
 */
import type { AttendanceAuditRow } from '@features/hr'
import { buildExcelReport, type ReportColumn } from '@lib/export/excel-report'
import { AUDIT_ACTION_LABELS, auditDiff, auditValue } from './attendance-audit.utils'

export type AuditColumnId =
  | 'seq' | 'created_at' | 'created_date' | 'created_time' | 'action' | 'employee_number' | 'full_name' | 'department_name'
  | 'work_date' | 'diff' | 'reason' | 'actor_name' | 'source' | 'id'

export interface AuditColumnDef { id: AuditColumnId; header: string; width: number; align?: 'center' | 'right' | 'left'; wrap?: boolean; group: 'الأساسية' | 'الموظف' | 'التفاصيل' | 'تقنية' }

export const AUDIT_EXPORT_COLUMNS: readonly AuditColumnDef[] = [
  { id: 'seq', header: 'ت', width: 6, align: 'center', group: 'الأساسية' },
  { id: 'created_at', header: 'وقت الإجراء', width: 20, align: 'center', group: 'الأساسية' },
  { id: 'created_date', header: 'تاريخ الإجراء', width: 13, align: 'center', group: 'الأساسية' },
  { id: 'created_time', header: 'ساعة الإجراء', width: 10, align: 'center', group: 'الأساسية' },
  { id: 'action', header: 'الإجراء', width: 30, group: 'الأساسية' },
  { id: 'employee_number', header: 'الرقم الوظيفي', width: 16, align: 'center', group: 'الموظف' },
  { id: 'full_name', header: 'اسم الموظف', width: 26, group: 'الموظف' },
  { id: 'department_name', header: 'القسم', width: 20, group: 'الموظف' },
  { id: 'work_date', header: 'يوم الحضور', width: 13, align: 'center', group: 'التفاصيل' },
  { id: 'diff', header: 'الفرق (قبل ← بعد)', width: 48, wrap: true, group: 'التفاصيل' },
  { id: 'reason', header: 'السبب', width: 44, wrap: true, group: 'التفاصيل' },
  { id: 'actor_name', header: 'المدقّق', width: 22, group: 'التفاصيل' },
  { id: 'source', header: 'مصدر التغيير', width: 12, align: 'center', group: 'تقنية' },
  { id: 'id', header: 'معرّف السجل', width: 38, group: 'تقنية' },
]
export const DEFAULT_AUDIT_COLUMNS: readonly AuditColumnId[] = ['seq', 'created_at', 'action', 'employee_number', 'full_name', 'department_name', 'work_date', 'diff', 'reason', 'actor_name']

/** الحقول المتتبَّعة التي تُفصَّل إلى أعمدة قبل/بعد عند اختيار «الفرق مفصّلاً» */
export const DIFF_FIELDS: readonly { key: string; label: string }[] = [
  { key: 'check_in', label: 'الدخول' }, { key: 'check_out', label: 'الخروج' }, { key: 'status', label: 'الحالة' },
  { key: 'late_minutes', label: 'تأخير (د)' }, { key: 'early_minutes', label: 'مبكر (د)' }, { key: 'worked_minutes', label: 'مدة العمل (د)' },
  { key: 'shortfall_minutes', label: 'النقص (د)' }, { key: 'proposed_deduction_days', label: 'استقطاع مقترح (أيام)' }, { key: 'proposed_deduction_minutes', label: 'استقطاع مقترح (د)' }, { key: 'waived', label: 'ملغى' },
]

export interface AuditExportOptions {
  columns: AuditColumnId[]
  /** الفرق: نص واحد أو أعمدة قبل/بعد لكل حقل */
  diffMode: 'text' | 'detailed'
  summarySheets: boolean
  chart: boolean
  from: string
  to: string
  /** وصف الفلاتر الفعّالة (يظهر في سطر المعلومات) */
  filtersLabel?: string
  fileName?: string
}

const BAGHDAD = 'Asia/Baghdad'
export const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: BAGHDAD, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: BAGHDAD })
export const fmtClock = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: BAGHDAD, hour12: false, hour: '2-digit', minute: '2-digit' })

export const auditSource = (r: AttendanceAuditRow): string => {
  const src = (r.after as Record<string, unknown> | null)?.source ?? (r.before as Record<string, unknown> | null)?.source
  return r.action === 'auto_blocked' || r.action === 'leave_sync' ? 'تلقائي' : src === 'auto' ? 'تلقائي' : src === 'manual' ? 'يدوي' : '—'
}

/** قيمة خلية لعمود معيّن — نقي */
export function auditCell(col: AuditColumnId, r: AttendanceAuditRow, seq: number): string | number {
  switch (col) {
    case 'seq': return seq
    case 'created_at': return fmtDateTime(r.created_at)
    case 'created_date': return fmtDate(r.created_at)
    case 'created_time': return fmtClock(r.created_at)
    case 'action': return AUDIT_ACTION_LABELS[r.action] ?? r.action
    case 'employee_number': return r.employee_number
    case 'full_name': return r.full_name
    case 'department_name': return r.department_name ?? '—'
    case 'work_date': return r.work_date
    case 'diff': { const d = auditDiff(r.before, r.after); return d.length ? d.map((x) => `${x.label}: ${x.from} ← ${x.to}`).join('\n') : '—' }
    case 'reason': return r.reason
    case 'actor_name': return r.actor_name ?? '—'
    case 'source': return auditSource(r)
    case 'id': return r.id
  }
}

/** يبني الأعمدة والصفوف للورقة الرئيسية — نقي (يُختبر بلا Excel) */
export function buildAuditSheet(rows: AttendanceAuditRow[], o: Pick<AuditExportOptions, 'columns' | 'diffMode'>): { columns: ReportColumn[]; rows: Record<string, unknown>[] } {
  const chosen = AUDIT_EXPORT_COLUMNS.filter((c) => o.columns.includes(c.id) && !(o.diffMode === 'detailed' && c.id === 'diff'))
  const columns: ReportColumn[] = chosen.map((c) => ({ key: c.id, header: c.header, width: c.width, align: c.align, wrap: c.wrap }))
  if (o.diffMode === 'detailed' && o.columns.includes('diff')) {
    for (const f of DIFF_FIELDS) {
      columns.push({ key: `before_${f.key}`, header: `${f.label} — قبل`, width: 14, align: 'center' })
      columns.push({ key: `after_${f.key}`, header: `${f.label} — بعد`, width: 14, align: 'center' })
    }
  }
  const out = rows.map((r, i) => {
    const rec: Record<string, unknown> = {}
    for (const c of chosen) rec[c.id] = auditCell(c.id, r, i + 1)
    if (o.diffMode === 'detailed' && o.columns.includes('diff')) {
      const b = (r.before ?? {}) as Record<string, unknown>, a = (r.after ?? {}) as Record<string, unknown>
      for (const f of DIFF_FIELDS) {
        const changed = JSON.stringify(b[f.key] ?? null) !== JSON.stringify(a[f.key] ?? null)
        rec[`before_${f.key}`] = changed ? auditValue(f.key, b[f.key]) : ''
        rec[`after_${f.key}`] = changed ? auditValue(f.key, a[f.key]) : ''
      }
    }
    return rec
  })
  return { columns, rows: out }
}

/** ملخصات نقية */
export function summarizeAudit(rows: AttendanceAuditRow[]) {
  const by = <K extends string>(key: (r: AttendanceAuditRow) => K, label: (r: AttendanceAuditRow) => string) => {
    const m = new Map<K, { label: string; count: number; employees: Set<string>; last: string; actions: Map<string, number> }>()
    for (const r of rows) {
      const k = key(r)
      const e = m.get(k) ?? { label: label(r), count: 0, employees: new Set<string>(), last: r.created_at, actions: new Map<string, number>() }
      e.count++; e.employees.add(r.employee_id); if (r.created_at > e.last) e.last = r.created_at
      e.actions.set(r.action, (e.actions.get(r.action) ?? 0) + 1)
      m.set(k, e)
    }
    return [...m.values()].sort((x, y) => y.count - x.count)
  }
  return {
    byAction: by((r) => r.action, (r) => AUDIT_ACTION_LABELS[r.action] ?? r.action),
    byEmployee: by((r) => r.employee_id, (r) => `${r.full_name} (${r.employee_number})`),
    byActor: by((r) => r.actor ?? '—', (r) => r.actor_name ?? '—'),
  }
}

const topActions = (actions: Map<string, number>) => [...actions.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${AUDIT_ACTION_LABELS[k as AttendanceAuditRow['action']] ?? k} (${v})`).join('، ')

/** التصدير الفعلي (Excel) */
export async function exportAttendanceAudit(rows: AttendanceAuditRow[], o: AuditExportOptions) {
  const main = buildAuditSheet(rows, o)
  const s = summarizeAudit(rows)
  const meta = `الفترة ${o.from} → ${o.to} · ${rows.length} إجراء · ${s.byEmployee.length} موظفاً${o.filtersLabel ? ` · ${o.filtersLabel}` : ''}`
  const sumCols = (first: string): ReportColumn[] => [
    { key: 'label', header: first, width: 34 }, { key: 'count', header: 'عدد الإجراءات', width: 14, align: 'center' },
    { key: 'employees', header: 'الموظفون', width: 12, align: 'center' }, { key: 'last', header: 'آخر إجراء', width: 20, align: 'center' }, { key: 'actions', header: 'توزيع الإجراءات', width: 60, wrap: true },
  ]
  const sumRows = (list: ReturnType<typeof summarizeAudit>['byAction']) => list.map((e) => ({ label: e.label, count: e.count, employees: e.employees.size, last: fmtDateTime(e.last), actions: topActions(e.actions) }))
  return buildExcelReport({
    sheetName: 'سجل التعديلات',
    companySub: 'التطوير المركزية — سجل تعديلات الحضور',
    title: 'سجل تعديلات الحضور',
    meta,
    columns: main.columns,
    rows: main.rows,
    orientation: 'landscape',
    fileName: o.fileName ?? `attendance-audit-${o.from}_${o.to}.xlsx`,
    extraSheets: o.summarySheets ? [
      { sheetName: 'حسب الإجراء', title: 'ملخص حسب نوع الإجراء', meta, columns: sumCols('الإجراء'), rows: sumRows(s.byAction), totalRow: { label: 'الإجمالي', count: rows.length } },
      { sheetName: 'حسب الموظف', title: 'ملخص حسب الموظف', meta, columns: sumCols('الموظف'), rows: sumRows(s.byEmployee), totalRow: { label: 'الإجمالي', count: rows.length } },
      { sheetName: 'حسب المدقّق', title: 'ملخص حسب المدقّق', meta, columns: sumCols('المدقّق'), rows: sumRows(s.byActor), totalRow: { label: 'الإجمالي', count: rows.length } },
    ] : undefined,
    charts: o.chart && s.byAction.length ? [{ title: 'توزيع الإجراءات', kind: 'bar', data: s.byAction.map((e) => ({ label: e.label, value: e.count })), valueLabel: 'إجراء' }] : undefined,
  })
}
