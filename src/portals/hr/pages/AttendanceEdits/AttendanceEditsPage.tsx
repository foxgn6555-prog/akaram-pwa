/**
 * الموارد البشرية — «طلبات تعديل الحضور» (00397-ب)
 *   · «بانتظار اعتمادي»: الطلبات التي اكتملت موافقاتها (أو بلا سلسلة) — HR تراجع البنود: تعديل حالة/أوقات بند، استبعاد بند بسبب، ثم «اعتماد وتنفيذ».
 *   · «السجل»: كل الطلبات (المباشرة من غرفة العمليات/المعاون وبالطلب) بفلاتر وتفاصيل قبل/بعد.
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { Button } from '@components/ui'
import { Icon } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import { useCanCall } from '@features/permissions/my-permissions'
import { ATTENDANCE_STATUS_LABELS, type AttendanceStatus } from '@features/hr'
import { StatCard } from '@portals/hr/components/hr-ui'
import { field } from '@portals/hr/components/hr-format'
import {
  composeBaghdad, hmBaghdad, useAttendanceEditHrApply, useAttendanceEditHrSkipItem, useAttendanceEditHrUpdateItem, useAttendanceEditList, useAttendanceEditStats,
  type AttendanceEditDetail, type AttendanceEditItem,
} from '@features/attendance-edits'
import { ListFilters, Overlay, ReasonDialog, RequestDetailDialog, RequestsTable, fmtDate, useListFilters } from '@features/attendance-edits/components/AttendanceEditShared'

type Tab = 'queue' | 'log'
const STATUS_CHOICES: AttendanceStatus[] = ['present', 'late', 'early_leave', 'absent', 'incomplete', 'leave', 'time_permit']

export default function AttendanceEditsPage() {
  const [tab, setTab] = useState<Tab>('queue')
  const [openId, setOpenId] = useState<string | null>(null)
  const { data: stats } = useAttendanceEditStats(null)
  const { data: queue = [], isLoading: qLoading } = useAttendanceEditList({ status: 'approved', mode: 'hr_request' })
  const { f, setF, query } = useListFilters()
  const { data: rows = [], isLoading: lLoading } = useAttendanceEditList(query, tab === 'log')

  return (
    <div className="space-y-4" data-testid="hr-attendance-edits">
      <ExecPageHeader icon="check-square" title="طلبات تعديل الحضور" subtitle="طلبات غرفة العمليات الجماعية (نطاق × أيام × نوع): تراجعين البنود وتعتمدين التنفيذ — وتطّلعين على كل التعديلات المباشرة." />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard title="بانتظار اعتمادي" value={queue.length} tone={queue.length ? 'amber' : 'emerald'} testId="ae-st-queue" />
        <StatCard title="في سلاسل الموافقات" value={stats?.pending_approval ?? 0} tone="sky" testId="ae-st-pending" />
        <StatCard title="نُفّذ هذا الشهر" value={stats?.total ?? 0} hint={stats ? `${stats.direct} مباشر · ${stats.by_request} بالطلب` : undefined} tone="slate" testId="ae-st-total" />
        <StatCard title="دقائق صُحّحت هذا الشهر" value={stats?.minutes_fixed ?? 0} hint={stats ? `${stats.employees} موظف · ${stats.work_days} يوم عمل` : undefined} tone="violet" testId="ae-st-minutes" />
      </div>
      <nav className="flex gap-1 rounded-xl bg-slate-100 p-1 text-xs font-bold" aria-label="أقسام">
        {([['queue', 'بانتظار اعتمادي', queue.length], ['log', 'السجل الكامل', null]] as const).map(([k, l, n]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={clsx('inline-flex items-center gap-1 rounded-lg px-3 py-1.5', tab === k ? 'bg-white text-brand-700 shadow' : 'text-slate-600')} data-testid={`ae-tab-${k}`} aria-pressed={tab === k}>
            {l}{n != null && n > 0 && <span className="rounded-full bg-amber-100 px-1.5 text-[10px] tabular-nums text-amber-800">{n}</span>}
          </button>
        ))}
      </nav>

      {tab === 'queue' && (qLoading ? <LoadingSpinner /> : queue.length === 0 ? <EmptyState title="لا طلبات بانتظار اعتمادك" hint="تصل هنا طلبات غرفة العمليات بعد اكتمال موافقاتها (أو مباشرة إن لم تكن لها سلسلة)" />
        : <RequestsTable rows={queue} onOpen={(r) => setOpenId(r.id)} extra={(r) => <Button size="sm" onClick={() => setOpenId(r.id)} data-testid={`ae-review-${r.id}`}><Icon name="edit" size={14} /> مراجعة واعتماد</Button>} />)}

      {tab === 'log' && (
        <div className="space-y-2">
          <ListFilters f={f} setF={setF} />
          {lLoading ? <LoadingSpinner /> : <RequestsTable rows={rows} onOpen={(r) => setOpenId(r.id)} />}
        </div>
      )}

      {openId && <HrReviewDialog id={openId} onClose={() => setOpenId(null)} />}
    </div>
  )
}

/** حوار المراجعة: تفاصيل + تعديل/استبعاد البنود + اعتماد (إن كان الطلب في مرحلة HR) */
function HrReviewDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [editItem, setEditItem] = useState<AttendanceEditItem | null>(null)
  const [skipItem, setSkipItem] = useState<AttendanceEditItem | null>(null)
  const [applyFor, setApplyFor] = useState<AttendanceEditDetail | null>(null)
  const skipM = useAttendanceEditHrSkipItem(); const applyM = useAttendanceEditHrApply()
  const canApply = useCanCall('attendance_edit_hr_apply')
  return (
    <>
      <RequestDetailDialog
        id={id}
        onClose={onClose}
        renderItemActions={(d) => d.can_hr_apply ? (it) => it.skipped_reason ? null : (
          <div className="flex flex-col gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditItem(it)} data-testid={`ae-item-edit-${it.id}`}><Icon name="edit" size={12} /> تعديل</Button>
            <Button size="sm" variant="ghost" onClick={() => setSkipItem(it)} data-testid={`ae-item-skip-${it.id}`}><Icon name="x" size={12} /> استبعاد</Button>
          </div>
        ) : undefined}
        footer={(d) => d.can_hr_apply ? (
          <>
            <span className="me-auto self-center text-[11px] text-slate-500">سيُنفَّذ {d.items.filter((i) => !i.skipped_reason).length} يوم عمل من أصل {d.items.length}.</span>
            <Button size="sm" disabled={!canApply.allowed} title={canApply.title} onClick={() => setApplyFor(d)} data-testid="ae-hr-apply"><Icon name="check" size={14} /> اعتماد وتنفيذ</Button>
          </>
        ) : null}
      />
      {editItem && <EditItemDialog it={editItem} onClose={() => setEditItem(null)} />}
      {skipItem && <ReasonDialog title={`استبعاد ${skipItem.full_name} — ${fmtDate(skipItem.work_date)}`} cta="استبعاد البند" min={3} testId="ae-skip-dialog" tone="danger" busy={skipM.isPending} onClose={() => setSkipItem(null)} onConfirm={(reason) => skipM.mutate({ itemId: skipItem.id, reason }, { onSuccess: () => setSkipItem(null) })} />}
      {applyFor && <ApplyDialog d={applyFor} busy={applyM.isPending} onClose={() => setApplyFor(null)} onConfirm={(note) => applyM.mutate({ id: applyFor.id, note }, { onSuccess: () => { setApplyFor(null); onClose() } })} />}
    </>
  )
}

function EditItemDialog({ it, onClose }: { it: AttendanceEditItem; onClose: () => void }) {
  const upd = useAttendanceEditHrUpdateItem()
  const [status, setStatus] = useState<string>(it.proposed.status)
  const [cin, setCin] = useState(it.proposed.check_in ? hmBaghdad(it.proposed.check_in) : '')
  const [cout, setCout] = useState(it.proposed.check_out ? hmBaghdad(it.proposed.check_out) : '')
  const noTimes = status === 'absent' || status === 'leave'
  const overnight = !!cin && !!cout && cout < cin
  const save = () => upd.mutate({ itemId: it.id, status, checkIn: noTimes ? null : composeBaghdad(it.work_date, cin), checkOut: noTimes ? null : composeBaghdad(it.work_date, cout, overnight) }, { onSuccess: onClose })
  return (
    <Overlay title={`تعديل بند: ${it.full_name} — ${fmtDate(it.work_date)}`} onClose={onClose} testId="ae-item-dialog">
      <div className="space-y-2 text-xs">
        <div className="rounded-lg bg-slate-50 p-2">قبل: <b>{it.before?.status_label ?? 'لا صف'}</b> {it.before && <span className="tabular-nums text-slate-500">{hmBaghdad(it.before.check_in)} ← {hmBaghdad(it.before.check_out)}</span>}</div>
        <label className="block">الحالة
          <select className={field} value={status} onChange={(e) => setStatus(e.target.value)} data-testid="ae-item-status">
            <option value="auto">تُشتق من الأوقات (بقواعد الشفت)</option>
            {STATUS_CHOICES.map((s) => <option key={s} value={s}>{ATTENDANCE_STATUS_LABELS[s]}</option>)}
          </select>
        </label>
        {!noTimes && (
          <div className="grid grid-cols-2 gap-2">
            <label>دخول<input type="time" className={field} value={cin} onChange={(e) => setCin(e.target.value)} data-testid="ae-item-cin" /></label>
            <label>خروج<input type="time" className={field} value={cout} onChange={(e) => setCout(e.target.value)} data-testid="ae-item-cout" /></label>
          </div>
        )}
        {overnight && !noTimes && <div className="text-[11px] text-amber-700">الخروج قبل الدخول ⇒ يُعدّ في اليوم التالي (شفت ليلي).</div>}
        <div className="flex justify-end gap-2 pt-1"><Button size="sm" variant="secondary" onClick={onClose}>إلغاء</Button><Button size="sm" isLoading={upd.isPending} disabled={status === 'auto' && (!cin || !cout)} onClick={save} data-testid="ae-item-save">حفظ البند</Button></div>
      </div>
    </Overlay>
  )
}

function ApplyDialog({ d, busy, onClose, onConfirm }: { d: AttendanceEditDetail; busy: boolean; onClose: () => void; onConfirm: (note: string | null) => void }) {
  const [note, setNote] = useState('')
  const n = useMemo(() => d.items.filter((i) => !i.skipped_reason).length, [d.items])
  return (
    <Overlay title="اعتماد وتنفيذ طلب تعديل الحضور" onClose={onClose} testId="ae-apply-dialog">
      <p className="text-xs text-slate-600">{d.scope_label} · {d.action_label} · سيُنفَّذ <b>{n}</b> يوم عمل الآن ويُبلَّغ الطالب والمعاون والتطوير المركزية.</p>
      <textarea className="mt-2 min-h-[70px] w-full rounded-xl border border-slate-300 p-2 text-sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة الموارد البشرية (اختياري)" data-testid="ae-apply-note" />
      <div className="mt-3 flex justify-end gap-2"><Button size="sm" variant="secondary" onClick={onClose}>رجوع</Button><Button size="sm" isLoading={busy} disabled={n === 0} onClick={() => onConfirm(note.trim() || null)} data-testid="ae-apply-confirm">اعتماد وتنفيذ</Button></div>
    </Overlay>
  )
}
