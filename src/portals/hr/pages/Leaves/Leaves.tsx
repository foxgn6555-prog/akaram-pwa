/**
 * بوابة الموارد البشرية — وحدة «الإجازات والزمنيات»
 * تعرض المعتمد فقط (إجازات أيام + زمنيات ساعات) بفلاتر التاريخ/القسم/البحث. دورة الطلب/الموافقة تُستكمل لاحقاً.
 */
import { useMemo, useState } from 'react'
import { useDepartments } from '@features/departments'
import { useHrLeaves } from '@features/hr'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import clsx from 'clsx'
import { StatCard } from '../../components/hr-ui'
import { field, hhmm, isoDay, monthStart } from '../../components/hr-format'

export default function Leaves() {
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(isoDay(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)))
  const [kind, setKind] = useState<'' | 'leave' | 'time_permit'>('')
  const [departmentId, setDepartmentId] = useState('')
  const [search, setSearch] = useState('')
  const { data: departments = [] } = useDepartments()
  const { data: leaves = [], isLoading } = useHrLeaves({ from, to, approvedOnly: true })
  const rows = useMemo(() => leaves.filter((l) =>
    (!kind || l.kind === kind) &&
    (!departmentId || l.employees?.department_id === departmentId) &&
    (!search || (l.employees?.full_name ?? '').includes(search) || (l.employees?.employee_number ?? '').includes(search))), [leaves, kind, departmentId, search])
  const days = rows.filter((l) => l.kind === 'leave').reduce((s, l) => s + ((new Date(l.end_date).getTime() - new Date(l.start_date).getTime()) / 86400000 + 1), 0)

  return (
    <div className="space-y-4" data-testid="hr-leaves">
      <header>
        <h1 className="text-xl font-black">الإجازات والزمنيات</h1>
        <p className="text-xs text-slate-500">المعتمد والموافق عليه فقط — يُستثنى تلقائياً من الغياب في الحضور</p>
      </header>
      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-3 lg:grid-cols-5" data-testid="leave-filters">
        <input type="date" className={field} value={from} onChange={(e) => setFrom(e.target.value)} data-testid="lv-from" />
        <input type="date" className={field} value={to} onChange={(e) => setTo(e.target.value)} data-testid="lv-to" />
        <select className={field} value={kind} onChange={(e) => setKind(e.target.value as '' | 'leave' | 'time_permit')} data-testid="lv-kind"><option value="">إجازات وزمنيات</option><option value="leave">إجازات فقط</option><option value="time_permit">زمنيات فقط</option></select>
        <select className={field} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} data-testid="lv-dept"><option value="">كل الأقسام</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <input className={field} placeholder="اسم / رقم وظيفي" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="lv-search" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <StatCard title="إجازات معتمدة" value={rows.filter((l) => l.kind === 'leave').length} tone="sky" testId="lv-stat-leaves" />
        <StatCard title="أيام الإجازة" value={days} testId="lv-stat-days" />
        <StatCard title="زمنيات معتمدة" value={rows.filter((l) => l.kind === 'time_permit').length} tone="violet" testId="lv-stat-permits" />
      </div>
      {isLoading ? <LoadingSpinner /> : rows.length === 0 ? <EmptyState title="لا إجازات أو زمنيات معتمدة في هذا النطاق" hint="دورة الطلب والموافقة ستُضاف في مرحلة لاحقة" /> : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm" data-testid="lv-table">
            <thead className="bg-slate-50 text-xs text-slate-600"><tr><th className="p-2 text-start">الموظف</th><th className="p-2">النوع</th><th className="p-2">من</th><th className="p-2">إلى</th><th className="p-2">الوقت</th><th className="p-2 text-start">ملاحظات</th></tr></thead>
            <tbody>{rows.map((l) => (
              <tr key={l.id} className="border-t border-slate-100" data-testid={`lv-row-${l.id}`}>
                <td className="p-2"><p className="font-semibold">{l.employees?.full_name}</p><p className="text-[11px] text-slate-500">{l.employees?.employee_number}</p></td>
                <td className="p-2 text-center"><span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-bold', l.kind === 'leave' ? 'bg-sky-50 text-sky-700' : 'bg-violet-50 text-violet-700')}>{l.kind === 'leave' ? `إجازة ${l.leave_type}` : 'زمنية'}</span></td>
                <td className="p-2 text-center text-xs">{l.start_date}</td><td className="p-2 text-center text-xs">{l.end_date}</td>
                <td className="p-2 text-center text-xs" dir="ltr">{l.start_time ? `${hhmm(l.start_time)}–${hhmm(l.end_time)}` : '—'}</td>
                <td className="p-2 text-xs text-slate-500">{l.notes ?? ''}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}
