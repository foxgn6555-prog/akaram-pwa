/** وحدة «الإجراءات» (00163) — طلبات إنهاء الخدمة، مشتركة بين مسؤول القاطع والعمليات الميدانية والمعاون والمدير المفوض.
 * النطاق يحدده الخادم (termination_targets): كل بوابة ترى من يحق لها إنهاء خدمته فقط. التنفيذ لا يتم إلا بعد اكتمال سلسلة الموافقات
 * المضبوطة من التطوير المركزية (وبلا سلسلة: موافقة الموارد البشرية). لا بيانات مالية هنا. */
import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, Search, UserX, XCircle } from 'lucide-react'
import { useApprovalTimeline, useCancelTerminationRequest, useCreateTerminationRequest, useMyTerminationRequests, useTerminationTargets } from '@features/sector-manager/hooks'
import { STATUS_AR, dateAr, isoDay, timeAr } from '@features/sector-manager/format'
import { TERMINATION_TYPE_AR, type TerminationRequest, type TerminationTarget, type TerminationType } from '@sdk/sector-manager.sdk'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const SCOPE_AR: Record<string, string> = { department_manager: 'مسؤولو الأقسام', contractor: 'المتعهدون', worker: 'عمال المتعهدين', admin_ops: 'مسؤولو القواطع', garage: 'الكراج المركزي', maintenance: 'الصيانة', other: 'موظفون آخرون' }
const SCOPE_ORDER = ['admin_ops', 'department_manager', 'contractor', 'worker', 'garage', 'maintenance', 'other']
const REQ_STATUS_AR: Record<TerminationRequest['status'], string> = { pending: 'قيد الموافقة', executed: 'نُفّذ', rejected: 'مرفوض', cancelled: 'مسحوب' }
const REQ_STATUS_CLS: Record<TerminationRequest['status'], string> = { pending: 'bg-amber-50 text-amber-800', executed: 'bg-emerald-50 text-emerald-800', rejected: 'bg-rose-50 text-rose-800', cancelled: 'bg-slate-100 text-slate-600' }
const targetId = (t: TerminationTarget) => (t.target_kind === 'worker' ? t.worker_id : t.employee_id) as string

export default function ProceduresPage({ title = 'الإجراءات' }: { title?: string }) {
  const [tab, setTab] = useState<'new' | 'mine'>('new')
  const mine = useMyTerminationRequests()
  const pending = (mine.data ?? []).filter((r) => r.status === 'pending').length
  return (
    <div className="space-y-4 pb-4" data-testid="procedures-page">
      <header>
        <h1 className="text-lg font-black">{title}</h1>
        <p className="text-xs text-slate-600">طلبات إنهاء الخدمة ضمن نطاق صلاحيتك. لا يُنفَّذ أي إنهاء قبل اكتمال سلسلة الموافقات المضبوطة من التطوير المركزية.</p>
      </header>
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1 text-xs font-bold" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'new'} data-testid="tab-new" onClick={() => setTab('new')} className={`flex-1 rounded-lg py-2 ${tab === 'new' ? 'bg-white shadow' : 'text-slate-600'}`}>طلب إنهاء خدمة</button>
        <button type="button" role="tab" aria-selected={tab === 'mine'} data-testid="tab-mine" onClick={() => setTab('mine')} className={`flex-1 rounded-lg py-2 ${tab === 'mine' ? 'bg-white shadow' : 'text-slate-600'}`}>طلباتي {pending > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[10px] text-white">{pending}</span>}</button>
      </div>
      {tab === 'new' ? <NewTermination onDone={() => setTab('mine')} /> : <MyRequests />}
    </div>
  )
}

function NewTermination({ onDone }: { onDone: () => void }) {
  const targets = useTerminationTargets(), create = useCreateTerminationRequest()
  const [q, setQ] = useState(''), [picked, setPicked] = useState<TerminationTarget | null>(null)
  const [type, setType] = useState<TerminationType>('resignation'), [lastDay, setLastDay] = useState(isoDay()), [reason, setReason] = useState(''), [confirm, setConfirm] = useState(false)
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const rows = (targets.data ?? []).filter((t) => !needle || t.full_name.toLowerCase().includes(needle) || t.label.toLowerCase().includes(needle) || (t.employee_number ?? '').toLowerCase().includes(needle))
    const map = new Map<string, TerminationTarget[]>()
    for (const r of rows) map.set(r.scope, [...(map.get(r.scope) ?? []), r])
    return SCOPE_ORDER.filter((s) => map.has(s)).map((s) => ({ scope: s, rows: map.get(s) as TerminationTarget[] }))
  }, [targets.data, q])
  const canSend = Boolean(picked) && reason.trim().length >= 5 && Boolean(lastDay) && confirm && !create.isPending
  const submit = () => {
    if (!picked) return
    create.mutate({ targetKind: picked.target_kind, targetId: targetId(picked), type, lastDay, reason: reason.trim() }, { onSuccess: () => { setPicked(null); setReason(''); setConfirm(false); onDone() } })
  }
  if (targets.isLoading) return <LoadingSpinner />
  if (targets.isError) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" data-testid="procedures-error">تعذّر تحميل نطاق صلاحيتك.</div>
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border bg-white p-4 shadow-sm" data-testid="target-picker">
        <h2 className="text-sm font-black">1 · من؟ <span className="text-[11px] font-normal text-slate-500">({(targets.data ?? []).length} ضمن نطاقك)</span></h2>
        <label className="mt-2 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
          <Search size={14} className="text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالاسم أو الرقم الوظيفي أو المنطقة" className="w-full bg-transparent outline-none" data-testid="target-search" />
        </label>
        {groups.length === 0 ? <div className="mt-3 rounded-xl border border-dashed p-6 text-center text-xs text-slate-500" data-testid="targets-empty">لا أحد ضمن نطاقك يطابق البحث.</div> : (
          <div className="mt-2 max-h-[55vh] space-y-3 overflow-y-auto pe-1">
            {groups.map((g) => (
              <div key={g.scope}>
                <div className="sticky top-0 bg-white py-1 text-[11px] font-black text-slate-500">{SCOPE_AR[g.scope] ?? g.scope} · {g.rows.length}</div>
                <ul className="space-y-1">
                  {g.rows.map((t) => {
                    const id = targetId(t), on = picked ? targetId(picked) === id : false
                    return (
                      <li key={`${t.target_kind}-${id}`}>
                        <button type="button" data-testid={`target-${id}`} onClick={() => setPicked(on ? null : t)} className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-start text-sm ${on ? 'border-rose-400 bg-rose-50' : 'hover:bg-slate-50'}`}>
                          <span><span className="font-bold">{t.full_name}</span><span className="block text-[11px] text-slate-500">{t.label}{t.employee_number ? ` · ${t.employee_number}` : ''}</span></span>
                          {on && <UserX size={16} className="text-rose-700" />}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="rounded-2xl border bg-white p-4 shadow-sm" data-testid="termination-form">
        <h2 className="text-sm font-black">2 · تفاصيل الإنهاء</h2>
        {picked ? (
          <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm" data-testid="picked-target">
            <div className="font-black text-rose-900">{picked.full_name}</div>
            <div className="text-xs text-rose-800">{picked.label}</div>
          </div>
        ) : <div className="mt-2 rounded-xl border border-dashed p-3 text-center text-xs text-slate-500">اختر الشخص من القائمة أولاً.</div>}
        <label className="mt-3 block text-xs font-bold">نوع الإنهاء
          <select value={type} onChange={(e) => setType(e.target.value as TerminationType)} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" data-testid="termination-type">
            {(Object.keys(TERMINATION_TYPE_AR) as TerminationType[]).map((k) => <option key={k} value={k}>{TERMINATION_TYPE_AR[k]}</option>)}
          </select>
        </label>
        <label className="mt-3 block text-xs font-bold">آخر يوم عمل
          <input type="date" value={lastDay} onChange={(e) => setLastDay(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" data-testid="termination-last-day" />
        </label>
        <label className="mt-3 block text-xs font-bold">السبب (إلزامي)
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="اكتب السبب بوضوح — يظهر لكل خطوة في سلسلة الموافقات ويُحفظ في ملف الموظف" className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" data-testid="termination-reason" />
        </label>
        <label className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
          <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="mt-0.5" data-testid="termination-confirm" />
          <span><AlertTriangle size={12} className="inline" /> أُقرّ بأن هذا الطلب سيُنفَّذ فعلياً فور اكتمال الموافقات (إيقاف من الملاك وإبلاغ الموارد البشرية والتطوير المركزية) ولا يمكن التراجع عنه بعدها.</span>
        </label>
        <button type="button" data-testid="termination-submit" disabled={!canSend} onClick={submit} className="mt-3 w-full rounded-xl bg-rose-700 py-2.5 text-sm font-black text-white disabled:opacity-40">
          {create.isPending ? 'جارٍ الإرسال…' : 'إرسال الطلب إلى سلسلة الموافقات'}
        </button>
      </section>
    </div>
  )
}

function MyRequests() {
  const mine = useMyTerminationRequests()
  if (mine.isLoading) return <LoadingSpinner />
  const rows = mine.data ?? []
  if (rows.length === 0) return <div className="rounded-2xl border border-dashed bg-white p-8 text-center text-sm text-slate-500" data-testid="mine-empty">لم تُقدّم طلبات إنهاء خدمة بعد.</div>
  return <ul className="space-y-3" data-testid="mine-list">{rows.map((r) => <RequestCard key={r.id} r={r} />)}</ul>
}

function RequestCard({ r }: { r: TerminationRequest }) {
  const cancel = useCancelTerminationRequest()
  const [showPath, setShowPath] = useState(false)
  const timeline = useApprovalTimeline(showPath ? 'termination' : undefined, showPath ? r.id : undefined)
  return (
    <li className="rounded-2xl border bg-white p-4 shadow-sm" data-testid={`req-${r.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-black">{r.target_name}</div>
          <div className="text-[11px] text-slate-500">{r.target_label}</div>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${REQ_STATUS_CLS[r.status]}`} data-testid={`req-status-${r.id}`}>{REQ_STATUS_AR[r.status]}</span>
      </div>
      <div className="mt-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
        <div className="font-black text-rose-800"><UserX size={12} className="inline" /> {r.termination_type_label} · آخر يوم {dateAr(r.last_day)}</div>
        <div className="mt-1">السبب: «{r.reason}»</div>
        <div className="mt-1 text-[11px] text-slate-500">قُدّم {timeAr(r.created_at)} · {dateAr(r.created_at)}{r.status === 'pending' && r.current_step ? ` · الآن عند: ${r.current_step}` : ''}{r.executed_at ? ` · نُفّذ ${dateAr(r.executed_at)}` : ''}</div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" data-testid={`req-path-${r.id}`} onClick={() => setShowPath((v) => !v)} className="rounded-lg border px-3 py-1 text-xs font-bold">{showPath ? 'إخفاء المسار' : 'مسار الموافقات'}</button>
        {r.status === 'pending' && (
          <button type="button" data-testid={`req-cancel-${r.id}`} disabled={cancel.isPending} onClick={() => { if (window.confirm('سحب طلب إنهاء الخدمة؟')) cancel.mutate(r.id) }} className="rounded-lg border border-rose-200 px-3 py-1 text-xs font-bold text-rose-700">سحب الطلب</button>
        )}
      </div>
      {showPath && (
        <ul className="mt-2 space-y-1 text-[11px]" data-testid={`req-timeline-${r.id}`}>
          {timeline.isLoading ? <li><LoadingSpinner /></li> : (timeline.data ?? []).map((s) => (
            <li key={s.step_no} className="flex flex-wrap items-center gap-1">
              {s.status === 'approved' ? <CheckCircle2 size={12} className="text-emerald-600" /> : s.status === 'rejected' ? <XCircle size={12} className="text-rose-600" /> : <Clock size={12} className="text-slate-400" />}
              <b>{s.step_no}.</b> {s.step_label} — {STATUS_AR[s.status] ?? s.status}
              {s.decided_by_name && <span className="text-slate-500">· {s.decided_by_name} {dateAr(s.decided_at)}</span>}
              {s.note && <span className="text-slate-500">· «{s.note}»</span>}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
