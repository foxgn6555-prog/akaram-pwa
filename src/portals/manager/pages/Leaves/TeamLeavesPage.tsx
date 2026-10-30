/**
 * بوابة مدير القسم — «إجازات فريقي» (00144)
 * صندوق الموافقات: طلبات موظفيه المباشرين (المدير المباشر حصراً يبتّ) · سجل الفريق · تنبيهات الفريق · طلباتي (المدير موظف أيضاً).
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { useHrAlerts, useHrPolicy, useLeaveBalance, useLeaveRequests, useMyEmployee } from '@features/hr'
import { field, isoDay, monthStart } from '@portals/hr/components/hr-format'
import { AlertsTable, BalanceCard, LeaveRequestForm, LeaveRequestsTable } from '@portals/hr/components/leaves/LeaveShared'
import { EmptyState } from '@components/feedback/EmptyState'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'

type Tab = 'inbox' | 'history' | 'alerts' | 'mine'

export default function TeamLeavesPage() {
  const [tab, setTab] = useState<Tab>('inbox')
  const [from, setFrom] = useState(monthStart(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)))
  const [to, setTo] = useState(isoDay(new Date(new Date().getFullYear(), new Date().getMonth() + 2, 0)))
  const { data: me } = useMyEmployee()
  const { data: policy } = useHrPolicy()
  const { data: team = [], isLoading } = useLeaveRequests({ scope: 'team', from, to })
  const { data: mine = [], isLoading: mineLoading } = useLeaveRequests({ scope: 'mine' })
  const { data: alerts = [], isLoading: alertsLoading } = useHrAlerts(null, true)
  const { data: balance, isLoading: balLoading } = useLeaveBalance(me?.id)
  const inbox = useMemo(() => team.filter((r) => r.status === 'pending' && r.can_decide), [team])
  const onLeaveToday = useMemo(() => { const t = isoDay(); return team.filter((r) => r.status === 'approved' && r.start_date <= t && r.end_date >= t).length }, [team])

  return (
    <div className="space-y-4" data-testid="team-leaves">
      <ExecPageHeader icon="calendar" title="إجازات فريقي" subtitle={`أنت المعتمد الوحيد لطلبات موظفيك المباشرين (${me?.reports_count ?? 0} موظف) · الرفض يتطلب سبباً يصل إلى الموظف`} stats={[
        { label: 'بانتظار قرارك', value: inbox.length, tone: inbox.length ? 'gold' : 'green', testId: 'tl-inbox-count' },
        { label: 'في إجازة اليوم', value: onLeaveToday, tone: 'plain', testId: 'tl-today' },
        { label: 'تنبيهات الفريق', value: alerts.length, tone: alerts.length ? 'red' : 'plain', testId: 'tl-alerts-count' },
        { label: 'رصيدي المتبقي (يوم)', value: balance ? Number(balance.remaining) : '—', tone: 'gold', testId: 'tl-my-balance' },
      ]} />
      <nav className="flex gap-1 rounded-2xl border border-slate-200 bg-white p-1 text-xs font-black shadow-sm" role="tablist">
        {([['inbox', `صندوق الموافقات (${inbox.length})`], ['history', 'سجل الفريق'], ['alerts', 'تنبيهات الفريق'], ['mine', 'طلباتي']] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} role="tab" aria-selected={tab === k} className={clsx('h-9 rounded-xl px-3', tab === k ? 'bg-gradient-to-l from-[#0b3d6b] to-[#0b4f8a] text-white shadow' : 'text-slate-600 hover:bg-slate-100')} data-testid={`tl-tab-${k}`}>{l}</button>
        ))}
      </nav>
      {tab === 'inbox' && (inbox.length === 0 && !isLoading ? <EmptyState title="لا طلبات بانتظارك" hint="ستصلك إشعارات فور إرسال أي طلب من موظفيك المباشرين" /> : <LeaveRequestsTable rows={inbox} isLoading={isLoading} mode="manager" testId="tl-inbox" />)}
      {tab === 'history' && (
        <div className="space-y-2">
          <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
            <input type="date" className={field} value={from} onChange={(e) => setFrom(e.target.value)} data-testid="tl-from" />
            <input type="date" className={field} value={to} onChange={(e) => setTo(e.target.value)} data-testid="tl-to" />
          </div>
          <LeaveRequestsTable rows={team} isLoading={isLoading} mode="manager" testId="tl-history" />
        </div>
      )}
      {tab === 'alerts' && <AlertsTable alerts={alerts} isLoading={alertsLoading} testId="tl-alerts" />}
      {tab === 'mine' && (
        <div className="space-y-3" data-testid="tl-mine">
          {!me ? <EmptyState title="حسابك غير مرتبط بسجل موظف" hint="اطلب من الموارد البشرية ربط حسابك لتقديم طلباتك" /> : (
            <>
              <BalanceCard balance={balance} isLoading={balLoading} testId="tl-balance" />
              {/* 00391: بلا مدير مباشر قد تنطبق سلسلة القسم/الدور — النموذج يعرض مسار الموافقة الفعلي عند اختيار النوع */}
              {!me.manager_id && <p className="rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-800" data-testid="tl-no-manager">لا يوجد مدير مباشر مسجّل لك — يُقبل طلبك إن كانت لقسمك أو لدورك سلسلة موافقات؛ اختر نوع الطلب لترى مسار الموافقة.</p>}
              <LeaveRequestForm employeeId={me.id} balance={balance} permitMaxMinutes={policy?.permit_max_minutes} testId="tl-form" />
              <LeaveRequestsTable rows={mine} isLoading={mineLoading} mode="employee" showEmployee={false} testId="tl-mine-table" />
            </>
          )}
        </div>
      )}
    </div>
  )
}
