import { ArrowLeft, Droplets } from 'lucide-react'
import { Link } from 'react-router'
import { useGarageTanks } from '@features/central-garage/hooks'
import { garageUnitLabel, type GarageFuelUnit } from '@features/central-garage/fuel-units'
import type { GarageFuelType, GarageTank } from '@features/central-garage/types'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'

const pages:Array<{type:GarageFuelType;title:string;path:string;color:string}> = [
  { type:'gas_oil',title:'الكاز', path:'/central-garage/fuel/gas-oil',color:'from-amber-600 to-orange-700' },
  { type:'hydraulic',title:'الهيدروليك', path:'/central-garage/fuel/hydraulic',color:'from-blue-600 to-cyan-700' },
  { type:'grease',title:'الدهن', path:'/central-garage/fuel/grease',color:'from-violet-600 to-fuchsia-700' },
  { type:'c_oil',title:'C-Oil', path:'/central-garage/fuel/c-oil',color:'from-slate-700 to-teal-700' },
]
function totalsByUnit(tanks:GarageTank[]){
  const grouped=new Map<GarageFuelUnit,{quantity:number;capacity:number}>()
  for(const tank of tanks){const old=grouped.get(tank.unit)??{quantity:0,capacity:0};old.quantity+=tank.currentQuantity;old.capacity+=tank.capacity;grouped.set(tank.unit,old)}
  return [...grouped.entries()]
}
export default function FuelHubPage(){const tanks=useGarageTanks();return <section className="space-y-6" dir="rtl" data-testid="fuel-hub-page"><ExecPageHeader icon="droplet" title="الوقود" subtitle="أرصدة الخزانات بوحداتها الفعلية، إضافة المخزون، تعبئة الآليات وطلبات التصفير" stats={[{ label: 'الخزانات', value: (tanks.data ?? []).length, tone: 'gold' }, { label: 'منخفضة المخزون', value: (tanks.data ?? []).filter((t) => t.currentQuantity * 100 / Math.max(1, t.capacity) <= t.lowStockThreshold).length, tone: (tanks.data ?? []).some((t) => t.currentQuantity * 100 / Math.max(1, t.capacity) <= t.lowStockThreshold) ? 'red' : 'green' }]} /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{pages.map(page=>{const related=(tanks.data??[]).filter(t=>t.fuelType===page.type);const units=totalsByUnit(related);return <Link key={page.path} to={page.path} className="group overflow-hidden rounded-3xl border bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl"><div className={`bg-gradient-to-l ${page.color} p-5 text-white`}><div className="flex justify-between"><Droplets/><ArrowLeft className="transition group-hover:-translate-x-1"/></div><h2 className="mt-5 text-xl font-black">{page.title}</h2></div><div className="p-4"><p className="mb-3 text-xs font-bold text-slate-500">{related.length} خزان</p>{units.length?<div className="space-y-3">{units.map(([unit,total])=>{const pct=total.capacity?total.quantity*100/total.capacity:0;return <div key={unit}><div className="flex justify-between gap-2 text-xs"><span>{garageUnitLabel(unit)}</span><b>{total.quantity.toLocaleString('ar-IQ-u-nu-latn')} / {total.capacity.toLocaleString('ar-IQ-u-nu-latn')}</b></div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{width:`${Math.min(100,pct)}%`}}/></div></div>})}</div>:<p className="py-3 text-center text-xs text-slate-400">لا توجد خزانات</p>}</div></Link>})}</div></section>}
