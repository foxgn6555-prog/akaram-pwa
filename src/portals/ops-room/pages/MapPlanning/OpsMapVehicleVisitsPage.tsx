/**
 * زيارات الآلية — «ماذا فعلت هذه الآلية اليوم؟»
 *
 * هذا هو الجواب المباشر لسؤال: «الآلية الفلانية، سائقها كذا، شفتها كذا،
 * دخلت الزقاق والشارع كذا». الصف لا يقول الآلية وحدها، بل **سائقها وشفتها**
 * مع تصريح المصدر: من انطلاقية اليوم (دقيق) أم من سجل الآلية (بديل موسوم).
 */
import { useMemo, useState } from 'react'
import { AlertCircle, Truck } from 'lucide-react'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import {
  formatDwell,
  SHIFT_LABEL_AR,
  SHIFT_SOURCE_LABEL_AR,
  shiftCaveat,
  VISIT_STATUS_LABEL_AR,
  type EnrichedVisit,
  type VehicleDayRow,
} from '@sdk/map-planning.sdk'
import {
  useBuildVisits,
  useMapZones,
  useUnvisitedEnriched,
  useVehiclesDay,
  useVisitsEnriched,
} from '@features/map-planning/hooks/useMapPlanning'
import { RefreshCw, Play } from 'lucide-react'

const todayBaghdad = () => new Date(Date.now() + 3 * 60 * 60_000).toISOString().slice(0, 10)

const hhmm = (v: string | null | undefined) =>
  v ? new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Baghdad',
  }).format(new Date(v)) : '—'

export default function MapVehicleVisitsPage() {
  const { data: zones = [] } = useMapZones()
  const [zoneId, setZoneId] = useState<string | null>(null)
  const activeZoneId = zoneId ?? zones[0]?.id ?? null
  const [day, setDay] = useState(todayBaghdad())
  const [vehicleId, setVehicleId] = useState<string | null>(null)

  const { data: vehicles = [] } = useVehiclesDay(activeZoneId, day)
  const { data: visits = [], isLoading } = useVisitsEnriched(activeZoneId, day, vehicleId)
  const { data: unvisited = [] } = useUnvisitedEnriched(activeZoneId, day)
  const build = useBuildVisits()

  const picked = useMemo(
    () => (vehicles as VehicleDayRow[]).find((v) => v.vehicle_id === vehicleId) ?? null,
    [vehicles, vehicleId],
  )

  /** توزيع السائقين: قد تتعدد انطلاقيات الآلية في اليوم */
  const drivers = useMemo(() => {
    const m = new Map<string, number>()
    for (const v of visits as EnrichedVisit[]) {
      const k = `${v.driver_name ?? '—'}|${v.shift ?? ''}|${v.shift_source}`
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return [...m.entries()].map(([k, n]) => {
      const [name, shift, src] = k.split('|')
      return { name, shift, source: src as EnrichedVisit['shift_source'], count: n }
    })
  }, [visits])

  return (
    <div className="space-y-4" dir="rtl">
      <ExecPageHeader icon="truck"
        title="زيارات الآلية"
        subtitle={picked
          ? `${picked.vehicle_name} · ${picked.db_number} · سائق ${picked.driver_name ?? '—'} · ${picked.visits_count} زيارة`
          : `${(vehicles as VehicleDayRow[]).length} آلية عملت في هذا اليوم`}
        actions={
          <button type="button" disabled={build.isPending || !activeZoneId}
            onClick={() => activeZoneId && build.mutate({ zoneId: activeZoneId, day })}
            className="flex items-center gap-1 rounded-xl bg-white/15 px-3 py-2 text-xs font-black text-white ring-1 ring-white/25 disabled:opacity-50">
            {build.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
            {build.isPending ? 'يُشغّل…' : 'استخراج الزيارات'}
          </button>
        }
        links={[{ to: '/ops-room/map-planning/coverage', label: 'التغطية', icon: 'gauge' }]}
      />

      {/* الزون واليوم */}
      <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3">
        {zones.map((z) => (
          <button key={z.id} type="button" onClick={() => { setZoneId(z.id); setVehicleId(null) }}
            aria-pressed={z.id === activeZoneId}
            className={`rounded-xl px-3 py-2 text-xs font-black ${z.id === activeZoneId ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-700'}`}>
            {z.name}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <input type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-label="اليوم"
          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold" />
        <span className="text-[10px] font-bold text-slate-400">يوم بغداد</span>
      </section>

      {/* اختيار الآلية */}
      <section className="rounded-2xl border border-slate-200 bg-white p-3">
        <p className="mb-2 flex items-center gap-1 text-[11px] font-black text-slate-600">
          <Truck size={13} /> الآليات التي عملت ({vehicles.length})
        </p>
        {vehicles.length === 0 ? (
          <p className="text-[11px] font-bold text-slate-500">
            لا آلية لها زيارات في هذا اليوم. إن كانت النقاط مستوردة فشغّل «استخراج الزيارات».
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setVehicleId(null)} aria-pressed={vehicleId === null}
              className={`rounded-xl px-3 py-2 text-[11px] font-black ${vehicleId === null ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
              الكل ({vehicles.length})
            </button>
            {(vehicles as VehicleDayRow[]).map((v) => (
              <button key={v.vehicle_id} type="button" onClick={() => setVehicleId(v.vehicle_id)}
                aria-pressed={vehicleId === v.vehicle_id}
                className={`rounded-xl px-3 py-2 text-[11px] font-black ${vehicleId === v.vehicle_id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                {v.db_number} · {v.visits_count}
                {v.shift_source === 'vehicle' && <span className="ms-1 text-amber-500" title="بلا انطلاقية">*</span>}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* بطاقة الآلية المختارة */}
      {picked && (
        <section className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <p className="text-[10px] font-black text-slate-500">السائق</p>
            <p className="mt-1 text-sm font-black text-slate-900">{picked.driver_name ?? '—'}</p>
            {picked.shift_source === 'vehicle' && (
              <p className="mt-1 flex items-center gap-1 text-[9px] font-bold text-amber-600">
                <AlertCircle size={9} /> من سجل الآلية
              </p>
            )}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <p className="text-[10px] font-black text-slate-500">الشفت</p>
            <p className="mt-1 text-sm font-black text-slate-900">
              {picked.shift ? (SHIFT_LABEL_AR[picked.shift] ?? picked.shift) : '—'}
            </p>
            <p className="mt-1 text-[9px] font-bold text-slate-400">
              {SHIFT_SOURCE_LABEL_AR[picked.shift_source]}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <p className="text-[10px] font-black text-slate-500">الزيارات</p>
            <p className="mt-1 text-sm font-black text-slate-900">
              {picked.confirmed_count} مؤكد · {picked.uncertain_count} غير مؤكد
            </p>
            <p className="mt-1 text-[9px] font-bold text-slate-400">{picked.places_count} مكاناً</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <p className="text-[10px] font-black text-slate-500">إجمالي المكوث</p>
            <p className="mt-1 text-sm font-black text-slate-900">{formatDwell(picked.total_dwell_seconds)}</p>
            <p className="mt-1 text-[9px] font-bold text-slate-400">
              {hhmm(picked.first_at)} → {hhmm(picked.last_at)}
            </p>
          </div>
        </section>
      )}

      {/* تعدد السائقين في اليوم — لا نُخفي التبديل */}
      {drivers.length > 1 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-[11px] font-black text-amber-900">أكثر من سائق/شفت في هذا اليوم:</p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {drivers.map((d) => (
              <li key={`${d.name}-${d.shift}`} className="rounded-lg bg-white px-2 py-1 text-[10px] font-bold text-amber-900">
                {d.name} · {d.shift ? (SHIFT_LABEL_AR[d.shift] ?? d.shift) : '—'} · {d.count} زيارة
                {d.source === 'vehicle' && <span className="ms-1 text-amber-500">(سجل الآلية)</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* الجدول */}
      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        {isLoading ? (
          <p className="p-6 text-center text-sm font-bold text-slate-500">جارٍ التحميل…</p>
        ) : visits.length === 0 ? (
          <p className="p-6 text-center text-sm font-bold text-slate-500">
            لا زيارات في هذا اليوم{vehicleId ? ' لهذه الآلية' : ''}
          </p>
        ) : (
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-[11px] font-black text-slate-600">
              <tr>
                <th className="p-2">#</th>
                <th className="p-2">الآلية</th>
                <th className="p-2">السائق</th>
                <th className="p-2">الشفت</th>
                <th className="p-2">المكان</th>
                <th className="p-2">الدخول</th>
                <th className="p-2">الخروج</th>
                <th className="p-2">المكوث</th>
                <th className="p-2">الحالة</th>
                <th className="p-2">مسؤول القسم</th>
              </tr>
            </thead>
            <tbody>
              {(visits as EnrichedVisit[]).map((v) => {
                const caveat = shiftCaveat(v)
                return (
                  <tr key={v.id} className="border-t border-slate-100">
                    <td className="p-2 font-bold text-slate-400">{v.seq}</td>
                    <td className="p-2">
                      <p className="font-black text-slate-900">{v.db_number ?? '—'}</p>
                      <p className="text-[9px] font-bold text-slate-500">{v.vehicle_name ?? ''}</p>
                    </td>
                    <td className="p-2 font-bold text-slate-800">
                      {v.driver_name ?? '—'}
                      {caveat && <p className="text-[9px] font-bold text-amber-600">{caveat}</p>}
                    </td>
                    <td className="p-2 font-bold text-slate-700">
                      {v.shift ? (SHIFT_LABEL_AR[v.shift] ?? v.shift) : '—'}
                    </td>
                    <td className="p-2">
                      <p className="font-black text-slate-900">{v.place_name ?? v.place_code}</p>
                      <p className="text-[9px] font-bold text-slate-500">
                        {v.place_kind === 'street' ? 'شارع' : 'زقاق'} · {v.place_code}
                      </p>
                    </td>
                    <td className="p-2 font-bold text-slate-700">{hhmm(v.entered_at)}</td>
                    <td className="p-2 font-bold text-slate-700">{hhmm(v.exited_at)}</td>
                    <td className="p-2 font-bold text-slate-700">{formatDwell(v.dwell_seconds)}</td>
                    <td className="p-2">
                      <span className={`rounded-lg px-2 py-1 text-[10px] font-black ${
                        v.status === 'confirmed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                        {VISIT_STATUS_LABEL_AR[v.status]}
                      </span>
                    </td>
                    <td className="p-2 text-[10px] font-bold text-slate-600">
                      {v.department_manager_names ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* لم تُدخل — بمسؤولها */}
      {unvisited.length > 0 && (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-3">
          <p className="text-[11px] font-black text-rose-900">
            أماكن لم تُدخل في هذا اليوم ({unvisited.length})
          </p>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {(unvisited as { place_code: string; place_name: string | null; place_kind: string; length_m: number | null; department_manager_names: string | null }[])
              .slice(0, 12).map((u) => (
              <li key={u.place_code} className="flex items-center justify-between rounded-lg bg-white px-2 py-1 text-[10px] font-bold">
                <span className="text-rose-900">{u.place_code} · {u.place_name ?? '—'}</span>
                <span className="text-slate-600">{u.length_m ?? '—'} م</span>
              </li>
            ))}
          </ul>
          {(unvisited as unknown[]).length > 12 && (
            <p className="mt-1 text-[10px] font-bold text-rose-700">
              و{unvisited.length - 12} أخرى — القائمة الكاملة في صفحة التغطية
            </p>
          )}
        </section>
      )}
    </div>
  )
}
