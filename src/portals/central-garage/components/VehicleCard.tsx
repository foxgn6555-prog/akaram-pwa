import { MapPin, Moon, Sun, Sunrise, UserRound } from 'lucide-react'
import { Link } from 'react-router'
import type { GarageVehicle } from '@features/central-garage/types'

const shiftMeta={morning:{label:'صباحي',icon:Sunrise,color:'bg-amber-50 text-amber-800'},evening:{label:'مسائي',icon:Sun,color:'bg-orange-50 text-orange-800'},night:{label:'ليلي',icon:Moon,color:'bg-indigo-50 text-indigo-800'}}

export function VehicleCard({vehicle,action}:{vehicle:GarageVehicle;action?:React.ReactNode}){
  const shift=shiftMeta[vehicle.shift];const ShiftIcon=shift.icon
  return <article className="group overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-xl" data-testid={`vehicle-card-${vehicle.id}`}>
    <Link to={`/central-garage/vehicles-database/${vehicle.id}`} className="block">
      <div className="relative h-40 overflow-hidden bg-slate-100"><img src={vehicle.imageUrl} alt={`صورة ${vehicle.vehicleName}`} className="size-full object-cover transition duration-300 group-hover:scale-105"/><span className="absolute end-3 top-3 rounded-full bg-slate-950/75 px-3 py-1 text-xs font-black text-white backdrop-blur">DB {vehicle.dbNumber}</span></div>
      <div className="p-4"><div className="flex items-start justify-between gap-3"><h2 className="font-black text-slate-900">{vehicle.vehicleName}</h2><span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${shift.color}`}><ShiftIcon size={13}/>{shift.label}</span></div>
      <div className="mt-3 space-y-2 text-xs text-slate-600"><p className="flex items-center gap-2"><UserRound size={14} className="text-cyan-700"/><span className="font-bold">{vehicle.driverName}</span></p><p className="flex items-center gap-2"><MapPin size={14} className="text-cyan-700"/>{vehicle.parentSector==='karrada'?'قاطع الكرادة':'قاطع الزعفرانية'} · {vehicle.areaName}</p></div></div>
    </Link>{action&&<div className="border-t border-slate-100 p-3">{action}</div>}
  </article>
}
