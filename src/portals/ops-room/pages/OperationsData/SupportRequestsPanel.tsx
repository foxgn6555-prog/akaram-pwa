/** لوحة طلبات الدعم بين المسؤولين في غرفة العمليات (00154): للعلم + إلغاء بسبب */
import { useState } from 'react'
import { useCancelSupportRequest } from '@features/sector'
import type { SupportRequest } from '@features/sector'
import { SUPPORT_STATUS_LABEL } from '@features/sector/supportMeta'

const dt = (v: string | null) =>
  v ? new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Baghdad' }).format(new Date(v)) : '—'

export function SupportRequestsPanel({ requests }: { requests: SupportRequest[] }) {
  const cancel = useCancelSupportRequest()
  const [target, setTarget] = useState<SupportRequest | null>(null)
  const [reason, setReason] = useState('')
  const open = requests.filter((r) => r.status === 'pending' || r.status === 'accepted')
  return (
    <section className="space-y-3" data-testid="ops-support-panel">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="طلبات معلّقة" value={requests.filter((r) => r.status === 'pending').length} />
        <Stat label="دعم جارٍ الآن" value={requests.filter((r) => r.status === 'accepted').length} />
        <Stat label="آليات في مهام دعم" value={requests.flatMap((r) => r.assignments).filter((a) => !a.ended_at).length} />
        <Stat label="مرفوض / ملغى" value={requests.filter((r) => r.status === 'rejected' || r.status === 'cancelled').length} />
      </div>
      {open.length > 0 && (
        <div className="rounded-3xl border border-violet-200 bg-violet-50/60 p-4">
          <b className="text-sm text-violet-900">الطلبات المفتوحة — القرار بين المسؤولين، وغرفة العمليات تُلغي بسبب عند الحاجة</b>
          <ul className="mt-3 grid gap-2 lg:grid-cols-2">
            {open.map((r) => (
              <li key={r.id} className="rounded-2xl border bg-white p-3 text-xs" data-testid={`ops-support-${r.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <b>{r.requester_name}</b> ({r.requester_area_name}) ← <b>{r.target_name}</b>
                    <p className="mt-1 text-slate-600">{r.needed_count} آلية · {r.reason}</p>
                    <p className="mt-1 text-[10px] text-slate-500">{SUPPORT_STATUS_LABEL[r.status]} · {dt(r.created_at)}</p>
                    {r.assignments.filter((a) => !a.ended_at).length > 0 && (
                      <p className="mt-1 text-[11px] text-emerald-800">
                        في المهمة: {r.assignments.filter((a) => !a.ended_at).map((a) => `${a.vehicle_name} · DB ${a.db_number}`).join('، ')}
                      </p>
                    )}
                  </div>
                  <button
                    data-testid={`ops-support-cancel-${r.id}`}
                    onClick={() => {
                      setTarget(r)
                      setReason('')
                    }}
                    className="h-9 shrink-0 rounded-lg border border-rose-300 px-3 font-black text-rose-700"
                  >
                    إلغاء
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {target && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" role="dialog" aria-modal="true">
          <form
            data-testid="ops-support-cancel-form"
            onSubmit={(e) => {
              e.preventDefault()
              cancel.mutate({ requestId: target.id, reason }, { onSuccess: () => setTarget(null) })
            }}
            className="w-full max-w-md space-y-3 rounded-3xl bg-white p-5 text-sm shadow-2xl"
          >
            <h3 className="text-lg font-black">إلغاء طلب الدعم من غرفة العمليات</h3>
            <p className="rounded-xl bg-slate-50 p-3 text-xs">
              {target.requester_name} ← {target.target_name} · سيُبلَّغ الطرفان، وتعود أي آلية في المهمة إلى منطقتها الأصلية.
            </p>
            <textarea data-testid="ops-support-cancel-reason" required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-20 w-full rounded-xl border p-3" placeholder="سبب الإلغاء (إلزامي)" />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setTarget(null)} className="h-11 rounded-xl border font-black">تراجع</button>
              <button data-testid="ops-support-cancel-submit" disabled={cancel.isPending} className="h-11 rounded-xl bg-rose-700 font-black text-white disabled:opacity-50">تأكيد الإلغاء</button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border bg-white p-3 shadow-sm">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="text-xl font-black">{value}</p>
    </div>
  )
}
