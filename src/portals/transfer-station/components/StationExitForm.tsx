/**
 * نموذج تسجيل خروج آلية من المحطة التحويلية (00330) — بالقوائم فقط، لا كتابة يدوية:
 *  آلية (من آليات المحطة المعلَّمة من غرفة العمليات) ← السائق (موظف سائق HR / سائق متعهد من السجل) ← الوجهة.
 *  00377: لا اسم حر — سائق الآلية الحالي (موظف أو متعهد) يُقترح تلقائياً عند اختيار الآلية ويمكن تغييره.
 *  التتبع: إن كان للآلية جهاز GPS مرتبط يُسجَّل الوصول آلياً عند دخول زون الوجهة، وإلا يُوسم «بلا تتبع».
 *  الشفت يُستنتج من دوام HR للمستخدم المسجِّل. وقت الخروج تلقائي.
 */
import { useMemo, useState } from 'react'
import { useCanCall } from '@features/permissions/my-permissions'
import clsx from 'clsx'
import { Icon } from '@components/ui/Icon/Icon'
import { useStationDestinations, useStationDrivers, useStationFleet, useStationRecordExit } from '@features/station-fleet/hooks'
import type { StationDriverKind } from '@sdk/station-fleet.sdk'
import { categoryDefaultTons } from '@features/transfer-station/lib/unitCapacities'

export type ExitKind = 'saksat' | 'carrier'
const DRIVER_KIND_AR: Record<StationDriverKind, string> = { employee: 'موظف (سائق في HR)', external: 'سائق متعهد (من السجل)' }
const field = 'h-11 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:border-brand-500'

export function StationExitForm({ kind, defaultWeight }: { kind: ExitKind; defaultWeight: string }) {
  // 00332: عند اختيار الآلية يُقترح الوزن القياسي لفئتها (نسافة 25 · سكس 10 · ناقلة 16) ما لم يكتب المستخدم وزناً
  const fleet = useStationFleet()
  const drivers = useStationDrivers()
  const destinations = useStationDestinations(false)
  const record = useStationRecordExit()
  const canRecord = useCanCall('station_record_exit')
  const [vehicleId, setVehicleId] = useState('')
  const [driverKind, setDriverKind] = useState<StationDriverKind>('employee')
  const [driverRef, setDriverRef] = useState('')
  const [destinationId, setDestinationId] = useState('')
  const [weight, setWeight] = useState(defaultWeight)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const vehicles = useMemo(() => (fleet.data ?? []).filter((v) => v.station_outbound && (kind === 'carrier' ? v.vehicle_category === 'container_carrier' : v.vehicle_category !== 'container_carrier')), [fleet.data, kind])
  const vehicle = vehicles.find((v) => v.id === vehicleId) ?? null
  const pickVehicle = (id: string) => {
    setVehicleId(id); setErrors((er) => ({ ...er, vehicle: '', driver: '' }))
    const v = vehicles.find((x) => x.id === id)
    if (v) {
      setWeight(String(categoryDefaultTons(v.vehicle_category)))
      // اقتراح سائق الآلية الحالي إن كان في القوائم (موظف أو سائق متعهد)
      const all = drivers.data ?? []
      const ext = v.driver_external_id && all.find((d) => d.driver_kind === 'external' && d.ref_id === v.driver_external_id)
      const emp = v.driver_employee_id && all.find((d) => d.driver_kind === 'employee' && d.ref_id === v.driver_employee_id)
      if (ext) { setDriverKind('external'); setDriverRef(ext.ref_id) }
      else if (emp) { setDriverKind('employee'); setDriverRef(emp.ref_id) }
      else setDriverRef('')
    }
  }
  const driverOptions = useMemo(() => (drivers.data ?? []).filter((d) => d.driver_kind === driverKind), [drivers.data, driverKind])
  const weightRequired = kind === 'carrier'

  const pickKind = (k: StationDriverKind) => { setDriverKind(k); setDriverRef(''); setErrors((er) => ({ ...er, driver: '' })) }
  const submit = () => {
    const er: Record<string, string> = {}
    if (!vehicle) er.vehicle = 'اختر الآلية من قائمة آليات المحطة'
    if (!destinationId) er.destination = 'اختر الوجهة'
    if (!driverRef) er.driver = driverKind === 'external' ? 'اختر سائق المتعهد من السجل (يضاف من غرفة العمليات)' : 'اختر السائق من القائمة'
    const w = weight.trim() === '' ? null : Number(weight)
    if (weightRequired && !(w !== null && w > 0)) er.weight = 'الوزن مطلوب بالطن (أكبر من صفر)'
    else if (w !== null && !(w > 0 && w < 1000)) er.weight = 'الوزن غير صحيح'
    setErrors(er)
    if (Object.keys(er).length > 0 || !vehicle) return
    record.mutate(
      { vehicleId: vehicle.id, driverKind, destinationId, driverEmployeeId: driverKind === 'employee' ? driverRef : null, externalDriverId: driverKind === 'external' ? driverRef : null, driverName: null, weightTons: w },
      { onSuccess: () => { setVehicleId(''); setDriverRef(''); setWeight(defaultWeight) } },
    )
  }
  const err = (k: string) => errors[k] ? <span className="text-[11px] text-red-600" role="alert">{errors[k]}</span> : null

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit() }} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" data-testid={`${kind}-form`}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700"><Icon name="edit" size={16} className="text-brand-600" /> تسجيل خروج {kind === 'carrier' ? 'ناقلة حاويات مكبسية' : 'نسافة / سكس'}</h2>
      {!fleet.isLoading && vehicles.length === 0 && (
        <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800" data-testid={`${kind}-no-fleet`}>
          لا آليات معلَّمة لهذه الوحدة — تطلب غرفة العمليات تعليم الآلية «آلية محطة» من صفحة أسطول المحطة التحويلية.
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">الآلية <span className="text-red-500">*</span>
          <select value={vehicleId} onChange={(e) => pickVehicle(e.target.value)} data-testid={`f-${kind}-vehicle`} className={clsx(field, errors.vehicle ? 'border-red-400' : 'border-slate-200')}>
            <option value="">— اختر الآلية —</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{`DB ${v.db_number} · ${v.category_label} · ${v.plate_number}${v.has_gps ? '' : ' · بلا GPS'}`}</option>)}
          </select>
          {vehicle && (
            <span data-testid={`f-${kind}-tracking`} className={clsx('rounded-lg px-2 py-1 text-[11px] font-bold', vehicle.has_gps ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>
              {vehicle.has_gps ? 'جهاز GPS مرتبط — الوصول يُسجَّل آلياً' : 'بلا تتبع — لا جهاز GPS مرتبط (سيصل تنبيه لغرفة العمليات)'}
            </span>
          )}
          {err('vehicle')}
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">الوجهة <span className="text-red-500">*</span>
          <select value={destinationId} onChange={(e) => { setDestinationId(e.target.value); setErrors((er) => ({ ...er, destination: '' })) }} data-testid={`f-${kind}-destination`} className={clsx(field, errors.destination ? 'border-red-400' : 'border-slate-200')}>
            <option value="">— اختر الوجهة —</option>
            {(destinations.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}{d.has_zone ? '' : ' (بلا زون)'}</option>)}
          </select>
          {err('destination')}
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">الوزن (طن) {weightRequired ? <span className="text-red-500">*</span> : <span className="font-normal text-slate-400">(القياسي {defaultWeight})</span>}
          <input type="number" min={0.1} step={0.1} value={weight} onChange={(e) => { setWeight(e.target.value); setErrors((er) => ({ ...er, weight: '' })) }} data-testid={`f-${kind}-weight`} className={clsx(field, errors.weight ? 'border-red-400' : 'border-slate-200')} />
          {err('weight')}
        </label>
        <div className="flex flex-col gap-1 text-xs font-medium text-slate-600 sm:col-span-2 lg:col-span-3">
          <span>السائق <span className="text-red-500">*</span></span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="نوع السائق">
            {(Object.keys(DRIVER_KIND_AR) as StationDriverKind[]).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={driverKind === k} onClick={() => pickKind(k)} data-testid={`f-${kind}-dk-${k}`}
                className={clsx('rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-40', driverKind === k ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-700')}>
                {DRIVER_KIND_AR[k]}
              </button>
            ))}
          </div>
          <select value={driverRef} onChange={(e) => { setDriverRef(e.target.value); setErrors((er) => ({ ...er, driver: '' })) }} data-testid={`f-${kind}-driver`} className={clsx(field, errors.driver ? 'border-red-400' : 'border-slate-200')}>
            <option value="">— اختر السائق —</option>
            {driverOptions.map((d) => <option key={d.ref_id} value={d.ref_id}>{d.full_name} · {d.detail}</option>)}
          </select>
          {vehicle && driverRef && (vehicle.driver_external_id === driverRef || vehicle.driver_employee_id === driverRef) && (
            <span className="text-[11px] font-bold text-emerald-700" data-testid={`f-${kind}-driver-auto`}>سائق الآلية الحالي — اقتُرح تلقائياً ويمكن تغييره</span>
          )}
          {err('driver')}
        </div>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">وقت الخروج <span className="font-normal text-slate-400">(تلقائي)</span>
          <div className="flex h-11 items-center rounded-xl border border-dashed border-brand-200 bg-brand-50/60 px-3 text-sm font-bold text-brand-700 dir-ltr">
            {new Date().toLocaleTimeString('ar-IQ-u-nu-latn', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </label>
        <div className="flex items-end sm:col-span-2">
          <button type="submit" disabled={record.isPending || !canRecord.allowed} title={canRecord.title} data-testid={`${kind}-submit`} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60">
            <Icon name="check-square" size={16} /> تسجيل الخروج
          </button>
        </div>
      </div>
    </form>
  )
}
