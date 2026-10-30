/**
 * بوابة الموظف — «طلباتي» (00144)
 * رصيد الإجازات الحي · طلب إجازة/زمنية يُرسل حسب سلسلة الموافقات المضبوطة لدورك (00160) أو إلى المدير المباشر إن لم توجد سلسلة
 * · سجل طلباتي مع إلغاء المعلّق أو المعتمد المستقبلي. تُستخدم في بوابة الموظف وبوابة مسؤول القاطع.
 */
import { useHrPolicy, useLeaveBalance, useLeaveRequests, useMyEmployee } from '@features/hr'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { BalanceCard, LeaveRequestForm, LeaveRequestsTable } from '@portals/hr/components/leaves/LeaveShared'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'

export default function MyRequests() {
  const { data: me, isLoading: meLoading } = useMyEmployee()
  const { data: policy } = useHrPolicy()
  const { data: balance, isLoading: balLoading } = useLeaveBalance(me?.id)
  const { data: rows = [], isLoading } = useLeaveRequests({ scope: 'mine' }, !!me)
  if (meLoading) return <LoadingSpinner />
  if (!me) return <EmptyState title="حسابك غير مرتبط بسجل موظف" hint="اطلب من الموارد البشرية ربط حسابك لتظهر أرصدتك وطلباتك" />
  return (
    <div className="space-y-4" data-testid="my-requests">
      <ExecPageHeader icon="calendar" title="طلباتي" subtitle={<>{me.full_name} · {me.job_title ?? ''}{me.department_name ? ` · ${me.department_name}` : ''} · المدير المباشر: <b data-testid="my-manager">{me.manager_name ?? 'غير محدد'}</b> — يمر طلبك بسلسلة الموافقات المضبوطة لدورك (إن وُجدت)، وإلا يذهب إلى مديرك المباشر.</>} />
      <BalanceCard balance={balance} isLoading={balLoading} testId="my-balance" />
      {!me.manager_id && <p className="rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-800" data-testid="my-no-manager">لا يوجد مدير مباشر مسجّل لك — يُقبل طلبك إن كانت لقسمك أو لدورك سلسلة موافقات؛ اختر نوع الطلب لترى مسار الموافقة الفعلي وسبب غيابه إن وُجد.</p>}
      <LeaveRequestForm employeeId={me.id} balance={balance} permitMaxMinutes={policy?.permit_max_minutes} testId="my-form" />
      <LeaveRequestsTable rows={rows} isLoading={isLoading} mode="employee" showEmployee={false} testId="my-req" />
    </div>
  )
}
