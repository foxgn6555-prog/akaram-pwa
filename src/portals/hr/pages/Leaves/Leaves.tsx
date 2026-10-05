/**
 * بوابة الموارد البشرية — وحدة «الإجازات والزمنيات» (00144)
 * تبويبات: الطلبات (كل الموظفين، فلاتر، إدخال نيابة عن موظف) · الأرصدة (منحة سنوية لكل موظف + تسويات بسبب + دفتر الحركات)
 * · التنبيهات (تكرار تأخير/نقص/غياب) · المعتمد (جدول التصدير القديم). الموافقة تبقى للمدير المباشر حصراً.
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { useDepartments } from '@features/departments'
import {
  useAdjustBalance, useHrAlerts, useHrEmployees, useHrLeaves, useHrPolicy, useLeaveBalance, useLeaveLedger, useLeaveRequests, useLeavesDashboard, useSetGrant,
} from '@features/hr'
import type { LeaveRequestRow } from '@features/hr'
import { Button } from '@components/ui'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { StatCard } from '../../components/hr-ui'
import { field, hhmm, isoDay, monthStart } from '../../components/hr-format'
import { ExportButton } from '../../components/ExportButton'
import { exportToExcel, leavesSpec } from '@features/hr/lib/hrExcel'
import { AlertsTable, BalanceCard, LeaveRequestForm, LeaveRequestsTable } from '../../components/leaves/LeaveShared'
import { LEAVE_STATUS_LABELS } from '../../components/leaves/leaveUtils'

type Tab = 'requests' | 'balances' | 'alerts' | 'approved'
const LEDGER_LABELS: Record<string, string> = { grant: 'منحة سنوية', adjust: 'تسوية HR', consume: 'إجازة', permit: 'زمنية', overtime: 'دوام إضافي', carry_over: 'مرحّل', reversal: 'إرجاع (إلغاء)' }

export default function Leaves() {
  const [tab, setTab] = useState<Tab>('requests')
  const { data: dash } = useLeavesDashboard()
  return (
    <div className="space-y-4" data-testid="hr-leaves">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-black">الإجازات والزمنيات</h1>
          <p className="text-xs text-slate-500">الطلبات تُرسل من حساب الموظف ويبتّ فيها مديره المباشر حصراً · HR تدير الأرصدة وتُدخل الطلبات نيابةً عند الحاجة</p>
        </div>
      </header>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard title="طلبات بانتظار المدراء" value={dash?.pending ?? 0} tone="amber" testId="lv-dash-pending" />
        <StatCard title="في إجازة اليوم" value={dash?.approved_today ?? 0} tone="sky" testId="lv-dash-today" />
        <StatCard title="زمنيات معتمدة هذا الشهر" value={dash?.permits_this_month ?? 0} tone="violet" testId="lv-dash-permits" />
        <StatCard title="تنبيهات مفتوحة" value={dash?.open_alerts ?? 0} tone={dash?.open_alerts ? 'red' : 'emerald'} testId="lv-dash-alerts" />
      </div>
      <nav className="flex gap-1 rounded-xl bg-slate-100 p-1 text-xs font-bold">
        {([['requests', 'الطلبات'], ['balances', 'الأرصدة'], ['alerts', 'التنبيهات'], ['approved', 'المعتمد (تصدير)']] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={clsx('rounded-lg px-3 py-1.5', tab === k ? 'bg-white text-brand-700 shadow' : 'text-slate-600')} data-testid={`lv-tab-${k}`}>{l}</button>
        ))}
      </nav>
      {tab === 'requests' && <RequestsTab />}
      {tab === 'balances' && <BalancesTab />}
      {tab === 'alerts' && <AlertsTab />}
      {tab === 'approved' && <ApprovedTab />}
    </div>
  )
}

function RequestsTab() {
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(isoDay(new Date(new Date().getFullYear(), new Date().getMonth() + 2, 0)))
  const [status, setStatus] = useState<'' | LeaveRequestRow['status']>('')
  const [departmentId, setDepartmentId] = useState('')
  const [search, setSearch] = useState('')
  const [onBehalf, setOnBehalf] = useState(false)
  const [employeeId, setEmployeeId] = useState('')
  const { data: departments = [] } = useDepartments()
  const { data: employees = [] } = useHrEmployees({ status: 'active' })
  const { data: rows = [], isLoading } = useLeaveRequests({ scope: 'all', from, to, status: status || null, departmentId: departmentId || null, search })
  const { data: balance } = useLeaveBalance(employeeId || null)
  const { data: policy } = useHrPolicy()
  return (
    <div className="space-y-3" data-testid="lv-requests-tab">
      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-3 lg:grid-cols-6">
        <input type="date" className={field} value={from} onChange={(e) => setFrom(e.target.value)} data-testid="lv-from" />
        <input type="date" className={field} value={to} onChange={(e) => setTo(e.target.value)} data-testid="lv-to" />
        <select className={field} value={status} onChange={(e) => setStatus(e.target.value as '' | LeaveRequestRow['status'])} data-testid="lv-status"><option value="">كل الحالات</option>{(Object.keys(LEAVE_STATUS_LABELS) as LeaveRequestRow['status'][]).map((s) => <option key={s} value={s}>{LEAVE_STATUS_LABELS[s]}</option>)}</select>
        <select className={field} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} data-testid="lv-dept"><option value="">كل الأقسام</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <input className={field} placeholder="اسم / رقم وظيفي" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="lv-search" />
        <Button size="sm" variant={onBehalf ? 'secondary' : 'primary'} onClick={() => setOnBehalf((v) => !v)} data-testid="lv-on-behalf">{onBehalf ? 'إغلاق النموذج' : '+ طلب نيابة عن موظف'}</Button>
      </div>
      {onBehalf && (
        <div className="space-y-2 rounded-2xl border border-brand-200 bg-brand-50/30 p-3" data-testid="lv-behalf-panel">
          <label className="block text-xs font-semibold text-slate-600">الموظف
            <select className={clsx(field, 'mt-1')} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} data-testid="lv-behalf-emp">
              <option value="">— اختر الموظف —</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.full_name} · {e.employee_number}</option>)}
            </select>
          </label>
          {employeeId && <BalanceCard balance={balance} compact testId="lv-behalf-balance" />}
          {employeeId && <LeaveRequestForm employeeId={employeeId} balance={balance} permitMaxMinutes={policy?.permit_max_minutes} onDone={() => setOnBehalf(false)} testId="lv-behalf-form" />}
        </div>
      )}
      <LeaveRequestsTable rows={rows} isLoading={isLoading} mode="hr" />
    </div>
  )
}

function BalancesTab() {
  const year = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState(year)
  const [search, setSearch] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const { data: employees = [] } = useHrEmployees({ status: 'active' })
  const shown = useMemo(() => employees.filter((e) => !search || e.full_name.includes(search) || e.employee_number.includes(search)).slice(0, 200), [employees, search])
  const { data: balance, isLoading } = useLeaveBalance(employeeId || null, selectedYear)
  const { data: ledger = [] } = useLeaveLedger(employeeId || null, selectedYear)
  const setGrant = useSetGrant(); const adjust = useAdjustBalance()
  const [grantDays, setGrantDays] = useState('')
  const [adjDays, setAdjDays] = useState('')
  const [adjReason, setAdjReason] = useState('')
  const selected = employees.find((e) => e.id === employeeId)
  return (
    <div className="grid gap-3 lg:grid-cols-[18rem_1fr]" data-testid="lv-balances-tab">
      <aside className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <input className={field} placeholder="ابحث عن موظف" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="bal-search" />
        <select className={field} value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} data-testid="bal-year">{[year + 1, year, year - 1].map((y) => <option key={y} value={y}>{y}</option>)}</select>
        <ul className="max-h-[28rem] divide-y divide-slate-100 overflow-y-auto text-sm">
          {shown.map((e) => <li key={e.id}><button type="button" className={clsx('w-full px-2 py-1.5 text-start hover:bg-slate-50', employeeId === e.id && 'bg-brand-50 font-bold text-brand-700')} onClick={() => { setEmployeeId(e.id); setGrantDays('') }} data-testid={`bal-emp-${e.employee_number}`}>{e.full_name}<span className="block text-[10px] text-slate-500">{e.employee_number}{e.biometric_pin ? '' : ' · بلا بصمة'}</span></button></li>)}
        </ul>
      </aside>
      <div className="space-y-3">
        {!employeeId ? <EmptyState title="اختر موظفاً" hint="لعرض رصيده السنوي وتعديله" /> : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-black">{selected?.full_name} · {selectedYear}</h2>{selected && !selected.biometric_pin && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">بلا رقم بصمة — لا يُحتسب حضوره</span>}</div>
            <BalanceCard balance={balance} isLoading={isLoading} testId="bal-card" />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <p className="text-xs font-bold">المنحة السنوية لهذا الموظف</p>
                <p className="mb-2 text-[11px] text-slate-500">تستبدل الافتراضي من السياسة ({balance ? Number(balance.granted) : '—'} حالياً)</p>
                <div className="flex gap-2"><input type="number" min={0} max={365} className={field} placeholder="أيام" value={grantDays} onChange={(e) => setGrantDays(e.target.value)} data-testid="bal-grant-days" />
                  <Button size="sm" disabled={grantDays === '' || Number(grantDays) < 0} isLoading={setGrant.isPending} onClick={() => setGrant.mutate({ employeeId, year: selectedYear, days: Number(grantDays) }, { onSuccess: () => setGrantDays('') })} data-testid="bal-grant-save">حفظ</Button></div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <p className="text-xs font-bold">تسوية (+ / −) بسبب إلزامي</p>
                <p className="mb-2 text-[11px] text-slate-500">مثال: +2 مكافأة، −1 تصحيح خطأ</p>
                <div className="grid grid-cols-[6rem_1fr_auto] gap-2"><input type="number" step={0.5} className={field} placeholder="±أيام" value={adjDays} onChange={(e) => setAdjDays(e.target.value)} data-testid="bal-adj-days" />
                  <input className={field} placeholder="السبب" value={adjReason} onChange={(e) => setAdjReason(e.target.value)} data-testid="bal-adj-reason" />
                  <Button size="sm" disabled={!adjDays || Number(adjDays) === 0 || adjReason.trim().length < 3} isLoading={adjust.isPending} onClick={() => adjust.mutate({ employeeId, year: selectedYear, days: Number(adjDays), reason: adjReason.trim() }, { onSuccess: () => { setAdjDays(''); setAdjReason('') } })} data-testid="bal-adj-save">تسجيل</Button></div>
              </div>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-xs" data-testid="bal-ledger">
                <thead className="bg-slate-50 text-slate-600"><tr><th className="p-2">التاريخ</th><th className="p-2">الحركة</th><th className="p-2">الأيام</th><th className="p-2 text-start">البيان</th></tr></thead>
                <tbody>{ledger.length === 0 ? <tr><td colSpan={4} className="p-3 text-center text-slate-400">لا حركات</td></tr> : ledger.map((l) => (
                  <tr key={l.id} className="border-t border-slate-100" data-testid={`ledger-${l.kind}`}>
                    <td className="p-2 text-center">{new Date(l.created_at).toLocaleDateString('ar-IQ-u-nu-latn')}</td>
                    <td className="p-2 text-center">{LEDGER_LABELS[l.kind] ?? l.kind}</td>
                    <td className={clsx('p-2 text-center font-bold tabular-nums', Number(l.days) < 0 ? 'text-red-700' : 'text-emerald-700')}>{Number(l.days) > 0 ? '+' : ''}{Number(l.days)}</td>
                    <td className="p-2">{l.note}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function AlertsTab() {
  const [month, setMonth] = useState<string>('')
  const [onlyOpen, setOnlyOpen] = useState(true)
  const { data: alerts = [], isLoading } = useHrAlerts(month || null, onlyOpen)
  return (
    <div className="space-y-3" data-testid="lv-alerts-tab">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <input type="month" className={clsx(field, 'w-44')} value={month ? month.slice(0, 7) : ''} onChange={(e) => setMonth(e.target.value ? `${e.target.value}-01` : '')} data-testid="al-month" />
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} data-testid="al-open" /> المفتوحة فقط</label>
        <span className="ms-auto text-[11px] text-slate-500">العتبات تُضبط من بوابة التطوير المركزية → سياسة الحضور والإجازات</span>
      </div>
      <AlertsTable alerts={alerts} isLoading={isLoading} />
    </div>
  )
}

function ApprovedTab() {
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
    <div className="space-y-3" data-testid="lv-approved-tab">
      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-3 lg:grid-cols-6" data-testid="leave-filters">
        <input type="date" className={field} value={from} onChange={(e) => setFrom(e.target.value)} data-testid="lva-from" />
        <input type="date" className={field} value={to} onChange={(e) => setTo(e.target.value)} data-testid="lva-to" />
        <select className={field} value={kind} onChange={(e) => setKind(e.target.value as '' | 'leave' | 'time_permit')} data-testid="lv-kind"><option value="">إجازات وزمنيات</option><option value="leave">إجازات فقط</option><option value="time_permit">زمنيات فقط</option></select>
        <select className={field} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} data-testid="lva-dept"><option value="">كل الأقسام</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <input className={field} placeholder="اسم / رقم وظيفي" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="lva-search" />
        <ExportButton disabled={rows.length === 0} testId="lv-export" onExport={() => exportToExcel(leavesSpec(rows, [['من', from], ['إلى', to], ['النوع', kind === 'leave' ? 'إجازات' : kind === 'time_permit' ? 'زمنيات' : ''], ['القسم', departments.find((d) => d.id === departmentId)?.name ?? ''], ['بحث', search]]))} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <StatCard title="إجازات معتمدة" value={rows.filter((l) => l.kind === 'leave').length} tone="sky" testId="lv-stat-leaves" />
        <StatCard title="أيام الإجازة" value={days} testId="lv-stat-days" />
        <StatCard title="زمنيات معتمدة" value={rows.filter((l) => l.kind === 'time_permit').length} tone="violet" testId="lv-stat-permits" />
      </div>
      {isLoading ? <LoadingSpinner /> : rows.length === 0 ? <EmptyState title="لا إجازات أو زمنيات معتمدة في هذا النطاق" /> : (
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
