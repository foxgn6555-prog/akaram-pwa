/**
 * بوابة مدير القسم — «إجازات فريقي» (00144)
 * صندوق الموافقات: طلبات موظفيه المباشرين (المدير المباشر حصراً يبتّ) · سجل الفريق · تنبيهات الفريق · طلباتي (المدير موظف أيضاً).
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { useHrAlerts, useHrPolicy, useLeaveBalance, useLeaveRequests, useMyEmployee } from '@features/hr'
import { StatCard } from '@portals/hr/components/hr-ui'
import { field, isoDay, monthStart } from '@portals/hr/components/hr-format'
import { AlertsTable, BalanceCard, LeaveRequestForm, LeaveRequestsTable } from '@portals/hr/components/leaves/LeaveShared'
import { EmptyState } from '@components/feedback/EmptyState'

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
      <header>
        <h1 className="text-xl font-black">إجازات فريقي</h1>
        <p className="text-xs text-slate-500">أنت المعتمد الوحيد لطلبات موظفيك المباشرين ({me?.reports_count ?? 0} موظف) · الرفض يتطلب سبباً يصل إلى الموظف</p>
      </header>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard title="بانتظار قرارك" value={inbox.length} tone={inbox.length ? 'amber' : 'emerald'} testId="tl-inbox-count" />
        <StatCard title="في إجازة اليوم" value={onLeaveToday} tone="sky" testId="tl-today" />
        <StatCard title="تنبيهات الفريق" value={alerts.length} tone={alerts.length ? 'red' : 'slate'} testId="tl-alerts-count" />
        <StatCard title="رصيدي المتبقي" value={balance ? Number(balance.remaining) : '—'} hint="يوم" tone="violet" testId="tl-my-balance" />
      </div>
      <nav className="flex gap-1 rounded-xl bg-slate-100 p-1 text-xs font-bold">
        {([['inbox', `صندوق الموافقات (${inbox.length})`], ['history', 'سجل الفريق'], ['alerts', 'تنبيهات الفريق'], ['mine', 'طلباتي']] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={clsx('rounded-lg px-3 py-1.5', tab === k ? 'bg-white text-brand-700 shadow' : 'text-slate-600')} data-testid={`tl-tab-${k}`}>{l}</button>
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
              {me.manager_id ? <LeaveRequestForm employeeId={me.id} balance={balance} permitMaxMinutes={policy?.permit_max_minutes} testId="tl-form" />
                : <p className="rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-800" data-testid="tl-no-manager">لا يوجد مدير مباشر مسجّل لك — لا يمكن إرسال طلب حتى تحدده الموارد البشرية</p>}
              <LeaveRequestsTable rows={mine} isLoading={mineLoading} mode="employee" showEmployee={false} testId="tl-mine-table" />
            </>
          )}
        </div>
      )}
    </div>
  )
}
