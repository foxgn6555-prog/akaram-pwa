/** فلتر تاريخ اليوم — «كل يوم تظهر بياناته في تاريخه» */
import { CalendarDays } from 'lucide-react'
import { baghdadDay, fmtDayAr } from '@features/media/constants'

export function DayFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const today = baghdadDay()
  const yesterday = baghdadDay(-1)
  const chip = (active: boolean) =>
    `rounded-xl px-3 py-2 text-[11px] font-black transition ${
      active ? 'bg-slate-950 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-cyan-400'
    }`
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="فلترة حسب التاريخ">
      <CalendarDays size={16} className="text-slate-400" />
      <button type="button" onClick={() => onChange('')} className={chip(value === '')}>
        كل الأيام
      </button>
      <button type="button" onClick={() => onChange(today)} className={chip(value === today)}>
        اليوم
      </button>
      <button type="button" onClick={() => onChange(yesterday)} className={chip(value === yesterday)}>
        أمس
      </button>
      <input
        type="date"
        aria-label="اختيار يوم محدد"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-700"
      />
      {value && <span className="text-[11px] font-bold text-cyan-800">{fmtDayAr(value)}</span>}
    </div>
  )
}
