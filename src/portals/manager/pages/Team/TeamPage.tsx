/** فريقي (مسؤول القسم) — لكل منطقة من مناطقي: المتعهد الذي يعمل معي، العدد الذي سجّله اليوم (يشمله)، والآليات التي تعمل في منطقتي الآن */
import { Camera, MapPin, Phone, Truck, UserCheck, Users } from 'lucide-react'
import { useManagerContractorPhotosToday, useManagerTeamSummary } from '@features/contractors/hooks'
import { PARENT_AR, SHIFT_AR, timeAr, zoneLabel } from '@features/contractors/format'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'

const TRIP_AR: Record<string, string> = { at_site: 'تعمل في الموقع', breakdown: 'عطل مُبلَّغ', to_site: 'في الطريق', to_station: 'إلى المحطة', at_station: 'في المحطة' }

export default function TeamPage() {
  const q = useManagerTeamSummary()
  const photosQ = useManagerContractorPhotosToday()
  const photosOf = (uid: string | null) => photosQ.data?.find((x) => x.contractor_user_id === uid)
  if (q.isLoading) return <LoadingSpinner />
  if (!q.data?.length) return <EmptyState title="لا مناطق مسندة إليك" hint="تُسند المناطق لمسؤول القسم من التطوير المركزية" />
  return (
    <div className="space-y-4" data-testid="manager-team">
      <ExecPageHeader icon="users" iconNode={<Users size={22} className="text-[#f3d06a]" />} title="فريقي" subtitle="المتعهد وعماله تُدار من بوابة المتعهد؛ هنا العرض والمتابعة فقط." />
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
                  <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-cyan-900" data-testid={`contractor-photos-${r.sector_id}`}>
                    <Camera size={11} />صور اليوم: {photosOf(r.contractor_user_id)?.tickets_today ?? 0} تذكرة · {photosOf(r.contractor_user_id)?.photos_today ?? 0} صورة
                  </div>
                </>
              ) : <div className="text-sm font-bold text-slate-500">لا متعهد معيّن لهذه المنطقة</div>}
            </div>
            <div className="rounded-2xl border bg-emerald-50 p-3">
              <div className="text-[11px] font-bold text-emerald-800">العدد اليوم (كما سجّله المتعهد)</div>
              <div className="text-3xl font-black text-emerald-950" data-testid={`workers-${r.sector_id}`}>{r.today_headcount ?? '—'}</div>
              <div className="inline-flex items-center gap-1 text-[11px] text-emerald-900"><UserCheck size={11} />{r.today_headcount == null ? 'لم يسجّل العدد اليوم بعد' : `يشمل المتعهد نفسه · عمال: ${Math.max(0, r.today_headcount - 1)}`}</div>
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
