import { useMemo, useState } from 'react'
import { AlertTriangle, BarChart3, BusFront, CalendarDays, Droplets, Fuel, Gauge, MapPin, Printer, RefreshCw, Users } from 'lucide-react'
import { Link } from 'react-router'
import { useGarageAreas, useGarageDashboard } from '@features/central-garage/hooks'
import type { GarageDashboardFilter, GarageFuelType } from '@features/central-garage/types'

const fuelLabels: Record<GarageFuelType, string> = { gas_oil: 'الكاز', hydraulic: 'الهيدروليك', grease: 'الدهن', c_oil: 'C-Oil' }
const shiftLabels = { morning: 'صباحي', evening: 'مسائي', night: 'ليلي' } as const
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const monthAgo = () => { const date = new Date(`${today()}T12:00:00+03:00`); date.setDate(date.getDate() - 29); return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date) }
const number = (value: number) => new Intl.NumberFormat('ar-IQ', { maximumFractionDigits: 1 }).format(value)
const dateTime = (value: string) => new Intl.DateTimeFormat('ar-IQ', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Baghdad' }).format(new Date(value))

function StatCard({ title, value, hint, icon: Icon, tone }: { title: string; value: number; hint: string; icon: typeof Gauge; tone: string }) {
  return <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-slate-500">{title}</p><b className="mt-2 block text-3xl text-slate-950">{number(value)}</b><p className="mt-1 text-[11px] text-slate-400">{hint}</p></div><span className={`flex size-12 items-center justify-center rounded-2xl ${tone}`}><Icon size={23} /></span></div>
  </article>
}

export default function CentralGarageDashboardPage() {
  const [filter, setFilter] = useState<GarageDashboardFilter>({ from: monthAgo(), to: today() })
  const areas = useGarageAreas()
  const summary = useGarageDashboard(filter)
  const data = summary.data
  const maxDaily = Math.max(1, ...(data?.dailyConsumption.map((item) => item.quantity) ?? []))
  const totalConsumption = useMemo(() => Object.values(data?.consumptionByType ?? {}).reduce((sum, item) => sum + Number(item ?? 0), 0), [data])
  const lowStock = data?.tankStock.filter((tank) => tank.lowStock).length ?? 0

  return <section className="space-y-5" dir="rtl" data-testid="central-garage-dashboard">
    <header className="overflow-hidden rounded-3xl bg-gradient-to-l from-slate-950 via-blue-950 to-cyan-900 p-6 text-white shadow-xl sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-cyan-100"><Gauge size={15} />غرفة قيادة الأسطول والمخزون</span><h1 className="mt-4 text-3xl font-black">لوحة الكراج المركزي</h1><p className="mt-2 max-w-2xl text-sm leading-7 text-cyan-100">مؤشرات الآليات والانطلاقات والخزانات والاستهلاك محدثة من النظام وفق الفترة والموقع المحددين.</p></div><button type="button" onClick={() => window.print()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-white/10 px-4 text-sm font-black hover:bg-white/20"><Printer size={17} />طباعة التقرير</button></div>
    </header>

    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm print:hidden">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <label className="text-xs font-bold text-slate-600">من<input aria-label="من تاريخ" type="date" max={filter.to ?? today()} value={filter.from ?? ''} onChange={(e) => setFilter((old) => ({ ...old, from: e.target.value }))} className="mt-1 h-11 w-full rounded-xl border px-3" /></label>
        <label className="text-xs font-bold text-slate-600">إلى<input aria-label="إلى تاريخ" type="date" min={filter.from} max={today()} value={filter.to ?? ''} onChange={(e) => setFilter((old) => ({ ...old, to: e.target.value }))} className="mt-1 h-11 w-full rounded-xl border px-3" /></label>
        <label className="text-xs font-bold text-slate-600">القاطع والمنطقة<select aria-label="القاطع والمنطقة" value={filter.sectorId ?? ''} onChange={(e) => setFilter((old) => ({ ...old, sectorId: e.target.value ? Number(e.target.value) : undefined }))} className="mt-1 h-11 w-full rounded-xl border px-3"><option value="">كل القواطع والمناطق</option>{(['karrada', 'zaafaraniya'] as const).map((parent) => <optgroup key={parent} label={parent === 'karrada' ? 'الكرادة' : 'الزعفرانية'}>{areas.data?.filter((area) => area.parentSector === parent).map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</optgroup>)}</select></label>
        <label className="text-xs font-bold text-slate-600">نوع المادة<select aria-label="نوع المادة" value={filter.fuelType ?? ''} onChange={(e) => setFilter((old) => ({ ...old, fuelType: (e.target.value || undefined) as GarageFuelType | undefined }))} className="mt-1 h-11 w-full rounded-xl border px-3"><option value="">كل الأنواع</option>{Object.entries(fuelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <button type="button" onClick={() => setFilter({ from: monthAgo(), to: today() })} className="mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-100 text-sm font-black text-slate-700"><RefreshCw size={16} />إعادة الضبط</button>
      </div>
    </div>

    {summary.isLoading ? <div className="rounded-3xl border bg-white p-12 text-center font-bold text-slate-500">جارٍ تجهيز مؤشرات الكراج…</div> : summary.isError || !data ? <div role="alert" className="rounded-3xl border border-red-200 bg-red-50 p-6 text-center font-bold text-red-700">تعذر تحميل لوحة القيادة. تحقق من الفترة وأعد المحاولة.</div> : <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard title="إجمالي الآليات" value={data.vehiclesTotal} hint="آلية فعالة" icon={BusFront} tone="bg-cyan-50 text-cyan-800" />
        <StatCard title="السائقون" value={data.driversTotal} hint="سائق حالي مميز" icon={Users} tone="bg-blue-50 text-blue-800" />
        <StatCard title="الانطلاقات" value={data.dispatchesTotal} hint="إسناد فعال" icon={MapPin} tone="bg-violet-50 text-violet-800" />
        <StatCard title="استهلاك الفترة" value={totalConsumption} hint="من الأنواع المحددة" icon={Fuel} tone="bg-amber-50 text-amber-800" />
        <StatCard title="تنبيهات المخزون" value={lowStock} hint={`${data.pendingZeroRequests} طلب تصفير معلق`} icon={AlertTriangle} tone={lowStock ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'} />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <article className="rounded-3xl border bg-white p-5 shadow-sm xl:col-span-2"><div className="flex items-center justify-between"><div><h2 className="flex items-center gap-2 font-black text-slate-900"><BarChart3 size={19} className="text-cyan-700" />الاستهلاك اليومي</h2><p className="mt-1 text-xs text-slate-400">من {data.from} إلى {data.to}</p></div></div><div className="mt-5 flex h-52 min-w-full items-end gap-1 overflow-x-auto border-b border-slate-100 pb-1">{data.dailyConsumption.map((item) => <div key={item.date} title={`${item.date}: ${number(item.quantity)}`} className="group flex h-full min-w-4 flex-1 items-end"><div className="w-full rounded-t bg-cyan-500 transition hover:bg-cyan-700" style={{ height: `${Math.max(item.quantity ? 4 : 1, item.quantity / maxDaily * 100)}%` }} /></div>)}</div><div className="mt-2 flex justify-between text-[10px] text-slate-400"><span>{data.from}</span><span>{data.to}</span></div><div className="mt-4 border-t pt-3"><p className="mb-2 text-xs font-black text-slate-600">الاستهلاك الشهري</p><div className="flex flex-wrap gap-2">{data.monthlyConsumption.length ? data.monthlyConsumption.map((item) => <span key={item.month} className="rounded-xl bg-slate-100 px-3 py-2 text-xs"><b>{item.month}</b> · {number(item.quantity)} وحدة</span>) : <span className="text-xs text-slate-400">لا توجد بيانات شهرية</span>}</div></div></article>
        <article className="rounded-3xl border bg-white p-5 shadow-sm"><h2 className="font-black text-slate-900">توزيع الآليات حسب الشفت</h2><div className="mt-5 space-y-4">{Object.entries(shiftLabels).map(([key, label]) => { const value = data.vehiclesByShift[key as keyof typeof shiftLabels] ?? 0; const percent = data.vehiclesTotal ? value / data.vehiclesTotal * 100 : 0; return <div key={key}><div className="mb-1 flex justify-between text-xs"><b>{label}</b><span>{number(value)} آلية</span></div><div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${percent}%` }} /></div></div> })}</div></article>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <article className="rounded-3xl border bg-white p-5 shadow-sm"><h2 className="flex items-center gap-2 font-black"><Droplets size={19} className="text-blue-700" />أرصدة الخزانات ونسب الامتلاء</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{data.tankStock.length ? data.tankStock.map((tank) => <Link key={tank.id} to={`/central-garage/fuel/${tank.fuelType.replace('_', '-')}`} className={`rounded-2xl border p-4 ${tank.lowStock ? 'border-red-200 bg-red-50/40' : 'border-slate-200'}`}><div className="flex justify-between gap-2"><div><b className="text-sm">{tank.name}</b><p className="text-[11px] text-slate-400">{fuelLabels[tank.fuelType]}</p></div><b className={tank.lowStock ? 'text-red-700' : 'text-blue-700'}>{number(tank.percent)}%</b></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${tank.lowStock ? 'bg-red-500' : 'bg-blue-600'}`} style={{ width: `${Math.min(100, tank.percent)}%` }} /></div><p className="mt-2 text-[11px] text-slate-500">{number(tank.quantity)} / {number(tank.capacity)} وحدة</p></Link>) : <p className="py-8 text-center text-sm text-slate-400 sm:col-span-2">لا توجد خزانات ضمن المرشح.</p>}</div></article>
        <article className="rounded-3xl border bg-white p-5 shadow-sm"><h2 className="font-black">توزيع الآليات حسب القاطع والمنطقة</h2><div className="mt-4 space-y-2">{data.vehiclesByArea.map((area) => <div key={area.sectorId} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-xs"><span><b>{area.area}</b><small className="mr-2 text-slate-400">{area.sector === 'karrada' ? 'الكرادة' : 'الزعفرانية'}</small></span><b className="text-cyan-800">{number(area.total)} آلية</b></div>)}</div></article>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <article className="rounded-3xl border bg-white p-5 shadow-sm"><h2 className="font-black">أكثر الآليات استهلاكاً</h2><div className="mt-4 space-y-2">{data.topConsumers.length ? data.topConsumers.map((vehicle, index) => <Link key={vehicle.vehicleId} to={`/central-garage/vehicles-database/${vehicle.vehicleId}`} className="flex items-center justify-between rounded-2xl border p-3 hover:border-cyan-300"><span className="flex items-center gap-3"><b className="flex size-8 items-center justify-center rounded-xl bg-cyan-50 text-cyan-800">{index + 1}</b><span><b className="block text-sm">{vehicle.vehicleName}</b><small className="text-slate-400">DB: {vehicle.dbNumber}</small></span></span><b className="text-amber-700">{number(vehicle.quantity)} وحدة</b></Link>) : <p className="py-8 text-center text-sm text-slate-400">لا توجد تعبئات في الفترة.</p>}</div></article>
        <article className="rounded-3xl border bg-white p-5 shadow-sm"><h2 className="flex items-center gap-2 font-black"><CalendarDays size={18} className="text-violet-700" />آخر عمليات التعبئة</h2><div className="mt-4 max-h-96 space-y-2 overflow-y-auto">{data.recentFills.length ? data.recentFills.map((fill) => <div key={fill.id} className="rounded-2xl border p-3 text-xs"><div className="flex justify-between gap-3"><span><b>{fill.vehicleName}</b><small className="mr-2 text-slate-400">DB {fill.dbNumber}</small></span><b className="text-amber-700">{number(fill.quantity)} وحدة</b></div><p className="mt-1 text-slate-500">{fill.tankName} · {fuelLabels[fill.fuelType]}</p><p className="mt-1 text-[10px] text-slate-400">{dateTime(fill.createdAt)} · الموعد التالي: {fill.nextRefillDate}</p></div>) : <p className="py-8 text-center text-sm text-slate-400">لا توجد عمليات تعبئة.</p>}</div></article>
      </div>

      <article className="rounded-3xl border border-amber-200 bg-amber-50/40 p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 font-black text-slate-900"><AlertTriangle size={18} className="text-amber-700" />طلبات التصفير المعلقة</h2><p className="mt-1 text-xs text-slate-500">لا يتغير أي رصيد قبل اعتماد بوابة التطوير المركزية.</p></div><b className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-800">{number(data.pendingZeroRequests)} طلب</b></div><div className="mt-4 grid gap-2 md:grid-cols-2">{data.pendingZeroItems.length ? data.pendingZeroItems.map((request) => <div key={request.id} className="rounded-2xl border border-amber-200 bg-white p-4 text-xs"><div className="flex justify-between gap-3"><b>{request.tankName} · {fuelLabels[request.fuelType]}</b><span className="font-black text-amber-800">{number(request.requestedQuantity)} وحدة</span></div><p className="mt-2 text-slate-600">{request.reason}</p><p className="mt-2 text-[10px] text-slate-400">{dateTime(request.requestedAt)}</p></div>) : <p className="py-6 text-center text-sm text-slate-400 md:col-span-2">لا توجد طلبات تصفير معلقة.</p>}</div></article>
    </>}
  </section>
}
