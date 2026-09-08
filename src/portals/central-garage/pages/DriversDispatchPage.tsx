import { useDeferredValue, useMemo, useState } from 'react'
import { BusFront, ClipboardEdit, DoorOpen, LogIn, LogOut, MapPin, Search } from 'lucide-react'
import { useGarageAreas, useGarageDepartures, useGarageVehicles, useRecordGarageDeparture, useRecordGarageReturn } from '@features/central-garage/hooks'
import type { GarageDeparture, GarageShift, GarageVehicle } from '@features/central-garage/types'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { AssignmentDialog } from '../components/AssignmentDialog'

const inputClass = 'h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100'
const shiftLabels = { morning: 'صباحي', evening: 'مسائي', night: 'ليلي' } as const
const clock = (value: string) => new Intl.DateTimeFormat('ar-IQ', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Baghdad' }).format(new Date(value))

type DepartureState =
  | { kind: 'field'; departure: GarageDeparture }
  | { kind: 'returned'; departure: GarageDeparture }
  | { kind: 'pending' }

/** حالة الانطلاق اليوم لكل آلية: في الميدان (لم تعد) / عادت / لم تنطلق بعد. */
function departureState(departures: GarageDeparture[]): Map<string, DepartureState> {
  const map = new Map<string, DepartureState>()
  for (const departure of departures) {
    const current = map.get(departure.vehicleId)
    if (departure.returnedAt === null) { map.set(departure.vehicleId, { kind: 'field', departure }); continue }
    if (!current) map.set(departure.vehicleId, { kind: 'returned', departure })
  }
  return map
}

function StatusChip({ state }: { state: DepartureState }) {
  if (state.kind === 'field') return <span data-testid="departure-state-field" className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black text-emerald-700"><DoorOpen size={13} />في الميدان · انطلقت {clock(state.departure.departedAt)}</span>
  if (state.kind === 'returned') return <span data-testid="departure-state-returned" className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-600"><LogIn size={13} />عادت إلى الكراج {clock(state.departure.returnedAt as string)}</span>
  return <span data-testid="departure-state-pending" className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-black text-amber-700">لم تسجل انطلاقاً اليوم</span>
}
export default function DriversDispatchPage() {
  const [search, setSearch] = useState('')
  const [shift, setShift] = useState('')
  const [sector, setSector] = useState('')
  const [selected, setSelected] = useState<GarageVehicle | null>(null)
  const deferred = useDeferredValue(search)
  const areas = useGarageAreas()
  const vehicles = useGarageVehicles({ search: deferred, shift: shift as GarageShift || undefined, sectorId: sector ? Number(sector) : undefined, pageSize: 100 })
  const departures = useGarageDepartures()
  const recordDeparture = useRecordGarageDeparture()
  const recordReturn = useRecordGarageReturn()
  const states = useMemo(() => departureState(departures.data ?? []), [departures.data])
  const rows = vehicles.data?.rows ?? []
  const inField = rows.filter((vehicle) => states.get(vehicle.id)?.kind === 'field').length
  const returned = rows.filter((vehicle) => states.get(vehicle.id)?.kind === 'returned').length
  const pending = rows.length - inField - returned
  const stat = (testId: string, label: string, value: number, tone: string) => (
    <div data-testid={testId} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center shadow-sm">
      <p className="text-[11px] font-bold text-slate-500">{label}</p><b className={`mt-1 block text-2xl ${tone}`}>{value}</b>
    </div>
  )
  return (
    <section className="space-y-5" dir="rtl" data-testid="drivers-dispatch-page">
      <header className="rounded-3xl bg-gradient-to-l from-blue-950 to-cyan-800 p-6 text-white shadow-xl">
        <span className="inline-flex items-center gap-2 text-xs font-bold text-cyan-100"><BusFront size={16} />حركة الكراج اليومية</span>
        <h1 className="mt-2 text-2xl font-black">انطلاق السائقين من الكراج</h1>
        <p className="mt-1 text-sm text-cyan-100">سجّل خروج كل سائق من الكراج إلى ورديته، ثم سجّل عودته عند الرجوع — كل التوقيتات محفوظة في السجل</p>
      </header>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stat('stat-total', 'آليات الانطلاقية', rows.length, 'text-slate-900')}
        {stat('stat-field', 'في الميدان الآن', inField, 'text-emerald-700')}
        {stat('stat-returned', 'عادت إلى الكراج', returned, 'text-slate-600')}
        {stat('stat-pending', 'لم تنطلق بعد', pending, 'text-amber-700')}
      </div>
      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_180px_220px]"><label className="relative"><Search className="absolute right-3 top-3 text-slate-400" size={18}/><input data-testid="dispatch-search" className={`${inputClass} w-full pr-10`} value={search} onChange={e=>setSearch(e.target.value)} placeholder="رقم DB أو اسم السائق أو السيارة"/></label><select data-testid="dispatch-shift" className={inputClass} value={shift} onChange={e=>setShift(e.target.value)}><option value="">كل الشفتات</option><option value="morning">صباحي</option><option value="evening">مسائي</option><option value="night">ليلي</option></select><select data-testid="dispatch-area" className={inputClass} value={sector} onChange={e=>setSector(e.target.value)}><option value="">كل مواقع العمل</option><optgroup label="الكرادة">{(areas.data??[]).filter(a=>a.parentSector==='karrada').map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</optgroup><optgroup label="الزعفرانية">{(areas.data??[]).filter(a=>a.parentSector==='zaafaraniya').map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</optgroup></select></div>
      {vehicles.isLoading || departures.isLoading
        ? <div className="rounded-2xl bg-white p-10"><LoadingSpinner label="جارٍ تحميل الانطلاق…"/></div>
        : rows.length === 0 ? <EmptyState title="لا توجد نتائج في الانطلاقية" hint="غيّر البحث أو الفلاتر"/>
        : <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b p-4"><h2 className="font-black text-slate-800">حالة الانطلاق اليوم</h2><span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-800">{vehicles.data?.totalCount} آلية</span></div>
            <div className="divide-y">
              {rows.map((vehicle) => {
                const state = states.get(vehicle.id) ?? ({ kind: 'pending' } as DepartureState)
                return <article key={vehicle.id} className="grid items-center gap-4 p-4 transition hover:bg-slate-50 sm:grid-cols-[72px_1fr_auto]" data-testid={`dispatch-row-${vehicle.id}`}>
                  <img src={vehicle.imageUrl} alt="" className="size-16 rounded-2xl border border-slate-100 bg-white object-contain"/>
                  <div>
                    <p className="font-black text-slate-900">{vehicle.driverName}</p>
                    <p className="mt-1 text-xs text-slate-500">{vehicle.vehicleName} · DB {vehicle.dbNumber} · وردة {shiftLabels[vehicle.shift]}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-600"><MapPin size={14} className="text-cyan-700"/>{vehicle.parentSector==='karrada'?'الكرادة':'الزعفرانية'} · {vehicle.areaName}</p>
                    <div className="mt-2"><StatusChip state={state}/></div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {state.kind === 'field'
                      ? <button data-testid={`return-${vehicle.id}`} disabled={recordReturn.isPending} onClick={()=>recordReturn.mutate({departureId:state.departure.id})} className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-xs font-black text-white disabled:opacity-60"><LogIn size={15}/>تسجيل عودة إلى الكراج</button>
                      : <button data-testid={`depart-${vehicle.id}`} disabled={recordDeparture.isPending} onClick={()=>recordDeparture.mutate({vehicleId:vehicle.id})} className="inline-flex h-10 items-center gap-2 rounded-xl bg-cyan-700 px-4 text-xs font-black text-white disabled:opacity-60"><LogOut size={15}/>تسجيل انطلاق من الكراج</button>}
                    <button data-testid={`change-assignment-${vehicle.id}`} onClick={()=>setSelected(vehicle)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-4 text-xs font-black text-cyan-800"><ClipboardEdit size={15}/>تغيير الانطلاقية</button>
                  </div>
                </article>
              })}
            </div>
          </div>}
      <p className="rounded-2xl bg-slate-50 p-3 text-[11px] leading-5 text-slate-500"><b className="text-slate-700">تسجيل انطلاق</b> يوثّق خروج السائق من الكراج إلى ورديته، و<b className="text-slate-700">تسجيل عودة</b> يوثّق رجوعه إلى الكراج — أما <b className="text-slate-700">تغيير الانطلاقية</b> فيعدّل السائق والوردية والموقع مع حفظ السجل السابق.</p>
      {selected && <AssignmentDialog vehicle={selected} areas={areas.data ?? []} onClose={()=>setSelected(null)}/>}
    </section>
  )
}
