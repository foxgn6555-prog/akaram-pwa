/**
 * وحدة مخالفات الوزن — المحطة التحويلية (00130):
 *  · المخالفة تُسجل تلقائياً عند اكتمال عملية وزن بوزن أقل من الحد الأدنى للنوع
 *  · بلا مبالغ مالية: سجل تدقيق على السائق + تنبيه فوري لغرفة العمليات
 *  · العرض: السائق · DB · الآلية · الوزن · الحد الأدنى · الفرق · الوقت
 */
import { useState } from 'react'
import { AlertTriangle, ShieldAlert } from 'lucide-react'
import { useViolations } from '@features/transfer-station'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const dateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('ar-IQ', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Baghdad' }).format(new Date(value))
    : '—'

export default function FinesPage() {
  const [day, setDay] = useState('')
  const list = useViolations(day || undefined)
  const rows = list.data ?? []

  return (
    <div className="space-y-5" data-testid="fines-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-slate-800">
            <ShieldAlert size={18} className="text-red-600" /> مخالفات الوزن
          </h1>
          <p className="text-sm text-slate-500">
            تُسجل تلقائياً عندما يكتمل سير العمل بوزن أقل من الحد المسموح — بلا مبالغ، وتصل تنبيهات لغرفة العمليات
          </p>
        </div>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          فلتر بتاريخ المخالفة
          <input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            data-testid="violations-date"
            className="h-11 rounded-xl border bg-white px-3 text-sm"
          />
        </label>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-700">
            السجل <span className="font-normal text-slate-400">({rows.length} مخالفة)</span>
          </h2>
        </div>
        {list.isLoading ? (
          <div className="p-8"><LoadingSpinner label="جارٍ جلب المخالفات…" /></div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><AlertTriangle size={26} /></span>
            <p className="font-bold text-slate-700">لا توجد مخالفات مسجلة</p>
            <p className="max-w-sm text-sm text-slate-500">كل الأوزان المكتملة ضمن الحدود المسموحة.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm" data-testid="violations-table">
              <thead>
                <tr className="bg-slate-50/70 text-xs text-slate-500">
                  <th className="px-3 py-2.5 font-semibold">ت</th>
                  <th className="px-3 py-2.5 font-semibold">السائق</th>
                  <th className="px-3 py-2.5 font-semibold">DB</th>
                  <th className="px-3 py-2.5 font-semibold">نوع الآلية</th>
                  <th className="px-3 py-2.5 font-semibold">الوزن (طن)</th>
                  <th className="px-3 py-2.5 font-semibold">الحد الأدنى (طن)</th>
                  <th className="px-3 py-2.5 font-semibold">الفرق (طن)</th>
                  <th className="px-3 py-2.5 font-semibold">وقت المخالفة</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className="border-t border-slate-50 hover:bg-red-50/40">
                    <td className="px-3 py-2.5 text-slate-400">{i + 1}</td>
                    <td className="px-3 py-2.5 font-medium">{r.driver_name}</td>
                    <td className="px-3 py-2.5 dir-ltr">{r.db_number}</td>
                    <td className="px-3 py-2.5 text-slate-500">{r.kind_label ?? r.vehicle_kind}</td>
                    <td className="px-3 py-2.5 font-bold text-red-700 dir-ltr">{r.weight_tons}</td>
                    <td className="px-3 py-2.5 dir-ltr">{r.min_tons}</td>
                    <td className="px-3 py-2.5 font-bold text-red-700 dir-ltr">{r.deficit_tons}</td>
                    <td className="px-3 py-2.5 text-slate-500">{dateTime(r.violated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
