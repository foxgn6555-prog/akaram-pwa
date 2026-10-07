/**
 * السُّلَف — غرفة العمليات (00191)
 *  · إدخال طلب سلفة لموظف: الموظف، النوع (من التطوير المركزية)، المبلغ، طريقة التسديد، ملاحظة
 *  · يمرّ الطلب بسلسلة الموافقات ثم يصل المالية للتسليم؛ هنا تظهر حالة الطلبات فقط (بلا أي بيانات رواتب أو أقساط)
 *  · إلغاء طلب ما دام قيد الموافقة (بسبب)
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { Search, Wallet } from 'lucide-react'
import { useAdvanceEmployeeLookup, useAdvanceTypes, useAdvancesList, useCancelAdvance, useCreateAdvance } from '@features/advances/hooks'
import { REPAYMENT_METHOD_HINT, REPAYMENT_METHOD_LABEL, type Advance, type AdvanceEmployee, type AdvanceStatus, type RepaymentMethod } from '@sdk/advances.sdk'
import { fmtDT, methodDetail } from '@features/advances/format'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { field, fmtMoney } from '@portals/hr/components/hr-format'

const STATUS_TONE: Record<AdvanceStatus, string> = {
  pending: 'bg-amber-50 text-amber-800 border-amber-200', approved: 'bg-sky-50 text-sky-800 border-sky-200', delivered: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  settled: 'bg-slate-100 text-slate-700 border-slate-200', rejected: 'bg-rose-50 text-rose-800 border-rose-200', cancelled: 'bg-slate-100 text-slate-600 border-slate-200',
}

export default function OpsAdvancesPage() {
  const [status, setStatus] = useState<AdvanceStatus | 'open' | ''>('open')
  const list = useAdvancesList({ status, limit: 300 })
  const [showForm, setShowForm] = useState(false)
  return (
    <div className="space-y-4 pb-6" data-testid="ops-advances">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-black"><Wallet size={18} className="inline" /> السُّلَف</h1>
          <p className="text-xs text-slate-600">تُدخل غرفة العمليات طلب السلفة لموظف، ثم يمرّ بسلسلة الموافقات، وتسلّمه الشؤون المالية. تظهر هنا حالة الطلبات فقط.</p>
        </div>
        <button type="button" data-testid="adv-new" onClick={() => setShowForm((v) => !v)} className="h-10 rounded-xl bg-indigo-600 px-4 text-sm font-black text-white">{showForm ? 'إغلاق النموذج' : 'طلب سلفة جديد'}</button>
      </header>
      {showForm && <RequestForm onDone={() => setShowForm(false)} />}

      <div className="flex flex-wrap gap-1" data-testid="adv-status-filter">
        {([['open', 'المفتوحة'], ['pending', 'قيد الموافقة'], ['approved', 'بانتظار التسليم'], ['delivered', 'مسلَّمة'], ['settled', 'مسدَّدة'], ['rejected', 'مرفوضة'], ['cancelled', 'ملغاة'], ['', 'الكل']] as const).map(([k, l]) => (
          <button key={k || 'all'} type="button" data-testid={`adv-filter-${k || 'all'}`} onClick={() => setStatus(k)} className={clsx('h-8 rounded-full border px-3 text-xs font-bold', status === k ? 'border-indigo-600 bg-indigo-600 text-white' : 'bg-white text-slate-700')}>{l}</button>
        ))}
      </div>
      {list.isLoading ? <LoadingSpinner /> : (list.data ?? []).length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-white p-8 text-center text-sm text-slate-500" data-testid="adv-empty">لا طلبات سلف في هذا التصنيف.</div>
      ) : (
        <ul className="space-y-2" data-testid="adv-list">{(list.data ?? []).map((a) => <AdvanceCard key={a.id} a={a} />)}</ul>
      )}
    </div>
  )
}

function AdvanceCard({ a }: { a: Advance }) {
  const cancel = useCancelAdvance()
  const [reason, setReason] = useState(''), [mode, setMode] = useState<'idle' | 'cancel'>('idle')
  return (
    <li className="rounded-2xl border bg-white p-3 shadow-sm" data-testid={`adv-${a.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-black">{a.employee_name} <span className="text-[11px] font-normal text-slate-500">{a.employee_number ?? ''}</span></div>
          <div className="text-[11px] text-slate-600">{a.type_name} · <span dir="ltr" className="font-mono">{a.ref_no}</span> · قُدّم {fmtDT(a.created_at)}{a.requested_by_name ? ` · ${a.requested_by_name}` : ''}</div>
        </div>
        <span className={clsx('rounded-full border px-2 py-0.5 text-[11px] font-bold', STATUS_TONE[a.status])} data-testid={`adv-status-${a.id}`}>{a.status_label}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700">
        <span>المبلغ: <b className="tabular-nums">{fmtMoney(a.amount)} د.ع</b>{a.requested_amount !== a.amount && <span className="text-slate-500"> (طُلب {fmtMoney(a.requested_amount)})</span>}</span>
        <span>التسديد: <b>{a.method_label}</b> · {methodDetail(a)}</span>
        {a.status === 'pending' && a.current_step && <span>الخطوة الحالية: <b>{a.current_step.step_no}. {a.current_step.label}</b></span>}
        {a.status === 'rejected' && a.reject_note && <span className="text-rose-700">سبب الرفض: {a.reject_note}</span>}
        {a.status === 'cancelled' && a.cancel_reason && <span className="text-slate-600">سبب الإلغاء: {a.cancel_reason}</span>}
        {a.delivered_at && <span>سُلّمت: {fmtDT(a.delivered_at)}</span>}
      </div>
      {a.notes && <p className="mt-1 text-[11px] text-slate-500">«{a.notes}»</p>}
      {a.status === 'pending' && (mode === 'idle' ? (
        <button type="button" data-testid={`adv-cancel-${a.id}`} onClick={() => setMode('cancel')} className="mt-2 text-[11px] font-bold text-rose-700 underline">إلغاء الطلب</button>
      ) : (
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2">
          <label className="flex-1 text-[11px] font-bold text-rose-900">سبب الإلغاء<input data-testid={`adv-cancel-reason-${a.id}`} value={reason} onChange={(e) => setReason(e.target.value)} className={clsx(field, 'mt-1 h-9 font-normal')} /></label>
          <button type="button" data-testid={`adv-cancel-confirm-${a.id}`} disabled={reason.trim().length < 2 || cancel.isPending} onClick={() => cancel.mutate({ id: a.id, reason: reason.trim() }, { onSuccess: () => setMode('idle') })} className="h-9 rounded-lg bg-rose-600 px-3 text-xs font-black text-white disabled:opacity-40">تأكيد الإلغاء</button>
          <button type="button" onClick={() => setMode('idle')} className="h-9 rounded-lg border bg-white px-3 text-xs font-bold">رجوع</button>
        </div>
      ))}
    </li>
  )
}

function RequestForm({ onDone }: { onDone: () => void }) {
  const types = useAdvanceTypes(false), create = useCreateAdvance()
  const [q, setQ] = useState(''), [emp, setEmp] = useState<AdvanceEmployee | null>(null)
  const lookup = useAdvanceEmployeeLookup(q, q.trim().length >= 2 && !emp)
  const [typeId, setTypeId] = useState(''), [amount, setAmount] = useState(''), [method, setMethod] = useState<RepaymentMethod>('equal')
  const [inst, setInst] = useState('3'), [monthly, setMonthly] = useState(''), [percent, setPercent] = useState('10'), [notes, setNotes] = useState('')
  const type = useMemo(() => (types.data ?? []).find((t) => t.id === typeId) ?? null, [types.data, typeId])
  const amt = Number(amount)
  const estimate = method === 'equal' ? Math.ceil(amt / Math.max(Number(inst) || 1, 1)) : method === 'fixed' ? Number(monthly) : method === 'single' ? amt : null
  const valid = !!emp && !!typeId && amt > 0 && (type?.max_amount == null || amt <= type.max_amount)
    && (method !== 'equal' || (Number(inst) >= 1 && Number(inst) <= (type?.max_installments ?? 60)))
    && (method !== 'fixed' || (Number(monthly) > 0 && Number(monthly) <= amt))
    && (method !== 'percent' || (Number(percent) > 0 && Number(percent) <= 100))
  return (
    <form data-testid="adv-form" className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4"
      onSubmit={(e) => { e.preventDefault(); if (!valid || !emp) return
        create.mutate({ employeeId: emp.id, typeId, amount: Math.round(amt), method, installments: method === 'equal' ? Number(inst) : null, monthly: method === 'fixed' ? Math.round(Number(monthly)) : null, percent: method === 'percent' ? Number(percent) : null, notes: notes.trim() || null }, { onSuccess: onDone }) }}>
      <h2 className="text-sm font-black">طلب سلفة جديد</h2>
      <div className="relative">
        <label className="text-xs font-bold">الموظف
          <div className="relative mt-1">
            <Search size={14} className="pointer-events-none absolute start-3 top-3 text-slate-400" />
            <input data-testid="adv-emp-q" value={emp ? `${emp.full_name} ${emp.employee_number ? `(${emp.employee_number})` : ''}` : q} onChange={(e) => { setEmp(null); setQ(e.target.value) }} placeholder="ابحث بالاسم أو الرقم الوظيفي" className={clsx(field, 'ps-9 font-normal')} />
          </div>
        </label>
        {!emp && q.trim().length >= 2 && (lookup.data ?? []).length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-xl border bg-white shadow-lg" data-testid="adv-emp-results">
            {(lookup.data ?? []).map((e) => (
              <li key={e.id}>
                <button type="button" data-testid={`adv-emp-${e.id}`} onClick={() => setEmp(e)} className="flex w-full items-center justify-between px-3 py-2 text-start text-sm hover:bg-slate-50">
                  <span>{e.full_name} <span className="text-[11px] text-slate-500">{e.employee_number ?? ''}{e.department_name ? ` · ${e.department_name}` : ''}</span></span>
                  {e.open_advance && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">لديه سلفة مفتوحة {e.open_advance}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {emp?.open_advance && <p className="rounded-xl border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900" data-testid="adv-open-warning">لدى هذا الموظف سلفة مفتوحة ({emp.open_advance}) — قد يُرفض الطلب تلقائياً حسب سياسة التطوير المركزية.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold">نوع السلفة
          <select data-testid="adv-type" value={typeId} onChange={(e) => setTypeId(e.target.value)} className={clsx(field, 'mt-1 font-normal')}>
            <option value="">— اختر —</option>
            {(types.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}{t.max_amount != null ? ` (حتى ${fmtMoney(t.max_amount)})` : ''}</option>)}
          </select>
          {type && <span className="mt-1 block text-[11px] font-normal text-slate-500">أقصى عدد أقساط لهذا النوع: {type.max_installments}{type.max_amount != null ? ` · سقف المبلغ ${fmtMoney(type.max_amount)} د.ع` : ''}</span>}
        </label>
        <label className="text-xs font-bold">المبلغ (د.ع)<input data-testid="adv-amount" type="number" inputMode="numeric" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} className={clsx(field, 'mt-1 font-normal tabular-nums')} /></label>
      </div>
      <fieldset>
        <legend className="text-xs font-bold">طريقة التسديد</legend>
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
          {(Object.keys(REPAYMENT_METHOD_LABEL) as RepaymentMethod[]).map((m) => (
            <label key={m} className={clsx('cursor-pointer rounded-xl border bg-white p-2 text-xs', method === m && 'border-indigo-500 ring-2 ring-indigo-200')}>
              <input type="radio" name="method" data-testid={`adv-method-${m}`} checked={method === m} onChange={() => setMethod(m)} className="me-1" /><b>{REPAYMENT_METHOD_LABEL[m]}</b>
              <span className="block text-[11px] text-slate-500">{REPAYMENT_METHOD_HINT[m]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-3">
        {method === 'equal' && <label className="text-xs font-bold">عدد الأقساط (أشهر)<input data-testid="adv-installments" type="number" inputMode="numeric" min={1} max={type?.max_installments ?? 60} value={inst} onChange={(e) => setInst(e.target.value)} className={clsx(field, 'mt-1 font-normal tabular-nums')} /></label>}
        {method === 'fixed' && <label className="text-xs font-bold">المبلغ الشهري (د.ع)<input data-testid="adv-monthly" type="number" inputMode="numeric" min={1} value={monthly} onChange={(e) => setMonthly(e.target.value)} className={clsx(field, 'mt-1 font-normal tabular-nums')} /></label>}
        {method === 'percent' && <label className="text-xs font-bold">النسبة من الراتب (%)<input data-testid="adv-percent" type="number" inputMode="numeric" min={1} max={100} value={percent} onChange={(e) => setPercent(e.target.value)} className={clsx(field, 'mt-1 font-normal tabular-nums')} /></label>}
        {estimate != null && estimate > 0 && Number.isFinite(estimate) && <p className="self-end text-xs text-slate-700" data-testid="adv-estimate">القسط الشهري: <b className="tabular-nums">{fmtMoney(estimate)} د.ع</b>{method === 'fixed' && amt > 0 ? ` · على ${Math.ceil(amt / estimate)} شهراً` : ''}</p>}
      </div>
      <label className="block text-xs font-bold">ملاحظة (اختياري)<textarea data-testid="adv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-normal" /></label>
      <p className="text-[11px] text-slate-500">يبدأ الاستقطاع من راتب الشهر التالي لتسليم المبلغ. يُرفض الطلب تلقائياً إن تجاوز القسط الشهري النسبة المسموحة من الراتب (سياسة التطوير المركزية).</p>
      <div className="flex gap-2">
        <button type="submit" data-testid="adv-submit" disabled={!valid || create.isPending} className="h-10 rounded-xl bg-indigo-600 px-4 text-sm font-black text-white disabled:opacity-40">إرسال الطلب إلى سلسلة الموافقات</button>
        <button type="button" onClick={onDone} className="h-10 rounded-xl border bg-white px-4 text-sm font-bold">إلغاء</button>
      </div>
    </form>
  )
}
