import { useState } from 'react'
import { X } from 'lucide-react'
import { garageAssignmentSchema } from '@features/central-garage/schemas'
import { useAssignGarageDriver } from '@features/central-garage/hooks'
import type { GarageArea, GarageShift, GarageVehicle } from '@features/central-garage/types'

const inputClass='h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100'

export function AssignmentDialog({ vehicle, areas, onClose }: { vehicle:GarageVehicle;areas:GarageArea[];onClose:()=>void }) {
  const [form,setForm]=useState({driverName:vehicle.driverName,shift:vehicle.shift as GarageShift,sectorId:String(vehicle.sectorId),reason:''})
  const [errors,setErrors]=useState<Record<string,string>>({})
  const assign=useAssignGarageDriver()
  const submit=(event:React.FormEvent)=>{event.preventDefault();const parsed=garageAssignmentSchema.safeParse(form);if(!parsed.success){setErrors(Object.fromEntries(parsed.error.issues.map(issue=>[String(issue.path[0]),issue.message])));return}assign.mutate({vehicleId:vehicle.id,...parsed.data},{onSuccess:onClose})}
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-label="تحديث انطلاقية السائق" data-testid="assignment-dialog">
    <form onSubmit={submit} className="w-full max-w-xl rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
      <div className="flex items-start justify-between"><div><h2 className="text-xl font-black text-slate-900">تحديث انطلاقية السائق</h2><p className="mt-1 text-sm text-slate-500">{vehicle.vehicleName} · DB {vehicle.dbNumber}</p></div><button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X size={20}/></button></div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field label="اسم السائق" error={errors.driverName}><input data-testid="assignment-driver" className={inputClass} value={form.driverName} onChange={e=>setForm({...form,driverName:e.target.value})}/></Field>
        <Field label="الشفت" error={errors.shift}><select data-testid="assignment-shift" className={inputClass} value={form.shift} onChange={e=>setForm({...form,shift:e.target.value as GarageShift})}><option value="morning">صباحي</option><option value="evening">مسائي</option><option value="night">ليلي</option></select></Field>
        <Field label="موقع العمل" error={errors.sectorId}><select data-testid="assignment-area" className={inputClass} value={form.sectorId} onChange={e=>setForm({...form,sectorId:e.target.value})}><option value="">اختر المنطقة</option><optgroup label="قاطع الكرادة">{areas.filter(a=>a.parentSector==='karrada').map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</optgroup><optgroup label="قاطع الزعفرانية">{areas.filter(a=>a.parentSector==='zaafaraniya').map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</optgroup></select></Field>
        <Field label="سبب التغيير"><input data-testid="assignment-reason" className={inputClass} value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})} placeholder="مثال: نقل إلى قاطع آخر"/></Field>
      </div>
      <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="h-11 rounded-xl border border-slate-300 px-5 font-bold text-slate-700">إلغاء</button><button data-testid="assignment-submit" disabled={assign.isPending} className="h-11 rounded-xl bg-cyan-700 px-6 font-bold text-white disabled:opacity-60">{assign.isPending?'جارٍ الحفظ…':'حفظ الانطلاقية'}</button></div>
    </form>
  </div>
}

function Field({label,error,children}:{label:string;error?:string;children:React.ReactNode}){return <label className="space-y-1.5 text-xs font-bold text-slate-600"><span>{label}</span>{children}{error&&<span className="block text-red-600">{error}</span>}</label>}
