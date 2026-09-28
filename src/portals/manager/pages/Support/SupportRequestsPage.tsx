/** طلبات الدعم بين مسؤولي الأقسام (00154): طلب آليات من مسؤول آخر، قبول/رفض الوارد، إنهاء/استرجاع الدعم */
import { useMemo, useState } from 'react'
import { ArrowLeftRight, Send, Truck, XCircle } from 'lucide-react'
import {
  useAcceptSupportRequest,
  useCancelSupportRequest,
  useCreateSupportRequest,
  useEndSupport,
  useManagerProfile,
  useRejectSupportRequest,
  useSectors,
  useSupportLendableVehicles,
  useSupportManagers,
  useSupportRequests,
} from '@features/sector'
import type { SupportAssignment, SupportRequest } from '@features/sector'
import { SUPPORT_STATUS_META } from '@features/sector/supportMeta'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const dt = (v: string | null) =>
  v
    ? new Intl.DateTimeFormat('ar-IQ', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Baghdad' }).format(new Date(v))
    : '—'
const END_KIND: Record<NonNullable<SupportAssignment['end_kind']>, string> = {
  released: 'أنهاه المستفيد',
  recalled: 'استرجعها المالك',
  returned: 'عادت إلى الكراج',
  cancelled: 'أُلغي',
}

export default function SupportRequestsPage() {
  const requests = useSupportRequests()
  const profile = useManagerProfile()
  const sectors = useSectors()
  const [tab, setTab] = useState<'incoming' | 'outgoing'>('incoming')
  const [showNew, setShowNew] = useState(false)
  const [decide, setDecide] = useState<{ req: SupportRequest; kind: 'accept' | 'reject' | 'cancel' } | null>(null)
  const [endTarget, setEndTarget] = useState<{ req: SupportRequest; a: SupportAssignment } | null>(null)
  const list = requests.data ?? []
  const incoming = list.filter((r) => r.direction === 'incoming')
  const outgoing = list.filter((r) => r.direction === 'outgoing')
  const shown = tab === 'incoming' ? incoming : outgoing
  const pendingIncoming = incoming.filter((r) => r.status === 'pending').length
  const mySectors = useMemo(() => {
    const ids = profile.data?.sectors ?? []
    return (sectors.data ?? []).filter((s) => ids.includes(s.id))
  }, [profile.data, sectors.data])

  return (
    <section className="space-y-5" dir="rtl" data-testid="manager-support">
      <header className="rounded-3xl bg-gradient-to-l from-slate-950 via-violet-950 to-fuchsia-800 p-6 text-white shadow-xl">
        <span className="text-xs font-bold text-fuchsia-200">تعاون بين مسؤولي الأقسام</span>
        <h1 className="mt-2 text-2xl font-black">طلبات الدعم بالآليات</h1>
        <p className="mt-1 text-sm text-fuchsia-100">
          اطلب آليات من مسؤول آخر عند الحاجة، أو أرسل آلياتك دعماً لمنطقة أخرى. غرفة العمليات تُبلَّغ بكل خطوة.
        </p>
        <button
          data-testid="support-new"
          onClick={() => setShowNew(true)}
          className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-violet-900"
        >
          <Send className="h-4 w-4" /> طلب دعم جديد
        </button>
      </header>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="طلبات واردة بانتظارك" value={pendingIncoming} tone="text-amber-700" />
        <Stat label="دعم جارٍ (وارد + صادر)" value={list.filter((r) => r.status === 'accepted').length} tone="text-emerald-700" />
        <Stat label="طلباتي الصادرة" value={outgoing.length} tone="text-violet-700" />
      </div>
      <div className="flex gap-2">
        {(['incoming', 'outgoing'] as const).map((t) => (
          <button
            key={t}
            data-testid={`support-tab-${t}`}
            onClick={() => setTab(t)}
            className={`h-10 rounded-xl px-4 text-sm font-black ${tab === t ? 'bg-violet-900 text-white' : 'border bg-white text-slate-700'}`}
          >
            {t === 'incoming' ? `الواردة إليّ (${incoming.length})` : `الصادرة مني (${outgoing.length})`}
          </button>
        ))}
      </div>
      {requests.isLoading ? (
        <LoadingSpinner label="جارٍ تحميل طلبات الدعم…" />
      ) : !shown.length ? (
        <div className="rounded-3xl border bg-white p-12 text-center text-sm text-slate-500">
          {tab === 'incoming' ? 'لا توجد طلبات دعم واردة إليك.' : 'لم تُرسل أي طلب دعم بعد.'}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {shown.map((r) => (
            <article key={r.id} className="rounded-3xl border bg-white p-5 shadow-sm" data-testid={`support-req-${r.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className={`rounded-lg px-2 py-1 text-xs font-black ${SUPPORT_STATUS_META[r.status].cls}`}>
                    {SUPPORT_STATUS_META[r.status].label}
                  </span>
                  <h2 className="mt-3 text-lg font-black">
                    {r.direction === 'incoming' ? `${r.requester_name} يطلب دعمك` : `طلبك من ${r.target_name}`}
                  </h2>
                  <p className="mt-1 text-xs text-slate-600">
                    المنطقة المحتاجة: <b>{r.requester_area_name}</b> · العدد المطلوب: <b>{r.needed_count}</b> آلية
                  </p>
                </div>
                <ArrowLeftRight className="h-6 w-6 text-violet-700" />
              </div>
              <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-800">{r.reason}</p>
              <p className="mt-2 text-[11px] text-slate-500">أُرسل: {dt(r.created_at)}{r.decided_at ? ` · البتّ: ${dt(r.decided_at)}` : ''}</p>
              {r.decision_note && <p className="mt-1 text-xs text-slate-700">ملاحظة الرد: {r.decision_note}</p>}
              {r.cancel_reason && <p className="mt-1 text-xs text-rose-700">سبب الإلغاء: {r.cancel_reason}</p>}
              {r.assignments.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {r.assignments.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2 rounded-xl border p-3 text-xs" data-testid={`support-asg-${a.id}`}>
                      <span className="flex items-center gap-2">
                        <Truck className="h-4 w-4 text-slate-500" />
                        <b>{a.vehicle_name}</b> · DB {a.db_number} · {a.driver_name}
                      </span>
                      {a.ended_at ? (
                        <span className="text-slate-500">{END_KIND[a.end_kind ?? 'cancelled']} · {dt(a.ended_at)}</span>
                      ) : (
                        <button
                          data-testid={`support-end-${a.id}`}
                          onClick={() => setEndTarget({ req: r, a })}
                          className="h-8 rounded-lg bg-slate-900 px-3 font-black text-white"
                        >
                          {r.direction === 'outgoing' ? 'إنهاء الدعم' : 'استرجاع الآلية'}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {r.status === 'pending' && r.direction === 'incoming' && (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button data-testid={`support-accept-${r.id}`} onClick={() => setDecide({ req: r, kind: 'accept' })} className="h-11 rounded-xl bg-emerald-700 text-sm font-black text-white">
                    موافقة وإرسال آليات
                  </button>
                  <button data-testid={`support-reject-${r.id}`} onClick={() => setDecide({ req: r, kind: 'reject' })} className="h-11 rounded-xl border border-rose-300 text-sm font-black text-rose-700">
                    اعتذار
                  </button>
                </div>
              )}
              {r.status === 'pending' && r.direction === 'outgoing' && (
                <button data-testid={`support-cancel-${r.id}`} onClick={() => setDecide({ req: r, kind: 'cancel' })} className="mt-4 h-11 w-full rounded-xl border text-sm font-black text-slate-700">
                  إلغاء الطلب
                </button>
              )}
            </article>
          ))}
        </div>
      )}
      {showNew && <NewRequestDialog mySectors={mySectors} onClose={() => setShowNew(false)} />}
      {decide && <DecisionDialog req={decide.req} kind={decide.kind} onClose={() => setDecide(null)} />}
      {endTarget && <EndDialog req={endTarget.req} a={endTarget.a} onClose={() => setEndTarget(null)} />}
    </section>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-black ${tone}`}>{value}</p>
    </div>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-black">{title}</h3>
          <button onClick={onClose} aria-label="إغلاق" className="rounded-lg p-1 text-slate-500">
            <XCircle className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function NewRequestDialog({ mySectors, onClose }: { mySectors: Array<{ id: number; name: string }>; onClose: () => void }) {
  const managers = useSupportManagers()
  const create = useCreateSupportRequest()
  const [target, setTarget] = useState('')
  const [sectorId, setSectorId] = useState<number>(mySectors[0]?.id ?? 0)
  const [count, setCount] = useState(1)
  const [reason, setReason] = useState('')
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    create.mutate({ targetUserId: target, sectorId, neededCount: count, reason }, { onSuccess: onClose })
  }
  return (
    <Modal title="طلب دعم بآليات" onClose={onClose}>
      <form onSubmit={submit} className="mt-4 space-y-3 text-sm" data-testid="support-new-form">
        <label className="block">
          <span className="text-xs font-bold text-slate-600">المسؤول الذي تطلب منه الدعم</span>
          <select data-testid="support-target" required value={target} onChange={(e) => setTarget(e.target.value)} className="mt-1 h-11 w-full rounded-xl border px-3">
            <option value="">— اختر مسؤولاً —</option>
            {(managers.data ?? []).map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.manager_name} — {m.area_names.join('، ')} ({m.active_vehicles} آلية نشطة)
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-600">المنطقة التي تحتاج الدعم (من مناطقك)</span>
          <select data-testid="support-sector" required value={sectorId || ''} onChange={(e) => setSectorId(Number(e.target.value))} className="mt-1 h-11 w-full rounded-xl border px-3">
            {mySectors.length === 0 && <option value="">لا مناطق مسندة إليك</option>}
            {mySectors.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-600">عدد الآليات المطلوبة</span>
          <input data-testid="support-count" type="number" min={1} max={20} required value={count} onChange={(e) => setCount(Number(e.target.value))} className="mt-1 h-11 w-full rounded-xl border px-3" />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-600">سبب الطلب</span>
          <textarea data-testid="support-reason" required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 min-h-24 w-full rounded-xl border p-3" placeholder="مثال: تراكم نفايات بعد سوق الجمعة ونحتاج كابسة إضافية حتى الظهر" />
        </label>
        <button data-testid="support-submit" disabled={create.isPending || !target || !sectorId} className="h-11 w-full rounded-xl bg-violet-900 text-sm font-black text-white disabled:opacity-50">
          إرسال الطلب
        </button>
      </form>
    </Modal>
  )
}

function DecisionDialog({ req, kind, onClose }: { req: SupportRequest; kind: 'accept' | 'reject' | 'cancel'; onClose: () => void }) {
  const lendable = useSupportLendableVehicles(kind === 'accept')
  const accept = useAcceptSupportRequest()
  const reject = useRejectSupportRequest()
  const cancel = useCancelSupportRequest()
  const [picked, setPicked] = useState<string[]>([])
  const [note, setNote] = useState('')
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < req.needed_count ? [...p, id] : p))
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (kind === 'accept') accept.mutate({ requestId: req.id, departureIds: picked, note: note || undefined }, { onSuccess: onClose })
    else if (kind === 'reject') reject.mutate({ requestId: req.id, note }, { onSuccess: onClose })
    else cancel.mutate({ requestId: req.id, reason: note }, { onSuccess: onClose })
  }
  const title = kind === 'accept' ? `إرسال آليات إلى ${req.requester_area_name}` : kind === 'reject' ? 'الاعتذار عن الطلب' : 'إلغاء الطلب'
  const busy = accept.isPending || reject.isPending || cancel.isPending
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="mt-4 space-y-3 text-sm" data-testid={`support-decision-${kind}`}>
        {kind === 'accept' && (
          <div>
            <p className="text-xs text-slate-600">
              اختر حتى <b>{req.needed_count}</b> من آلياتك التي تعمل في موقعك الآن (المحدد: {picked.length})
            </p>
            {lendable.isLoading ? (
              <LoadingSpinner label="جارٍ تحميل آلياتك…" />
            ) : !(lendable.data ?? []).length ? (
              <p className="mt-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800" data-testid="support-no-lendable">
                لا توجد لديك آلية تعمل في الموقع الآن يمكن إرسالها — الآليات في الطريق أو المحطة أو الصيانة أو المُعارة أصلاً لا تظهر هنا.
              </p>
            ) : (
              <ul className="mt-2 max-h-64 space-y-2 overflow-auto">
                {(lendable.data ?? []).map((v) => (
                  <li key={v.departure_id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border p-3">
                      <input type="checkbox" data-testid={`lend-${v.departure_id}`} checked={picked.includes(v.departure_id)} onChange={() => toggle(v.departure_id)} />
                      <span>
                        <b>{v.vehicle_name}</b> · DB {v.db_number} · {v.driver_name} · {v.area_name}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <label className="block">
          <span className="text-xs font-bold text-slate-600">{kind === 'accept' ? 'ملاحظة (اختياري)' : 'السبب (إلزامي)'}</span>
          <textarea data-testid="support-note" required={kind !== 'accept'} minLength={kind !== 'accept' ? 3 : undefined} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 min-h-20 w-full rounded-xl border p-3" />
        </label>
        <button data-testid="support-decision-submit" disabled={busy || (kind === 'accept' && picked.length === 0)} className={`h-11 w-full rounded-xl text-sm font-black text-white disabled:opacity-50 ${kind === 'accept' ? 'bg-emerald-700' : 'bg-rose-700'}`}>
          {kind === 'accept' ? `إرسال ${picked.length} آلية` : kind === 'reject' ? 'تأكيد الاعتذار' : 'تأكيد الإلغاء'}
        </button>
      </form>
    </Modal>
  )
}

function EndDialog({ req, a, onClose }: { req: SupportRequest; a: SupportAssignment; onClose: () => void }) {
  const end = useEndSupport()
  const [note, setNote] = useState('')
  const owner = req.direction === 'incoming'
  return (
    <Modal title={owner ? 'استرجاع الآلية إلى منطقتك' : 'إنهاء الدعم وإعادة الآلية'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          end.mutate({ assignmentId: a.id, note: note || undefined }, { onSuccess: onClose })
        }}
        className="mt-4 space-y-3 text-sm"
      >
        <p className="rounded-xl bg-slate-50 p-3">
          <b>{a.vehicle_name}</b> · DB {a.db_number} — ستعود إلى منطقتها الأصلية وتُراقَب ضد زونها من جديد.
        </p>
        <textarea data-testid="support-end-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className="min-h-20 w-full rounded-xl border p-3" placeholder="ملاحظة (اختياري)" />
        <button data-testid="support-end-submit" disabled={end.isPending} className="h-11 w-full rounded-xl bg-slate-900 text-sm font-black text-white disabled:opacity-50">
          تأكيد
        </button>
      </form>
    </Modal>
  )
}
