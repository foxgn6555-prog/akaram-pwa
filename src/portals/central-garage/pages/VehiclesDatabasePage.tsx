import { useDeferredValue, useEffect, useState } from 'react'
import { CarFront, ChevronLeft, ChevronRight, Filter, ImagePlus, Plus, Search, X } from 'lucide-react'
import { useCreateGarageVehicle, useGarageAreas, useGarageVehicles } from '@features/central-garage/hooks'
import { garageVehicleSchema } from '@features/central-garage/schemas'
import type { GarageArea, GarageShift } from '@features/central-garage/types'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { VehicleCard } from '../components/VehicleCard'

const inputClass='h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100'
const blank={vehicleName:'',dbNumber:'',plateNumber:'',chassisNumber:'',driverName:'',shift:'morning' as GarageShift,sectorId:'',image:null as File|null}

export default function VehiclesDatabasePage(){
  const [search,setSearch]=useState('');const deferredSearch=useDeferredValue(search);const[sectorId,setSectorId]=useState('');const[shift,setShift]=useState('');const[page,setPage]=useState(1);const[open,setOpen]=useState(false)
  useEffect(()=>setPage(1),[deferredSearch,sectorId,shift])
  const areas=useGarageAreas();const vehicles=useGarageVehicles({search:deferredSearch,sectorId:sectorId?Number(sectorId):undefined,shift:shift as GarageShift||undefined,page,pageSize:24})
  const total=vehicles.data?.totalCount??0;const pages=Math.max(1,Math.ceil(total/24))
  return <section className="space-y-5" dir="rtl" data-testid="vehicles-database-page">
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-gradient-to-l from-slate-950 via-blue-950 to-cyan-900 p-6 text-white shadow-xl"><div><span className="text-xs font-bold text-cyan-200">قاعدة بيانات الأسطول</span><h1 className="mt-1 text-2xl font-black">الآليات</h1><p className="mt-1 text-sm text-cyan-100">بطاقات منظمة مع بحث وفلاتر وتفاصيل كاملة لكل آلية</p></div><button data-testid="open-add-vehicle" onClick={()=>setOpen(true)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 font-black text-cyan-900 shadow"><Plus size={18}/>إضافة آلية</button></header>
    <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_220px_180px_auto]">
      <label className="relative"><Search className="absolute right-3 top-3 text-slate-400" size={18}/><input data-testid="vehicle-search" value={search} onChange={e=>setSearch(e.target.value)} className={`${inputClass} pr-10`} placeholder="DB، السيارة، السائق، اللوحة أو الشاصي"/></label>
      <select data-testid="vehicle-area-filter" value={sectorId} onChange={e=>setSectorId(e.target.value)} className={inputClass}><option value="">كل المواقع</option><optgroup label="قاطع الكرادة">{(areas.data??[]).filter(a=>a.parentSector==='karrada').map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</optgroup><optgroup label="قاطع الزعفرانية">{(areas.data??[]).filter(a=>a.parentSector==='zaafaraniya').map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</optgroup></select>
      <select data-testid="vehicle-shift-filter" value={shift} onChange={e=>setShift(e.target.value)} className={inputClass}><option value="">كل الشفتات</option><option value="morning">صباحي</option><option value="evening">مسائي</option><option value="night">ليلي</option></select>
      <div className="flex items-center justify-center gap-2 rounded-xl bg-slate-50 px-4 text-sm font-bold text-slate-700"><Filter size={16}/>{total} آلية</div>
    </div>
    {vehicles.isLoading?<div className="rounded-2xl bg-white p-12"><LoadingSpinner label="جارٍ تحميل الآليات…"/></div>:vehicles.isError?<div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm font-bold text-red-700">تعذر تحميل قاعدة بيانات الآليات. حاول مرة أخرى.</div>:(vehicles.data?.rows.length??0)===0?<EmptyState title="لا توجد آليات مطابقة" hint="غيّر الفلاتر أو أضف آلية جديدة"/>:<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{vehicles.data?.rows.map(vehicle=><VehicleCard key={vehicle.id} vehicle={vehicle}/>)}</div>}
    {total>24&&<nav className="flex items-center justify-center gap-3" aria-label="صفحات الآليات"><button aria-label="الصفحة السابقة" disabled={page===1} onClick={()=>setPage(p=>p-1)} className="rounded-xl border bg-white p-2 disabled:opacity-40"><ChevronRight/></button><span className="text-sm font-bold">{page} من {pages}</span><button aria-label="الصفحة التالية" disabled={page>=pages} onClick={()=>setPage(p=>p+1)} className="rounded-xl border bg-white p-2 disabled:opacity-40"><ChevronLeft/></button></nav>}
    {open&&<AddVehicleDialog areas={areas.data??[]} onClose={()=>setOpen(false)}/>}  
  </section>
}

function AddVehicleDialog({areas,onClose}:{areas:GarageArea[];onClose:()=>void}){
  const[form,setForm]=useState(blank);const[errors,setErrors]=useState<Record<string,string>>({});const[preview,setPreview]=useState<string|null>(null);const create=useCreateGarageVehicle()
  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview)},[preview])
  const update=(key:string,value:string)=>{setForm(current=>({...current,[key]:value}));setErrors(current=>({...current,[key]:''}))}
  const choose=(file:File|null)=>{if(preview)URL.revokeObjectURL(preview);setForm(current=>({...current,image:file}));setPreview(file?URL.createObjectURL(file):null);setErrors(current=>({...current,image:''}))}
  const submit=(event:React.FormEvent)=>{event.preventDefault();const parsed=garageVehicleSchema.safeParse(form);if(!parsed.success){setErrors(Object.fromEntries(parsed.error.issues.map(issue=>[String(issue.path[0]),issue.message])));return}create.mutate(parsed.data,{onSuccess:onClose})}
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-label="إضافة آلية" data-testid="add-vehicle-dialog"><form onSubmit={submit} className="mx-auto my-4 w-full max-w-3xl rounded-3xl bg-white p-5 shadow-2xl sm:p-7"><div className="flex justify-between"><div><h2 className="text-xl font-black">إضافة آلية جديدة</h2><p className="text-sm text-slate-500">أدخل البيانات الأساسية والإسناد الحالي</p></div><button type="button" aria-label="إغلاق" onClick={onClose} className="rounded-xl p-2 hover:bg-slate-100"><X/></button></div>
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      <Field label="صورة الآلية" error={errors.image} wide><label className="flex min-h-36 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-cyan-200 bg-cyan-50/50">{preview?<img src={preview} alt="معاينة الآلية" className="h-44 w-full object-cover"/>:<span className="flex flex-col items-center gap-2 text-sm font-bold text-cyan-800"><ImagePlus/>اختر صورة JPG أو PNG أو WebP</span>}<input data-testid="vehicle-image" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={e=>choose(e.target.files?.[0]??null)}/></label></Field>
      <Field label="اسم السيارة" error={errors.vehicleName}><input data-testid="vehicle-name" className={inputClass} value={form.vehicleName} onChange={e=>update('vehicleName',e.target.value)} placeholder="مثال: كابسة نفايات"/></Field>
      <Field label="رقم DB" error={errors.dbNumber}><input data-testid="vehicle-db" className={inputClass} value={form.dbNumber} onChange={e=>update('dbNumber',e.target.value)} placeholder="رقم فريد"/></Field>
      <Field label="رقم اللوحة" error={errors.plateNumber}><input data-testid="vehicle-plate" className={inputClass} value={form.plateNumber} onChange={e=>update('plateNumber',e.target.value)}/></Field>
      <Field label="رقم الشاصي" error={errors.chassisNumber}><input data-testid="vehicle-chassis" className={inputClass} value={form.chassisNumber} onChange={e=>update('chassisNumber',e.target.value)}/></Field>
      <Field label="اسم السائق" error={errors.driverName}><input data-testid="vehicle-driver" className={inputClass} value={form.driverName} onChange={e=>update('driverName',e.target.value)}/></Field>
      <Field label="الشفت" error={errors.shift}><select data-testid="vehicle-shift" className={inputClass} value={form.shift} onChange={e=>update('shift',e.target.value)}><option value="morning">صباحي</option><option value="evening">مسائي</option><option value="night">ليلي</option></select></Field>
      <Field label="موقع عمل السائق" error={errors.sectorId}><select data-testid="vehicle-area" className={inputClass} value={form.sectorId} onChange={e=>update('sectorId',e.target.value)}><option value="">اختر المنطقة</option><optgroup label="قاطع الكرادة">{areas.filter(a=>a.parentSector==='karrada').map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</optgroup><optgroup label="قاطع الزعفرانية">{areas.filter(a=>a.parentSector==='zaafaraniya').map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</optgroup></select></Field>
    </div>{create.isError&&<p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">تعذر حفظ الآلية. تحقق من عدم تكرار DB أو اللوحة أو الشاصي.</p>}<div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="h-11 rounded-xl border px-5 font-bold">إلغاء</button><button data-testid="vehicle-submit" disabled={create.isPending} className="inline-flex h-11 items-center gap-2 rounded-xl bg-cyan-700 px-6 font-black text-white disabled:opacity-60"><CarFront size={18}/>{create.isPending?'جارٍ الحفظ…':'حفظ الآلية'}</button></div></form></div>
}
function Field({label,error,wide,children}:{label:string;error?:string;wide?:boolean;children:React.ReactNode}){return <label className={`space-y-1.5 text-xs font-bold text-slate-600 ${wide?'sm:col-span-2':''}`}><span>{label} <b className="text-red-500">*</b></span>{children}{error&&<span className="block text-red-600">{error}</span>}</label>}
