/**
 * الزيارات (المرحلة ⑤) — ماذا دخلت الآليات فعلاً، ولماذا لم تُحتسب زيارة.
 *
 * المبدأ الحاكم: **لا «صفر كاذب»**. كل صف مكان يظهر بإحدى ثلاث حالات صريحة:
 *   مؤكد · غير مؤكد (والسبب مكتوب) · لم تُدخل (لا صف زيارة إطلاقاً).
 * الزيارات تأتي من جدول دائم، فلا تختفي عند تفريغ نقاط GPS اليومي.
 */
import { useMemo, useState } from 'react'
import { Play, RefreshCw, ShieldCheck } from 'lucide-react'
import { ShiftPanel } from './ShiftPanel'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import {
  formatDwell,
  VISIT_STATUS_LABEL_AR,
  type MapVisit,
} from '@sdk/map-planning.sdk'
import {
  useBuildVisits,
  useDayCertified,
  useMapCoverage,
  useMapVisits,
  useMapZones,
} from '@features/map-planning/hooks/useMapPlanning'

type Filter = 'all' | 'confirmed' | 'uncertain'

/** تاريخ اليوم بتوقيت بغداد (UTC+3) بصيغة YYYY-MM-DD */
function todayBaghdad(): string {
  const now = new Date()
  const baghdad = new Date(now.getTime() + 3 * 60 * 60_000)
  return baghdad.toISOString().slice(0, 10)
}

export default function MapVisitsPage() {
  const { data: zones = [] } = useMapZones()
  const [zoneId, setZoneId] = useState<string | null>(null)
  const activeZoneId = zoneId ?? zones[0]?.id ?? null

  const [day, setDay] = useState(todayBaghdad())
  const [filter, setFilter] = useState<Filter>('all')

  const { data: visits = [], isLoading } = useMapVisits(activeZoneId, day)
  const { data: coverage = [] } = useMapCoverage(activeZoneId, day)
  const build = useBuildVisits()
  const { data: certified } = useDayCertified(day)

  const rows = useMemo(
    () => (visits as MapVisit[]).filter((v) => filter === 'all' || v.status === filter),
    [visits, filter],
  )

  const counts = useMemo(() => {
    const all = visits as MapVisit[]
    return {
      confirmed: all.filter((v) => v.status === 'confirmed').length,
      uncertain: all.filter((v) => v.status === 'uncertain').length,
      places: all.length,
    }
  }, [visits])

  const streetCov = coverage.find((c) => c.place_kind === 'street')
  const alleyCov = coverage.find((c) => c.place_kind === 'alley')

  // اليوم يُرسل تاريخاً فقط — الخادم يحسب حدوده بتوقيت بغداد (map_day_bounds).
  // كان هنا `T00:00:00Z`–`T23:59:59Z` وهو يوم UTC لا يوم بغداد (يزيح ٣ ساعات).
  const run = () => {
    if (!activeZoneId) return
    build.mutate({ zoneId: activeZoneId, day })
  }

  return (
    <div className="space-y-4" dir="rtl">
      <ExecPageHeader icon="activity"
        title="الزيارات"
        subtitle={`${counts.confirmed} مؤكدة · ${counts.uncertain} غير مؤكدة · ${day}`}
        actions={
          <button
            type="button"
            onClick={run}
            disabled={build.isPending || !activeZoneId}
            className="flex items-center gap-1 rounded-xl bg-white/15 px-3 py-2 text-xs font-black text-white ring-1 ring-white/25 disabled:opacity-50"
          >
            {build.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
            {build.isPending ? 'يُشغّل…' : 'استخراج الزيارات'}
          </button>
        }
        links={[{ to: '/ops-room/map-planning/coverage', label: 'التغطية والإحصاء', icon: 'gauge' }]}
      />

      {/* شارة الحماية: هل بُنيت زيارة هذا اليوم لكل الزونات؟ بدونها لا تُحذف نقاطه */}
      <section
        aria-live="polite"
        data-testid="visits-certification"
        className={`flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2 text-xs font-bold ring-1 ${
          certified === true
            ? 'bg-emerald-50 text-emerald-900 ring-emerald-200'
            : certified === false
              ? 'bg-amber-50 text-amber-900 ring-amber-200'
              : 'bg-slate-50 text-slate-600 ring-slate-200'
        }`}
      >
        <ShieldCheck size={15} className="shrink-0" />
        {certified === true ? (
          <span>
            هذا اليوم <b>محميّ</b> — بُنيت زيارات كل الزونات، فيُسمَح بحذف نقاطه الخام بعد انتهاء مدة الاحتفاظ (٤٨ ساعة).
          </span>
        ) : certified === false ? (
          <span>
            هذا اليوم <b>غير محميّ</b> — لم تُبنَ زيارات كل الزونات بعد، ولن تُحذف نقاطه الخام. اضغط «استخراج الزيارات» بعد اختيار كل زون.
          </span>
        ) : (
          <span>جارٍ فحص حالة الحماية…</span>
        )}
      </section>

      {/* اختيار الزون واليوم */}
      <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3">
        {zones.map((z) => (
          <button
            key={z.id}
            type="button"
            onClick={() => setZoneId(z.id)}
            aria-pressed={z.id === activeZoneId}
            className={`rounded-xl px-3 py-2 text-xs font-black ${
              z.id === activeZoneId ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {z.name}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <input
          type="date"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          aria-label="يوم الزيارات"
          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"
        />
      </section>

      {/* الشفتات: نافذتها وحالة نقاطها + سحب صريح من المزوّد */}
      <ShiftPanel day={day} />

      {/* ملخّص التغطية — الشوارع والأزقة منفصلة، و«لم تُدخل» ظاهرة بالعدد */}
      <section className="grid gap-3 sm:grid-cols-2">
        {[{ label: 'الشوارع', c: streetCov }, { label: 'الأزقة', c: alleyCov }].map(({ label, c }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-[11px] font-black text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-black text-slate-900">
              {c ? `${c.coverage_pct}%` : '—'}
            </p>
            <p className="mt-1 text-[11px] font-bold text-slate-600">
              {c
                ? `${c.places_confirmed} مؤكد من ${c.places_total} · ${c.places_total - c.places_visited} لم تُدخل`
                : 'لا بيانات تغطية لهذا اليوم'}
            </p>
          </div>
        ))}
      </section>

      {/* الفلاتر */}
      <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3">
        {(['all', 'confirmed', 'uncertain'] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`rounded-xl px-3 py-2 text-[11px] font-black ${
              filter === f ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {f === 'all' ? `الكل (${counts.places})` : `${VISIT_STATUS_LABEL_AR[f]} (${counts[f]})`}
          </button>
        ))}
      </section>

      {/* الجدول */}
      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        {isLoading ? (
          <p className="p-6 text-center text-sm font-bold text-slate-500">جارٍ التحميل…</p>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm font-black text-slate-700">لا زيارة لهذا اليوم</p>
            <p className="mt-1 text-xs font-bold text-slate-500">
              «لا زيارة» ليست صفر تغطية: إما أن الآليات لم تدخل، أو أن النقاط لم تُستورد بعد.
              شغّل «استخراج الزيارات» بعد استيراد نقاط GPS.
            </p>
          </div>
        ) : (
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-[11px] font-black text-slate-600">
              <tr>
                <th className="p-3">#</th>
                <th className="p-3">المكان</th>
                <th className="p-3">الدخول</th>
                <th className="p-3">الخروج</th>
                <th className="p-3">المكوث</th>
                <th className="p-3">نقاط</th>
                <th className="p-3">أقصى عمق</th>
                <th className="p-3">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id} className="border-t border-slate-100">
                  <td className="p-3 font-bold text-slate-500">{v.seq}</td>
                  <td className="p-3">
                    <p className="font-black text-slate-900">{v.place_name ?? v.place_code}</p>
                    <p className="text-[10px] font-bold text-slate-500">
                      {v.place_kind === 'street' ? 'شارع' : 'زقاق'} · {v.place_code}
                    </p>
                  </td>
                  <td className="p-3 font-bold text-slate-700">
                    {new Date(v.entered_at).toLocaleTimeString('ar-IQ-u-nu-latn', {
                      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Baghdad',
                    })}
                  </td>
                  <td className="p-3 font-bold text-slate-700">
                    {v.exited_at
                      ? new Date(v.exited_at).toLocaleTimeString('ar-IQ-u-nu-latn', {
                          hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Baghdad',
                        })
                      : '—'}
                  </td>
                  <td className="p-3 font-bold text-slate-700">{formatDwell(v.dwell_seconds)}</td>
                  <td className="p-3 font-bold text-slate-700">{v.points_count}</td>
                  <td className="p-3 font-bold text-slate-700">
                    {v.max_depth_m === null ? '—' : `${v.max_depth_m} م`}
                  </td>
                  <td className="p-3">
                    <span
                      className={`rounded-lg px-2 py-1 text-[10px] font-black ${
                        v.status === 'confirmed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {VISIT_STATUS_LABEL_AR[v.status]}
                    </span>
                    {v.reason && (
                      <p className="mt-1 max-w-[220px] text-[10px] font-bold leading-relaxed text-amber-700">
                        {v.reason}
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
