/**
 * بوابة الموارد البشرية — وحدة «الحضور والانصراف» (عرض دقيق، قراءة فقط)
 * أول دخول وآخر خروج حسب شفت الموظف، دقائق التأخير/الخروج المبكر، الحالة، فلاتر التاريخ/الفرع/القسم (بشجرته)/الحالة/البحث.
 * التعديل والتدقيق يتمان في غرفة العمليات (وحدة الحضوريات) — هنا زر «إعادة الاحتساب من البصمات» فقط.
 */
import { useMemo, useState } from 'react'
import { useBranches } from '@features/branches'
import { useDepartments } from '@features/departments'
import { ATTENDANCE_STATUS_LABELS, ATTENDANCE_STATUS_ORDER, WEEKDAYS_AR, useAttendance, useEvaluateAttendance } from '@features/hr'
import type { AttendanceStatus } from '@features/hr'
import { Button } from '@components/ui'
import { Icon } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import clsx from 'clsx'
import { StatCard, StatusBadge } from '../../components/hr-ui'
import { field, fmtMinutes, fmtTime, isoDay, STATUS_STYLES } from '../../components/hr-format'
import { ExportButton } from '../../components/ExportButton'
import { UnmatchedPunchesPanel } from '../../components/UnmatchedPunchesPanel'
import { attendanceSpec, exportToExcel } from '@features/hr/lib/hrExcel'

export default function AttendanceLog() {
  const [from, setFrom] = useState(isoDay(new Date(Date.now() - 6 * 86400000)))
  const [to, setTo] = useState(isoDay())
  const [branchId, setBranchId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [status, setStatus] = useState<AttendanceStatus | ''>('')
  const [search, setSearch] = useState('')
  const { data: departments = [] } = useDepartments()
  const { data: branches = [] } = useBranches()
  const filters = useMemo(() => ({ from, to, branchId: branchId || null, departmentId: departmentId || null, status: status || null, search }), [from, to, branchId, departmentId, status, search])
  const { data: rows = [], isLoading } = useAttendance(filters, !!from && !!to && from <= to)
  const evaluate = useEvaluateAttendance()
  const counts = useMemo(() => Object.fromEntries(ATTENDANCE_STATUS_ORDER.map((s) => [s, rows.filter((r) => r.status === s).length])) as Record<AttendanceStatus, number>, [rows])

  return (
    <div className="space-y-4" data-testid="hr-attendance">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-black">الحضور والانصراف</h1>
          <p className="text-xs text-slate-500">مشتق من البصمات حسب شفت كل موظف · التدقيق والتعديل في غرفة العمليات</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportButton disabled={rows.length === 0} testId="att-export" onExport={() => exportToExcel(attendanceSpec(rows, [
            ['من', from], ['إلى', to], ['الفرع', branches.find((b) => b.id === branchId)?.name ?? ''], ['القسم', departments.find((d) => d.id === departmentId)?.name ?? ''],
            ['الحالة', status ? ATTENDANCE_STATUS_LABELS[status] : ''], ['بحث', search],
          ]))} />
          <Button size="sm" variant="secondary" isLoading={evaluate.isPending} onClick={() => evaluate.mutate({ from, to })} data-testid="att-evaluate">
            <Icon name="refresh" size={14} /> إعادة الاحتساب من البصمات
          </Button>
        </div>
      </header>

      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-3 lg:grid-cols-6" data-testid="att-filters">
        <input type="date" className={field} value={from} onChange={(e) => setFrom(e.target.value)} data-testid="att-from" />
        <input type="date" className={field} value={to} onChange={(e) => setTo(e.target.value)} data-testid="att-to" />
        <select className={field} value={branchId} onChange={(e) => setBranchId(e.target.value)} data-testid="att-branch"><option value="">كل الفروع</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <select className={field} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} data-testid="att-dept"><option value="">كل الأقسام</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.parent_id ? '↳ ' : ''}{d.name}</option>)}</select>
        <select className={field} value={status} onChange={(e) => setStatus(e.target.value as AttendanceStatus | '')} data-testid="att-status-filter"><option value="">كل الحالات</option>{ATTENDANCE_STATUS_ORDER.map((s) => <option key={s} value={s}>{ATTENDANCE_STATUS_LABELS[s]}</option>)}</select>
        <input className={field} placeholder="اسم / رقم وظيفي" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="att-search" />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {ATTENDANCE_STATUS_ORDER.map((s) => (
          <button key={s} type="button" onClick={() => setStatus(status === s ? '' : s)} className={clsx('text-start', status === s && 'ring-2 ring-brand-400 rounded-2xl')} data-testid={`att-stat-${s}`}>
            <StatCard title={ATTENDANCE_STATUS_LABELS[s]} value={counts[s]} tone={s === 'absent' ? 'red' : s === 'late' ? 'amber' : s === 'present' ? 'emerald' : s === 'incomplete' ? 'violet' : 'sky'} />
          </button>
        ))}
      </div>

      <UnmatchedPunchesPanel from={from} to={to} />

      {isLoading ? <LoadingSpinner /> : rows.length === 0 ? <EmptyState title="لا سجلات حضور في هذا النطاق" hint="الحضور يُحتسب للموظفين المربوطين برقم بصمة فقط — اربط أرقام البصمة بالموظفين من دفتر البصمة، ثم اضغط «إعادة الاحتساب من البصمات» إن لزم" /> : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm" data-testid="att-table">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr><th className="p-2 text-start">اليوم</th><th className="p-2 text-start">الموظف</th><th className="p-2 text-start">القسم / الفرع</th><th className="p-2">الشفت</th><th className="p-2">المتوقع</th><th className="p-2">دخول</th><th className="p-2">خروج</th><th className="p-2">تأخير</th><th className="p-2">مبكر</th><th className="p-2">مدة العمل</th><th className="p-2">الحالة</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={clsx('border-t border-slate-100', r.status === 'absent' && 'bg-red-50/30')} data-testid={`att-row-${r.employee_number}-${r.work_date}`}>
                  <td className="p-2 text-xs">{r.work_date}<span className="block text-[10px] text-slate-400">{WEEKDAYS_AR[new Date(r.work_date).getDay()]}</span></td>
                  <td className="p-2"><p className="font-semibold">{r.full_name}</p><p className="text-[11px] text-slate-500">{r.employee_number}</p></td>
                  <td className="p-2 text-xs">{r.department_name ?? '—'}<span className="block text-[10px] text-slate-400">{r.branch_name ?? ''}</span></td>
                  <td className="p-2 text-center text-xs">{r.shift_name ?? '—'}{r.is_rest_day && <span className="block text-[9px] text-violet-600">يوم راحة</span>}</td>
                  <td className="p-2 text-center text-[11px] tabular-nums text-slate-500" dir="ltr">{r.expected_in ? `${fmtTime(r.expected_in)}–${fmtTime(r.expected_out)}` : '—'}</td>
                  <td className="p-2 text-center tabular-nums" dir="ltr">{fmtTime(r.check_in)}</td>
                  <td className="p-2 text-center tabular-nums" dir="ltr">{fmtTime(r.check_out)}</td>
                  <td className={clsx('p-2 text-center text-xs', r.late_minutes > 0 && 'font-bold text-amber-700')}>{fmtMinutes(r.late_minutes)}</td>
                  <td className={clsx('p-2 text-center text-xs', r.early_minutes > 0 && 'font-bold text-orange-700')}>{fmtMinutes(r.early_minutes)}</td>
                  <td className="p-2 text-center text-xs">{fmtMinutes(r.worked_minutes)}</td>
                  <td className="p-2 text-center"><StatusBadge status={r.status} source={r.source} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-slate-400">دليل الألوان: {ATTENDANCE_STATUS_ORDER.map((s) => <span key={s} className={clsx('mx-1 rounded px-1', STATUS_STYLES[s])}>{ATTENDANCE_STATUS_LABELS[s]}</span>)} · ✎ = مُعدَّل يدوياً في غرفة العمليات</p>
    </div>
  )
}
