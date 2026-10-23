/**
 * ورقة تقرير مسار الانطلاقية (00345) — A4 بترويسة وصورة الخريطة والملخص والمراحل والتوقفات والانقطاعات.
 * تُلتقط كصورة للـ PDF وتُطبع كما هي؛ تُرسم خارج الشاشة في صفحة الخريطة.
 */
import { forwardRef } from 'react'
import type { TripRouteDetail } from '@sdk/gps-lvn.sdk'
import { fmtDateTime, fmtDur, fmtTime, summaryRows, tripTitle } from '@features/gps-lvn/trip-route-export'

const DEST_AR: Record<string, string> = { work_site: 'موقع العمل', transfer_station: 'المحطة التحويلية', maintenance: 'الصيانة', garage: 'الكراج' }
const th = 'border border-slate-300 bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-700'
const td = 'border border-slate-200 px-2 py-1 text-[11px] text-slate-800'

const TripRouteReportSheet = forwardRef<HTMLDivElement, { d: TripRouteDetail; mapImage: string | null; compare?: TripRouteDetail | null }>(function TripRouteReportSheet({ d, mapImage, compare }, ref) {
  const t = d.trip
  const rows = summaryRows(d)
  return (
    <div ref={ref} dir="rtl" className="trip-sheet mx-auto w-[718px] bg-white p-6 text-slate-900 shadow" data-testid="trip-report-sheet" style={{ fontFamily: "Cairo, Tajawal, 'Segoe UI', Tahoma, Arial, sans-serif" }}>
      <header className="mb-4 flex items-center justify-between border-b-4 border-[#005F8D] pb-3">
        <div>
          <p className="text-[11px] font-bold text-slate-500">شركة جزيرة الأكارم · غرفة العمليات</p>
          <h1 className="text-lg font-black text-[#0B4261]">تقرير مسار انطلاقية</h1>
          <p className="text-xs font-bold text-slate-700">{tripTitle(t)}</p>
        </div>
        <div className="text-left text-[10px] text-slate-500" dir="ltr">
          <div>{fmtDateTime(t?.departed_at ?? d.first_fix)}</div>
          <div>{t?.returned_at ? `↩ ${fmtDateTime(t.returned_at)}` : 'مفتوحة'}</div>
          <div className="mt-1 rounded bg-[#F5B400] px-2 py-0.5 text-center font-black text-[#0B4261]">{d.is_final ? 'نهائي' : 'جزئي'}</div>
        </div>
      </header>

      <section className="mb-4 grid grid-cols-2 gap-x-6 gap-y-1">
        {rows.map((r) => <div key={r.metric} className="flex justify-between border-b border-dotted border-slate-200 py-0.5 text-[11px]"><span className="font-bold text-slate-600">{r.metric}</span><span className="font-black">{r.value}</span></div>)}
      </section>

      {mapImage && (
        <section className="mb-4">
          <h2 className="mb-1 text-xs font-black text-[#0B4261]">الخريطة — الخط ملوّن بالسرعة، التوقفات مرقّمة{compare ? '، المقارنة بالبنفسجي' : ''}</h2>
          <img src={mapImage} alt="خريطة المسار" className="w-full rounded border border-slate-300" data-testid="trip-report-map" />
          <p className="mt-1 text-[10px] text-slate-500">خلفية © OpenStreetMap · ساكن رمادي · &lt;30 أخضر · 30–60 أصفر · 60–90 برتقالي · &gt;90 أحمر · ─ ─ انقطاع إشارة</p>
        </section>
      )}

      {compare && (
        <section className="mb-4 rounded border border-violet-300 bg-violet-50 p-2 text-[11px]">
          <b className="text-violet-800">المقارنة:</b> {tripTitle(compare.trip)} · {fmtDateTime(compare.trip?.departed_at ?? compare.first_fix)} · {(compare.distance_m / 1000).toFixed(2)} كم · {compare.stops_count} توقف · حركة {fmtDur(compare.moving_seconds)} · توقف {fmtDur(compare.stopped_seconds)}
          <span className="block text-violet-700">الفرق لصالح هذا المسار: {((d.distance_m - compare.distance_m) / 1000).toFixed(2)} كم · {Math.round((d.moving_seconds + d.stopped_seconds - compare.moving_seconds - compare.stopped_seconds) / 60)} دقيقة</span>
        </section>
      )}

      <section className="mb-4">
        <h2 className="mb-1 text-xs font-black text-[#0B4261]">المراحل</h2>
        <table className="w-full border-collapse" data-testid="trip-report-legs">
          <thead><tr><th className={th}>#</th><th className={th}>المرحلة</th><th className={th}>الانطلاق</th><th className={th}>تأكيد الوصول</th><th className={th}>كم</th><th className={th}>حركة</th><th className={th}>توقف</th><th className={th}>توقفات</th><th className={th}>انقطاع</th><th className={th}>أقصى</th></tr></thead>
          <tbody>
            <tr><td className={td}>0</td><td className={td}>الكراج ← موقع العمل</td><td className={td}>{fmtTime(t?.departed_at ?? d.first_fix)}</td><td className={td}>{fmtTime(t?.site_arrived_at)}</td><td className={td}>—</td><td className={td}>—</td><td className={td}>—</td><td className={td}>{(d.stops ?? []).filter((s) => !s.leg_id).length}</td><td className={td}>{(d.gaps ?? []).filter((g) => !g.leg_id).length}</td><td className={td}>—</td></tr>
            {(d.legs ?? []).map((l) => <tr key={l.leg_id}><td className={td}>{l.sequence_no}</td><td className={td}>{DEST_AR[l.origin_type] ?? l.origin_type} ← {DEST_AR[l.destination_type] ?? l.destination_type}</td><td className={td}>{fmtTime(l.departed_at)}</td><td className={td}>{l.arrived_at ? fmtTime(l.arrived_at) : 'لم يؤكَّد'}</td><td className={td}>{(l.distance_m / 1000).toFixed(1)}</td><td className={td}>{fmtDur(l.moving_seconds)}</td><td className={td}>{fmtDur(l.stopped_seconds)}</td><td className={td}>{l.stops_count}</td><td className={td}>{l.gaps_count}</td><td className={td}>{l.max_speed_kmh ? Math.round(l.max_speed_kmh) : '—'}</td></tr>)}
          </tbody>
        </table>
      </section>

      <section className="mb-4">
        <h2 className="mb-1 text-xs font-black text-[#0B4261]">التوقفات المرقّمة ({d.stops_count})</h2>
        {(d.stops ?? []).length === 0 ? <p className="text-[11px] text-slate-500">لا توقفات ≥ الحد المعتمد.</p> : (
          <table className="w-full border-collapse" data-testid="trip-report-stops">
            <thead><tr><th className={th}>#</th><th className={th}>من</th><th className={th}>إلى</th><th className={th}>المدة</th><th className={th}>العنوان</th><th className={th}>الزون</th></tr></thead>
            <tbody>{(d.stops ?? []).map((s) => <tr key={s.seq}><td className={`${td} text-center font-black text-rose-700`}>{s.seq}</td><td className={td}>{fmtTime(s.started_at)}</td><td className={td}>{fmtTime(s.ended_at)}</td><td className={td}>{fmtDur(s.duration_seconds)}</td><td className={td}>{s.address ?? `${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}`}</td><td className={td}>{s.geofence_name ?? '—'}</td></tr>)}</tbody>
          </table>
        )}
      </section>

      {(d.gaps ?? []).length > 0 && (
        <section className="mb-4">
          <h2 className="mb-1 text-xs font-black text-[#0B4261]">انقطاعات الإشارة ({d.gaps_count})</h2>
          <table className="w-full border-collapse">
            <thead><tr><th className={th}>#</th><th className={th}>من</th><th className={th}>إلى</th><th className={th}>المدة</th><th className={th}>آخر موقع</th><th className={th}>أول موقع بعده</th></tr></thead>
            <tbody>{(d.gaps ?? []).map((g) => <tr key={g.seq}><td className={td}>{g.seq}</td><td className={td}>{fmtTime(g.started_at)}</td><td className={td}>{fmtTime(g.ended_at)}</td><td className={td}>{fmtDur(g.seconds)}</td><td className={td} dir="ltr">{g.from_lat.toFixed(5)}, {g.from_lng.toFixed(5)}</td><td className={td} dir="ltr">{g.to_lat.toFixed(5)}, {g.to_lng.toFixed(5)}</td></tr>)}</tbody>
          </table>
        </section>
      )}

      <footer className="mt-4 flex justify-between border-t border-slate-300 pt-2 text-[10px] text-slate-500">
        <span>المصدر: نقاط LVN للفترة الدقيقة بعد التنظيف (بلا لصق بالطرق) · العناوين: LVN / زون المنصة / OpenStreetMap</span>
        <span dir="ltr">{fmtDateTime(new Date().toISOString())}</span>
      </footer>
    </div>
  )
})
export default TripRouteReportSheet
