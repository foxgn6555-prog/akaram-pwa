/**
 * درج تفاصيل الكشف (00170) — يُستخدم في غرفة العمليات والمعاون والمدير المفوض
 *  · البيانات الكاملة + مسار الموافقات + سجل الأحداث (من فعل ماذا ومتى)
 *  · لوحة القرار (مبلغ + اعتماد / إعادة بسبب) تظهر للمُعتمِد الحالي فقط (can_decide)
 *  · إجراءات غرفة العمليات: تعديل (مسودة/مُعاد) · رفع · إلغاء بسبب
 */
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { EVENT_LABEL, type DisclosureV2 } from '@sdk/disclosures-unit.sdk'
import { useDisclosureActions, useDisclosureDetail } from '../unit'
import { Field, StatusBadge, TargetChip } from './shared'
import { btnDanger, btnGhost, btnPrimary, fmtDate, fmtDateTime, fmtIqd, fmtMonth, inputCls, penaltyLabel, shiftLabel } from './ui'

export interface DisclosureDetailDrawerProps {
  id: string | null
  onClose: () => void
  /** وضع غرفة العمليات: يُظهر تعديل/رفع/إلغاء */
  opsMode?: boolean
  onEdit?: (d: DisclosureV2) => void
  /** طباعة نموذج الكشف الرسمي */
  onPrint?: (d: DisclosureV2) => void
  /** زر إضافي */
  extraActions?: (d: DisclosureV2) => React.ReactNode
}

export function DisclosureDetailDrawer({ id, onClose, opsMode = false, onEdit, onPrint, extraActions }: DisclosureDetailDrawerProps) {
  const q = useDisclosureDetail(id)
  const { submit, decide, cancel } = useDisclosureActions()
  const d = q.data
  const [amount, setAmount] = useState<string>('')
  const [note, setNote] = useState('')
  const [mode, setMode] = useState<'none' | 'return' | 'cancel'>('none')
  useEffect(() => { setAmount(d?.amount != null ? String(d.amount) : ''); setNote(''); setMode('none') }, [d?.id, d?.amount, d?.status])
  useEffect(() => {
    if (!id) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [id, onClose])
  if (!id) return null
  const amountNum = amount.trim() === '' ? null : Number(amount)
  const amountBad = amountNum != null && (!Number.isFinite(amountNum) || amountNum < 0)
  const busy = submit.isPending || decide.isPending || cancel.isPending

  return (
    <div className="fixed inset-0 z-50 flex justify-start bg-slate-900/40" onClick={onClose} data-testid="disc-drawer">
      <aside className="flex h-full w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl" onClick={(e) => e.stopPropagation()} dir="rtl">
        <header className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-black text-slate-800">كشف {d?.ref_no ?? ''}</h2>
              {d ? <StatusBadge status={d.status} step={d.current_step} /> : null}
            </div>
            {d ? <p className="truncate text-xs text-slate-500">{d.type_label} · {d.target_label}</p> : null}
          </div>
          {d && onPrint ? <button type="button" onClick={() => onPrint(d)} className={btnGhost} data-testid="disc-print">طباعة</button> : null}
          <button type="button" onClick={onClose} className={btnGhost} aria-label="إغلاق" data-testid="disc-drawer-close">✕</button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {q.isLoading || !d ? <div className="p-6 text-center text-sm text-slate-500">جارٍ التحميل…</div> : (
            <>
              {d.status === 'returned' && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" data-testid="disc-return-banner">
                  <div className="font-black">مُعاد للتصحيح من {d.returned_by_name ?? '—'} · {fmtDateTime(d.returned_at)}</div>
                  <div className="mt-1 whitespace-pre-wrap">{d.return_reason}</div>
                </div>
              )}
              {d.status === 'cancelled' && (
                <div className="rounded-xl border border-slate-300 bg-slate-100 p-3 text-sm text-slate-700"><b>ملغى</b> بواسطة {d.cancelled_by_name ?? '—'} · {fmtDateTime(d.cancelled_at)}<div className="mt-1">{d.cancel_reason}</div></div>
              )}
              {d.status === 'approved' && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" data-testid="disc-approved-banner">
                  <div className="font-black">معتمد نهائياً · {d.approved_by_name ?? '—'} · {fmtDateTime(d.approved_at)}</div>
                  {d.amount != null && d.amount > 0 ? (
                    d.deduction_posted
                      ? <div className="mt-1">أُضيف استقطاع <b>{fmtIqd(d.amount)}</b> إلى حضورية الموظف لشهر <b dir="ltr">{fmtMonth(d.deduction_month)}</b>{d.deduction_note ? <span className="block text-xs">{d.deduction_note}</span> : null}</div>
                      : <div className="mt-1">المبلغ <b>{fmtIqd(d.amount)}</b> مسجَّل فقط — {d.deduction_note ?? 'الهدف غير مرتبط بسجل موظف في الموارد البشرية'}</div>
                  ) : <div className="mt-1">بدون مبلغ مالي.</div>}
                </div>
              )}

              <section className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 p-3 text-sm sm:grid-cols-3" data-testid="disc-facts">
                <Fact k="الهدف" v={<TargetChip d={d} />} />
                {d.target_kind === 'vehicle' ? (
                  <>
                    <Fact k="السائق" v={d.driver_name} />
                    <Fact k="رقم DB" v={<span dir="ltr">{d.db_number}</span>} />
                    <Fact k="نوع الآلية" v={d.vehicle_type ?? '—'} />
                    <Fact k="المتعهد" v={d.contractor_name ?? '—'} />
                    <Fact k="القاطع" v={d.sector ?? '—'} />
                    <Fact k="سجل الموظف" v={d.employee_name ? `${d.employee_name} #${d.employee_number ?? ''}` : 'غير مرتبط (آلية مؤجّرة)'} />
                  </>
                ) : (
                  <>
                    <Fact k="الموظف" v={d.employee_name ?? '—'} />
                    <Fact k="الرقم الوظيفي" v={<span dir="ltr">{d.employee_number ?? '—'}</span>} />
                    <Fact k="القسم" v={d.department_name ?? '—'} />
                    <Fact k="العنوان الوظيفي" v={d.job_title ?? '—'} />
                  </>
                )}
                <Fact k="الشفت" v={shiftLabel(d.shift)} />
                <Fact k="تاريخ المخالفة" v={<span dir="ltr">{fmtDate(d.log_date)}</span>} />
                <Fact k="شهر الاستقطاع" v={<span dir="ltr">{fmtMonth(d.deduction_month ?? d.period_month)}</span>} />
                <Fact k="النوع" v={d.type_label} />
                <Fact k="العقوبة" v={penaltyLabel(d.penalty_type)} />
                <Fact k="المبلغ" v={<b className="tabular-nums">{fmtIqd(d.amount)}</b>} />
                <Fact k="مُعدّ الكشف" v={`${d.prepared_by_name ?? '—'}${d.resubmit_count ? ` · أُعيد رفعه ${d.resubmit_count}×` : ''}`} />
                <Fact k="رُفع في" v={fmtDateTime(d.submitted_at)} />
              </section>

              <section>
                <h3 className="mb-1 text-xs font-black text-slate-500">التفاصيل</h3>
                <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-800" data-testid="disc-details">{d.details}</p>
                {d.amount_note ? <p className="mt-1 text-xs text-slate-500">ملاحظة المبلغ ({d.amount_by_name ?? '—'}): {d.amount_note}</p> : null}
              </section>

              {d.timeline && d.timeline.length > 0 && (
                <section data-testid="disc-timeline">
                  <h3 className="mb-2 text-xs font-black text-slate-500">مسار الموافقة</h3>
                  <ol className="flex flex-wrap gap-2">
                    {d.timeline.map((s) => (
                      <li key={s.step_no} className={clsx('rounded-xl border px-3 py-2 text-xs', s.status === 'approved' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : s.status === 'pending' ? 'border-amber-300 bg-amber-50 text-amber-800' : s.status === 'rejected' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-slate-200 bg-white text-slate-500')}>
                        <div className="font-black">{s.step_no}. {s.label}</div>
                        <div>{s.status === 'approved' ? `وافق ${s.decided_by ?? ''} · ${fmtDateTime(s.decided_at)}` : s.status === 'pending' ? 'بانتظار القرار' : s.status === 'rejected' ? `أعاد ${s.decided_by ?? ''}` : 'لاحقاً'}</div>
                        {s.approvers?.length ? <div className="text-[10px] opacity-70">{s.approvers.join('، ')}</div> : null}
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {d.can_decide && d.status === 'pending' && (
                <section className="rounded-2xl border-2 border-brand-200 bg-brand-50/40 p-3" data-testid="disc-decision">
                  <h3 className="text-sm font-black text-slate-800">قرارك — {d.current_step}</h3>
                  <p className="mb-2 text-xs text-slate-500">حدّد مبلغ الاستقطاع (مثال 5000) أو اتركه فارغاً إن لم يكن هناك مبلغ. عند الاعتماد النهائي يُضاف المبلغ تلقائياً إلى حضورية الموظف ويُستقطع من راتبه.</p>
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <Field label="المبلغ (دينار عراقي)">
                      <input className={clsx(inputCls, amountBad && 'border-rose-400')} inputMode="numeric" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="بدون مبلغ" data-testid="decide-amount" />
                    </Field>
                    <div className="flex items-end gap-2">
                      <button type="button" className={btnPrimary} disabled={busy || amountBad} data-testid="decide-approve" onClick={() => decide.mutate({ id: d.id, approve: true, amount: amountNum, note: note || null }, { onSuccess: (r) => { if (r.status !== 'pending') onClose() } })}>اعتماد</button>
                      <button type="button" className={btnDanger} disabled={busy} data-testid="decide-return-open" onClick={() => setMode(mode === 'return' ? 'none' : 'return')}>إعادة بسبب</button>
                    </div>
                  </div>
                  {mode === 'return' && (
                    <div className="mt-2 grid gap-2">
                      <Field label="سبب الإعادة (يصل إلى غرفة العمليات)"><textarea className={clsx(inputCls, 'h-20 py-2')} value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثال: نقص في المعلومات — أضف اسم السائق الصحيح" data-testid="decide-reason" /></Field>
                      <button type="button" className={btnDanger} disabled={busy || note.trim().length < 3} data-testid="decide-return" onClick={() => decide.mutate({ id: d.id, approve: false, note: note.trim() }, { onSuccess: onClose })}>تأكيد الإعادة إلى غرفة العمليات</button>
                    </div>
                  )}
                </section>
              )}

              {opsMode && (d.status === 'draft' || d.status === 'returned') && (
                <section className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 p-3" data-testid="disc-ops-actions">
                  <button type="button" className={btnPrimary} disabled={busy} data-testid="ops-submit" onClick={() => submit.mutate(d.id, { onSuccess: onClose })}>{d.status === 'returned' ? 'إعادة الرفع بعد التصحيح' : 'رفع للموافقة'}</button>
                  {onEdit ? <button type="button" className={btnGhost} disabled={busy} data-testid="ops-edit" onClick={() => onEdit(d)}>تعديل</button> : null}
                  <button type="button" className={btnDanger} disabled={busy} data-testid="ops-cancel-open" onClick={() => setMode(mode === 'cancel' ? 'none' : 'cancel')}>إلغاء الكشف</button>
                </section>
              )}
              {opsMode && d.status === 'pending' && (
                <section className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 p-3" data-testid="disc-ops-actions">
                  <span className="text-xs text-slate-500">الكشف قيد الموافقة عند {d.current_step}. يمكنك إلغاؤه بسبب (يُبلَّغ المدير المفوض).</span>
                  <button type="button" className={btnDanger} disabled={busy} data-testid="ops-cancel-open" onClick={() => setMode(mode === 'cancel' ? 'none' : 'cancel')}>إلغاء الكشف</button>
                </section>
              )}
              {mode === 'cancel' && (
                <div className="grid gap-2 rounded-2xl border border-rose-200 bg-rose-50/50 p-3">
                  <Field label="سبب الإلغاء"><textarea className={clsx(inputCls, 'h-20 py-2')} value={note} onChange={(e) => setNote(e.target.value)} data-testid="cancel-reason" /></Field>
                  <button type="button" className={btnDanger} disabled={busy || note.trim().length < 3} data-testid="cancel-confirm" onClick={() => cancel.mutate({ id: d.id, reason: note.trim() }, { onSuccess: onClose })}>تأكيد الإلغاء</button>
                </div>
              )}

              {extraActions ? <div className="flex flex-wrap gap-2">{extraActions(d)}</div> : null}

              <section data-testid="disc-events">
                <h3 className="mb-2 text-xs font-black text-slate-500">سجل الأحداث</h3>
                <ol className="space-y-1.5 border-s-2 border-slate-200 ps-3">
                  {(d.events ?? []).map((e) => (
                    <li key={e.id} className="text-xs text-slate-700">
                      <span className="font-black">{e.actor_name ?? 'النظام'}</span> {EVENT_LABEL[e.action] ?? e.action}
                      {e.amount != null ? <span> · {fmtIqd(e.amount)}</span> : null}
                      {e.note ? <span className="text-slate-500"> — {e.note}</span> : null}
                      <span className="block text-[10px] text-slate-400">{fmtDateTime(e.at)}</span>
                    </li>
                  ))}
                  {(d.events ?? []).length === 0 ? <li className="text-xs text-slate-400">لا أحداث بعد</li> : null}
                </ol>
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  )
}

function Fact({ k, v }: { k: string; v: React.ReactNode }) {
  return <div><div className="text-[10px] font-bold text-slate-400">{k}</div><div className="text-sm text-slate-800">{v}</div></div>
}
