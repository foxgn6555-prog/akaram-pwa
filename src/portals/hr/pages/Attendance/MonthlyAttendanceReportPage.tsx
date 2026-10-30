/**
 * بوابة الموارد البشرية — «تقرير الحضور الشهري» (00389-ب) — قراءة فقط.
 * صف لكل موظف: أيام مجدولة/حضور/تأخير/غياب/ناقصة/إجازة/راحة، دقائق التأخير والخروج المبكر والنقص والإضافي، ونسبة الالتزام.
 * المصدر نفسه الذي تعتمده غرفة العمليات والمالية (ops_attendance_month_grid) ⇒ لا أرقام متضاربة. أرقام لاتينية. تصدير Excel + طباعة/PDF (A4 أفقي، بلا رأس/تذييل المتصفح).
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { useBranches } from '@features/branches'
import { useDepartments } from '@features/departments'
import { useAttendanceGrid } from '@features/hr'
import type { AttendanceGridRow } from '@features/hr'
import { Button } from '@components/ui'
import { Icon } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import { StatCard } from '../../components/hr-ui'
import { field, fmtMinutes, monthStart } from '../../components/hr-format'
import { ExportButton } from '../../components/ExportButton'
import { exportToExcel } from '@features/hr/lib/hrExcel'
import type { ExportSpec } from '@features/hr/lib/hrExcel'

const MONTHS_AR = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول']
export const monthLabel = (m: string) => { const [y, mo] = m.slice(0, 7).split('-').map(Number); return `${MONTHS_AR[(mo ?? 1) - 1]} ${y}` }
/** الأيام المطلوب حضورها = حضور + تأخير + غياب + ناقصة (الإجازة والراحة وغير المحتسبة خارج المقام) */
export const scheduledDays = (r: AttendanceGridRow) => r.present_days + r.late_days + r.absent_days + r.incomplete_days
export const compliancePct = (r: AttendanceGridRow) => { const d = scheduledDays(r); return d ? Math.round(((r.present_days + r.late_days) / d) * 100) : 0 }
export type SortKey = 'name' | 'absent' | 'late' | 'compliance'
export function sortRows(rows: AttendanceGridRow[], key: SortKey): AttendanceGridRow[] {
  const c = [...rows]
  if (key === 'absent') return c.sort((a, b) => b.absent_days - a.absent_days || b.late_days - a.late_days)
  if (key === 'late') return c.sort((a, b) => b.late_minutes - a.late_minutes || b.late_days - a.late_days)
  if (key === 'compliance') return c.sort((a, b) => compliancePct(a) - compliancePct(b))
  return c.sort((a, b) => (a.department_name ?? '').localeCompare(b.department_name ?? '', 'ar') || a.full_name.localeCompare(b.full_name, 'ar'))
}
export function monthlySpec(rows: AttendanceGridRow[], month: string, filters: Array<[string, string]>): ExportSpec<AttendanceGridRow> {
  return {
    title: `تقرير الحضور الشهري — ${monthLabel(month)}`, sheetName: 'الحضور الشهري', fileName: `الحضور-الشهري-${month.slice(0, 7)}.xlsx`, rows, filters,
    footerNote: 'الأرقام من محرّك الحضور المعتمد (غرفة العمليات/المالية). لا يتضمن التقرير أي بيانات رواتب.',
    columns: [
      { key: 'employee_number', header: 'الرقم الوظيفي', width: 12, value: (r) => r.employee_number, align: 'center' },
      { key: 'full_name', header: 'الاسم', width: 26, value: (r) => r.full_name },
      { key: 'department_name', header: 'القسم', width: 18, value: (r) => r.department_name ?? '' },
      { key: 'scheduled', header: 'المطلوب', width: 9, value: (r) => scheduledDays(r), align: 'center' },
      { key: 'present_days', header: 'حضور', width: 8, value: (r) => r.present_days, align: 'center' },
      { key: 'late_days', header: 'تأخير', width: 8, value: (r) => r.late_days, align: 'center' },
      { key: 'absent_days', header: 'غياب', width: 8, value: (r) => r.absent_days, align: 'center' },
      { key: 'incomplete_days', header: 'ناقصة', width: 8, value: (r) => r.incomplete_days, align: 'center' },
      { key: 'leave_days', header: 'إجازة', width: 8, value: (r) => r.leave_days, align: 'center' },
      { key: 'rest_days', header: 'راحة', width: 8, value: (r) => r.rest_days, align: 'center' },
      { key: 'late_minutes', header: 'دقائق التأخير', width: 12, value: (r) => r.late_minutes, align: 'center' },
      { key: 'early_minutes', header: 'خروج مبكر (د)', width: 12, value: (r) => r.early_minutes, align: 'center' },
      { key: 'shortfall_minutes', header: 'النقص (د)', width: 10, value: (r) => r.shortfall_minutes, align: 'center' },
      { key: 'overtime_minutes', header: 'الإضافي (د)', width: 10, value: (r) => r.overtime_minutes, align: 'center' },
      { key: 'compliance', header: 'الالتزام %', width: 10, value: (r) => compliancePct(r), align: 'center' },
    ],
  }
}

const PRINT_CSS = `
#att-month-report { direction: rtl; color: #0f172a; font-size: 10px; }
#att-month-report table { border-collapse: collapse; width: 100%; }
#att-month-report th, #att-month-report td { border: 1px solid #cbd5e1; padding: 2px 4px; text-align: center; }
#att-month-report td.r { text-align: right; }
#att-month-report thead th { background: #0b3d6b; color: #fff; font-weight: 800; }
#att-month-report tbody tr:nth-child(even) td { background: #f8fafc; }
@media print {
  @page { size: A4 landscape; margin: 0; }
  html, body { background: #fff !important; }
  body * { visibility: hidden; }
  #att-month-report, #att-month-report * { visibility: visible; }
  #att-month-report { position: absolute; inset: 0; width: 100%; padding: 10mm 10mm 14mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  #att-month-report thead { display: table-header-group; }
  #att-month-report tr { break-inside: avoid; }
}`

export default function MonthlyAttendanceReportPage() {
  const [month, setMonth] = useState(monthStart())
  const [branchId, setBranchId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('name')
  const { data: branches = [] } = useBranches()
  const { data: departments = [] } = useDepartments()
  const { data: raw = [], isLoading } = useAttendanceGrid({ month, branchId: branchId || null, departmentId: departmentId || null, search: search.trim() || null })
  const rows = useMemo(() => sortRows(raw, sort), [raw, sort])
  const totals = useMemo(() => ({
    employees: raw.length,
    absent: raw.reduce((s, r) => s + r.absent_days, 0), late: raw.reduce((s, r) => s + r.late_days, 0), lateMin: raw.reduce((s, r) => s + r.late_minutes, 0),
    unevaluated: raw.reduce((s, r) => s + r.unevaluated_days, 0),
    compliance: raw.length ? Math.round(raw.reduce((s, r) => s + compliancePct(r), 0) / raw.length) : 0,
  }), [raw])
  const filters: Array<[string, string]> = [['الشهر', monthLabel(month)], ['الفرع', branches.find((b) => b.id === branchId)?.name ?? 'الكل'], ['القسم', departments.find((d) => d.id === departmentId)?.name ?? 'الكل'], ['بحث', search.trim() || '—']]
  const printPdf = () => { const t = document.title; document.title = `attendance-${month.slice(0, 7)}`; window.print(); document.title = t }
  return (
    <div className="space-y-4" data-testid="hr-attendance-monthly">
      <style>{PRINT_CSS}</style>
      <ExecPageHeader icon="bar-chart" title="تقرير الحضور الشهري" subtitle="صف لكل موظف من محرّك الحضور المعتمد نفسه (غرفة العمليات/المالية) · أرقام لاتينية · تصدير Excel أو طباعة/PDF"
        actions={<div className="flex flex-wrap gap-2">
          <ExportButton disabled={!rows.length} testId="am-export" onExport={() => exportToExcel(monthlySpec(rows, month, filters))} />
          <Button size="sm" variant="secondary" disabled={!rows.length} onClick={printPdf} data-testid="am-print"><Icon name="printer" size={14} className="ms-1" />طباعة / PDF</Button>
        </div>} />
      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-5 print:hidden" data-testid="am-filters">
        <input type="month" className={field} value={month.slice(0, 7)} onChange={(e) => e.target.value && setMonth(`${e.target.value}-01`)} data-testid="am-month" />
        <select className={field} value={branchId} onChange={(e) => setBranchId(e.target.value)} data-testid="am-branch"><option value="">كل الفروع</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <select className={field} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} data-testid="am-dept"><option value="">كل الأقسام</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <input className={field} placeholder="اسم / رقم وظيفي" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="am-search" />
        <select className={field} value={sort} onChange={(e) => setSort(e.target.value as SortKey)} data-testid="am-sort"><option value="name">ترتيب: القسم ثم الاسم</option><option value="absent">الأكثر غيابًا</option><option value="late">الأكثر تأخيرًا</option><option value="compliance">الأقل التزامًا</option></select>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 print:hidden">
        <StatCard title="الموظفون" value={totals.employees} testId="am-stat-emp" />
        <StatCard title="متوسط الالتزام" value={`${totals.compliance}%`} tone={totals.compliance >= 90 ? 'emerald' : totals.compliance >= 75 ? 'amber' : 'red'} testId="am-stat-compliance" />
        <StatCard title="أيام الغياب" value={totals.absent} tone={totals.absent ? 'red' : 'emerald'} testId="am-stat-absent" />
        <StatCard title="أيام التأخير" value={totals.late} hint={fmtMinutes(totals.lateMin)} tone={totals.late ? 'amber' : 'emerald'} testId="am-stat-late" />
        <StatCard title="أيام غير محتسبة" value={totals.unevaluated} hint={totals.unevaluated ? 'أعد الاحتساب من صفحة الحضور' : undefined} tone={totals.unevaluated ? 'violet' : 'emerald'} testId="am-stat-unevaluated" />
      </div>
      {isLoading ? <LoadingSpinner /> : rows.length === 0 ? <EmptyState title="لا بيانات حضور لهذا الشهر" hint="الحضور يُحتسب للموظفين المربوطين برقم بصمة فقط." /> : (
        <div id="att-month-report" className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm" data-testid="am-report">
          <div className="hidden items-center justify-between px-3 pt-3 print:flex">
            <div><p className="text-sm font-black text-[#0b3d6b]">شركة جزيرة الأكارم — الموارد البشرية</p><p className="text-xs font-bold">تقرير الحضور الشهري · {monthLabel(month)}</p></div>
            <p className="text-[10px] text-slate-500" dir="ltr">{filters.map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>
          </div>
          <table className="w-full text-xs" data-testid="am-table">
            <thead className="bg-slate-50 text-[11px] text-slate-600">
              <tr><th className="p-2 text-start">الموظف</th><th className="p-2 text-start">القسم</th><th className="p-2">المطلوب</th><th className="p-2">حضور</th><th className="p-2">تأخير</th><th className="p-2">غياب</th><th className="p-2">ناقصة</th><th className="p-2">إجازة</th><th className="p-2">راحة</th><th className="p-2">دقائق التأخير</th><th className="p-2">خروج مبكر</th><th className="p-2">النقص</th><th className="p-2">الإضافي</th><th className="p-2">الالتزام</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => { const pct = compliancePct(r); return (
                <tr key={r.employee_id} className={clsx('border-t border-slate-100', r.absent_days >= 3 && 'bg-red-50/30')} data-testid={`am-row-${r.employee_number}`}>
                  <td className="r p-2 text-start"><p className="font-semibold">{r.full_name}</p><p className="text-[10px] text-slate-500" dir="ltr">{r.employee_number}</p></td>
                  <td className="r p-2 text-start text-[11px]">{r.department_name ?? '—'}</td>
                  <td className="p-2 text-center tabular-nums">{scheduledDays(r)}</td>
                  <td className="p-2 text-center tabular-nums text-emerald-700">{r.present_days}</td>
                  <td className={clsx('p-2 text-center tabular-nums', r.late_days > 0 && 'font-bold text-amber-700')}>{r.late_days}</td>
                  <td className={clsx('p-2 text-center tabular-nums', r.absent_days > 0 && 'font-bold text-red-700')}>{r.absent_days}</td>
                  <td className={clsx('p-2 text-center tabular-nums', r.incomplete_days > 0 && 'text-violet-700')}>{r.incomplete_days}</td>
                  <td className="p-2 text-center tabular-nums text-sky-700">{r.leave_days}</td>
                  <td className="p-2 text-center tabular-nums text-slate-500">{r.rest_days}</td>
                  <td className="p-2 text-center tabular-nums" dir="ltr">{r.late_minutes}</td>
                  <td className="p-2 text-center tabular-nums" dir="ltr">{r.early_minutes}</td>
                  <td className="p-2 text-center tabular-nums" dir="ltr">{r.shortfall_minutes}</td>
                  <td className="p-2 text-center tabular-nums" dir="ltr">{r.overtime_minutes}</td>
                  <td className="p-2 text-center"><span className={clsx('inline-block min-w-[3rem] rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums', pct >= 90 ? 'bg-emerald-100 text-emerald-800' : pct >= 75 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800')} dir="ltr">{pct}%</span></td>
                </tr>
              ) })}
            </tbody>
          </table>
          <p className="border-t px-3 py-2 text-[10px] text-slate-500">{rows.length} موظف · الالتزام = (حضور + تأخير) ÷ المطلوب · الدقائق أرقام صحيحة · لا يتضمن التقرير أي بيانات رواتب.</p>
        </div>
      )}
    </div>
  )
}
