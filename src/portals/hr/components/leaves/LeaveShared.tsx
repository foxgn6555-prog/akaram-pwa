/**
 * مكوّنات الإجازات المشتركة بين بوابات HR / الموظف / مدير القسم (00144):
 *  · BalanceCard: رصيد الإجازات (منحة، مستهلك، زمنيات، إضافي، متبقٍ)
 *  · LeaveRequestForm: نموذج طلب إجازة/زمنية (نوع، تواريخ، وقت، ملاحظات، مرفق)
 *  · LeaveRequestsTable: جدول الطلبات مع إجراءات الموافقة/الرفض/الإلغاء حسب الصلاحية
 *  · AlertsTable: تنبيهات التأخير/النقص/الغياب مع الإقرار
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { Button } from '@components/ui'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import type { HrAlert, LeaveBalance, LeaveRequestRow } from '@features/hr'
import { useAckAlert, useCancelLeave, useDecideLeave, useLeaveTypes, useRequestLeave } from '@features/hr'
import { hr } from '@sdk/hr.sdk'
import { StatCard } from '../hr-ui'
import { field, fmtMinutes, hhmm, isoDay } from '../hr-format'
import { ALERT_LABELS, LEAVE_STATUS_LABELS, LEAVE_STATUS_STYLES, balanceCost, daysBetween, minutesBetween } from './leaveUtils'

export function BalanceCard({ balance, isLoading, compact = false, testId = 'balance-card' }: { balance: LeaveBalance | null | undefined; isLoading?: boolean; compact?: boolean; testId?: string }) {
  if (isLoading) return <LoadingSpinner />
  if (!balance) return <EmptyState title="لا رصيد متاح" hint="يظهر الرصيد بعد ربط حسابك بسجل موظف" />
  const remaining = Number(balance.remaining)
  return (
    <div className={clsx('grid gap-2', compact ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6')} data-testid={testId}>
      <StatCard title={`المتبقي ${balance.year}`} value={remaining} tone={remaining <= 2 ? 'red' : remaining <= 5 ? 'amber' : 'emerald'} hint="يوم" testId={`${testId}-remaining`} />
      <StatCard title="المنحة السنوية" value={Number(balance.granted)} hint={balance.accrued !== balance.granted ? `المستحق حتى الآن ${balance.accrued}` : undefined} testId={`${testId}-granted`} />
      <StatCard title="إجازات مستهلكة" value={Number(balance.used_leave_days)} tone="sky" testId={`${testId}-used`} />
      <StatCard title="زمنيات" value={`${balance.permits_count}`} hint={`= ${Number(balance.used_permit_days)} يوم (كل ${balance.permits_per_leave_day} زمنيات = يوم)`} tone="violet" testId={`${testId}-permits`} />
      {!compact && <StatCard title="رصيد إضافي" value={Number(balance.overtime_days)} hint="من الدوام الإضافي" tone="emerald" testId={`${testId}-overtime`} />}
      {!compact && <StatCard title="مرحّل / تسويات" value={`${Number(balance.carried)} / ${Number(balance.adjusted) >= 0 ? '+' : ''}${Number(balance.adjusted)}`} testId={`${testId}-carry`} />}
    </div>
  )
}

export function LeaveRequestForm({ employeeId, balance, permitMaxMinutes, onDone, testId = 'leave-form' }: {
  employeeId: string | null
  balance?: LeaveBalance | null
  permitMaxMinutes?: number | null
  onDone?: () => void
  testId?: string
}) {
  const { data: types = [] } = useLeaveTypes()
  const request = useRequestLeave()
  const [typeId, setTypeId] = useState('')
  const [start, setStart] = useState(isoDay())
  const [end, setEnd] = useState(isoDay())
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const t = types.find((x) => x.id === typeId)
  const isPermit = t?.kind === 'time_permit'
  const days = isPermit ? 0 : daysBetween(start, end)
  const minutes = isPermit ? minutesBetween(startTime, endTime) : 0
  const maxMin = t?.max_minutes ?? permitMaxMinutes ?? null
  const cost = balanceCost(t, days, balance?.permits_per_leave_day ?? 3)
  const insufficient = !!t?.consumes_balance && balance != null && cost > Number(balance.remaining)
  const localError = !t ? 'اختر النوع' : !employeeId ? 'لا يوجد سجل موظف مرتبط بحسابك' : isPermit
    ? (minutes <= 0 ? 'وقت النهاية يجب أن يكون بعد البداية' : maxMin && minutes > maxMin ? `الحد الأقصى للزمنية ${fmtMinutes(maxMin)}` : null)
    : (end < start ? 'تاريخ النهاية قبل البداية' : t.max_days_per_request && days > t.max_days_per_request ? `الحد الأقصى ${t.max_days_per_request} يوم لهذا النوع` : null)
  const attachmentMissing = !!t?.requires_attachment && !file
  const disabled = !!localError || insufficient || attachmentMissing || request.isPending || uploading

  const submit = async () => {
    if (!employeeId || !t || disabled) return
    setError(null)
    try {
      let attachment: string | null = null
      if (file) { setUploading(true); attachment = await hr.uploadLeaveAttachment(employeeId, file); setUploading(false) }
      await request.mutateAsync({ employeeId, typeId: t.id, start, end: isPermit ? start : end, startTime: isPermit ? startTime : null, endTime: isPermit ? endTime : null, notes, attachment })
      setNotes(''); setFile(null); onDone?.()
    } catch (e) { setUploading(false); setError(e instanceof Error ? e.message : String(e)) }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid={testId}>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs font-semibold text-slate-600">النوع
          <select className={clsx(field, 'mt-1')} value={typeId} onChange={(e) => setTypeId(e.target.value)} data-testid={`${testId}-type`}>
            <option value="">— اختر —</option>
            <optgroup label="إجازات (أيام)">{types.filter((x) => x.kind === 'leave').map((x) => <option key={x.id} value={x.id}>{x.name}{x.is_paid ? '' : ' · تُستقطع من الراتب'}</option>)}</optgroup>
            <optgroup label="زمنيات (ساعات)">{types.filter((x) => x.kind === 'time_permit').map((x) => <option key={x.id} value={x.id}>{x.name}{x.is_paid ? '' : ' · تُستقطع من الراتب'}</option>)}</optgroup>
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">{isPermit ? 'اليوم' : 'من'}
          <input type="date" className={clsx(field, 'mt-1')} value={start} onChange={(e) => { setStart(e.target.value); if (e.target.value > end) setEnd(e.target.value) }} data-testid={`${testId}-start`} />
        </label>
        {isPermit ? (
          <>
            <label className="text-xs font-semibold text-slate-600">من الساعة<input type="time" className={clsx(field, 'mt-1')} value={startTime} onChange={(e) => setStartTime(e.target.value)} data-testid={`${testId}-start-time`} /></label>
            <label className="text-xs font-semibold text-slate-600">إلى الساعة<input type="time" className={clsx(field, 'mt-1')} value={endTime} onChange={(e) => setEndTime(e.target.value)} data-testid={`${testId}-end-time`} /></label>
          </>
        ) : (
          <label className="text-xs font-semibold text-slate-600">إلى<input type="date" className={clsx(field, 'mt-1')} value={end} min={start} onChange={(e) => setEnd(e.target.value)} data-testid={`${testId}-end`} /></label>
        )}
        <label className="text-xs font-semibold text-slate-600 sm:col-span-2">ملاحظات<input className={clsx(field, 'mt-1')} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="سبب الطلب (اختياري)" data-testid={`${testId}-notes`} /></label>
        {t && (
          <label className="text-xs font-semibold text-slate-600 sm:col-span-2">مرفق {t.requires_attachment ? <span className="text-red-600">(إلزامي لهذا النوع)</span> : '(اختياري)'}
            <input type="file" className="mt-1 block w-full text-xs" accept="image/*,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} data-testid={`${testId}-file`} />
          </label>
        )}
      </div>
      {t && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-2 text-xs" data-testid={`${testId}-summary`}>
          <span className="font-bold">{isPermit ? `المدة: ${minutes > 0 ? fmtMinutes(minutes) : '—'}` : `الأيام: ${days}`}</span>
          <span className={clsx('rounded-full px-2 py-0.5 font-bold', t.is_paid ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}>{t.is_paid ? 'مدفوعة — لا تُستقطع من الراتب' : 'غير مدفوعة — تُستقطع من الراتب'}</span>
          {t.consumes_balance && <span className={clsx('rounded-full px-2 py-0.5 font-bold', insufficient ? 'bg-red-50 text-red-700' : 'bg-sky-50 text-sky-700')}>تخصم من الرصيد {cost} يوم{balance ? ` · المتبقي ${Number(balance.remaining)}` : ''}</span>}
          {localError && <span className="text-red-600">{localError}</span>}
          {insufficient && <span className="text-red-600">الرصيد غير كافٍ</span>}
          {attachmentMissing && <span className="text-red-600">أرفق المستند</span>}
        </div>
      )}
      {error && <p className="text-xs text-red-600" data-testid={`${testId}-error`}>{error}</p>}
      <div className="flex justify-end"><Button size="sm" disabled={disabled} isLoading={request.isPending || uploading} onClick={() => void submit()} data-testid={`${testId}-submit`}>إرسال الطلب إلى المدير المباشر</Button></div>
    </div>
  )
}

export function LeaveRequestsTable({ rows, isLoading, mode, showEmployee = true, testId = 'lv-req' }: {
  rows: LeaveRequestRow[]; isLoading?: boolean; mode: 'employee' | 'manager' | 'hr'; showEmployee?: boolean; testId?: string
}) {
  const decide = useDecideLeave(); const cancel = useCancelLeave()
  const today = isoDay()
  const act = async (fn: () => Promise<unknown>) => { try { await fn() } catch { /* toast in hook */ } }
  const onApprove = (r: LeaveRequestRow) => { const note = window.prompt('ملاحظة الموافقة (اختياري):') ?? ''; void act(() => decide.mutateAsync({ id: r.id, approve: true, note })) }
  const onReject = (r: LeaveRequestRow) => { const note = window.prompt('سبب الرفض (إلزامي):'); if (!note || note.trim().length < 2) return; void act(() => decide.mutateAsync({ id: r.id, approve: false, note: note.trim() })) }
  const onCancel = (r: LeaveRequestRow) => {
    const reason = r.status === 'approved' ? window.prompt('سبب إلغاء الإجازة المعتمدة (إلزامي — يُعاد الرصيد):') : (window.confirm('إلغاء هذا الطلب؟') ? 'إلغاء من صاحب الطلب' : null)
    if (!reason || reason.trim().length < 2) return
    void act(() => cancel.mutateAsync({ id: r.id, reason: reason.trim() }))
  }
  if (isLoading) return <LoadingSpinner />
  if (rows.length === 0) return <EmptyState title="لا طلبات" hint={mode === 'manager' ? 'ستظهر هنا طلبات موظفيك المباشرين فور إرسالها' : 'لم تُسجَّل طلبات في هذا النطاق'} />
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm" data-testid={`${testId}-table`}>
        <thead className="bg-slate-50 text-xs text-slate-600"><tr>
          {showEmployee && <th className="p-2 text-start">الموظف</th>}<th className="p-2">النوع</th><th className="p-2">الفترة</th><th className="p-2">المدة</th><th className="p-2">الحالة</th><th className="p-2 text-start">ملاحظات / قرار</th>{mode !== 'employee' && <th className="p-2">المدير المباشر</th>}<th className="p-2">إجراءات</th>
        </tr></thead>
        <tbody>{rows.map((r) => {
          const canCancel = (r.status === 'pending' && (mode !== 'manager' || r.can_decide)) || (r.status === 'approved' && (mode === 'hr' || r.start_date > today))
          return (
            <tr key={r.id} className={clsx('border-t border-slate-100', r.status === 'pending' && 'bg-amber-50/30')} data-testid={`${testId}-row-${r.id}`}>
              {showEmployee && <td className="p-2"><p className="font-semibold">{r.full_name}</p><p className="text-[11px] text-slate-500">{r.employee_number}{r.department_name ? ` · ${r.department_name}` : ''}</p></td>}
              <td className="p-2 text-center"><span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-bold', r.kind === 'leave' ? 'bg-sky-50 text-sky-700' : 'bg-violet-50 text-violet-700')}>{r.type_name ?? (r.kind === 'leave' ? 'إجازة' : 'زمنية')}</span>{r.is_paid === false && <span className="block text-[10px] text-red-600">تُستقطع من الراتب</span>}</td>
              <td className="p-2 text-center text-xs" dir="ltr">{r.start_date}{r.end_date !== r.start_date ? ` → ${r.end_date}` : ''}{r.start_time && <span className="block text-[10px] text-slate-500">{hhmm(r.start_time)}–{hhmm(r.end_time)}</span>}</td>
              <td className="p-2 text-center text-xs font-bold">{r.kind === 'leave' ? `${Number(r.days)} يوم` : fmtMinutes(r.minutes)}</td>
              <td className="p-2 text-center"><span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-bold', LEAVE_STATUS_STYLES[r.status])}>{LEAVE_STATUS_LABELS[r.status]}</span></td>
              <td className="p-2 text-xs text-slate-600">{r.notes && <p>{r.notes}</p>}{r.decision_note && <p className="text-[11px] text-slate-500">قرار: {r.decision_note}</p>}{r.cancelled_reason && <p className="text-[11px] text-slate-500">إلغاء: {r.cancelled_reason}</p>}{r.attachment_path && <AttachmentLink path={r.attachment_path} />}</td>
              {mode !== 'employee' && <td className="p-2 text-center text-xs">{r.manager_name ?? <span className="text-red-600">غير محدد</span>}</td>}
              <td className="p-2">
                <div className="flex justify-center gap-1">
                  {r.status === 'pending' && r.can_decide && <>
                    <button type="button" className="rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white" onClick={() => onApprove(r)} data-testid={`${testId}-approve-${r.id}`}>موافقة</button>
                    <button type="button" className="rounded-lg bg-red-50 px-2 py-1 text-[11px] font-bold text-red-700" onClick={() => onReject(r)} data-testid={`${testId}-reject-${r.id}`}>رفض</button>
                  </>}
                  {canCancel && <button type="button" className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700" onClick={() => onCancel(r)} data-testid={`${testId}-cancel-${r.id}`}>إلغاء</button>}
                </div>
              </td>
            </tr>
          )
        })}</tbody>
      </table>
    </div>
  )
}

function AttachmentLink({ path }: { path: string }) {
  const [busy, setBusy] = useState(false)
  return <button type="button" className="text-[11px] font-bold text-brand-700 hover:underline" disabled={busy} onClick={async () => { setBusy(true); try { const url = await hr.signedUrl(path); if (url) window.open(url, '_blank') } finally { setBusy(false) } }}>📎 المرفق</button>
}

export function AlertsTable({ alerts, isLoading, testId = 'hr-alerts' }: { alerts: HrAlert[]; isLoading?: boolean; testId?: string }) {
  const ack = useAckAlert()
  const grouped = useMemo(() => alerts, [alerts])
  if (isLoading) return <LoadingSpinner />
  if (grouped.length === 0) return <EmptyState title="لا تنبيهات مفتوحة" hint="تُولَّد التنبيهات تلقائياً عند تجاوز عتبات التأخير/النقص/الغياب المحددة في السياسة" />
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm" data-testid={`${testId}-table`}>
        <thead className="bg-slate-50 text-xs text-slate-600"><tr><th className="p-2 text-start">الموظف</th><th className="p-2">الشهر</th><th className="p-2">النوع</th><th className="p-2">القيمة / العتبة</th><th className="p-2 text-start">التفاصيل</th><th className="p-2">المدير</th><th className="p-2"></th></tr></thead>
        <tbody>{grouped.map((a) => (
          <tr key={a.id} className="border-t border-slate-100" data-testid={`${testId}-row-${a.id}`}>
            <td className="p-2"><p className="font-semibold">{a.full_name}</p><p className="text-[11px] text-slate-500">{a.employee_number}{a.department_name ? ` · ${a.department_name}` : ''}</p></td>
            <td className="p-2 text-center text-xs">{a.period_month.slice(0, 7)}</td>
            <td className="p-2 text-center"><span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-bold', a.kind === 'absent_repeat' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700')}>{ALERT_LABELS[a.kind]}</span></td>
            <td className="p-2 text-center text-xs font-bold tabular-nums">{Number(a.value)} / {Number(a.threshold)}</td>
            <td className="p-2 text-xs">{a.details}</td>
            <td className="p-2 text-center text-xs">{a.manager_name ?? '—'}</td>
            <td className="p-2 text-center">{!a.acknowledged_at && <button type="button" className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700" onClick={() => void ack.mutateAsync(a.id).catch(() => undefined)} data-testid={`${testId}-ack-${a.id}`}>إقرار</button>}</td>
          </tr>))}</tbody>
      </table>
    </div>
  )
}
