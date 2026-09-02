/** جدول سجلات الوحدات الخارجة (اسم السائق · نوع الآلية · وقت الخروج · الحالة · التاريخ) */
import type { SaksatRecord } from '@features/transfer-station/types'
import { formatTime, type StationUnitKind } from './station.utils'

/** صف الجدول — سكسات/نسافات خارجة */
export type StationRow = SaksatRecord

export function StationTable({
  kind, records, personLabel, withVehicle = true,
}: {
  kind: StationUnitKind
  records: StationRow[]
  personLabel?: string
  withVehicle?: boolean
  /** مهمل بعد إلغاء وحدة الحضورية — يبقى لتفادي كسر استدعاءات قديمة */
  presence?: boolean
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-bold text-slate-700">
          السجلات <span className="font-normal text-slate-400">({records.length} سجل)</span>
        </h2>
      </div>
      {records.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500">
          لا توجد سجلات — أضِف من النموذج أعلاه.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm" data-testid={`${kind}-table`}>
            <thead>
              <tr className="bg-slate-50/70 text-xs text-slate-500">
                <th className="px-3 py-2.5 font-semibold">ت</th>
                <th className="px-3 py-2.5 font-semibold">{personLabel ?? 'اسم السائق'}</th>
                {withVehicle && <th className="px-3 py-2.5 font-semibold">نوع الآلية</th>}
                <th className="px-3 py-2.5 font-semibold">وقت الخروج</th>
                <th className="px-3 py-2.5 font-semibold">التاريخ</th>
                <th className="px-3 py-2.5 font-semibold">حالة الإرسال</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={r.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                  <td className="px-3 py-2.5 text-slate-400">{i + 1}</td>
                  <td className="px-3 py-2.5 font-medium">{r.driver_name}</td>
                  {withVehicle && <td className="px-3 py-2.5 text-slate-500">{r.vehicle_type ?? '—'}</td>}
                  <td className="px-3 py-2.5 font-bold text-brand-700 dir-ltr">{formatTime(r.exit_time)}</td>
                  <td className="px-3 py-2.5 text-slate-500 dir-ltr">{r.log_date}</td>
                  <td className="px-3 py-2.5">
                    {r.status === 'submitted_to_deputy' ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">مُرسل للمعاون</span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">مسودة</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
