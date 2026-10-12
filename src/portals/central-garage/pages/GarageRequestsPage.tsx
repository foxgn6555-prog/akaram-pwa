/**
 * طلبات موظفي الكراج (00208) — الإجازات والزمنيات لموظفي قسم الكراج وفروعه.
 * الكراج يُدخل الطلب نيابةً عن موظفه (يذهب إلى سلسلة الموافقات/المدير المباشر كما هي)، يتابع الحالة، يلغي ما أدخله وهو معلّق،
 * ويبتّ فقط إن كان هو المعتمد وفق سلاسل التطوير المركزية. لا رواتب ولا بيانات حساسة.
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { useGarageEmployees, useGarageLeavesSummary } from '@features/central-garage/hooks'
import { useHrPolicy, useLeaveBalance, useLeaveRequests } from '@features/hr'
import type { LeaveRequestRow } from '@features/hr'
import { ExecPageHeader, HeaderButton } from '@components/executive/ExecPageHeader'
import { BalanceCard, LeaveRequestForm, LeaveRequestsTable } from '@portals/hr/components/leaves/LeaveShared'
import { LEAVE_STATUS_LABELS } from '@portals/hr/components/leaves/leaveUtils'
import { field, isoDay, monthStart } from '@portals/hr/components/hr-format'
import { disclosureErrorMessage } from '@sdk/disclosures-unit.sdk'

type Tab = 'inbox' | 'all'
const n = (v: number) => v.toLocaleString('en-US')

export interface DeptRequestsPageProps { title?: string; dept?: string; testId?: string }
/** صفحة مشتركة بنطاق القسم — الكراج افتراضياً؛ المحطة التحويلية (00212) تمرر عنوانها واسم جهتها. */
export default function GarageRequestsPage({ title = 'طلبات موظفي الكراج', dept = 'الكراج', testId = 'garage-requests-page' }: DeptRequestsPageProps = {}) {
  const [tab, setTab] = useState<Tab>('inbox')
  const [from, setFrom] = useState(monthStart(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)))
  const [to, setTo] = useState(isoDay(new Date(new Date().getFullYear(), new Date().getMonth() + 2, 0)))
  const [status, setStatus] = useState<'' | LeaveRequestRow['status']>('')
  const [search, setSearch] = useState('')
  const [onBehalf, setOnBehalf] = useState(false)
  const [employeeId, setEmployeeId] = useState('')
  const { data: summary, error: summaryError } = useGarageLeavesSummary()
  const { data: rows = [], isLoading, error } = useLeaveRequests({ scope: 'garage', from, to, status: status || null, search })
  const { data: employees } = useGarageEmployees('', '')
  const { data: balance } = useLeaveBalance(employeeId || null)
  const { data: policy } = useHrPolicy()
  const inbox = useMemo(() => rows.filter((r) => r.status === 'pending'), [rows])
  const err = error ?? summaryError
  return (
    <div className="space-y-4" data-testid={testId}>
      <ExecPageHeader icon="calendar" title={title} subtitle={`إجازات وزمنيات موظفي قسم ${dept} — الطلب يُرسل إلى سلسلة الموافقات المعتمدة من التطوير المركزية ويُسجَّل في الحضور تلقائياً عند الموافقة`}
        stats={[{ label: 'معلّقة', value: summary ? n(summary.pending) : '…', tone: summary?.pending ? 'gold' : 'plain' }, { label: 'بانتظار قرارك', value: summary ? n(summary.my_decisions) : '…', tone: summary?.my_decisions ? 'red' : 'green' }, { label: 'في إجازة اليوم', value: summary ? n(summary.on_leave_today) : '…' }, { label: 'زمنيات الشهر', value: summary ? n(summary.permits_month) : '…' }]}
        actions={<HeaderButton onClick={() => setOnBehalf((v) => !v)} icon="user-plus" testId="gr-on-behalf">{onBehalf ? 'إغلاق النموذج' : '+ طلب نيابة عن موظف'}</HeaderButton>} />

      {err && <p role="alert" className="rounded-2xl bg-red-50 p-3 text-xs font-bold text-red-700">{disclosureErrorMessage(err)}</p>}

      {onBehalf && (
        <div className="space-y-2 rounded-2xl border border-[#0b3d6b]/20 bg-[#0b3d6b]/[0.03] p-3" data-testid="gr-behalf-panel">
          <label className="block text-xs font-semibold text-slate-600">الموظف (من قسم {dept})
            <select className={clsx(field, 'mt-1')} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} data-testid="gr-behalf-emp">
              <option value="">— اختر الموظف —</option>
              {(employees?.rows ?? []).filter((e) => e.employment_status !== 'terminated').map((e) => <option key={e.id} value={e.id}>{e.full_name} · {e.employee_number}{e.is_driver ? ' · سائق' : ''}</option>)}
            </select>
          </label>
          {employeeId && <BalanceCard balance={balance} compact testId="gr-behalf-balance" />}
          {employeeId && <LeaveRequestForm employeeId={employeeId} balance={balance} permitMaxMinutes={policy?.permit_max_minutes} onDone={() => setOnBehalf(false)} testId="gr-behalf-form" />}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="inline-flex rounded-xl border border-slate-200 p-0.5" role="tablist">
          {([['inbox', `المعلّقة (${inbox.length})`], ['all', 'كل الطلبات']] as const).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={clsx('h-8 rounded-lg px-3 text-xs font-black', tab === k ? 'bg-[#0b3d6b] text-white' : 'text-slate-600 hover:bg-slate-50')} data-testid={`gr-tab-${k}`}>{l}</button>
          ))}
        </div>
        <input type="date" dir="ltr" className={clsx(field, 'w-auto')} value={from} onChange={(e) => setFrom(e.target.value)} data-testid="gr-from" aria-label="من" />
        <input type="date" dir="ltr" className={clsx(field, 'w-auto')} value={to} onChange={(e) => setTo(e.target.value)} data-testid="gr-to" aria-label="إلى" />
        {tab === 'all' && (
          <select className={clsx(field, 'w-auto')} value={status} onChange={(e) => setStatus(e.target.value as '' | LeaveRequestRow['status'])} data-testid="gr-status">
            <option value="">كل الحالات</option>{(Object.keys(LEAVE_STATUS_LABELS) as LeaveRequestRow['status'][]).map((s) => <option key={s} value={s}>{LEAVE_STATUS_LABELS[s]}</option>)}
          </select>
        )}
        <input className={clsx(field, 'flex-1 min-w-[180px]')} placeholder="اسم / رقم وظيفي" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="gr-search" />
      </div>

      <LeaveRequestsTable rows={tab === 'inbox' ? inbox : rows} isLoading={isLoading} mode="garage" testId={tab === 'inbox' ? 'gr-inbox' : 'gr-all'} />
      <p className="text-[11px] text-slate-400">الموافقة/الرفض لمن حدّدته سلسلة الموافقات فقط · الإلغاء للطلبات المعلّقة التي أدخلها الكراج · الأرصدة والسياسات تُدار من الموارد البشرية والتطوير المركزية.</p>
    </div>
  )
}
