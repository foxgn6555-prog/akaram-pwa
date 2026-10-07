/** طلبات الموافقة (مشتركة: مسؤول القاطع، الميدانية، المعاون، المدير المفوض): مهام الموافقة المعلّقة لديّ (إجازات/زمنيات/مستلزمات 00162 /إنهاء خدمة 00163 /سلف 00191)
 * حسب سلاسل الموافقات؛ موافقة أو رفض بسبب إلزامي؛ مسار الطلب. السلفة: يمكن للمعتمِد تعديل المبلغ (وعدد الأقساط) قبل الموافقة. */
import { useState } from 'react'
import { CheckCircle2, Clock, Package, UserX, Wallet, XCircle } from 'lucide-react'
import { useApprovalTimeline, useDecideApproval, useMyApprovalTasks } from '@features/sector-manager/hooks'
import { useDecideAdvance } from '@features/advances/hooks'
import { STATUS_AR, dateAr, hm, timeAr } from '@features/sector-manager/format'
import type { AdvanceTaskDetails, ApprovalTask, TerminationTaskDetails } from '@sdk/sector-manager.sdk'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { fmtMoney } from '@portals/hr/components/hr-format'

export default function TeamRequestsPage({ title = 'طلبات فريقي' }: { title?: string }) {
  const tasks = useMyApprovalTasks()
  return (
    <div className="space-y-4 pb-4" data-testid="sm-requests">
      <header>
        <h1 className="text-lg font-black">{title}</h1>
        <p className="text-xs text-slate-600">الطلبات (إجازات، زمنيات، مستلزمات، إنهاء خدمة، سلف) التي وصلت إلى دورك في سلسلة الموافقات. الرفض يُنهي الطلب، والموافقة تنقله إلى الخطوة التالية أو تعتمده إن كنت الأخير.</p>
      </header>
      {tasks.isLoading ? <LoadingSpinner /> : (tasks.data ?? []).length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-white p-8 text-center text-sm text-slate-500" data-testid="sm-requests-empty">لا طلبات بانتظار قرارك الآن.</div>
      ) : (
        <ul className="space-y-3" data-testid="sm-requests-list">
          {(tasks.data ?? []).map((t) => <TaskCard key={t.task_id} t={t} />)}
        </ul>
      )}
    </div>
  )
}

type Decider = { pending: boolean; approve: (x: { amount: number | null; installments: number | null }) => void; reject: (note: string, onSuccess: () => void) => void }
/** بطاقة المهمة: السلفة تستخدم advance_decide (مع تعديل المبلغ)؛ البقية approval_decide_request — الخطاف يُستدعى في المغلّف المناسب فقط */
function TaskCard({ t }: { t: ApprovalTask }) {
  return t.request_kind === 'advance' ? <AdvanceTaskCard t={t} /> : <GenericTaskCard t={t} />
}
function GenericTaskCard({ t }: { t: ApprovalTask }) {
  const decide = useDecideApproval()
  return <TaskCardInner t={t} d={{ pending: decide.isPending, approve: () => decide.mutate({ kind: t.request_kind, requestId: t.request_id, approve: true }), reject: (note, onSuccess) => decide.mutate({ kind: t.request_kind, requestId: t.request_id, approve: false, note }, { onSuccess }) }} />
}
function AdvanceTaskCard({ t }: { t: ApprovalTask }) {
  const decide = useDecideAdvance()
  return <TaskCardInner t={t} d={{ pending: decide.isPending, approve: (x) => decide.mutate({ id: t.request_id, approve: true, amount: x.amount, installments: x.installments }), reject: (note, onSuccess) => decide.mutate({ id: t.request_id, approve: false, note }, { onSuccess }) }} />
}

function TaskCardInner({ t, d }: { t: ApprovalTask; d: Decider }) {
  const [mode, setMode] = useState<'idle' | 'reject'>('idle'), [note, setNote] = useState(''), [showPath, setShowPath] = useState(false)
  const timeline = useApprovalTimeline(showPath ? t.request_kind : undefined, showPath ? t.request_id : undefined)
  const isSupply = t.request_kind === 'supplies', isTermination = t.request_kind === 'termination', isAdvance = t.request_kind === 'advance'
  const term = isTermination ? (t.details as TerminationTaskDetails | null) : null
  const adv = isAdvance ? (t.details as AdvanceTaskDetails | null) : null
  const [editAmount, setEditAmount] = useState(false), [amount, setAmount] = useState(''), [inst, setInst] = useState('')
  const pending = d.pending
  const approve = () => d.approve({ amount: isAdvance && editAmount && amount.trim() !== '' ? Number(amount) : null, installments: isAdvance && editAmount && inst.trim() !== '' ? Number(inst) : null })
  const reject = () => d.reject(note.trim(), () => setMode('idle'))
  const period = isSupply || isTermination || isAdvance ? '' : t.request_kind === 'time_permit' ? `${dateAr(t.start_date)} · ${hm(t.start_time)}–${hm(t.end_time)} (${t.minutes} دقيقة)` : t.start_date === t.end_date ? `${dateAr(t.start_date)} (يوم واحد)` : `${dateAr(t.start_date)} → ${dateAr(t.end_date)} (${t.days} أيام)`
  return (
    <li className="rounded-2xl border bg-white p-4 shadow-sm" data-testid={`task-${t.request_id}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-black">{t.requester_name} <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">{t.requester_role_label}</span></div>
          <div className="text-[11px] text-slate-500">{[t.parent_sector, t.area_name].filter(Boolean).join(' · ')}</div>
        </div>
        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-800" data-testid={`task-step-${t.request_id}`}>خطوة {t.step_no} من {t.total_steps}</span>
      </div>
      <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
        <div className="font-black">{isSupply ? <><Package size={14} className="inline" /> {t.type_name} {t.ref_no && <span className="text-[11px] font-normal text-slate-500">· {t.ref_no}</span>}</> : isTermination ? <span className="text-rose-800"><UserX size={14} className="inline" /> {t.type_name} · {term?.type_label}</span>
          : isAdvance ? <span className="text-amber-800"><Wallet size={14} className="inline" /> {t.type_name} · {adv?.type_name} {t.ref_no && <span className="text-[11px] font-normal text-slate-500">· <span dir="ltr">{t.ref_no}</span></span>}</span> : t.type_name}</div>
        {term ? (
          <div className="mt-1 rounded-lg border border-rose-100 bg-white p-2 text-xs text-slate-800" data-testid={`task-termination-${t.request_id}`}>
            <div className="font-black">{term.target_name}</div>
            <div className="text-slate-600">{term.target_label}</div>
            <div className="mt-1 flex items-center gap-1 text-slate-700"><Clock size={12} /> آخر يوم عمل: {dateAr(term.last_day)}</div>
          </div>
        ) : adv ? (
          <div className="mt-1 rounded-lg border border-amber-100 bg-white p-2 text-xs text-slate-800" data-testid={`task-advance-${t.request_id}`}>
            <div className="font-black">{adv.employee_name} <span className="font-normal text-slate-500">{adv.employee_number ?? ''}</span></div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-slate-700">
              <span>المبلغ: <b className="tabular-nums" data-testid={`task-advance-amount-${t.request_id}`}>{fmtMoney(adv.amount)} د.ع</b>{adv.requested_amount !== adv.amount && <span className="text-slate-500"> (المطلوب أصلاً {fmtMoney(adv.requested_amount)})</span>}</span>
              <span>التسديد: <b>{adv.method_label}</b>{adv.method === 'equal' && adv.installments ? ` · ${adv.installments} شهراً` : adv.method === 'fixed' && adv.monthly_amount ? ` · ${fmtMoney(adv.monthly_amount)} شهرياً` : adv.method === 'percent' && adv.percent ? ` · ${adv.percent}%` : ''}</span>
              {adv.estimated_installment != null && adv.estimated_installment > 0 && <span>القسط الشهري التقديري: <b className="tabular-nums">{fmtMoney(adv.estimated_installment)}</b></span>}
            </div>
            {mode === 'idle' && (
              <div className="mt-2">
                {!editAmount ? (
                  <button type="button" data-testid={`advance-edit-${t.request_id}`} onClick={() => { setEditAmount(true); setAmount(String(adv.amount)); setInst(adv.installments ? String(adv.installments) : '') }} className="text-[11px] font-bold text-indigo-700 underline">تعديل المبلغ{adv.method === 'equal' ? ' / عدد الأقساط' : ''} قبل الموافقة</button>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[11px] font-bold text-slate-700">المبلغ المعتمد (د.ع)
                      <input data-testid={`advance-amount-${t.request_id}`} type="number" inputMode="numeric" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 h-9 w-full rounded-lg border px-2 text-sm font-normal tabular-nums" />
                    </label>
                    {adv.method === 'equal' && (
                      <label className="text-[11px] font-bold text-slate-700">عدد الأقساط
                        <input data-testid={`advance-installments-${t.request_id}`} type="number" inputMode="numeric" min={1} max={60} value={inst} onChange={(e) => setInst(e.target.value)} className="mt-1 h-9 w-full rounded-lg border px-2 text-sm font-normal tabular-nums" />
                      </label>
                    )}
                    <button type="button" onClick={() => setEditAmount(false)} className="col-span-2 text-start text-[11px] text-slate-500 underline">إلغاء التعديل (الموافقة على المبلغ كما هو)</button>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : isSupply ? (
          <ul className="mt-1 space-y-0.5 text-xs text-slate-800" data-testid={`task-items-${t.request_id}`}>
            {(t.items ?? []).map((it) => <li key={it.item_id} className="flex justify-between rounded-lg bg-white px-2 py-1"><span>{it.name}</span><b>{it.qty} {it.unit}</b></li>)}
          </ul>
        ) : <div className="mt-0.5 flex items-center gap-1 text-slate-700"><Clock size={14} />{period}</div>}
        {t.notes && <div className="mt-1 text-xs text-slate-600">{isTermination ? 'السبب: ' : ''}«{t.notes}»</div>}
        <div className="mt-1 text-[11px] text-slate-500">قُدّم {timeAr(t.created_at)} · {dateAr(t.created_at)}</div>
      </div>
      {t.previous_steps.length > 0 && (
        <ul className="mt-2 space-y-1 text-[11px]" data-testid={`task-prev-${t.request_id}`}>
          {t.previous_steps.map((p) => (
            <li key={p.step_no} className="flex items-center gap-1 text-slate-600">
              {p.status === 'approved' ? <CheckCircle2 size={12} className="text-emerald-600" /> : <span className="inline-block size-3 rounded-full bg-slate-300" />}
              {p.step_no}. {p.label}: {STATUS_AR[p.status] ?? p.status}{p.decided_by ? ` — ${p.decided_by}` : ''}{p.note ? ` («${p.note}»)` : ''}
            </li>
          ))}
        </ul>
      )}
      {mode === 'idle' ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" data-testid={`approve-${t.request_id}`} disabled={pending} onClick={approve}
            className="h-11 rounded-xl bg-emerald-600 text-sm font-black text-white disabled:opacity-40"><CheckCircle2 size={16} className="inline" /> موافقة</button>
          <button type="button" data-testid={`reject-${t.request_id}`} onClick={() => setMode('reject')} className="h-11 rounded-xl border border-rose-300 bg-rose-50 text-sm font-black text-rose-800"><XCircle size={16} className="inline" /> رفض</button>
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3">
          <label className="text-xs font-bold text-rose-900">سبب الرفض (إلزامي)
            <textarea data-testid={`reject-reason-${t.request_id}`} value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-normal" />
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" data-testid={`reject-confirm-${t.request_id}`} disabled={note.trim().length < 2 || pending}
              onClick={reject}
              className="h-10 rounded-xl bg-rose-600 text-sm font-black text-white disabled:opacity-40">تأكيد الرفض</button>
            <button type="button" onClick={() => setMode('idle')} className="h-10 rounded-xl border bg-white text-sm font-bold">إلغاء</button>
          </div>
        </div>
      )}
      <button type="button" data-testid={`path-${t.request_id}`} onClick={() => setShowPath((v) => !v)} className="mt-2 text-[11px] font-bold text-indigo-700 underline">{showPath ? 'إخفاء مسار الطلب' : 'عرض مسار الطلب كاملاً'}</button>
      {showPath && (
        <ol className="mt-2 space-y-1 rounded-xl border p-2 text-[11px]" data-testid={`path-list-${t.request_id}`}>
          {(timeline.data ?? []).map((s) => (
            <li key={s.step_no} className="flex flex-wrap items-center gap-1">
              <b>{s.step_no}.</b> {s.step_label} — <span className={s.status === 'approved' ? 'text-emerald-700' : s.status === 'rejected' ? 'text-rose-700' : s.status === 'pending' ? 'text-amber-700' : 'text-slate-500'}>{STATUS_AR[s.status]}</span>
              {s.approvers.length > 0 && <span className="text-slate-500">({s.approvers.map((a) => a.name).join('، ')})</span>}
            </li>
          ))}
        </ol>
      )}
    </li>
  )
}
