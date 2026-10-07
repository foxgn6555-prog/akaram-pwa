/**
 * 00194 — نموذج كشف الرواتب (المالية): فلاتر مترابطة (فرع ← أقسام الفرع فقط)، ترتيب بأي عمود، مجاميع دقيقة، وتجميع فرع/قسم.
 * دوال نقية بلا React حتى تُختبر وتُستعمل في الصفحة وفي Excel على السواء.
 */
import type { PayrollReconcileIssue, PayrollReconcileRow, PayrollSheetRow } from '../types'
import { employeeSortKey, rowDeductions, rowGross } from './payrollExcel'

export type ProfileFilter = 'all' | 'defined' | 'missing' | 'adjusted' | 'flagged'
export type SortKey = 'default' | 'name' | 'number' | 'department' | 'gross' | 'deductions' | 'net' | 'absent' | 'present' | 'late_minutes' | 'auto' | 'ops' | 'advance'
export interface SheetFilters { branch: string; department: string; contract: '' | 'monthly' | 'daily'; profile: ProfileFilter; search: string; sort: SortKey; dir: 'asc' | 'desc' }
export const DEFAULT_FILTERS: SheetFilters = { branch: '', department: '', contract: '', profile: 'all', search: '', sort: 'default', dir: 'asc' }

export const NO_BRANCH = 'بلا فرع'
export const NO_DEPT = 'بلا قسم'
export const branchOf = (r: PayrollSheetRow) => r.branch_name ?? NO_BRANCH
export const deptOf = (r: PayrollSheetRow) => r.department_name ?? NO_DEPT
/** تصفية الأرقام العربية-الهندية إلى لاتينية وتطبيع البحث */
const norm = (s: string) => s.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').trim().toLowerCase()
const arCmp = (a: string, b: string) => a.localeCompare(b, 'ar')
const lastCmp = (none: string) => (a: string, b: string) => (a === none ? 1 : b === none ? -1 : arCmp(a, b))

/** الفروع الموجودة فعلاً في الكشف (مرتبة، «بلا فرع» آخراً) */
export function branchOptions(rows: PayrollSheetRow[]): string[] {
  return [...new Set(rows.map(branchOf))].sort(lastCmp(NO_BRANCH))
}
/** الأقسام الموجودة في الكشف — مقصورة على الفرع المختار إن وُجد */
export function departmentOptions(rows: PayrollSheetRow[], branch: string): string[] {
  return [...new Set(rows.filter((r) => !branch || branchOf(r) === branch).map(deptOf))].sort(lastCmp(NO_DEPT))
}

export const rowNet = (r: PayrollSheetRow) => r.final_net ?? r.proposed_net ?? 0
export const rowOps = (r: PayrollSheetRow) => (r.ops_deduction_amount ?? 0) + (r.ops_deduction_days_amount ?? 0)
export const isAdjusted = (r: PayrollSheetRow) => r.final_net != null && r.final_net !== r.proposed_net
/** صف يستحق انتباه المحاسب: بلا ملف راتب، أيام غير محتسبة، تعديل يدوي، صافٍ صفر مع راتب معرَّف، أو استقطاع مقيَّد بالسقف */
export function rowFlags(r: PayrollSheetRow): string[] {
  const f: string[] = []
  if (r.pay_type == null) f.push('بلا ملف راتب')
  if ((r.unevaluated_days ?? 0) > 0) f.push(`${r.unevaluated_days} يوم غير محتسب`)
  if (isAdjusted(r)) f.push('صافٍ معدَّل يدوياً')
  if (r.pay_type != null && rowNet(r) === 0) f.push('صافٍ صفر')
  if (r.auto_deduction_capped) f.push('استقطاع مقيَّد بالسقف')
  if (r.pay_type != null && rowDeductions(r) > rowGross(r)) f.push('الاستقطاعات تفوق الإجمالي')
  return f
}

export function applyFilters(rows: PayrollSheetRow[], f: SheetFilters): PayrollSheetRow[] {
  const q = norm(f.search)
  const branchDepts = f.branch ? new Set(departmentOptions(rows, f.branch)) : null
  // القسم المختار لا يُطبَّق إن لم يعد ضمن أقسام الفرع (حماية من فلتر يتيم بعد تغيير الفرع)
  const dept = f.department && (!branchDepts || branchDepts.has(f.department)) ? f.department : ''
  return rows.filter((r) => {
    if (f.branch && branchOf(r) !== f.branch) return false
    if (dept && deptOf(r) !== dept) return false
    if (f.contract && (r.pay_type ?? r.contract_type) !== f.contract) return false
    if (f.profile === 'defined' && r.pay_type == null) return false
    if (f.profile === 'missing' && r.pay_type != null) return false
    if (f.profile === 'adjusted' && !isAdjusted(r)) return false
    if (f.profile === 'flagged' && rowFlags(r).length === 0) return false
    if (q) {
      const hay = norm([r.full_name, r.employee_number, r.department_name, r.branch_name, r.job_title].filter(Boolean).join(' '))
      if (!hay.includes(q)) return false
    }
    return true
  })
}

const SORTERS: Record<Exclude<SortKey, 'default'>, (r: PayrollSheetRow) => number | string> = {
  name: (r) => r.full_name ?? '', number: (r) => employeeSortKey(r.employee_number), department: (r) => deptOf(r),
  gross: rowGross, deductions: rowDeductions, net: rowNet, absent: (r) => r.days_absent, present: (r) => r.days_present,
  late_minutes: (r) => r.late_minutes, auto: (r) => r.auto_deduction_amount ?? 0, ops: rowOps, advance: (r) => r.advance_installment ?? 0,
}
export const SORT_LABELS: Record<SortKey, string> = {
  default: 'الترتيب الافتراضي (فرع ← قسم ← رقم وظيفي)', name: 'الاسم', number: 'الرقم الوظيفي', department: 'القسم', gross: 'الإجمالي قبل الاستقطاع',
  deductions: 'إجمالي الاستقطاعات', net: 'الصافي', absent: 'أيام الغياب', present: 'أيام الحضور', late_minutes: 'دقائق التأخير', auto: 'الاستقطاع التلقائي', ops: 'استقطاع العمليات', advance: 'قسط السلفة',
}
/** الترتيب الافتراضي الثابت: فرع ← قسم ← رقم وظيفي طبيعي ← اسم (مطابق لترتيب القاعدة) */
export function defaultCompare(a: PayrollSheetRow, b: PayrollSheetRow): number {
  return lastCmp(NO_BRANCH)(branchOf(a), branchOf(b)) || lastCmp(NO_DEPT)(deptOf(a), deptOf(b)) || employeeSortKey(a.employee_number).localeCompare(employeeSortKey(b.employee_number)) || arCmp(a.full_name ?? '', b.full_name ?? '')
}
export function sortRows(rows: PayrollSheetRow[], sort: SortKey, dir: 'asc' | 'desc'): PayrollSheetRow[] {
  const out = rows.slice()
  if (sort === 'default') { out.sort(defaultCompare); return dir === 'desc' ? out.reverse() : out }
  const k = SORTERS[sort]; const sgn = dir === 'desc' ? -1 : 1
  out.sort((a, b) => { const x = k(a), y = k(b); const c = typeof x === 'number' && typeof y === 'number' ? x - y : arCmp(String(x), String(y)); return (c || defaultCompare(a, b)) * sgn })
  return out
}

export interface SheetTotals { count: number; defined: number; missing: number; gross: number; fixed: number; ops: number; auto: number; advance: number; deductions: number; proposed: number; final: number; present: number; absent: number; leave: number; unevaluated: number; adjusted: number }
/** مجاميع دقيقة (تقريب إلى فلسين لتجنّب انجراف الفاصلة العائمة) */
export function sheetTotals(rows: PayrollSheetRow[]): SheetTotals {
  const r2 = (n: number) => Math.round(n * 100) / 100
  const sum = (f: (r: PayrollSheetRow) => number) => r2(rows.reduce((s, r) => s + (f(r) || 0), 0))
  return {
    count: rows.length, defined: rows.filter((r) => r.pay_type != null).length, missing: rows.filter((r) => r.pay_type == null).length,
    gross: sum(rowGross), fixed: sum((r) => r.fixed_deductions_total ?? 0), ops: sum(rowOps), auto: sum((r) => r.auto_deduction_amount ?? 0), advance: sum((r) => r.advance_installment ?? 0),
    deductions: sum(rowDeductions), proposed: sum((r) => r.proposed_net ?? 0), final: sum(rowNet),
    present: sum((r) => r.days_present), absent: sum((r) => r.days_absent), leave: sum((r) => r.days_leave), unevaluated: sum((r) => r.unevaluated_days ?? 0), adjusted: rows.filter(isAdjusted).length,
  }
}
/** معادلة الإجمالي: الإجمالي − الاستقطاعات = الصافي المقترح (على مستوى الكشف كله، بفارق تقريب ≤ 1 د.ع لكل صف) */
export function totalsConsistent(t: SheetTotals, rowsCount: number): boolean {
  return Math.abs(t.gross - t.deductions - t.proposed) <= Math.max(1, rowsCount)
}

export interface BranchGroup { branch: string; rows: PayrollSheetRow[]; totals: SheetTotals; departments: Array<{ name: string; rows: PayrollSheetRow[]; totals: SheetTotals }> }
/** تجميع هرمي فرع ← قسم (يحترم الترتيب الممرَّر داخل كل قسم) */
export function groupByBranchDept(rows: PayrollSheetRow[]): BranchGroup[] {
  const byBranch = new Map<string, PayrollSheetRow[]>()
  for (const r of rows) { const k = branchOf(r); byBranch.set(k, [...(byBranch.get(k) ?? []), r]) }
  return [...byBranch.keys()].sort(lastCmp(NO_BRANCH)).map((branch) => {
    const brRows = byBranch.get(branch) ?? []
    const byDept = new Map<string, PayrollSheetRow[]>()
    for (const r of brRows) { const k = deptOf(r); byDept.set(k, [...(byDept.get(k) ?? []), r]) }
    const departments = [...byDept.keys()].sort(lastCmp(NO_DEPT)).map((name) => ({ name, rows: byDept.get(name) ?? [], totals: sheetTotals(byDept.get(name) ?? []) }))
    return { branch, rows: brRows, totals: sheetTotals(brRows), departments }
  })
}

/** 00194 — تسميات مخالفات التحقق الحسابي (المالية) */
export const RECONCILE_ISSUE_LABELS: Record<PayrollReconcileIssue, string> = {
  SALARY_MISSING: 'بلا ملف راتب', GROSS_MISMATCH: 'الإجمالي لا يطابق مكوّناته', DEDUCTIONS_MISMATCH: 'الاستقطاعات لا تطابق مكوّناتها', NET_MISMATCH: 'الصافي ≠ الإجمالي − الاستقطاعات',
  FINAL_NEGATIVE: 'صافٍ معتمد سالب', NET_NOT_FLOORED: 'صافٍ غير مُصفَّر رغم تجاوز الاستقطاعات', DAYS_UNCLASSIFIED: 'أيام عمل غير مصنّفة', UNEVALUATED_DAYS: 'أيام غير محتسبة',
  ATTENDANCE_CHANGED: 'تغيّرت الحضورية بعد التصدير', AUTO_DEDUCTION_CHANGED: 'تغيّر الاستقطاع التلقائي بعد التصدير', OPS_DEDUCTIONS_CHANGED: 'تغيّرت استقطاعات العمليات بعد التصدير',
}
export const MONEY_ISSUES: PayrollReconcileIssue[] = ['GROSS_MISMATCH', 'DEDUCTIONS_MISMATCH', 'NET_MISMATCH', 'FINAL_NEGATIVE', 'NET_NOT_FLOORED']
export function reconcileSummary(rows: PayrollReconcileRow[]) {
  const money = rows.filter((r) => !r.money_ok).length, attendance = rows.filter((r) => !r.attendance_ok).length, missing = rows.filter((r) => r.issues.includes('SALARY_MISSING')).length
  return { total: rows.length, ok: rows.filter((r) => r.ok).length, money, attendance, missing, canApprove: money === 0 }
}
/** شرح الصافي بالكلمات والأرقام لصف تحقق — يُستعمل في الصفحة وفي Excel */
export function explainRow(r: PayrollReconcileRow): string {
  const c = r.components; const n = (k: string) => Number(c[k] ?? 0)
  const money = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (r.pay_type == null) return 'بلا ملف راتب — لا يُحتسب صافٍ حتى تعرّفه المالية'
  const gross = r.pay_type === 'daily'
    ? `${money(n('daily_rate'))} × ${money(n('payable_days'))} يوم مدفوع + مخصصات ${money(n('allowances'))} = ${money(r.gross_expected ?? 0)}`
    : Number(c.proration_ratio ?? 1) < 1
      ? `أجر اليوم ${money(n('day_rate'))} × ${n('covered_days')} يوم مشمول من ${n('days_in_month')} (بسقف الأساسي ${money(n('base_salary'))}) + مخصصات ${money(n('allowances'))} = ${money(r.gross_expected ?? 0)}`
      : `الأساسي ${money(n('base_salary'))} + مخصصات ${money(n('allowances'))} = ${money(r.gross_expected ?? 0)}`
  const ded = `ثابتة ${money(n('fixed_deductions'))} + عمليات ${money(n('ops_amount'))} + أيام عمليات ${money(n('ops_days_amount'))} + تلقائي ${money(n('auto_amount'))}${c.auto_basis === 'disabled' ? ' (متوقف)' : ''} + قسط سلفة ${money(n('advance'))} = ${money(r.deductions_expected ?? 0)}`
  return `الإجمالي: ${gross} · الاستقطاعات: ${ded} · الصافي = ${money(r.gross_expected ?? 0)} − ${money(r.deductions_expected ?? 0)} = ${money(r.net_expected ?? 0)}`
}
