import { useState } from 'react'
import { CheckCircle2, Clock3, FolderOpen, MapPin, RotateCcw } from 'lucide-react'
import {
  useConfirmSectorVehicleArrival,
  useSectorVehicleTripDays,
  useSectorVehicleTripsForDay,
  useSendSectorVehicleToGarage,
} from '@features/sector'
import type { SectorVehicleTrip } from '@features/sector/types'
import {
  useConfirmVehicleSiteReturn,
  useMaintenanceDispatchState,
  useSendVehicleToMaintenance,
  useSendVehicleToStation,
  useTripLegs,
} from '@features/vehicle-operations/hooks'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { MaintenanceTimelineDialog } from '@features/vehicle-operations/components/MaintenanceTimelineDialog'
const dt = (v: string | null) =>
  v
    ? new Intl.DateTimeFormat('ar-IQ', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'Asia/Baghdad',
      }).format(new Date(v))
    : '—'
const duration = (a: string, b: string | null) => {
  if (!b) return '—'
  const m = Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000))
  return m < 60 ? `${m} دقيقة` : `${Math.floor(m / 60)} ساعة ${m % 60 ? `و${m % 60} دقيقة` : ''}`
}
export default function VehicleTripsPage() {
  const [selectedDay, setSelectedDay] = useState(() =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(new Date()),
  )
  const days = useSectorVehicleTripDays()
  const trips = useSectorVehicleTripsForDay(selectedDay)
  const arrival = useConfirmSectorVehicleArrival()
  const garage = useSendSectorVehicleToGarage()
  const [target, setTarget] = useState<{
    trip: SectorVehicleTrip
    stage: 'arrival' | 'garage'
  } | null>(null)
  const [notes, setNotes] = useState('')
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!target) return
    const mutation = target.stage === 'arrival' ? arrival : garage
    mutation.mutate(
      { departureId: target.trip.id, notes: notes.trim() || undefined },
      {
        onSuccess: () => {
          setTarget(null)
          setNotes('')
        },
      },
    )
  }
  const list = trips.data ?? []
  const incoming = list.filter((t) => !t.arrived_at)
  const working = list.filter((t) => t.arrived_at && !t.site_departed_at)
  const returning = list.filter((t) => t.site_departed_at && !t.returned_at)
  return (
    <section className="space-y-5" dir="rtl" data-testid="manager-vehicle-trips">
      <header className="rounded-3xl bg-gradient-to-l from-slate-950 via-blue-950 to-cyan-800 p-6 text-white shadow-xl">
        <span className="text-xs font-bold text-cyan-200">ربط مباشر مع الكراج المركزي</span>
        <h1 className="mt-2 text-2xl font-black">حركة آليات الوردية</h1>
        <p className="mt-1 text-sm text-cyan-100">
          أكد وصول الآلية إلى موقع العمل، ثم أنهِ ورديتها عند مغادرتها باتجاه الكراج.
        </p>
      </header>
      <DailyFolders days={days.data ?? []} selected={selectedDay} onSelect={setSelectedDay} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="في الطريق إليك" value={incoming.length} tone="text-amber-700" />
        <Stat label="تعمل في الموقع" value={working.length} tone="text-emerald-700" />
        <Stat label="في طريق العودة" value={returning.length} tone="text-blue-700" />
      </div>
      {trips.isLoading ? (
        <LoadingSpinner label="جارٍ تحميل حركة الآليات…" />
      ) : !list.length ? (
        <div className="rounded-3xl border bg-white p-12 text-center text-sm text-slate-500">
          لا توجد آليات مرسلة إلى ورديتك حالياً.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {list.map((t) => (
            <article
              key={t.id}
              className="rounded-3xl border bg-white p-5 shadow-sm"
              data-testid={`manager-trip-${t.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-black text-white">
                    DB {t.db_number}
                  </span>
                  <h2 className="mt-3 text-lg font-black">{t.vehicle_name}</h2>
                  <p className="mt-1 text-xs text-slate-500">السائق: {t.driver_name}</p>
                </div>
                <Status trip={t} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <Info icon={<Clock3 />} label="انطلقت من الكراج" value={dt(t.departed_at)} />
                <Info icon={<MapPin />} label="موقع العمل" value={t.area_name} />
                {t.arrived_at && (
                  <Info icon={<CheckCircle2 />} label="وصلت إلى الموقع" value={dt(t.arrived_at)} />
                )}{' '}
                {t.site_departed_at && (
                  <Info
                    icon={<RotateCcw />}
                    label="غادرت إلى الكراج"
                    value={dt(t.site_departed_at)}
                  />
                )}
              </div>
              {!t.arrived_at && (
                <button
                  data-testid={`confirm-arrival-${t.id}`}
                  onClick={() => {
                    setTarget({ trip: t, stage: 'arrival' })
                    setNotes('')
                  }}
                  className="mt-4 h-11 w-full rounded-xl bg-emerald-700 text-sm font-black text-white"
                >
                  وصلت الآلية إلى موقع العمل
                </button>
              )}
              <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center text-[10px] text-slate-500">
                <span>
                  طريق الذهاب
                  <b className="mt-1 block text-slate-800">
                    {duration(t.departed_at, t.arrived_at)}
                  </b>
                </span>
                <span>
                  العمل بالموقع
                  <b className="mt-1 block text-slate-800">
                    {t.arrived_at
                      ? duration(t.arrived_at, t.site_departed_at ?? new Date().toISOString())
                      : '—'}
                  </b>
                </span>
                <span>
                  الرحلة الكلية
                  <b className="mt-1 block text-slate-800">
                    {duration(t.departed_at, t.returned_at)}
                  </b>
                </span>
              </div>
              <MaintenanceTimelineButton trip={t} />
              {t.arrived_at && !t.returned_at && (
                <OperationalActions
                  trip={t}
                  onDirectGarage={() => {
                    setTarget({ trip: t, stage: 'garage' })
                    setNotes('')
                  }}
                />
              )}
              {t.returned_at && (
                <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-xs font-bold text-emerald-800">
                  أكد الكراج وصول الآلية الساعة {dt(t.returned_at)}.
                </p>
              )}
            </article>
          ))}
        </div>
      )}
      {target && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-white p-6">
            <h2 className="text-xl font-black">
              {target.stage === 'arrival' ? 'تأكيد وصول الآلية' : 'إنهاء الوردية وإرسال الآلية'}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {target.trip.vehicle_name} · DB {target.trip.db_number}
            </p>
            <textarea
              data-testid="trip-stage-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              rows={3}
              className="mt-4 w-full rounded-xl border p-3 text-sm"
              placeholder="ملاحظات اختيارية عن الوصول أو حالة الآلية"
            />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTarget(null)}
                className="h-11 rounded-xl border font-bold"
              >
                إلغاء
              </button>
              <button
                data-testid="confirm-trip-stage"
                disabled={arrival.isPending || garage.isPending}
                className="h-11 rounded-xl bg-cyan-700 font-black text-white"
              >
                تأكيد وإبلاغ الطرف الآخر
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}
function Status({ trip: t }: { trip: SectorVehicleTrip }) {
  const x = t.returned_at
    ? ['عادت إلى الكراج', 'bg-slate-100 text-slate-700']
    : t.site_departed_at
      ? ['في الطريق للكراج', 'bg-blue-50 text-blue-700']
      : t.arrived_at
        ? ['تعمل في الموقع', 'bg-emerald-50 text-emerald-700']
        : ['في الطريق إليك', 'bg-amber-50 text-amber-700']
  return <span className={`rounded-full px-3 py-1 text-[11px] font-black ${x[1]}`}>{x[0]}</span>
}
function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <article className="rounded-2xl border bg-white p-4 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <b className={`mt-1 block text-3xl ${tone}`}>{value}</b>
    </article>
  )
}
function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <span className="flex items-center gap-1 text-[10px] text-slate-400 [&>svg]:size-3">
        {icon}
        {label}
      </span>
      <b className="mt-1 block text-xs">{value}</b>
    </div>
  )
}
function DailyFolders({
  days,
  selected,
  onSelect,
}: {
  days: Array<{ trip_day: string; total_count: number; open_count: number }>
  selected: string
  onSelect: (day: string) => void
}) {
  const label = (d: string) =>
    new Intl.DateTimeFormat('ar-IQ', {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Baghdad',
    }).format(new Date(`${d}T12:00:00Z`))
  return (
    <section
      className="rounded-3xl border bg-white p-4 shadow-sm"
      data-testid="manager-trip-day-folders"
    >
      <div className="mb-3 flex items-center gap-2">
        <FolderOpen className="size-5 text-amber-600" />
        <h2 className="font-black">مجلدات الأيام</h2>
        <span className="text-[11px] text-slate-500">يُحمّل اليوم المفتوح فقط</span>
        <input
          aria-label="فتح يوم محدد"
          type="date"
          value={selected}
          onChange={(e) => onSelect(e.target.value)}
          className="mr-auto h-9 rounded-xl border px-2 text-xs"
        />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {days.map((d) => (
          <button
            key={d.trip_day}
            data-testid={`manager-trip-day-${d.trip_day}`}
            onClick={() => onSelect(d.trip_day)}
            className={`min-w-44 rounded-2xl border p-3 text-right transition ${selected === d.trip_day ? 'border-cyan-600 bg-cyan-50 ring-2 ring-cyan-100' : 'bg-slate-50 hover:border-amber-400'}`}
          >
            <b className="block text-xs">{label(d.trip_day)}</b>
            <span className="mt-1 block text-[11px] text-slate-500">
              {d.total_count} آلية
              {d.open_count > 0 && (
                <em className="mr-2 not-italic font-black text-emerald-700">
                  · {d.open_count} نشطة
                </em>
              )}
            </span>
          </button>
        ))}
      </div>
      {!days.length && (
        <p className="py-4 text-center text-xs text-slate-500">لا توجد مجلدات حركة حتى الآن.</p>
      )}
    </section>
  )
}
function MaintenanceTimelineButton({ trip }: { trip: SectorVehicleTrip }) {
  const state = useMaintenanceDispatchState(trip.id),
    [open, setOpen] = useState(false)
  if (!state.data?.case_id) return null
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-3 h-10 w-full rounded-xl border border-violet-200 bg-violet-50 text-xs font-black text-violet-800"
      >
        عرض تسلسل الصيانة
      </button>
      {open && (
        <MaintenanceTimelineDialog
          caseId={state.data.case_id}
          title={`${trip.vehicle_name} · DB ${trip.db_number}`}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
function OperationalActions({
  trip,
  onDirectGarage,
}: {
  trip: SectorVehicleTrip
  onDirectGarage: () => void
}) {
  const q = useTripLegs(trip.id),
    dispatch = useMaintenanceDispatchState(trip.id),
    station = useSendVehicleToStation(),
    maintenance = useSendVehicleToMaintenance(),
    site = useConfirmVehicleSiteReturn()
  const [fault, setFault] = useState(false)
  const latest = q.data?.at(-1),
    decision = dispatch.data?.decision_status
  if (decision === 'awaiting_approval')
    return (
      <p className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs font-black text-violet-800">
        بانتظار موافقة الكراج المركزي؛ لم يُسمح بحركة الآلية بعد.
      </p>
    )
  if (latest && !latest.arrivedAt) {
    if (latest.destinationType === 'work_site')
      return (
        <button
          onClick={() => site.mutate({ legId: latest.id })}
          className="mt-4 h-11 w-full rounded-xl bg-emerald-700 text-xs font-black text-white"
        >
          تأكيد عودة الآلية إلى موقع العمل
        </button>
      )
    const names = {
      transfer_station: 'المحطة التحويلية',
      maintenance: 'الصيانة',
      garage: 'الكراج',
      work_site: 'موقع العمل',
    }
    return (
      <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs font-black text-amber-800">
        الآلية في الطريق إلى {names[latest.destinationType]}
      </p>
    )
  }
  if (latest?.destinationType === 'transfer_station' || latest?.destinationType === 'maintenance')
    return (
      <p className="mt-4 rounded-xl bg-slate-100 p-3 text-xs font-bold">
        الآلية موجودة في {latest.destinationType === 'maintenance' ? 'الصيانة' : 'المحطة التحويلية'}{' '}
        وتنتظر قرار المغادرة.
      </p>
    )
  return (
    <>
      {fault ? (
        <div className="mt-4 rounded-2xl border bg-rose-50 p-3">
          <FaultForm trip={trip} onCancel={() => setFault(false)} mutation={maintenance} />
        </div>
      ) : (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <button
            onClick={() => station.mutate({ departureId: trip.id })}
            className="h-11 rounded-xl bg-orange-700 text-xs font-black text-white"
          >
            إرسال إلى المحطة
          </button>
          <button
            onClick={() => setFault(true)}
            className="h-11 rounded-xl bg-rose-700 text-xs font-black text-white"
          >
            عطل — إلى الصيانة
          </button>
          <button
            data-testid={`send-garage-${trip.id}`}
            onClick={onDirectGarage}
            className="h-11 rounded-xl bg-blue-700 text-xs font-black text-white"
          >
            إنهاء الوردية للكراج
          </button>
        </div>
      )}
    </>
  )
}
function FaultForm({
  trip,
  onCancel,
  mutation,
}: {
  trip: SectorVehicleTrip
  onCancel: () => void
  mutation: ReturnType<typeof useSendVehicleToMaintenance>
}) {
  const [fault, setFault] = useState(''),
    [priority, setPriority] = useState('normal'),
    [notes, setNotes] = useState('')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        mutation.mutate(
          { departureId: trip.id, faultType: fault, priority, notes },
          { onSuccess: onCancel },
        )
      }}
    >
      <b className="text-sm">تسجيل العطل وإبلاغ الصيانة</b>
      <input
        required
        minLength={3}
        value={fault}
        onChange={(e) => setFault(e.target.value)}
        className="mt-2 h-10 w-full rounded-xl border px-3 text-sm"
        placeholder="نوع العطل"
      />
      <select
        value={priority}
        onChange={(e) => setPriority(e.target.value)}
        className="mt-2 h-10 w-full rounded-xl border px-3 text-sm"
      >
        <option value="normal">اعتيادي</option>
        <option value="urgent">عاجل</option>
        <option value="critical">حرج</option>
      </select>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="mt-2 w-full rounded-xl border p-3 text-sm"
        placeholder="التفاصيل"
      />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onCancel} className="h-10 rounded-xl border">
          إلغاء
        </button>
        <button className="h-10 rounded-xl bg-rose-700 font-black text-white">
          تأكيد وإرسال للصيانة
        </button>
      </div>
    </form>
  )
}
