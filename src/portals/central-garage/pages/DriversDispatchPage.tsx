import { useDeferredValue, useMemo, useState } from 'react'
import {
  BusFront,
  ClipboardEdit,
  DoorOpen,
  FolderOpen,
  LogIn,
  LogOut,
  MapPin,
  Search,
} from 'lucide-react'
import {
  useGarageAreas,
  useGarageDepartureDays,
  useGarageDeparturesForDay,
  useGarageVehicles,
  useGarageShiftAssignments,
  useGarageShiftDispatchRecipients,
  useRecordGarageReturn,
  useRecordGarageShiftDeparture,
  useSetGarageShiftAssignment,
} from '@features/central-garage/hooks'
import type {
  GarageArea,
  GarageDeparture,
  GarageShift,
  GarageVehicle,
} from '@features/central-garage/types'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'

const inputClass =
  'h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100'
const shiftLabels = { morning: 'صباحي', evening: 'مسائي', night: 'ليلي' } as const
const clock = (value: string) =>
  new Intl.DateTimeFormat('ar-IQ', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Baghdad',
  }).format(new Date(value))

type DepartureState =
  | { kind: 'field'; departure: GarageDeparture }
  | { kind: 'returned'; departure: GarageDeparture }
  | { kind: 'pending' }

/** حالة الانطلاق اليوم لكل آلية: في الميدان (لم تعد) / عادت / لم تنطلق بعد. */
function departureState(departures: GarageDeparture[]): Map<string, DepartureState> {
  const map = new Map<string, DepartureState>()
  for (const departure of departures) {
    const current = map.get(departure.vehicleId)
    if (departure.returnedAt === null) {
      map.set(departure.vehicleId, { kind: 'field', departure })
      continue
    }
    if (!current) map.set(departure.vehicleId, { kind: 'returned', departure })
  }
  return map
}

function StatusChip({ state }: { state: DepartureState }) {
  if (state.kind === 'field') {
    const d = state.departure
    const label = d.siteDepartedAt
      ? 'في الطريق إلى الكراج'
      : d.arrivedAt
        ? 'وصلت وتعمل في الموقع'
        : 'في الطريق إلى موقع العمل'
    return (
      <span
        data-testid="departure-state-field"
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-black ${d.siteDepartedAt ? 'bg-blue-50 text-blue-700' : d.arrivedAt ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}
      >
        <DoorOpen size={13} />
        {label} · انطلقت {clock(d.departedAt)}
      </span>
    )
  }
  if (state.kind === 'returned')
    return (
      <span
        data-testid="departure-state-returned"
        className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-600"
      >
        <LogIn size={13} />
        عادت إلى الكراج {clock(state.departure.returnedAt as string)}
      </span>
    )
  return (
    <span
      data-testid="departure-state-pending"
      className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-black text-amber-700"
    >
      لم تسجل انطلاقاً اليوم
    </span>
  )
}
export default function DriversDispatchPage() {
  const [search, setSearch] = useState('')
  const [shift, setShift] = useState('')
  const [sector, setSector] = useState('')
  const [selected, setSelected] = useState<GarageVehicle | null>(null)
  const [dispatchVehicle, setDispatchVehicle] = useState<GarageVehicle | null>(null)
  const today = useMemo(
    () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(new Date()),
    [],
  )
  const [selectedDay, setSelectedDay] = useState(today)
  const deferred = useDeferredValue(search)
  const areas = useGarageAreas()
  const vehicles = useGarageVehicles({
    search: deferred,
    shift: (shift as GarageShift) || undefined,
    sectorId: sector ? Number(sector) : undefined,
    pageSize: 100,
  })
  const dayFolders = useGarageDepartureDays()
  const departures = useGarageDeparturesForDay(selectedDay)
  const recordReturn = useRecordGarageReturn()
  const states = useMemo(() => departureState(departures.data ?? []), [departures.data])
  const allRows = vehicles.data?.rows ?? []
  const rows = selectedDay === today ? allRows : allRows.filter((v) => states.has(v.id))
  const inField = rows.filter((vehicle) => states.get(vehicle.id)?.kind === 'field').length
  const returned = rows.filter((vehicle) => states.get(vehicle.id)?.kind === 'returned').length
  const pending = rows.length - inField - returned
  const stat = (testId: string, label: string, value: number, tone: string) => (
    <div
      data-testid={testId}
      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center shadow-sm"
    >
      <p className="text-[11px] font-bold text-slate-500">{label}</p>
      <b className={`mt-1 block text-2xl ${tone}`}>{value}</b>
    </div>
  )
  return (
    <section className="space-y-5" dir="rtl" data-testid="drivers-dispatch-page">
      <header className="rounded-3xl bg-gradient-to-l from-blue-950 to-cyan-800 p-6 text-white shadow-xl">
        <span className="inline-flex items-center gap-2 text-xs font-bold text-cyan-100">
          <BusFront size={16} />
          حركة الكراج اليومية
        </span>
        <h1 className="mt-2 text-2xl font-black">انطلاق السائقين من الكراج</h1>
        <p className="mt-1 text-sm text-cyan-100">
          سجّل خروج كل سائق من الكراج إلى ورديته، ثم سجّل عودته عند الرجوع — كل التوقيتات محفوظة في
          السجل
        </p>
      </header>
      <GarageDailyFolders
        days={dayFolders.data ?? []}
        selected={selectedDay}
        onSelect={setSelectedDay}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stat('stat-total', 'آليات الانطلاقية', rows.length, 'text-slate-900')}
        {stat('stat-field', 'في الميدان الآن', inField, 'text-emerald-700')}
        {stat('stat-returned', 'عادت إلى الكراج', returned, 'text-slate-600')}
        {stat('stat-pending', 'لم تنطلق بعد', pending, 'text-amber-700')}
      </div>
      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_180px_220px]">
        <label className="relative">
          <Search className="absolute right-3 top-3 text-slate-400" size={18} />
          <input
            data-testid="dispatch-search"
            className={`${inputClass} w-full pr-10`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="رقم DB أو اسم السائق أو السيارة"
          />
        </label>
        <select
          data-testid="dispatch-shift"
          className={inputClass}
          value={shift}
          onChange={(e) => setShift(e.target.value)}
        >
          <option value="">كل الشفتات</option>
          <option value="morning">صباحي</option>
          <option value="evening">مسائي</option>
          <option value="night">ليلي</option>
        </select>
        <select
          data-testid="dispatch-area"
          className={inputClass}
          value={sector}
          onChange={(e) => setSector(e.target.value)}
        >
          <option value="">كل مواقع العمل</option>
          <optgroup label="الكرادة">
            {(areas.data ?? [])
              .filter((a) => a.parentSector === 'karrada')
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </optgroup>
          <optgroup label="الزعفرانية">
            {(areas.data ?? [])
              .filter((a) => a.parentSector === 'zaafaraniya')
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </optgroup>
        </select>
      </div>
      {vehicles.isLoading || departures.isLoading ? (
        <div className="rounded-2xl bg-white p-10">
          <LoadingSpinner label="جارٍ تحميل الانطلاق…" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="لا توجد نتائج في الانطلاقية" hint="غيّر البحث أو الفلاتر" />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b p-4">
            <h2 className="font-black text-slate-800">حالة الانطلاق اليوم</h2>
            <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-800">
              {vehicles.data?.totalCount} آلية
            </span>
          </div>
          <div className="divide-y">
            {rows.map((vehicle) => {
              const state = states.get(vehicle.id) ?? ({ kind: 'pending' } as DepartureState)
              return (
                <article
                  key={vehicle.id}
                  className="grid items-center gap-4 p-4 transition hover:bg-slate-50 sm:grid-cols-[72px_1fr_auto]"
                  data-testid={`dispatch-row-${vehicle.id}`}
                >
                  <img
                    src={vehicle.imageUrl}
                    alt=""
                    className="size-16 rounded-2xl border border-slate-100 bg-white object-contain"
                  />
                  <div>
                    <p className="font-black text-slate-900">{vehicle.driverName}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {vehicle.vehicleName} · DB {vehicle.dbNumber} · وردة{' '}
                      {shiftLabels[vehicle.shift]}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-600">
                      <MapPin size={14} className="text-cyan-700" />
                      {vehicle.parentSector === 'karrada' ? 'الكرادة' : 'الزعفرانية'} ·{' '}
                      {vehicle.areaName}
                    </p>
                    <div className="mt-2">
                      <StatusChip state={state} />
                      {state.kind === 'field' && state.departure.recipientManagerName && (
                        <p className="mt-1 text-[11px] font-bold text-cyan-800">
                          المستلم: {state.departure.recipientManagerName}
                          {state.departure.arrivedAt
                            ? ` · وصل ${clock(state.departure.arrivedAt)}`
                            : ''}
                          {state.departure.siteDepartedAt
                            ? ` · غادر الموقع ${clock(state.departure.siteDepartedAt)}`
                            : ''}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {selectedDay !== today && state.kind !== 'field' ? (
                      <span className="rounded-xl bg-slate-100 px-4 py-2 text-[11px] font-bold text-slate-600">
                        مجلد محفوظ للعرض فقط
                      </span>
                    ) : state.kind === 'field' ? (
                      state.departure.siteDepartedAt ? (
                        <button
                          data-testid={`return-${vehicle.id}`}
                          disabled={recordReturn.isPending}
                          onClick={() => recordReturn.mutate({ departureId: state.departure.id })}
                          className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-xs font-black text-white disabled:opacity-60"
                        >
                          <LogIn size={15} />
                          تأكيد وصول الآلية إلى الكراج
                        </button>
                      ) : (
                        <span className="text-[11px] font-bold text-slate-500">
                          بانتظار تأكيد مسؤول القسم وإرسال الآلية عائدة
                        </span>
                      )
                    ) : (
                      <button
                        data-testid={`depart-${vehicle.id}`}
                        onClick={() => setDispatchVehicle(vehicle)}
                        className="inline-flex h-10 items-center gap-2 rounded-xl bg-cyan-700 px-4 text-xs font-black text-white"
                      >
                        <LogOut size={15} />
                        تسجيل انطلاق من الكراج
                      </button>
                    )}
                    <button
                      data-testid={`change-assignment-${vehicle.id}`}
                      disabled={selectedDay !== today || state.kind === 'field'}
                      title={
                        selectedDay !== today
                          ? 'المجلدات السابقة للعرض فقط'
                          : state.kind === 'field'
                            ? 'سجّل عودة الآلية قبل تغيير الإسناد'
                            : undefined
                      }
                      onClick={() => setSelected(vehicle)}
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-4 text-xs font-black text-cyan-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      <ClipboardEdit size={15} />
                      {state.kind === 'field' ? 'الإسناد مقفل أثناء الخروج' : 'إدارة سائقي الشفتات'}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      )}
      <p className="rounded-2xl bg-slate-50 p-3 text-[11px] leading-5 text-slate-500">
        <b className="text-slate-700">تسجيل انطلاق</b> يوثّق خروج السائق من الكراج إلى ورديته، و
        <b className="text-slate-700">تسجيل عودة</b> يوثّق رجوعه إلى الكراج — أما{' '}
        <b className="text-slate-700">تغيير الانطلاقية</b> فيعدّل السائق والوردية والموقع مع حفظ
        السجل السابق.
      </p>
      {selected && (
        <MultiShiftAssignmentsDialog
          vehicle={selected}
          areas={areas.data ?? []}
          onClose={() => setSelected(null)}
        />
      )}
      {dispatchVehicle && (
        <DepartureDialog vehicle={dispatchVehicle} onClose={() => setDispatchVehicle(null)} />
      )}
    </section>
  )
}

function MultiShiftAssignmentsDialog({
  vehicle,
  areas,
  onClose,
}: {
  vehicle: GarageVehicle
  areas: GarageArea[]
  onClose: () => void
}) {
  const q = useGarageShiftAssignments(vehicle.id),
    save = useSetGarageShiftAssignment()
  const [shift, setShift] = useState<GarageShift>('morning'),
    [driver, setDriver] = useState(''),
    [sectorId, setSectorId] = useState(vehicle.sectorId),
    [reason, setReason] = useState('تحديث إسناد الشفت')
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    save.mutate(
      { vehicleId: vehicle.id, shift, driverName: driver, sectorId, reason },
      {
        onSuccess: () => {
          setDriver('')
          void q.refetch()
        },
      },
    )
  }
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      dir="rtl"
    >
      <form onSubmit={submit} className="w-full max-w-xl rounded-3xl bg-white p-6">
        <h2 className="text-xl font-black">سائقو شفتات {vehicle.vehicleName}</h2>
        <select
          data-testid="assignment-shift"
          value={shift}
          onChange={(e) => setShift(e.target.value as GarageShift)}
          className="mt-4 h-11 w-full rounded-xl border px-3"
        >
          <option value="morning">صباحي</option>
          <option value="evening">مسائي</option>
          <option value="night">ليلي</option>
        </select>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(['morning', 'evening', 'night'] as GarageShift[]).map((x) => {
            const a = q.data?.find((v) => v.shift === x && !v.endsAt)
            return (
              <button
                type="button"
                key={x}
                onClick={() => {
                  setShift(x)
                  setDriver(a?.driverName ?? '')
                  setSectorId(a?.sectorId ?? vehicle.sectorId)
                }}
                className={`rounded-xl border p-3 text-xs ${shift === x ? 'border-cyan-600 bg-cyan-50' : ''}`}
              >
                <b>{shiftLabels[x]}</b>
                <span className="mt-1 block">{a?.driverName ?? 'غير مسند'}</span>
              </button>
            )
          })}
        </div>
        <input
          data-testid="assignment-driver"
          required
          minLength={2}
          value={driver}
          onChange={(e) => setDriver(e.target.value)}
          className="mt-4 h-11 w-full rounded-xl border px-3"
          placeholder="اسم سائق الشفت"
        />
        <select
          data-testid="assignment-area"
          value={sectorId}
          onChange={(e) => setSectorId(Number(e.target.value))}
          className="mt-3 h-11 w-full rounded-xl border px-3"
        >
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <input
          data-testid="assignment-reason"
          required
          minLength={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-3 h-11 w-full rounded-xl border px-3"
          placeholder="سبب التغيير"
        />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} className="h-11 rounded-xl border">
            إغلاق
          </button>
          <button
            data-testid="assignment-submit"
            className="h-11 rounded-xl bg-cyan-700 font-black text-white"
          >
            حفظ إسناد {shiftLabels[shift]}
          </button>
        </div>
      </form>
    </div>
  )
}

function DepartureDialog({ vehicle, onClose }: { vehicle: GarageVehicle; onClose: () => void }) {
  const assignments = useGarageShiftAssignments(vehicle.id)
  const departure = useRecordGarageShiftDeparture()
  const [shift, setShift] = useState<GarageShift>('morning')
  const recipients = useGarageShiftDispatchRecipients(vehicle.id, shift)
  const [notes, setNotes] = useState('')
  const active = (assignments.data ?? []).filter((assignment) => !assignment.endsAt)
  const selected = active.find((assignment) => assignment.shift === shift)
  const matchedManagers = recipients.data ?? []
  const automaticManager = matchedManagers.length === 1 ? matchedManagers[0] : null
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!selected || !automaticManager) return
    departure.mutate(
      { vehicleId: vehicle.id, shift, notes: notes || undefined },
      { onSuccess: onClose },
    )
  }
  return (
    <div
      className="fixed inset-0 z-[1800] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      dir="rtl"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        <header className="bg-slate-950 p-6 text-white">
          <span className="text-[10px] font-black tracking-widest text-cyan-300">
            AUTOMATIC DISPATCH
          </span>
          <h2 className="mt-1 text-xl font-black">إطلاق الآلية إلى مسؤول منطقتها</h2>
          <p className="mt-1 text-xs text-slate-400">
            {vehicle.vehicleName} · DB {vehicle.dbNumber}
          </p>
        </header>
        <div className="p-6">
          <label className="block text-xs font-black">الشفت والسائق</label>
          <select
            aria-label="شفت انطلاق الآلية"
            value={shift}
            onChange={(event) => setShift(event.target.value as GarageShift)}
            className="mt-2 h-12 w-full rounded-xl border px-3"
          >
            {(['morning', 'evening', 'night'] as GarageShift[]).map((value) => (
              <option key={value} value={value}>
                {shiftLabels[value]} —{' '}
                {active.find((assignment) => assignment.shift === value)?.driverName ??
                  'لا يوجد إسناد'}
              </option>
            ))}
          </select>
          {selected ? (
            <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-xl bg-emerald-600 text-white">
                  <MapPin size={17} />
                </span>
                <div>
                  <b className="block text-sm">{selected.areaName}</b>
                  <p className="text-[10px] text-emerald-800">
                    السائق: {selected.driverName} · الشفت {shiftLabels[selected.shift]}
                  </p>
                </div>
              </div>
              <div className="mt-3 border-t border-emerald-200 pt-3 text-[11px] font-bold leading-5 text-emerald-900">
                {recipients.isLoading ? (
                  <span>جارٍ تحديد مسؤول المنطقة…</span>
                ) : automaticManager ? (
                  <>
                    <span className="block">
                      المسؤول المستلم تلقائياً: {automaticManager.managerName}
                    </span>
                    <span className="font-normal">
                      سيسجل الخادم المسؤول في الانطلاقية ويرسل له الإشعار فوراً، دون اختيار يدوي.
                    </span>
                  </>
                ) : matchedManagers.length > 1 ? (
                  <span className="text-rose-700">
                    يوجد أكثر من مسؤول للمنطقة نفسها. يجب تصحيح التداخل من إعدادات المسؤولين.
                  </span>
                ) : (
                  <span className="text-rose-700">لم يُهيأ مسؤول لهذه المنطقة بعد.</span>
                )}
              </div>
            </div>
          ) : (
            <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">
              لا يوجد سائق ومنطقة مسندان لهذا الشفت. أكمل الإسناد أولاً.
            </p>
          )}
          <textarea
            aria-label="ملاحظات الانطلاق"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={500}
            rows={3}
            className="mt-4 w-full rounded-xl border p-3 text-sm"
            placeholder="ملاحظات الانطلاق (اختياري)"
          />
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button type="button" onClick={onClose} className="h-11 rounded-xl border font-bold">
              إلغاء
            </button>
            <button
              data-testid="confirm-departure"
              disabled={
                !selected || recipients.isLoading || !automaticManager || departure.isPending
              }
              className="h-11 rounded-xl bg-cyan-700 font-black text-white disabled:opacity-50"
            >
              {departure.isPending ? 'جارٍ الإرسال…' : 'تأكيد الانطلاق والإبلاغ التلقائي'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
function GarageDailyFolders({
  days,
  selected,
  onSelect,
}: {
  days: Array<{ tripDay: string; totalCount: number; openCount: number }>
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
      data-testid="garage-trip-day-folders"
    >
      <div className="mb-3 flex items-center gap-2">
        <FolderOpen className="size-5 text-amber-600" />
        <h2 className="font-black">مجلدات حركة الأيام</h2>
        <span className="text-[11px] text-slate-500">فتح يوم واحد يمنع ازدحام السجل</span>
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
            key={d.tripDay}
            data-testid={`garage-trip-day-${d.tripDay}`}
            onClick={() => onSelect(d.tripDay)}
            className={`min-w-44 rounded-2xl border p-3 text-right ${selected === d.tripDay ? 'border-cyan-600 bg-cyan-50 ring-2 ring-cyan-100' : 'bg-slate-50 hover:border-amber-400'}`}
          >
            <b className="block text-xs">{label(d.tripDay)}</b>
            <span className="mt-1 block text-[11px] text-slate-500">
              {d.totalCount} انطلاقة
              {d.openCount > 0 && (
                <em className="mr-2 not-italic font-black text-emerald-700">
                  · {d.openCount} مفتوحة
                </em>
              )}
            </span>
          </button>
        ))}
      </div>
      {!days.length && (
        <p className="py-3 text-center text-xs text-slate-500">سيظهر أول مجلد عند تسجيل انطلاقة.</p>
      )}
    </section>
  )
}
