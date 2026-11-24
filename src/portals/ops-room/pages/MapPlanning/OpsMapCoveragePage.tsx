/**
 * التغطية والإحصاء (المرحلة ⑥).
 *
 * المبدأ: النسبة وحدها تُخفي المشكلة. لذلك الصفحة تعرض **ثلاثة أرقام منفصلة**
 * (مؤكد · غير مؤكد · لم تُدخل) وثلاثة تبويبات، أوّلها «لم تُزر» — لأن سؤال
 * المفتّش الحقيقي هو «أين لم تصل الآلية»، لا «كم النسبة».
 *
 * اليوم يوم بغداد (UTC+3) لا يوم UTC: زيارة الساعة 01:00 تُنسب ليومها الصحيح.
 */
import { useMemo } from 'react'
import { AlertTriangle, CheckCircle2, MapPinOff, TrendingUp } from 'lucide-react'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import { MapFilterBar } from '@features/map-planning/components/MapFilterBar'
import { useUrlChoice, useUrlState } from '@features/map-planning/hooks/useUrlState'
import { baghdadDayKey, isBaghdadDayKey } from '@features/map-planning/lib/baghdad-day'
import {
  formatDwell,
  placeCoverageState,
  type PlaceCoverageRow,
  type VehicleCoverageRow,
} from '@sdk/map-planning.sdk'
import { useShiftLabel } from '@features/hr-shifts/hooks'
import {
  useCoverageByPlace,
  useCoverageByVehicle,
  useCoverageRollup,
  useCoverageTrend,
  useMapZones,
} from '@features/map-planning/hooks/useMapPlanning'

type Tab = 'unvisited' | 'uncertain' | 'confirmed' | 'vehicles'

/** شريط اتجاه بسيط بلا مكتبة رسم — ١٤ عموداً يعرض النسبة عبر الأيام */
function TrendBars({ points }: { points: { day: string; pct: number }[] }) {
  if (points.length === 0) return null
  return (
    <div className="flex items-end gap-1" role="img" aria-label="اتجاه التغطية">
      {points.map((p) => (
        <div
          key={p.day}
          className="flex flex-1 flex-col items-center gap-1"
          title={`${p.day}: ${p.pct}%`}
        >
          <div
            className="w-full rounded-sm bg-indigo-500/80"
            style={{ height: `${Math.max(2, Math.round((p.pct / 100) * 40))}px` }}
          />
          <span className="text-[8px] font-bold text-slate-400">{p.day.slice(5)}</span>
        </div>
      ))}
    </div>
  )
}

export default function MapCoveragePage() {
  const { data: zones = [] } = useMapZones()
  // المرشّحات في العنوان — المشاركة والرجوع يعملان بلا كود إضافي
  const [zoneParam, setZoneParam] = useUrlState<string | null>('zone', {
    fallback: null,
    parse: (raw) => raw || undefined,
    serialize: (v) => v ?? '',
  })
  const activeZoneId = zoneParam ?? zones[0]?.id ?? null
  const [day, setDay] = useUrlState<string>('day', {
    fallback: baghdadDayKey(),
    parse: (raw) => (isBaghdadDayKey(raw) ? raw : undefined),
  })
  const [tab, setTab] = useUrlChoice<Tab>('tab', ['unvisited', 'uncertain', 'confirmed', 'vehicles'], 'unvisited')
  /** الشفت من `hr_shifts` حيّاً — لا من قاموس ثابت مهجور */
  const shiftLabel = useShiftLabel()

  const { data: rollup } = useCoverageRollup(activeZoneId, day)
  const { data: places = [], isLoading } = useCoverageByPlace(activeZoneId, day)
  const { data: vehicles = [] } = useCoverageByVehicle(activeZoneId, day)
  const { data: trend = [] } = useCoverageTrend(activeZoneId, day, 14)

  const grouped = useMemo(() => {
    const rows = places as PlaceCoverageRow[]
    return {
      unvisited: rows.filter((r) => placeCoverageState(r) === 'not_entered'),
      uncertain: rows.filter((r) => placeCoverageState(r) === 'uncertain'),
      confirmed: rows.filter((r) => placeCoverageState(r) === 'confirmed'),
    }
  }, [places])

  const trendPoints = useMemo(
    () =>
      (trend as { day: string; coverage_pct: number }[]).map((t) => ({
        day: t.day,
        pct: t.coverage_pct,
      })),
    [trend],
  )

  const shown: PlaceCoverageRow[] =
    tab === 'unvisited'
      ? grouped.unvisited
      : tab === 'uncertain'
        ? grouped.uncertain
        : tab === 'confirmed'
          ? grouped.confirmed
          : []

  const tabs: { key: Tab; label: string; count: number; tone: string }[] = [
    { key: 'unvisited', label: 'لم تُزر', count: grouped.unvisited.length, tone: 'bg-rose-600' },
    { key: 'uncertain', label: 'غير مؤكد', count: grouped.uncertain.length, tone: 'bg-amber-500' },
    { key: 'confirmed', label: 'مؤكد', count: grouped.confirmed.length, tone: 'bg-emerald-600' },
    {
      key: 'vehicles',
      label: 'الآليات',
      count: (vehicles as VehicleCoverageRow[]).length,
      tone: 'bg-slate-800',
    },
  ]

  return (
    <div className="space-y-4" dir="rtl">
      <ExecPageHeader
        icon="gauge"
        title="التغطية والإحصاء"
        subtitle={
          rollup
            ? `${rollup.places_confirmed} مؤكد · ${rollup.places_uncertain} غير مؤكد · ${rollup.places_not_entered} لم تُدخل من ${rollup.places_total}`
            : 'لا بيانات لهذا اليوم'
        }
        stats={
          rollup
            ? [
                { label: 'التغطية', value: `${rollup.coverage_pct}%`, tone: 'gold' },
                { label: 'مؤكد', value: `${rollup.confirmed_pct}%`, tone: 'green' },
                { label: 'غير مؤكد', value: `${rollup.uncertain_pct}%`, tone: 'red' },
                { label: 'آليات نشطة', value: String(rollup.vehicles_active), tone: 'plain' },
              ]
            : undefined
        }
        links={[
          { to: '/ops-room/map-planning/vehicle-visits', label: 'زيارات الآلية', icon: 'truck' },
        ]}
      />

      {/* المرشّحات الموحّدة: الزون + اليوم + التبويب + العدد في شريط واحد */}
      <MapFilterBar
        zones={zones.map((z) => ({ id: z.id, name: z.name }))}
        activeZoneId={activeZoneId}
        onPickZone={setZoneParam}
        day={day}
        onDayChange={setDay}
        shown={tab === 'vehicles' ? (vehicles as unknown[]).length : shown.length}
        total={
          tab === 'vehicles' ? (vehicles as unknown[]).length : places.length
        }
        unitLabel={tab === 'vehicles' ? 'آلية' : 'مكان'}
        dirty={zoneParam !== null || day !== baghdadDayKey() || tab !== 'unvisited'}
        onClearAll={() => {
          setZoneParam(null)
          setDay(baghdadDayKey())
          setTab('unvisited')
        }}
      />

      {/* ثلاثة أرقام منفصلة — لا نسبة واحدة مخلوطة */}
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="flex items-center gap-1 text-[11px] font-black text-emerald-800">
            <CheckCircle2 size={13} /> مؤكد
          </p>
          <p className="mt-1 text-2xl font-black text-emerald-900">
            {rollup?.places_confirmed ?? '—'}
          </p>
          <p className="text-[11px] font-bold text-emerald-700">
            {rollup?.visits_confirmed ?? 0} زيارة بكل المعايير
          </p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="flex items-center gap-1 text-[11px] font-black text-amber-800">
            <AlertTriangle size={13} /> غير مؤكد
          </p>
          <p className="mt-1 text-2xl font-black text-amber-900">
            {rollup?.places_uncertain ?? '—'}
          </p>
          <p className="text-[11px] font-bold text-amber-700">
            {rollup?.visits_uncertain ?? 0} زيارة ناقصة الشرط
          </p>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <p className="flex items-center gap-1 text-[11px] font-black text-rose-800">
            <MapPinOff size={13} /> لم تُدخل
          </p>
          <p className="mt-1 text-2xl font-black text-rose-900">
            {rollup?.places_not_entered ?? '—'}
          </p>
          <p className="text-[11px] font-bold text-rose-700">مكان لم تصله أي آلية</p>
        </div>
      </section>

      {/* الاتجاه */}
      {trendPoints.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="mb-2 flex items-center gap-1 text-[11px] font-black text-slate-600">
            <TrendingUp size={13} /> اتجاه التغطية — آخر ١٤ يوماً
          </p>
          <TrendBars points={trendPoints} />
        </section>
      )}

      {/* التبويبات */}
      <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-pressed={tab === t.key}
            className={`rounded-xl px-3 py-2 text-[11px] font-black ${tab === t.key ? `${t.tone} text-white` : 'bg-slate-100 text-slate-700'}`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </section>

      {/* الجدول */}
      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        {isLoading ? (
          <p className="p-6 text-center text-sm font-bold text-slate-500">جارٍ التحميل…</p>
        ) : tab === 'vehicles' ? (
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-[11px] font-black text-slate-600">
              <tr>
                <th className="p-3">الآلية</th>
                <th className="p-3">الشفت</th>
                <th className="p-3">السائق</th>
                <th className="p-3">زيارات</th>
                <th className="p-3">مؤكد</th>
                <th className="p-3">غير مؤكد</th>
                <th className="p-3">أماكن</th>
                <th className="p-3">مكوث</th>
              </tr>
            </thead>
            <tbody>
              {(vehicles as VehicleCoverageRow[]).map((v) => (
                <tr key={v.vehicle_id} className="border-t border-slate-100">
                  <td className="p-3">
                    <p className="font-black text-slate-900">{v.vehicle_name ?? '—'}</p>
                    <p className="text-[10px] font-bold text-slate-500">
                      {v.db_number ?? ''}
                      {!v.in_fleet && (
                        <span className="ms-1 rounded bg-slate-200 px-1 text-slate-700">
                          خارج الأسطول
                        </span>
                      )}
                    </p>
                  </td>
                  <td className="p-3 font-bold text-slate-700">{shiftLabel(v.shift)}</td>
                  <td className="p-3 font-bold text-slate-700">{v.driver_name ?? '—'}</td>
                  <td className="p-3 font-black text-slate-900">{v.visits_count}</td>
                  <td className="p-3 font-bold text-emerald-700">{v.confirmed_count}</td>
                  <td className="p-3 font-bold text-amber-700">{v.uncertain_count}</td>
                  <td className="p-3 font-bold text-slate-700">{v.places_count}</td>
                  <td className="p-3 font-bold text-slate-700">
                    {formatDwell(v.total_dwell_seconds)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : shown.length === 0 ? (
          <p className="p-6 text-center text-sm font-bold text-slate-500">
            {tab === 'unvisited' ? 'كل الأماكن زِيرت — لا مكان متروك' : 'لا صفوف في هذا التصنيف'}
          </p>
        ) : (
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-[11px] font-black text-slate-600">
              <tr>
                <th className="p-3">الكود</th>
                <th className="p-3">الاسم</th>
                <th className="p-3">المحلة</th>
                <th className="p-3">الطول</th>
                <th className="p-3">العرض</th>
                <th className="p-3">زيارات</th>
                <th className="p-3">آليات</th>
                <th className="p-3">مكوث</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={`${r.place_kind}-${r.place_id}`} className="border-t border-slate-100">
                  <td className="p-3 font-black text-slate-700">{r.place_code}</td>
                  <td className="p-3">
                    <p className="font-black text-slate-900">{r.place_name ?? '—'}</p>
                    <p className="text-[10px] font-bold text-slate-500">
                      {r.place_kind === 'street' ? 'شارع' : 'زقاق'}
                    </p>
                  </td>
                  <td className="p-3 font-bold text-slate-600">{r.mahalla_code ?? '—'}</td>
                  <td className="p-3 font-bold text-slate-700">
                    {r.length_m === null ? '—' : `${r.length_m} م`}
                  </td>
                  <td className="p-3 font-bold text-slate-700">
                    {r.width_m === null ? '—' : `${r.width_m} م`}
                  </td>
                  <td className="p-3 font-black text-slate-900">{r.visits_count}</td>
                  <td className="p-3 font-bold text-slate-700">{r.vehicles_count}</td>
                  <td className="p-3 font-bold text-slate-700">
                    {formatDwell(r.total_dwell_seconds)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {rollup && rollup.places_total === 0 && (
        <p className="rounded-xl bg-slate-100 p-3 text-center text-[11px] font-bold text-slate-600">
          هذا الزون لا تخطيط فيه بعد — لا شوارع ولا أزقة. التغطية غير قابلة للحساب لا أنها صفر.
        </p>
      )}
    </div>
  )
}
