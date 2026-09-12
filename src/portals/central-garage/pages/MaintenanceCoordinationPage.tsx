import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  History,
  Search,
  ShieldCheck,
  Wrench,
} from 'lucide-react'
import {
  useGarageMaintenanceCoordination,
  useGarageMaintenanceDecision,
} from '@features/vehicle-operations/hooks'
import type { GarageMaintenanceCoordination } from '@sdk/vehicle-operations.sdk'
import { MaintenanceTimelineDialog } from '@features/vehicle-operations/components/MaintenanceTimelineDialog'
const dt = (v: string) =>
  new Intl.DateTimeFormat('ar-IQ', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Baghdad',
  }).format(new Date(v))
const stateLabel = {
  awaiting_ack: 'بانتظار تأكيد الاستلام',
  acknowledged: 'تم تأكيد الاستلام',
  awaiting_approval: 'بانتظار الموافقة',
  approved: 'تمت الموافقة',
  rejected: 'مرفوض',
}
export default function MaintenanceCoordinationPage() {
  const q = useGarageMaintenanceCoordination(),
    action = useGarageMaintenanceDecision(),
    [search, setSearch] = useState(''),
    [onlyPending, setOnlyPending] = useState(true),
    [target, setTarget] = useState<{
      row: GarageMaintenanceCoordination
      decision: 'acknowledge' | 'approve' | 'reject'
    } | null>(null),
    [notes, setNotes] = useState(''),
    [timeline, setTimeline] = useState<GarageMaintenanceCoordination | null>(null)
  const rows = useMemo(
      () =>
        (q.data ?? []).filter(
          (x) =>
            (!onlyPending ||
              x.decision_status === 'awaiting_ack' ||
              x.decision_status === 'awaiting_approval') &&
            `${x.vehicle_name} ${x.db_number} ${x.driver_name} ${x.manager_name} ${x.fault_type}`
              .toLowerCase()
              .includes(search.trim().toLowerCase()),
        ),
      [q.data, onlyPending, search],
    ),
    pending = (q.data ?? []).filter(
      (x) => x.decision_status === 'awaiting_ack' || x.decision_status === 'awaiting_approval',
    )
  const decide = (e: React.FormEvent) => {
    e.preventDefault()
    if (!target) return
    action.mutate(
      { caseId: target.row.case_id, decision: target.decision, notes },
      {
        onSuccess: () => {
          setTarget(null)
          setNotes('')
        },
      },
    )
  }
  return (
    <section className="space-y-5" dir="rtl" data-testid="garage-maintenance-coordination">
      <header className="overflow-hidden rounded-3xl bg-gradient-to-l from-slate-950 via-violet-950 to-cyan-900 p-6 text-white shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold text-cyan-200">تنسيق فوري دون تعطيل الميدان</span>
            <h1 className="mt-2 text-2xl font-black">حركة الآليات إلى الصيانة</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-200">
              أكد استلام البلاغ أو راجع طلب الموافقة وفق السياسة التي حددتها بوابة التطوير المركزي.
            </p>
          </div>
          <div className="rounded-2xl bg-white/10 p-4 text-center">
            <b className="block text-3xl">{pending.length}</b>
            <span className="text-xs">إجراء مطلوب</span>
          </div>
        </div>
      </header>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          icon={<Clock3 />}
          label="تأكيدات معلقة"
          value={pending.filter((x) => x.decision_status === 'awaiting_ack').length}
        />
        <Stat
          icon={<ShieldCheck />}
          label="موافقات معلقة"
          value={pending.filter((x) => x.decision_status === 'awaiting_approval').length}
        />
        <Stat icon={<Wrench />} label="سجل 30 يوماً" value={q.data?.length ?? 0} />
      </div>
      <div className="flex flex-wrap gap-3 rounded-2xl border bg-white p-3">
        <label className="relative min-w-64 flex-1">
          <Search className="absolute right-3 top-2.5 size-4 text-slate-400" />
          <input
            aria-label="بحث طلبات الصيانة"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-xl border pr-9 text-sm"
            placeholder="DB، الآلية، السائق، المسؤول أو العطل"
          />
        </label>
        <button
          onClick={() => setOnlyPending((v) => !v)}
          className={`rounded-xl px-4 text-xs font-black ${onlyPending ? 'bg-violet-700 text-white' : 'border bg-white'}`}
        >
          {onlyPending ? 'المعلقة فقط' : 'عرض كل السجل'}
        </button>
      </div>
      {q.isLoading ? (
        <div className="h-52 animate-pulse rounded-3xl bg-slate-100" />
      ) : rows.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {rows.map((row) => (
            <article
              key={row.case_id}
              className={`rounded-3xl border bg-white p-5 shadow-sm ${row.priority === 'critical' ? 'border-rose-300' : 'border-slate-200'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="rounded-lg bg-slate-950 px-2 py-1 text-xs font-black text-white">
                    DB {row.db_number}
                  </span>
                  <h2 className="mt-3 font-black">{row.vehicle_name}</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {row.vehicle_category} · السائق {row.driver_name}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-black ${row.decision_status.startsWith('awaiting') ? 'bg-amber-50 text-amber-800' : row.decision_status === 'rejected' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}
                >
                  {stateLabel[row.decision_status]}
                </span>
              </div>
              <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                <div className="flex gap-2">
                  <AlertTriangle className="size-5 text-rose-600" />
                  <div>
                    <b className="text-sm">{row.fault_type}</b>
                    <p className="mt-1 text-xs text-slate-500">
                      {row.sector_name} · المسؤول {row.manager_name}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">{dt(row.reported_at)}</p>
                  </div>
                </div>
              </div>
              {row.decision_status === 'awaiting_ack' && (
                <button
                  onClick={() => {
                    setTarget({ row, decision: 'acknowledge' })
                    setNotes('')
                  }}
                  className="mt-4 h-11 w-full rounded-xl bg-cyan-700 text-sm font-black text-white"
                >
                  تأكيد استلام البلاغ
                </button>
              )}
              {row.decision_status === 'awaiting_approval' && (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      setTarget({ row, decision: 'reject' })
                      setNotes('')
                    }}
                    className="h-11 rounded-xl border border-rose-300 font-black text-rose-700"
                  >
                    رفض مع السبب
                  </button>
                  <button
                    onClick={() => {
                      setTarget({ row, decision: 'approve' })
                      setNotes('')
                    }}
                    className="h-11 rounded-xl bg-emerald-700 font-black text-white"
                  >
                    موافقة وتحريك الآلية
                  </button>
                </div>
              )}
              {row.decision_notes && (
                <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs">
                  قرار الكراج: {row.decision_notes}
                </p>
              )}
              <button
                onClick={() => setTimeline(row)}
                className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 text-xs font-black text-violet-800"
              >
                <History size={15} /> عرض التسلسل الزمني
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border bg-white p-12 text-center">
          <CheckCircle2 className="mx-auto text-emerald-600" />
          <b className="mt-3 block">لا توجد إجراءات معلقة</b>
          <p className="mt-1 text-xs text-slate-500">جميع بلاغات الصيانة منسقة حالياً.</p>
        </div>
      )}
      {timeline && (
        <MaintenanceTimelineDialog
          caseId={timeline.case_id}
          title={`${timeline.vehicle_name} · DB ${timeline.db_number}`}
          onClose={() => setTimeline(null)}
        />
      )}
      {target && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4">
          <form onSubmit={decide} className="w-full max-w-md rounded-3xl bg-white p-6">
            <h2 className="text-xl font-black">
              {target.decision === 'approve'
                ? 'اعتماد حركة الصيانة'
                : target.decision === 'reject'
                  ? 'رفض حركة الصيانة'
                  : 'تأكيد استلام البلاغ'}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {target.row.vehicle_name} · DB {target.row.db_number}
            </p>
            <textarea
              required={target.decision === 'reject'}
              minLength={target.decision === 'reject' ? 3 : undefined}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="mt-4 w-full rounded-xl border p-3 text-sm"
              placeholder={
                target.decision === 'reject' ? 'سبب الرفض إلزامي' : 'ملاحظات التنسيق (اختيارية)'
              }
            />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTarget(null)}
                className="h-11 rounded-xl border"
              >
                إلغاء
              </button>
              <button
                disabled={action.isPending}
                className={`h-11 rounded-xl font-black text-white ${target.decision === 'reject' ? 'bg-rose-700' : 'bg-emerald-700'}`}
              >
                {action.isPending ? 'جارٍ الحفظ…' : 'تأكيد القرار'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}
function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <article className="flex items-center gap-3 rounded-2xl border bg-white p-4 shadow-sm">
      <span className="grid size-11 place-items-center rounded-xl bg-violet-50 text-violet-700 [&>svg]:size-5">
        {icon}
      </span>
      <div>
        <b className="text-2xl">{value}</b>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </article>
  )
}
