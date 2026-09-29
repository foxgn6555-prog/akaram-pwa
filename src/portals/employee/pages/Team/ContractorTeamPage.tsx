/** بوابة المتعهد — فريقي: عدد الأفراد، إضافة عامل (القاطع/المنطقة من بيانات المتعهد تلقائياً)، إزالة عامل */
import { useState } from 'react'
import { Phone, Trash2, UserPlus, Users } from 'lucide-react'
import { useAddWorker, useContractorMe, useContractorWorkers, useRemoveWorker } from '@features/contractors/hooks'
import { PARENT_AR, dateAr } from '@features/contractors/format'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'

export default function ContractorTeamPage() {
  const me = useContractorMe(), workers = useContractorWorkers(), add = useAddWorker(), remove = useRemoveWorker()
  const [name, setName] = useState(''), [phone, setPhone] = useState('')
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null), [reason, setReason] = useState('')
  if (me.isLoading) return <LoadingSpinner />
  if (!me.data) return <EmptyState title="لم تُعيَّن بعد متعهداً على منطقة" hint="راجع التطوير المركزية" />
  const m = me.data
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim().length < 2) return
    add.mutate({ fullName: name, phone: phone || null }, { onSuccess: () => { setName(''); setPhone('') } })
  }
  return (
    <div className="space-y-4" data-testid="contractor-team">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white p-4 shadow-sm">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-black"><Users size={20} />فريقي</h1>
          <p className="text-xs text-slate-500">منطقة {m.area_name} · {PARENT_AR[m.parent_sector] ?? m.parent_sector}</p>
        </div>
        <div className="rounded-2xl bg-brand-50 px-4 py-2 text-center">
          <div className="text-[11px] font-bold text-brand-700">عدد أفراد الفريق</div>
          <div className="text-2xl font-black text-brand-800" data-testid="team-count">{workers.data?.length ?? m.workers_count}</div>
        </div>
      </header>
      <form onSubmit={submit} className="grid gap-2 rounded-2xl border bg-white p-4 shadow-sm md:grid-cols-[1fr_1fr_auto]" data-testid="add-worker-form">
        <label className="text-xs font-bold">اسم العامل
          <input data-testid="worker-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-11 w-full rounded-xl border px-3 text-sm" placeholder="الاسم الثلاثي" />
        </label>
        <label className="text-xs font-bold">الهاتف (اختياري)
          <input data-testid="worker-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className="mt-1 h-11 w-full rounded-xl border px-3 text-sm" placeholder="07xxxxxxxxx" />
        </label>
        <div className="flex flex-col justify-end">
          <p className="mb-1 text-[11px] text-slate-500">القاطع والمنطقة يُسجَّلان تلقائياً: <b>{PARENT_AR[m.parent_sector] ?? m.parent_sector} / {m.area_name}</b></p>
          <button type="submit" disabled={name.trim().length < 2 || add.isPending} data-testid="add-worker" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-black text-white disabled:opacity-40">
            <UserPlus size={16} />إضافة عامل
          </button>
        </div>
      </form>
      {workers.isLoading ? <LoadingSpinner /> : !workers.data?.length ? <EmptyState title="لا عمال بعد" hint="أضف أول عامل من النموذج أعلاه" /> : (
        <ul className="grid gap-2 md:grid-cols-2" data-testid="workers-list">
          {workers.data.map((w, i) => (
            <li key={w.id} className="flex items-center justify-between gap-3 rounded-2xl border bg-white p-3 shadow-sm" data-testid={`worker-${w.id}`}>
              <div className="min-w-0">
                <div className="font-black">{i + 1}. {w.full_name}</div>
                <div className="flex flex-wrap gap-x-3 text-[11px] text-slate-500">
                  {w.phone && <span className="inline-flex items-center gap-1"><Phone size={11} />{w.phone}</span>}
                  <span>{PARENT_AR[w.parent_sector] ?? w.parent_sector} / {w.area_name}</span>
                  <span>منذ {dateAr(w.created_at)}</span>
                  <span>هذا الشهر: حاضر {w.month_present} · غائب {w.month_absent}</span>
                </div>
              </div>
              <button onClick={() => { setRemoving({ id: w.id, name: w.full_name }); setReason('') }} data-testid={`remove-${w.id}`} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-xs font-bold text-rose-700"><Trash2 size={12} />إزالة</button>
            </li>
          ))}
        </ul>
      )}
      {removing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center" role="dialog" aria-label="تأكيد إزالة عامل">
          <div className="w-full max-w-md space-y-3 rounded-2xl bg-white p-4">
            <h3 className="font-black">إزالة {removing.name} من الفريق؟</h3>
            <p className="text-xs text-slate-500">يبقى سجل حضوره السابق محفوظاً في التقارير.</p>
            <input data-testid="remove-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="السبب (اختياري)" className="h-11 w-full rounded-xl border px-3 text-sm" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setRemoving(null)} className="rounded-xl border px-4 py-2 text-sm font-bold">إلغاء</button>
              <button data-testid="confirm-remove" onClick={() => remove.mutate({ workerId: removing.id, reason }, { onSuccess: () => setRemoving(null) })} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-black text-white">تأكيد الإزالة</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
