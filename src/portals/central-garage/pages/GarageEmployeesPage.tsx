/**
 * موظفو الكراج (00207) — كل موظفي قسم الكراج وفروعه ببيانات أساسية غير حساسة:
 * لا رواتب (المالية فقط) ولا رقم بصمة/سماحيات/بيانات شخصية (الموارد البشرية فقط). النطاق يُفرض في قاعدة البيانات.
 */
import { useDeferredValue, useState } from 'react'
import clsx from 'clsx'
import { useGarageEmployees } from '@features/central-garage/hooks'
import type { GarageEmployeeRow } from '@features/central-garage/types'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { Icon } from '@components/ui/Icon/Icon'
import { disclosureErrorMessage } from '@sdk/disclosures-unit.sdk'

const STATUS: Record<GarageEmployeeRow['employment_status'], { label: string; cls: string }> = {
  active: { label: 'على رأس العمل', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' }, on_leave: { label: 'في إجازة', cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
  suspended: { label: 'موقوف', cls: 'bg-amber-50 text-amber-800 ring-amber-200' }, terminated: { label: 'منتهي الخدمة', cls: 'bg-slate-100 text-slate-600 ring-slate-200' },
}
const thisMonth = () => new Date().toISOString().slice(0, 7)
const n = (v: number) => v.toLocaleString('en-US')
type Filter = 'all' | 'drivers' | 'staff' | 'issues'

export interface DeptEmployeesPageProps { title?: string; dept?: string; testId?: string }
/** صفحة مشتركة بنطاق القسم — الكراج افتراضياً؛ المحطة التحويلية (00211) تمرر عنوانها واسم جهتها. */
export default function GarageEmployeesPage({ title = 'موظفو الكراج', dept = 'الكراج', testId = 'garage-employees-page' }: DeptEmployeesPageProps = {}) {
  const [q, setQ] = useState(''); const dq = useDeferredValue(q.trim())
  const [month, setMonth] = useState(thisMonth())
  const [filter, setFilter] = useState<Filter>('all')
  const { data, isLoading, error } = useGarageEmployees(dq, month)
  const rows = (data?.rows ?? []).filter((r) => filter === 'all' ? true : filter === 'drivers' ? r.is_driver : filter === 'staff' ? !r.is_driver : r.open_disclosures > 0 || r.month.absent > 0)
  const s = data?.summary
  return (
    <div className="space-y-4" data-testid={testId}>
      <ExecPageHeader icon="users" title={title} subtitle={data?.department ? `قسم «${data.department}» وفروعه — بيانات أساسية؛ الرواتب لدى المالية والملف الكامل لدى الموارد البشرية` : 'كل موظفي قسم الكراج وفروعه — بيانات أساسية غير حساسة'}
        stats={[{ label: 'الموظفون', value: s ? n(s.total) : '…', tone: 'gold' }, { label: 'سائقون', value: s ? n(s.drivers) : '…' }, { label: 'غائبون اليوم', value: s ? n(s.absent_today) : '…', tone: s?.absent_today ? 'red' : 'green' }, { label: 'عليهم كشوفات مفتوحة', value: s ? n(s.with_open_disclosures) : '…', tone: s?.with_open_disclosures ? 'red' : 'plain' }]} />

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <label className="relative flex-1 min-w-[200px]"><Icon name="search" size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pr-9 pl-3 text-sm outline-none focus:border-[#0b3d6b]" placeholder="بحث بالاسم أو الرقم الوظيفي أو العنوان الوظيفي…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="emp-search" /></label>
        <input type="month" dir="ltr" className="h-10 rounded-xl border border-slate-200 px-3 text-sm" value={month} onChange={(e) => setMonth(e.target.value)} data-testid="emp-month" aria-label="شهر الحضور" />
        <div className="inline-flex rounded-xl border border-slate-200 p-0.5" role="tablist" data-testid="emp-filter">
          {([['all', 'الكل'], ['drivers', 'السائقون'], ['staff', 'الكادر'], ['issues', 'بحاجة متابعة']] as const).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={clsx('h-8 rounded-lg px-3 text-xs font-black', filter === k ? 'bg-[#0b3d6b] text-white' : 'text-slate-600 hover:bg-slate-50')}>{l}</button>
          ))}
        </div>
      </div>

      {isLoading ? <LoadingSpinner /> : error ? <p role="alert" className="rounded-2xl bg-red-50 p-3 text-xs font-bold text-red-700">{disclosureErrorMessage(error)}</p> : rows.length === 0 ? (
        <EmptyState title="لا موظفون" hint={data?.scoped ? `لم تضع الموارد البشرية موظفين في قسم ${dept} بعد` : 'لا نتائج مطابقة'} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[900px] text-sm" data-testid="emp-table">
            <thead><tr className="border-b-2 border-[#0b3d6b] bg-slate-50 text-[11px] text-slate-500">
              <th className="px-3 py-2 text-right font-semibold">#</th><th className="px-3 py-2 text-right font-semibold">الموظف</th><th className="px-3 py-2 text-right font-semibold">العنوان الوظيفي / القسم</th>
              <th className="px-3 py-2 text-center font-semibold">الشفت</th><th className="px-3 py-2 text-center font-semibold">الآلية</th><th className="px-3 py-2 text-center font-semibold">العقد</th>
              <th className="px-3 py-2 text-center font-semibold">حضور الشهر</th><th className="px-3 py-2 text-center font-semibold">غياب</th><th className="px-3 py-2 text-center font-semibold">تأخير</th>
              <th className="px-3 py-2 text-center font-semibold">كشوفات مفتوحة</th><th className="px-3 py-2 text-center font-semibold">الحالة</th><th className="px-3 py-2 text-right font-semibold">الهاتف</th>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60" data-testid={`emp-row-${r.employee_number}`}>
                  <td className="px-3 py-2 text-xs tabular-nums text-slate-400" dir="ltr">{i + 1}</td>
                  <td className="px-3 py-2"><div className="font-black text-slate-800">{r.full_name}{r.is_driver && <span className="ms-2 rounded-md bg-[#0b3d6b]/10 px-1.5 py-0.5 text-[10px] font-black text-[#0b3d6b]">سائق</span>}</div><div className="text-[11px] text-slate-400" dir="ltr">{r.employee_number}</div></td>
                  <td className="px-3 py-2 text-xs"><div className="font-bold text-slate-700">{r.job_title ?? '—'}</div><div className="text-slate-400">{r.department}</div></td>
                  <td className="px-3 py-2 text-center text-xs">{r.shift ?? '—'}</td>
                  <td className="px-3 py-2 text-center text-xs font-bold tabular-nums" dir="ltr">{r.vehicle ?? '—'}</td>
                  <td className="px-3 py-2 text-center text-xs">{r.contract_type === 'daily' ? 'يومي' : 'شهري'}</td>
                  <td className="px-3 py-2 text-center text-xs tabular-nums" dir="ltr">{r.month.present}/{r.month.working_days}</td>
                  <td className="px-3 py-2 text-center"><span className={clsx('inline-block min-w-7 rounded-md px-1.5 py-0.5 text-[11px] font-black', r.month.absent ? 'bg-red-100 text-red-700' : 'text-slate-400')}>{r.month.absent}</span></td>
                  <td className="px-3 py-2 text-center"><span className={clsx('inline-block min-w-7 rounded-md px-1.5 py-0.5 text-[11px] font-black', r.month.late ? 'bg-amber-100 text-amber-800' : 'text-slate-400')}>{r.month.late}</span></td>
                  <td className="px-3 py-2 text-center"><span className={clsx('inline-block min-w-7 rounded-md px-1.5 py-0.5 text-[11px] font-black', r.open_disclosures ? 'bg-violet-100 text-violet-700' : 'text-slate-400')}>{r.open_disclosures}</span></td>
                  <td className="px-3 py-2 text-center"><span className={clsx('rounded-md px-2 py-0.5 text-[10px] font-black ring-1', STATUS[r.employment_status].cls)}>{STATUS[r.employment_status].label}</span></td>
                  <td className="px-3 py-2 text-xs" dir="ltr">{r.phone ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-slate-400">الرواتب والاستحقاقات لدى الشؤون المالية فقط · رقم البصمة والسماحيات والبيانات الشخصية لدى الموارد البشرية فقط · الحضور حسب الشهر المختار حتى اليوم.</p>
    </div>
  )
}
