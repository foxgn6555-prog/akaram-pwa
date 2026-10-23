/** 00336: لوحة تفويض الموافقات — يستخدمها الموافِق من صفحة «طلبات الموافقة» (تفويضي أنا)،
 * وبوابة التطوير المركزية (كل التفويضات + تفويض نيابةً عن أي حساب). تعتمد على approval_delegation_set/cancel/list (00279).
 * قواعد المحرك: مدة ≤ 90 يوماً، لا تفويض دائري، تفويض واحد نافذ في الفترة، الإلغاء يُعيد المهام للموافِق الأصلي. */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { UserCheck, XCircle } from 'lucide-react'
import { useApprovalDelegations, useCancelApprovalDelegation, useSetApprovalDelegation } from '@features/sector-manager/hooks'
import { useUsers } from '@features/user-management'
import { dateAr } from '@features/sector-manager/format'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const today = () => new Date().toISOString().slice(0, 10)
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }

type UserOpt = { id: string; label: string }
function UserPicker({ testId, label, value, onChange, exclude }: { testId: string; label: string; value: UserOpt | null; onChange: (u: UserOpt | null) => void; exclude?: string[] }) {
  const [q, setQ] = useState('')
  const users = useUsers()
  const options = useMemo(() => (users.data ?? []).filter((u) => !(exclude ?? []).includes(u.id)).filter((u) => (u.employee_name ?? u.email ?? '').includes(q)).slice(0, 30), [users.data, q, exclude])
  return (
    <div className="space-y-1">
      <label className="text-xs font-bold text-slate-600">{label}</label>
      {value ? (
        <div className="flex items-center gap-2 rounded-xl border bg-emerald-50 px-3 py-2 text-sm" data-testid={`${testId}-selected`}>
          <span className="flex-1 font-bold">{value.label}</span>
          <button type="button" className="text-xs text-slate-600 underline" onClick={() => onChange(null)}>تغيير</button>
        </div>
      ) : (
        <>
          <input aria-label={label} data-testid={`${testId}-search`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالاسم" className="h-10 w-full rounded-xl border px-3 text-sm" />
          <div className="max-h-40 overflow-auto rounded-xl border bg-white">
            {options.length === 0 ? <div className="p-2 text-xs text-slate-500">لا نتائج.</div> : options.map((u) => (
              <button key={u.id} type="button" data-testid={`${testId}-opt-${u.id}`} className="block w-full px-3 py-2 text-right text-sm hover:bg-slate-50" onClick={() => onChange({ id: u.id, label: u.employee_name ?? u.email ?? u.id })}>{u.employee_name ?? u.email}</button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** `admin` = وضع التطوير المركزية: قائمة الكل + حقل «نيابةً عن». */
export function DelegationPanel({ admin = false }: { admin?: boolean }) {
  const list = useApprovalDelegations(admin)
  const set = useSetApprovalDelegation(), cancel = useCancelApprovalDelegation()
  const [open, setOpen] = useState(false)
  const [to, setTo] = useState<UserOpt | null>(null), [from, setFrom] = useState<UserOpt | null>(null)
  const [startsOn, setStartsOn] = useState(today()), [endsOn, setEndsOn] = useState(addDays(today(), 7)), [note, setNote] = useState('')
  const rows = list.data ?? []
  const current = rows.filter((d) => d.is_active)
  const days = Math.round((new Date(endsOn).getTime() - new Date(startsOn).getTime()) / 86_400_000) + 1
  const invalid = !to || (admin && !from) || !startsOn || !endsOn || days < 1 || days > 90 || endsOn < today()
  const submit = () => {
    if (invalid || !to) return
    set.mutate({ toUser: to.id, startsOn, endsOn, note: note.trim() || null, fromUser: admin ? from?.id ?? null : null }, { onSuccess: () => { setOpen(false); setTo(null); setFrom(null); setNote('') } })
  }
  return (
    <section className="rounded-2xl border bg-white p-4" data-testid="delegation-panel">
      <div className="flex flex-wrap items-center gap-2">
        <UserCheck className="h-5 w-5 text-emerald-700" />
        <h2 className="flex-1 text-base font-extrabold">{admin ? 'تفويضات الموافقات (كل الحسابات)' : 'تفويض موافقاتي'}</h2>
        <button type="button" data-testid="delegation-open" className="rounded-xl bg-emerald-700 px-3 py-2 text-sm font-bold text-white" onClick={() => setOpen((v) => !v)}>{open ? 'إغلاق' : admin ? 'تفويض نيابةً عن حساب' : 'تفويض جديد'}</button>
      </div>
      <p className="mt-1 text-xs text-slate-500">{admin ? 'يمكنك ضبط تفويض لأي موافِق (مثلاً أثناء إجازته) أو إلغاء أي تفويض؛ المهام المعلّقة تنتقل فوراً وتعود عند الإلغاء أو انتهاء المدة.' : 'أثناء غيابك تنتقل مهام الموافقة إلى من تفوّضه فوراً (ويُشعَر بذلك)، وتعود إليك تلقائياً بانتهاء المدة أو عند الإلغاء. المدة القصوى 90 يوماً.'}</p>

      {open && (
        <div className="mt-3 grid gap-3 rounded-xl border bg-slate-50 p-3 md:grid-cols-2" data-testid="delegation-form">
          {admin && <UserPicker testId="delegation-from" label="نيابةً عن (الموافِق الغائب)" value={from} onChange={setFrom} exclude={to ? [to.id] : []} />}
          <UserPicker testId="delegation-to" label="المفوَّض إليه" value={to} onChange={setTo} exclude={from ? [from.id] : []} />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-bold text-slate-600">من<input type="date" data-testid="delegation-start" value={startsOn} min={today()} onChange={(e) => setStartsOn(e.target.value)} className="mt-1 h-10 w-full rounded-xl border px-2 text-sm" /></label>
            <label className="text-xs font-bold text-slate-600">إلى<input type="date" data-testid="delegation-end" value={endsOn} min={startsOn} onChange={(e) => setEndsOn(e.target.value)} className="mt-1 h-10 w-full rounded-xl border px-2 text-sm" /></label>
          </div>
          <label className="text-xs font-bold text-slate-600 md:col-span-2">ملاحظة (اختياري)<input data-testid="delegation-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثال: إجازة سنوية" className="mt-1 h-10 w-full rounded-xl border px-3 text-sm" /></label>
          <div className="flex items-center gap-2 md:col-span-2">
            <span className={clsx('text-xs font-bold', days > 90 || days < 1 ? 'text-red-700' : 'text-slate-600')} data-testid="delegation-days">{days < 1 ? 'تاريخ النهاية قبل البداية' : days > 90 ? `المدة ${days} يوماً — الحد 90` : `المدة: ${days} يوم`}</span>
            <span className="flex-1" />
            <button type="button" data-testid="delegation-submit" disabled={invalid || set.isPending} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40" onClick={submit}>تفعيل التفويض</button>
          </div>
        </div>
      )}

      <div className="mt-3">
        {list.isLoading ? <LoadingSpinner /> : current.length === 0 ? (
          <div className="rounded-xl border border-dashed p-3 text-center text-xs text-slate-500" data-testid="delegation-empty">لا تفويضات فعّالة.</div>
        ) : (
          <ul className="space-y-2" data-testid="delegation-list">
            {current.map((d) => (
              <li key={d.id} data-testid={`delegation-${d.id}`} className={clsx('flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm', d.is_current ? 'border-emerald-300 bg-emerald-50' : 'bg-white')}>
                <span className="font-bold">{d.from_name}</span><span className="text-slate-500">←</span><span className="font-bold">{d.to_name}</span>
                <span className="text-xs text-slate-600">{dateAr(d.starts_on)} → {dateAr(d.ends_on)}</span>
                <span className={clsx('rounded-full px-2 py-0.5 text-xs font-bold', d.is_current ? 'bg-emerald-200 text-emerald-900' : 'bg-amber-100 text-amber-900')}>{d.is_current ? 'نافذ الآن' : 'مجدول'}</span>
                {d.note && <span className="text-xs text-slate-500">— {d.note}</span>}
                <span className="flex-1" />
                <button type="button" data-testid={`delegation-cancel-${d.id}`} disabled={cancel.isPending} className="inline-flex items-center gap-1 text-xs font-bold text-red-700" onClick={() => { if (window.confirm(`إلغاء تفويض ${d.from_name} إلى ${d.to_name}؟ تعود المهام المعلّقة إلى الموافِق الأصلي.`)) cancel.mutate(d.id) }}><XCircle className="h-4 w-4" /> إلغاء</button>
              </li>
            ))}
          </ul>
        )}
        {rows.some((d) => !d.is_active) && <details className="mt-2 text-xs text-slate-500"><summary className="cursor-pointer">تفويضات سابقة ({rows.filter((d) => !d.is_active).length})</summary>
          <ul className="mt-1 space-y-1">{rows.filter((d) => !d.is_active).map((d) => <li key={d.id}>{d.from_name} ← {d.to_name} · {dateAr(d.starts_on)} → {dateAr(d.ends_on)}</li>)}</ul></details>}
      </div>
    </section>
  )
}
