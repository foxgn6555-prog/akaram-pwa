/** فريقي (مسؤول القسم) — لكل منطقة من مناطقي: المتعهد الذي يعمل معي، عدد العمال (عدد فقط)، والآليات التي تعمل في منطقتي الآن */
import { MapPin, Phone, Truck, UserCheck, Users } from 'lucide-react'
import { useManagerTeamSummary } from '@features/contractors/hooks'
import { PARENT_AR, SHIFT_AR, timeAr, zoneLabel } from '@features/contractors/format'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'

const TRIP_AR: Record<string, string> = { at_site: 'تعمل في الموقع', breakdown: 'عطل مُبلَّغ', to_site: 'في الطريق', to_station: 'إلى المحطة', at_station: 'في المحطة' }

export default function TeamPage() {
  const q = useManagerTeamSummary()
  if (q.isLoading) return <LoadingSpinner />
  if (!q.data?.length) return <EmptyState title="لا مناطق مسندة إليك" hint="تُسند المناطق لمسؤول القسم من التطوير المركزية" />
  return (
    <div className="space-y-4" data-testid="manager-team">
      <header className="rounded-2xl border bg-white p-4 shadow-sm">
        <h1 className="flex items-center gap-2 text-xl font-black"><Users size={20} />فريقي</h1>
        <p className="text-xs text-slate-500">المتعهد وعماله تُدار من بوابة المتعهد؛ هنا العرض والمتابعة فقط.</p>
      </header>
      {q.data.map((r) => (
        <section key={r.sector_id} className="rounded-2xl border bg-white p-4 shadow-sm" data-testid={`team-area-${r.sector_id}`}>
          <h2 className="flex items-center gap-2 font-black"><MapPin size={16} />{r.area_name} <span className="text-xs font-bold text-slate-500">· {PARENT_AR[r.parent_sector] ?? r.parent_sector}</span></h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border bg-cyan-50 p-3">
              <div className="text-[11px] font-bold text-cyan-800">المتعهد</div>
              {r.contractor_name ? (
                <>
                  <div className="text-lg font-black text-cyan-950" data-testid={`contractor-${r.sector_id}`}>{r.contractor_name}</div>
                  {r.contractor_phone && <div className="inline-flex items-center gap-1 text-xs text-cyan-900"><Phone size={11} />{r.contractor_phone}</div>}
                  <div className="mt-1 text-[11px] text-cyan-900">
                    {r.contractor_checked_in ? <>✓ أثبت تواجده في الموقع {timeAr(r.contractor_checkin_at)} · {zoneLabel(r.in_zone)}</> : 'لم يُثبت تواجده في الموقع اليوم بعد'}
                  </div>
                </>
              ) : <div className="text-sm font-bold text-slate-500">لا متعهد معيّن لهذه المنطقة</div>}
            </div>
            <div className="rounded-2xl border bg-emerald-50 p-3">
              <div className="text-[11px] font-bold text-emerald-800">عدد العمال</div>
              <div className="text-3xl font-black text-emerald-950" data-testid={`workers-${r.sector_id}`}>{r.workers_count}</div>
              <div className="inline-flex items-center gap-1 text-[11px] text-emerald-900"><UserCheck size={11} />اليوم: حاضر {r.today_present} · غائب {r.today_absent}</div>
            </div>
            <div className="rounded-2xl border bg-blue-50 p-3">
              <div className="text-[11px] font-bold text-blue-800">آليات تعمل الآن</div>
              <div className="text-3xl font-black text-blue-950" data-testid={`vehicles-${r.sector_id}`}>{r.vehicles_now}</div>
              <div className="text-[11px] text-blue-900">وصلت إلى الموقع ولم تغادره</div>
            </div>
          </div>
          {r.vehicles.length > 0 && (
            <ul className="mt-3 grid gap-2 md:grid-cols-2" data-testid={`vehicles-list-${r.sector_id}`}>
              {r.vehicles.map((v) => (
                <li key={v.id} className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm">
                  <span className="inline-flex items-center gap-2 font-bold"><Truck size={14} />{v.db_number} · {v.vehicle_name}</span>
                  <span className="text-[11px] text-slate-500">{v.driver_name} · {SHIFT_AR[v.shift] ?? v.shift} · منذ {timeAr(v.arrived_at)} · {TRIP_AR[v.trip_status] ?? v.trip_status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}
