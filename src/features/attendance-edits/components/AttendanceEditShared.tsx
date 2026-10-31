/** مكونات مشتركة لوحدة «طلب تعديل بيانات الحضور» (00397) — تُستخدم في غرفة العمليات والموارد البشرية والمعاون والمدير التنفيذي */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { Button } from '@components/ui'
import { Icon } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import {
  ATTENDANCE_EDIT_STATUS_LABELS, hmBaghdad, useAttendanceEditDetail,
  type AttendanceEditDetail, type AttendanceEditItem, type AttendanceEditRow, type AttendanceEditStatus,
} from '@features/attendance-edits'

const STATUS_TONE: Record<AttendanceEditStatus, string> = {
  pending_approval: 'bg-amber-50 text-amber-800 ring-amber-200',
  approved: 'bg-sky-50 text-sky-800 ring-sky-200',
  applied: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  rejected: 'bg-red-50 text-red-800 ring-red-200',
  cancelled: 'bg-slate-100 text-slate-600 ring-slate-200',
  reverted: 'bg-violet-50 text-violet-800 ring-violet-200',
}
export function RequestStatusChip({ status, label }: { status: AttendanceEditStatus; label?: string }) {
  return <span className={clsx('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ring-1', STATUS_TONE[status] ?? STATUS_TONE.cancelled)} data-testid={`ae-status-${status}`}>{label ?? ATTENDANCE_EDIT_STATUS_LABELS[status] ?? status}</span>
}
export function ModeChip({ mode, label }: { mode: 'direct' | 'hr_request'; label?: string }) {
  return <span className={clsx('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold', mode === 'direct' ? 'bg-slate-800 text-white' : 'bg-brand-50 text-brand-700 ring-1 ring-brand-200')}>{label ?? (mode === 'direct' ? 'مباشر' : 'بطلب إلى HR')}</span>
}

export const fmtDate = (d: string | null | undefined) => (d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—')
export const fmtDateTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Baghdad' }) : '—')
export const fmtDays = (dates: string[]) => dates.length <= 3 ? dates.map(fmtDate).join('، ') : `${fmtDate(dates[0])} ← ${fmtDate(dates[dates.length - 1])} (${dates.length} يوم)`
const fmtMin = (m: number | null | undefined) => (!m || m <= 0 ? '—' : m >= 60 ? `${Math.floor(m / 60)}س ${m % 60}د` : `${m}د`)

/** خلية قبل/بعد: الحالة + الأوقات + التأخير/الخروج المبكر */
export function SideCell({ side }: { side: AttendanceEditItem['before'] | AttendanceEditItem['after'] }) {
  if (!side) return <span className="text-slate-400">لا صف</span>
  return (
    <div className="space-y-0.5 text-[11px] leading-tight">
      <div className="font-bold">{side.status_label}</div>
      <div className="tabular-nums text-slate-600">{hmBaghdad(side.check_in)} ← {hmBaghdad(side.check_out)}</div>
      {(side.late_minutes > 0 || side.early_minutes > 0) && <div className="text-amber-700">{side.late_minutes > 0 && `تأخير ${fmtMin(side.late_minutes)}`} {side.early_minutes > 0 && `خروج مبكر ${fmtMin(side.early_minutes)}`}</div>}
    </div>
  )
}

/** جدول البنود (موظف × يوم): قبل / المقترح / بعد — مع أزرار اختيارية لكل بند (منضدة HR) */
export function ItemsTable({ items, status, renderActions }: { items: AttendanceEditItem[]; status: AttendanceEditStatus; renderActions?: (it: AttendanceEditItem) => React.ReactNode }) {
  const showAfter = status === 'applied' || status === 'reverted'
  if (items.length === 0) return <EmptyState title="لا بنود" />
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[720px] text-right text-xs" data-testid="ae-items-table">
        <thead className="bg-slate-50 text-[11px] text-slate-600">
          <tr><th className="p-2">الموظف</th><th className="p-2">اليوم</th><th className="p-2">قبل</th><th className="p-2">{showAfter ? 'بعد التنفيذ' : 'المقترح'}</th>{renderActions && <th className="p-2">إجراء</th>}</tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className={clsx('border-t border-slate-100 align-top', it.skipped_reason && 'bg-slate-50 opacity-70')} data-testid={`ae-item-${it.id}`}>
              <td className="p-2"><div className="font-bold">{it.full_name}</div><div className="text-[10px] text-slate-500">{it.employee_number}{it.department_name ? ` · ${it.department_name}` : ''}</div></td>
              <td className="p-2 tabular-nums">{fmtDate(it.work_date)}</td>
              <td className="p-2"><SideCell side={it.before} /></td>
              <td className="p-2">
                {it.skipped_reason ? <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] text-slate-700">مستبعد — {it.skipped_reason}</span>
                  : showAfter ? <SideCell side={it.after} />
                  : <div className="space-y-0.5 text-[11px] leading-tight"><div className="font-bold text-brand-700">{it.proposed.status === 'auto' ? 'تُشتق من الأوقات' : it.proposed.status_label}</div><div className="tabular-nums text-slate-600">{hmBaghdad(it.proposed.check_in)} ← {hmBaghdad(it.proposed.check_out)}</div></div>}
                {it.hr_edited && <div className="mt-0.5 text-[10px] text-sky-700">عدّلته الموارد البشرية{it.hr_edited_by_name ? ` (${it.hr_edited_by_name})` : ''}</div>}
              </td>
              {renderActions && <td className="p-2">{renderActions(it)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** الملخص الرأسي للطلب (من/ماذا/متى/لماذا) + مسار الموافقات */
export function RequestSummary({ r }: { r: AttendanceEditDetail | AttendanceEditRow }) {
  const d = r as Partial<AttendanceEditDetail>
  return (
    <div className="space-y-3 text-xs" data-testid="ae-summary">
      <div className="flex flex-wrap items-center gap-2">
        <RequestStatusChip status={r.status} label={r.status_label} /><ModeChip mode={r.mode} label={r.mode_label} />
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">{r.action_label}</span>
        {r.current_step && <span className="text-[11px] text-amber-700">الخطوة الحالية: {r.current_step}</span>}
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3">
        <dt className="text-slate-500">النطاق</dt><dd className="col-span-1 font-bold sm:col-span-2">{r.scope_label}{r.departments ? <span className="block text-[10px] font-normal text-slate-500">{r.departments}</span> : null}</dd>
        <dt className="text-slate-500">الأيام</dt><dd className="sm:col-span-2 tabular-nums">{fmtDays(r.dates)}</dd>
        <dt className="text-slate-500">الحجم</dt><dd className="sm:col-span-2 tabular-nums">{r.employees_count} موظف × {r.days_count} يوم = {r.items_count} يوم عمل{r.minutes_fixed > 0 && <> · صُحّح <b>{r.minutes_fixed}</b> دقيقة</>}</dd>
        {r.action === 'set_times' && <><dt className="text-slate-500">الأوقات</dt><dd className="sm:col-span-2 tabular-nums">{r.payload.check_in ?? '—'} ← {r.payload.check_out ?? '—'}</dd></>}
        <dt className="text-slate-500">السبب</dt><dd className="sm:col-span-2">{r.reason}</dd>
        <dt className="text-slate-500">الطالب</dt><dd className="sm:col-span-2">{r.requester_name ?? '—'} · {fmtDateTime(r.created_at)}</dd>
        {r.applied_at && <><dt className="text-slate-500">نُفّذ</dt><dd className="sm:col-span-2">{r.applied_by_name ?? '—'} · {fmtDateTime(r.applied_at)}{r.hr_note ? ` · ملاحظة HR: ${r.hr_note}` : ''}</dd></>}
        {r.rejected_note && <><dt className="text-slate-500">سبب الرفض</dt><dd className="sm:col-span-2 text-red-700">{r.rejected_note}</dd></>}
        {r.reverted_at && <><dt className="text-slate-500">تراجع</dt><dd className="sm:col-span-2 text-violet-800">{r.reverted_by_name ?? '—'} · {fmtDateTime(r.reverted_at)} · {r.revert_reason}</dd></>}
      </dl>
      {d.timeline && d.timeline.length > 0 && (
        <ol className="flex flex-wrap gap-1.5" aria-label="مسار الموافقات" data-testid="ae-timeline">
          {d.timeline.map((s) => (
            <li key={s.step_no} className={clsx('rounded-lg px-2 py-1 text-[11px] ring-1', s.status === 'approved' ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : s.status === 'rejected' ? 'bg-red-50 text-red-800 ring-red-200' : s.status === 'pending' ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-slate-50 text-slate-600 ring-slate-200')}>
              <b>{s.step_no}. {s.step_label}</b>{s.decided_by_name ? ` — ${s.decided_by_name}` : s.approvers.length ? ` — ${s.approvers.join('، ')}` : ''}{s.note ? ` (${s.note})` : ''}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/** حاوية حوار موحّدة */
export function Overlay({ title, onClose, children, testId, wide }: { title: string; onClose: () => void; children: React.ReactNode; testId: string; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-2 sm:items-center" role="dialog" aria-modal="true" data-testid={testId}>
      <div className={clsx('max-h-[92vh] w-full overflow-y-auto rounded-2xl bg-white p-4 shadow-xl', wide ? 'max-w-5xl' : 'max-w-lg')}>
        <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-bold">{title}</h3><button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="إغلاق">✕</button></div>
        {children}
      </div>
    </div>
  )
}

/** حوار تفاصيل الطلب — للقراءة (غرفة العمليات/المعاون/التنفيذي) مع فتحات اختيارية للأزرار والبنود */
export function RequestDetailDialog({ id, onClose, footer, renderItemActions }: { id: string; onClose: () => void; footer?: (d: AttendanceEditDetail) => React.ReactNode; renderItemActions?: (d: AttendanceEditDetail) => ((it: AttendanceEditItem) => React.ReactNode) | undefined }) {
  const { data, isLoading } = useAttendanceEditDetail(id)
  return (
    <Overlay title="تفاصيل طلب تعديل الحضور" onClose={onClose} testId="ae-detail" wide>
      {isLoading || !data ? <LoadingSpinner /> : (
        <div className="space-y-3">
          <RequestSummary r={data} />
          <ItemsTable items={data.items} status={data.status} renderActions={renderItemActions?.(data)} />
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">{footer(data)}</div>}
        </div>
      )}
    </Overlay>
  )
}

/** جدول السجل */
export function RequestsTable({ rows, onOpen, extra }: { rows: AttendanceEditRow[]; onOpen: (r: AttendanceEditRow) => void; extra?: (r: AttendanceEditRow) => React.ReactNode }) {
  if (rows.length === 0) return <EmptyState title="لا طلبات تعديل حضور" hint="تظهر هنا الطلبات المباشرة وطلبات الموارد البشرية حسب الفلاتر" />
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[860px] text-right text-xs" data-testid="ae-requests-table">
        <thead className="bg-slate-50 text-[11px] text-slate-600">
          <tr><th className="p-2">الحالة</th><th className="p-2">النطاق</th><th className="p-2">التعديل</th><th className="p-2">الأيام</th><th className="p-2">الحجم</th><th className="p-2">الطالب</th><th className="p-2">أُنشئ</th><th className="p-2"></th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-slate-100 align-top hover:bg-slate-50" data-testid={`ae-row-${r.id}`}>
              <td className="p-2"><div className="flex flex-col items-start gap-1"><RequestStatusChip status={r.status} label={r.status_label} /><ModeChip mode={r.mode} /></div></td>
              <td className="p-2"><div className="font-bold">{r.scope_label}</div>{r.departments && <div className="text-[10px] text-slate-500">{r.departments}</div>}</td>
              <td className="p-2">{r.action_label}{r.action === 'set_times' && <div className="tabular-nums text-[10px] text-slate-500">{r.payload.check_in} ← {r.payload.check_out}</div>}{r.action === 'set_status' && r.payload.status && <div className="text-[10px] text-slate-500">{r.payload.status}</div>}</td>
              <td className="p-2 tabular-nums">{fmtDays(r.dates)}</td>
              <td className="p-2 tabular-nums">{r.employees_count} × {r.days_count} = <b>{r.items_count}</b>{r.minutes_fixed > 0 && <div className="text-[10px] text-emerald-700">{r.minutes_fixed} دقيقة</div>}</td>
              <td className="p-2">{r.requester_name ?? '—'}{r.current_step && <div className="text-[10px] text-amber-700">عند: {r.current_step}</div>}</td>
              <td className="p-2 tabular-nums text-slate-500">{fmtDateTime(r.created_at)}</td>
              <td className="p-2"><div className="flex flex-wrap justify-end gap-1"><Button size="sm" variant="ghost" onClick={() => onOpen(r)} data-testid={`ae-open-${r.id}`}><Icon name="eye" size={14} /> التفاصيل</Button>{extra?.(r)}</div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** حوار سبب (إلغاء/تراجع/استبعاد) */
export function ReasonDialog({ title, cta, min = 5, onClose, onConfirm, busy, testId, tone = 'default' }: { title: string; cta: string; min?: number; onClose: () => void; onConfirm: (reason: string) => void; busy?: boolean; testId: string; tone?: 'default' | 'danger' }) {
  const [v, setV] = useState('')
  const ok = v.trim().length >= min
  return (
    <Overlay title={title} onClose={onClose} testId={testId}>
      <textarea className="min-h-[90px] w-full rounded-xl border border-slate-300 p-2 text-sm" value={v} onChange={(e) => setV(e.target.value)} placeholder={`السبب (${min} أحرف على الأقل)`} data-testid={`${testId}-reason`} />
      <div className="mt-3 flex justify-end gap-2"><Button size="sm" variant="secondary" onClick={onClose}>إغلاق</Button><Button size="sm" variant={tone === 'danger' ? 'danger' : 'primary'} disabled={!ok} isLoading={busy} onClick={() => onConfirm(v.trim())} data-testid={`${testId}-confirm`}>{cta}</Button></div>
    </Overlay>
  )
}

/** فلاتر السجل الموحّدة */
export interface ListFiltersState { from: string; to: string; mode: '' | 'direct' | 'hr_request'; status: '' | AttendanceEditStatus; search: string }
export function useListFilters(initial?: Partial<ListFiltersState>) {
  const [f, setF] = useState<ListFiltersState>({ from: '', to: '', mode: '', status: '', search: '', ...initial })
  const query = useMemo(() => ({ from: f.from || null, to: f.to || null, mode: f.mode || null, status: f.status || null, search: f.search || null }), [f])
  return { f, setF, query }
}
export function ListFilters({ f, setF }: { f: ListFiltersState; setF: (u: (p: ListFiltersState) => ListFiltersState) => void }) {
  const field = 'h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs'
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="ae-filters">
      <input type="date" className={field} value={f.from} onChange={(e) => setF((p) => ({ ...p, from: e.target.value }))} aria-label="من" data-testid="ae-f-from" />
      <input type="date" className={field} value={f.to} onChange={(e) => setF((p) => ({ ...p, to: e.target.value }))} aria-label="إلى" data-testid="ae-f-to" />
      <select className={field} value={f.mode} onChange={(e) => setF((p) => ({ ...p, mode: e.target.value as ListFiltersState['mode'] }))} aria-label="الوضع" data-testid="ae-f-mode"><option value="">مباشر وبطلب</option><option value="direct">مباشر فقط</option><option value="hr_request">بطلب إلى HR فقط</option></select>
      <select className={field} value={f.status} onChange={(e) => setF((p) => ({ ...p, status: e.target.value as ListFiltersState['status'] }))} aria-label="الحالة" data-testid="ae-f-status"><option value="">كل الحالات</option>{(Object.keys(ATTENDANCE_EDIT_STATUS_LABELS) as AttendanceEditStatus[]).map((s) => <option key={s} value={s}>{ATTENDANCE_EDIT_STATUS_LABELS[s]}</option>)}</select>
      <input className={clsx(field, 'min-w-[180px]')} value={f.search} onChange={(e) => setF((p) => ({ ...p, search: e.target.value }))} placeholder="بحث: موظف / رقم / نطاق / سبب" data-testid="ae-f-search" />
    </div>
  )
}
