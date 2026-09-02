/**
 * فولدرات المحطة التحويلية الواردة — معاون المدير المفوض:
 *  · فولدر السكسات الخارجة الشهري
 *  · فولدر النسافات الخارجة الشهري
 * تُرسَل من المحطة بنهاية كل شهر للاطلاع والاعتماد.
 */
import { useMemo } from 'react'
import {
  useSaksatSubmitted,
  useTripsSubmitted,
  type SaksatRecord,
} from '@features/transfer-station'
import { Icon } from '@components/ui/Icon/Icon'
import { formatTime, monthLabel } from '@components/station/station.utils'

/** تجميع السجلات المُرسلة في فولدرات شهرية */
function groupByMonth(records: SaksatRecord[]): Array<{ month: string; items: SaksatRecord[] }> {
  const map = new Map<string, SaksatRecord[]>()
  for (const r of records) {
    const key = (r.log_date ?? '').slice(0, 7)
    if (!key) continue
    const arr = map.get(key) ?? []
    arr.push(r)
    map.set(key, arr)
  }
  return [...map.entries()]
    .map(([month, items]) => ({ month, items }))
    .sort((a, b) => (a.month < b.month ? 1 : -1))
}

function FolderCard({ title, icon, records, accent }: {
  title: string
  icon: 'send' | 'truck'
  records: SaksatRecord[]
  accent: string
}) {
  const folders = useMemo(() => groupByMonth(records), [records])

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className={`flex items-center gap-2 border-b ${accent} px-4 py-3`}>
        <Icon name={icon} size={16} />
        <h2 className="text-sm font-bold text-slate-800">{title}</h2>
        <span className="ms-auto text-xs text-slate-500">{records.length} سجل مُرسل</span>
      </div>

      {folders.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500">
          لا توجد فولدرات واردة بعد — تُرسَل من المحطة بنهاية الشهر.
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {folders.map((f) => (
            <div key={f.month} className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <Icon name="folder" size={14} className="text-brand-600" />
                <span className="text-sm font-bold text-slate-700">
                  فولدر {title} — {monthLabel(f.month)}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                  {f.items.length} سجل
                </span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="bg-slate-50/70 text-xs text-slate-500">
                      <th className="px-3 py-2 font-semibold">ت</th>
                      <th className="px-3 py-2 font-semibold">اسم السائق</th>
                      <th className="px-3 py-2 font-semibold">نوع الآلية</th>
                      <th className="px-3 py-2 font-semibold">وقت الخروج</th>
                      <th className="px-3 py-2 font-semibold">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.items.map((r, i) => (
                      <tr key={r.id} className="border-t border-slate-50">
                        <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                        <td className="px-3 py-2 font-medium">{r.driver_name}</td>
                        <td className="px-3 py-2 text-slate-500">{r.vehicle_type ?? '—'}</td>
                        <td className="px-3 py-2 font-bold text-brand-700 dir-ltr">{formatTime(r.exit_time)}</td>
                        <td className="px-3 py-2 text-slate-500 dir-ltr">{r.log_date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function StationFolders() {
  const saksat = useSaksatSubmitted()
  const trips = useTripsSubmitted()

  return (
    <div className="space-y-5" data-testid="station-folders-page">
      <div>
        <h1 className="text-lg font-bold text-slate-800">فولدرات المحطة التحويلية</h1>
        <p className="text-sm text-slate-500">
          الفولدرات الشهرية الواردة من المحطة التحويلية — للاطلاع والاعتماد
        </p>
      </div>

      <FolderCard
        title="السكسات الخارجة"
        icon="send"
        records={saksat.data ?? []}
        accent="border-amber-200 bg-amber-50/50"
      />
      <FolderCard
        title="النسافات الخارجة"
        icon="truck"
        records={trips.data ?? []}
        accent="border-sky-200 bg-sky-50/50"
      />
    </div>
  )
}