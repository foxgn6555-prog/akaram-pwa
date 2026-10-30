/**
 * طلبات الإجازة — غرفة العمليات (00239).
 * غرفة العمليات تقدّم طلب إجازة/زمنية نيابةً عن أي موظف في ملاك الموارد البشرية (حتى من لا حساب له أو لا بصمة).
 * الطلب يدخل سلسلة الموافقات الاعتيادية لذلك الموظف كما لو قدّمه بنفسه؛ غرفة العمليات لا تعتمد ولا ترفض،
 * وتستطيع إلغاء ما أدخلته وهو معلّق. كل من في السلسلة يرى وسم «قُدِّم عبر غرفة العمليات» ويُعلَم الموظف نفسه.
 */
import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { useHrPolicy, useLeaveBalance, useLeaveRequests, useOpsLeaveEmployeeLookup, useOpsLeavesSummary } from '@features/hr'
import type { LeaveRequestRow, OpsLeaveEmployee } from '@features/hr'
import { ExecPageHeader, HeaderButton } from '@components/executive/ExecPageHeader'
import { BalanceCard, LeaveRequestForm, LeaveRequestsTable } from '@portals/hr/components/leaves/LeaveShared'
import { LEAVE_STATUS_LABELS } from '@portals/hr/components/leaves/leaveUtils'
import { field, isoDay, monthStart } from '@portals/hr/components/hr-format'
import { disclosureErrorMessage } from '@sdk/disclosures-unit.sdk'
import { ChainPreview } from '@components/approvals/ChainPreview'

type Tab = 'ops' | 'pending' | 'all'
const n = (v: number) => v.toLocaleString('en-US')

function useDebounced(value: string, ms = 250) {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}

export default function OpsLeavesPage() {
  const [tab, setTab] = useState<Tab>('ops')
  const [from, setFrom] = useState(monthStart(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)))
  const [to, setTo] = useState(isoDay(new Date(new Date().getFullYear(), new Date().getMonth() + 2, 0)))
  const [status, setStatus] = useState<'' | LeaveRequestRow['status']>('')
  const [search, setSearch] = useState('')
  const [onBehalf, setOnBehalf] = useState(false)
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<OpsLeaveEmployee | null>(null)
  const dq = useDebounced(q)
  const { data: summary, error: summaryError } = useOpsLeavesSummary()
  const { data: rows = [], isLoading, error } = useLeaveRequests({ scope: 'all', from, to, status: status || null, search })
  const { data: found = [], isFetching: searching } = useOpsLeaveEmployeeLookup(dq)
  const { data: balance } = useLeaveBalance(picked?.id ?? null)
  const { data: policy } = useHrPolicy()
  const viaOps = useMemo(() => rows.filter((r) => r.requested_via === 'ops_room'), [rows])
  const pending = useMemo(() => rows.filter((r) => r.status === 'pending'), [rows])
  const shown = tab === 'ops' ? viaOps : tab === 'pending' ? pending : rows
  const err = error ?? summaryError
  return (
    <div className="space-y-4" data-testid="ops-leaves-page">
      <ExecPageHeader icon="calendar" title="طلبات الإجازة" subtitle="تقديم طلب إجازة أو زمنية نيابةً عن أي موظف في الملاك — يمرّ الطلب بسلسلة الموافقات المعتمدة من التطوير المركزية كما لو قدّمه الموظف بنفسه."
        stats={[
          { label: 'قدّمتها غرفة العمليات (معلّقة)', value: summary ? n(summary.via_ops_pending) : '…', tone: summary?.via_ops_pending ? 'gold' : 'plain' },
          { label: 'قدّمتها غرفة العمليات هذا الشهر', value: summary ? n(summary.via_ops_month) : '…', tone: 'plain' },
          { label: 'كل المعلّقة', value: summary ? n(summary.pending) : '…', tone: 'plain' },
          { label: 'في إجازة اليوم', value: summary ? n(summary.on_leave_today) : '…', tone: 'plain' },
        ]}
        actions={<HeaderButton onClick={() => setOnBehalf((v) => !v)} icon="user-plus" testId="ol-on-behalf">{onBehalf ? 'إغلاق النموذج' : '+ طلب نيابة عن موظف'}</HeaderButton>} />

      {err && <p role="alert" className="rounded-2xl bg-red-50 p-3 text-xs font-bold text-red-700">{disclosureErrorMessage(err)}</p>}

      {onBehalf && (
        <div className="space-y-2 rounded-2xl border border-[#0b3d6b]/20 bg-[#0b3d6b]/[0.03] p-3" data-testid="ol-behalf-panel">
          <label className="block text-xs font-semibold text-slate-600">الموظف (ابحث بالاسم أو الرقم الوظيفي — كل الملاك)
            <input className={clsx(field, 'mt-1')} value={q} onChange={(e) => { setQ(e.target.value); setPicked(null) }} placeholder="اكتب حرفين على الأقل…" data-testid="ol-emp-search" />
          </label>
          {!picked && dq.trim().length >= 2 && (
            <ul className="max-h-56 divide-y divide-slate-100 overflow-auto rounded-xl border border-slate-200 bg-white" data-testid="ol-emp-results">
              {searching && found.length === 0 && <li className="p-2 text-xs text-slate-500">جارٍ البحث…</li>}
              {!searching && found.length === 0 && <li className="p-2 text-xs text-slate-500">لا نتائج</li>}
              {found.map((e) => (
                <li key={e.id}>
                  <button type="button" className="flex w-full items-center justify-between gap-2 p-2 text-start text-xs hover:bg-slate-50" onClick={() => { setPicked(e); setQ(e.full_name) }} data-testid={`ol-emp-${e.employee_number}`}>
                    <span><b>{e.full_name}</b> <span className="text-slate-500">· {e.employee_number}{e.department_name ? ` · ${e.department_name}` : ''}{e.job_title ? ` · ${e.job_title}` : ''}</span></span>
                    <span className="flex shrink-0 gap-1">
                      {!e.has_account && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">بلا حساب</span>}
                      {!e.has_biometric && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">بلا بصمة</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {picked && (
            <div className="rounded-xl border border-slate-200 bg-white p-2 text-xs" data-testid="ol-picked">
              <p><b>{picked.full_name}</b> · {picked.employee_number}{picked.department_name ? ` · ${picked.department_name}` : ''}</p>
              <p className="text-slate-500">المدير المباشر: {picked.manager_name ?? <span className="font-bold text-amber-700">غير محدد</span>}</p>
              {/* 00391: معاينة مسار الموافقة الفعلي قبل الإرسال (سلسلة القسم/الدور أو المدير) وسبب غيابه */}
              <div className="mt-2"><ChainPreview employeeId={picked.id} type="leave" testId="ol-chain" /></div>
            </div>
          )}
          {picked && <BalanceCard balance={balance} compact testId="ol-behalf-balance" />}
          {picked && <LeaveRequestForm employeeId={picked.id} balance={balance} permitMaxMinutes={policy?.permit_max_minutes} onDone={() => { setOnBehalf(false); setPicked(null); setQ('') }} testId="ol-behalf-form" />}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="inline-flex rounded-xl border border-slate-200 p-0.5" role="tablist">
          {([['ops', `قدّمتها غرفة العمليات (${viaOps.length})`], ['pending', `المعلّقة (${pending.length})`], ['all', 'كل الطلبات']] as const).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={clsx('h-8 rounded-lg px-3 text-xs font-black', tab === k ? 'bg-[#0b3d6b] text-white' : 'text-slate-600 hover:bg-slate-50')} data-testid={`ol-tab-${k}`}>{l}</button>
          ))}
        </div>
        <input type="date" dir="ltr" className={clsx(field, 'w-auto')} value={from} onChange={(e) => setFrom(e.target.value)} data-testid="ol-from" aria-label="من" />
        <input type="date" dir="ltr" className={clsx(field, 'w-auto')} value={to} onChange={(e) => setTo(e.target.value)} data-testid="ol-to" aria-label="إلى" />
        <select className={clsx(field, 'w-auto')} value={status} onChange={(e) => setStatus(e.target.value as '' | LeaveRequestRow['status'])} data-testid="ol-status">
          <option value="">كل الحالات</option>{(Object.keys(LEAVE_STATUS_LABELS) as LeaveRequestRow['status'][]).map((s) => <option key={s} value={s}>{LEAVE_STATUS_LABELS[s]}</option>)}
        </select>
        <input className={clsx(field, 'flex-1 min-w-[180px]')} placeholder="اسم / رقم وظيفي" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="ol-search" />
      </div>

      <LeaveRequestsTable rows={shown} isLoading={isLoading} mode="ops" testId={`ol-${tab}`} />
      <p className="text-[11px] text-slate-400">غرفة العمليات تقدّم الطلب فقط — الموافقة/الرفض لمن حدّدته سلسلة الموافقات · الإلغاء للطلبات المعلّقة التي أدخلتها غرفة العمليات · الأرصدة والسياسات تُدار من الموارد البشرية</p>
    </div>
  )
}
