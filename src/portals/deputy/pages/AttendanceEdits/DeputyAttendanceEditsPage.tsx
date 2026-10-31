/**
 * معاون المدير المفوض — «تعديلات الحضور» (00397-ج)
 *   · المؤشرات الشهرية: عدد التعديلات (مباشر ÷ بالطلب)، الموظفون المتأثرون، أيام العمل، الدقائق المصحّحة، حسب النوع، أكثر الطالبين.
 *   · السجل الكامل (غرفة العمليات + الموارد البشرية + المعاون) مع التفاصيل قبل/بعد ومسار الموافقات.
 *   · «تراجع» عن أي طلب منفَّذ بسبب موثّق — كل يوم يعود إلى ما كان عليه.
 *   · «تعديل مباشر»: المعاون ينفّذ بنفسه (لا يرسل طلباً إلى HR).
 */
import { useState } from 'react'
import clsx from 'clsx'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import { Button } from '@components/ui'
import { Icon } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { StatCard, MonthPicker } from '@portals/hr/components/hr-ui'
import { monthStart } from '@portals/hr/components/hr-format'
import { ATTENDANCE_EDIT_ACTION_LABELS, useAttendanceEditList, useAttendanceEditRevert, useAttendanceEditStats, type AttendanceEditAction, type AttendanceEditStats } from '@features/attendance-edits'
import { ListFilters, ReasonDialog, RequestDetailDialog, RequestsTable, useListFilters } from '@features/attendance-edits/components/AttendanceEditShared'
import { BulkEditPanel } from '@portals/ops-room/pages/Attendance/BulkEditPanel'

type Tab = 'log' | 'direct'

export default function DeputyAttendanceEditsPage() {
  const [tab, setTab] = useState<Tab>('log')
  const [month, setMonth] = useState(monthStart())
  const [openId, setOpenId] = useState<string | null>(null)
  const [revertId, setRevertId] = useState<string | null>(null)
  const { data: stats } = useAttendanceEditStats(month)
  const { f, setF, query } = useListFilters()
  const { data: rows = [], isLoading } = useAttendanceEditList(query, tab === 'log')
  const revert = useAttendanceEditRevert()

  return (
    <div className="space-y-4" data-testid="deputy-attendance-edits">
      <ExecPageHeader icon="calendar" title="تعديلات الحضور" subtitle="كل تعديل جماعي على الحضور — من غرفة العمليات مباشرة أو عبر الموارد البشرية — يظهر هنا بقبل/بعد، ويمكنك التراجع عنه أو تنفيذ تعديل بنفسك." />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonthPicker value={month} onChange={setMonth} testId="ae-month" />
        <nav className="flex gap-1 rounded-xl bg-slate-100 p-1 text-xs font-bold" aria-label="أقسام">
          {([['log', 'السجل والمؤشرات'], ['direct', 'تعديل مباشر']] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={clsx('rounded-lg px-3 py-1.5', tab === k ? 'bg-white text-brand-700 shadow' : 'text-slate-600')} data-testid={`ae-tab-${k}`} aria-pressed={tab === k}>{l}</button>
          ))}
        </nav>
      </div>

      {tab === 'log' && (
        <>
          <StatsBlock s={stats} />
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold">السجل</h3><ListFilters f={f} setF={setF} /></div>
          {isLoading ? <LoadingSpinner /> : <RequestsTable rows={rows} onOpen={(r) => setOpenId(r.id)} extra={(r) => r.can_revert ? <Button size="sm" variant="danger" onClick={() => setRevertId(r.id)} data-testid={`ae-revert-${r.id}`}><Icon name="refresh" size={14} /> تراجع</Button> : null} />}
        </>
      )}
      {tab === 'direct' && <BulkEditPanel canRequest={false} />}

      {openId && <RequestDetailDialog id={openId} onClose={() => setOpenId(null)} footer={(d) => d.can_revert ? <Button size="sm" variant="danger" onClick={() => { setRevertId(d.id); setOpenId(null) }} data-testid="ae-detail-revert"><Icon name="refresh" size={14} /> تراجع عن هذا التعديل</Button> : null} />}
      {revertId && <ReasonDialog title="التراجع عن تعديل الحضور" cta="تراجع الآن" testId="ae-revert-dialog" tone="danger" busy={revert.isPending} onClose={() => setRevertId(null)} onConfirm={(reason) => revert.mutate({ id: revertId, reason }, { onSuccess: () => setRevertId(null) })} />}
    </div>
  )
}

export function StatsBlock({ s }: { s: AttendanceEditStats | undefined }) {
  return (
    <div className="space-y-2" data-testid="ae-stats">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard title="تعديلات نُفّذت" value={s?.total ?? 0} hint={s ? `${s.direct} مباشر · ${s.by_request} بالطلب` : undefined} tone="slate" testId="ae-st-total" />
        <StatCard title="موظفون تأثروا" value={s?.employees ?? 0} hint={s ? `${s.work_days} يوم عمل` : undefined} tone="sky" testId="ae-st-employees" />
        <StatCard title="دقائق صُحّحت" value={s?.minutes_fixed ?? 0} tone="emerald" testId="ae-st-minutes" />
        <StatCard title="معلّق / مرفوض / مُتراجَع" value={`${s?.pending_approval ?? 0} / ${s?.rejected ?? 0} / ${s?.reverted ?? 0}`} hint={s?.awaiting_hr ? `${s.awaiting_hr} لدى الموارد البشرية` : undefined} tone={s?.reverted ? 'violet' : 'slate'} testId="ae-st-flow" />
      </div>
      {s && (Object.keys(s.by_action).length > 0 || s.top_requesters.length > 0) && (
        <div className="flex flex-wrap gap-2 text-[11px]">
          {(Object.entries(s.by_action) as [AttendanceEditAction, number][]).map(([a, n]) => <span key={a} className="rounded-full bg-slate-100 px-2 py-0.5">{ATTENDANCE_EDIT_ACTION_LABELS[a] ?? a}: <b>{n}</b></span>)}
          {s.top_requesters.map((r, i) => <span key={i} className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800" data-testid={`ae-top-${i}`}>{r.name ?? '—'}: <b>{r.n}</b></span>)}
        </div>
      )}
    </div>
  )
}
