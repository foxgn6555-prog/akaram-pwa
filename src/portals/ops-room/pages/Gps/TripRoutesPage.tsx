/**
 * غرفة العمليات — مسارات الانطلاقيات (00343): القائمة والفلاتر.
 * لكل انطلاقية مسارها الخاص (محرّك 00342): المسافة، زمن الحركة/التوقف، التوقفات، الفجوات، السرعة، من أين إلى أين.
 * الفلاتر: التاريخ، القاطع، المركبة، السائق، الشفت، مفتوحة/عادت، حالة المسار، فجوات، أدنى توقفات/مسافة، البحث،
 * ومن↔إلى↔مرّ بـ: زون منصة/LVN، معلم (كراج/ورشة/…)، وجهة محطة، أو دائرة حرة تُرسم بالنقر على الخريطة.
 * 00347: تُعرض كتبويب داخل وحدة «بيانات أجهزة GPS» (GpsDataPage ?view=trips)؛ الخريطة التفصيلية تُفتح بـ ?trip=<id>.
 */
import { useMemo, useState } from 'react'
import { Circle, MapContainer, Polygon, useMapEvents } from 'react-leaflet'
import { useMapTheme } from '@features/map-theme/useMapTheme'
import MapTiles, { MapThemeToggle, useInjectMapThemeStyle } from '@features/map-theme/MapTiles'
import 'leaflet/dist/leaflet.css'
import { Link } from 'react-router'
import { tripMapHref } from '@features/gps-lvn/trip-route-links'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { useGpsMapGeofences, usePullTripRouteNow, useTripRoutesFilterOptions, useTripRoutesList } from '@features/gps-lvn/hooks'
import { lvnErrorToast } from '@features/gps-lvn/lvn-errors'
import { useUiStore } from '@stores/ui.store'
import type { GpsMapGeofence, TripRoutePlace, TripRoutePlaceKind, TripRouteStatus, TripRoutesFilters, TripRoutesFilterOptions, TripRoutesOrder, TripRoutesRow } from '@sdk/gps-lvn.sdk'

const PAGE = 50
const todayBaghdad = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(new Date())
const daysAgoBaghdad = (n: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(new Date(Date.now() - n * 86400000))
export const timeAr = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString('ar-IQ-u-nu-latn', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Baghdad' }) : '—')
export const dateAr = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('ar-IQ-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Baghdad' }) : '—')
export const km = (m: number | null | undefined) => (m == null ? '—' : (m / 1000).toFixed(m >= 10000 ? 0 : 1))
export const dur = (s: number | null | undefined) => {
  if (s == null || !Number.isFinite(s)) return '—'
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}س ${m}د` : `${m}د`
}
export const STATUS_AR: Record<TripRouteStatus, string> = { pending: 'بانتظار السحب', no_device: 'بلا جهاز', partial: 'جارٍ (مفتوحة)', complete: 'مكتمل', empty: 'بلا نقاط', failed: 'فشل السحب' }
const STATUS_TONE: Record<TripRouteStatus, string> = { pending: 'bg-slate-100 text-slate-600', no_device: 'bg-amber-50 text-amber-800', partial: 'bg-sky-50 text-sky-700', complete: 'bg-emerald-50 text-emerald-700', empty: 'bg-slate-100 text-slate-500', failed: 'bg-rose-50 text-rose-700' }
const DEST_AR: Record<string, string> = { work_site: 'موقع العمل', transfer_station: 'المحطة التحويلية', maintenance: 'الصيانة', garage: 'الكراج' }
import { SHIFT_LABELS_LIVE } from '@sdk/hr-shifts.sdk'
const SHIFT_AR = SHIFT_LABELS_LIVE
const LANDMARK_CAT_AR: Record<string, string> = { landmark: 'معلم', garage: 'كراج', station: 'محطة', maintenance: 'ورشة', office: 'مكتب', checkpoint: 'سيطرة', hazard: 'خطر', other: 'أخرى' }
const ORDER_AR: Record<TripRoutesOrder, string> = { departed_desc: 'الأحدث أولاً', departed_asc: 'الأقدم أولاً', distance_desc: 'الأطول مسافة', stops_desc: 'الأكثر توقفاً', duration_desc: 'الأطول زمناً', gaps_desc: 'الأكثر انقطاعاً' }
const zonePoint = (pt: GpsMapGeofence['polygon'][number]): [number, number] => (Array.isArray(pt) ? [pt[0], pt[1]] : [pt.lat, pt.lng])
const inp = 'mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm'
const lbl = 'text-[11px] font-bold text-slate-600'

/** يُحوّل حالة الفلاتر إلى ما تتوقعه RPC (يحذف الفارغ) */
export function toRpcFilters(f: TripRoutesFilters): TripRoutesFilters {
  const out: TripRoutesFilters = {}
  if (f.date_from) out.date_from = f.date_from
  if (f.date_to) out.date_to = f.date_to
  if (f.sector_id) out.sector_id = f.sector_id
  if (f.vehicle_id) out.vehicle_id = f.vehicle_id
  if (f.driver?.trim()) out.driver = f.driver.trim()
  if (f.shift) out.shift = f.shift
  if (f.trip) out.trip = f.trip
  if (f.status) out.status = f.status
  if (f.search?.trim()) out.search = f.search.trim()
  if (f.has_gaps != null) out.has_gaps = f.has_gaps
  if (f.min_stops) out.min_stops = f.min_stops
  if (f.min_km) out.min_km = f.min_km
  if (f.leg_type) out.leg_type = f.leg_type
  if (f.min_legs) out.min_legs = f.min_legs
  if (f.leg_state) out.leg_state = f.leg_state
  for (const k of ['from_place', 'to_place', 'via_place'] as const) {
    const p = f[k]
    if (!p) continue
    if (p.kind === 'circle' ? p.lat != null && p.lng != null : Boolean(p.id)) out[k] = { kind: p.kind, id: p.id, lat: p.lat, lng: p.lng, radius_m: p.radius_m }
  }
  if (f.order && f.order !== 'departed_desc') out.order = f.order
  return out
}

export default function TripRoutesPage() {
  const today = todayBaghdad()
  const [draft, setDraft] = useState<TripRoutesFilters>({ date_from: daysAgoBaghdad(7), date_to: today, order: 'departed_desc' })
  const [applied, setApplied] = useState<TripRoutesFilters>(() => toRpcFilters({ date_from: daysAgoBaghdad(7), date_to: today }))
  const [page, setPage] = useState(0)
  const [showMore, setShowMore] = useState(false)
  const options = useTripRoutesFilterOptions()
  const live = !applied.date_to || applied.date_to >= today
  const list = useTripRoutesList(applied, PAGE, page * PAGE, live)
  const pull = usePullTripRouteNow()
  const toast = useUiStore((s) => s.addToast)
  const data = list.data
  const rows = useMemo(() => data?.rows ?? [], [data])
  const sum = data?.summary
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE))
  const set = <K extends keyof TripRoutesFilters>(k: K, v: TripRoutesFilters[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const apply = () => { setPage(0); setApplied(toRpcFilters(draft)) }
  const reset = () => { const d: TripRoutesFilters = { date_from: daysAgoBaghdad(7), date_to: today, order: 'departed_desc' }; setDraft(d); setPage(0); setApplied(toRpcFilters(d)) }
  const activeCount = Object.keys(applied).filter((k) => !['date_from', 'date_to'].includes(k)).length
  const pullNow = (id: string) => pull.mutate(id, {
    onSuccess: (r) => toast({ type: 'success', message: r.final ? `سُحب المسار النهائي: ${r.points} نقطة` : `سُحب المسار الجزئي: ${r.points} نقطة — سيُحدَّث تلقائياً` }),
    onError: (e) => toast({ type: 'error', message: lvnErrorToast((e as { code?: string; message?: string }).code ?? (e as Error).message) }),
  })

  return (
    <section dir="rtl" className="space-y-4" data-testid="trip-routes-page">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5" data-testid="tr-stats">
        {([
          { label: 'انطلاقيات', value: sum?.total ?? '—', cls: 'text-slate-900', testId: 'tr-st-total' },
          { label: 'مفتوحة الآن', value: sum?.open ?? '—', cls: 'text-amber-600', testId: 'tr-st-open' },
          { label: 'إجمالي المسافة (كم)', value: sum ? km(sum.distance_m) : '—', cls: 'text-emerald-700', testId: 'tr-st-km' },
          { label: 'توقفات', value: sum?.stops ?? '—', cls: 'text-slate-900', testId: 'tr-st-stops' },
          { label: 'بلا جهاز', value: sum?.no_device ?? '—', cls: (sum?.no_device ?? 0) > 0 ? 'text-rose-700' : 'text-slate-900', testId: 'tr-st-nodev' },
        ] as const).map((st) => (
          <div key={st.testId} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" data-testid={st.testId}>
            <p className="text-[10px] font-bold text-slate-500">{st.label}</p>
            <b className={`block text-xl font-black tabular-nums ${st.cls}`} dir="ltr">{st.value}</b>
          </div>
        ))}
      </div>
      <p className="px-1 text-[11px] text-slate-500">مسار كل انطلاقية من لحظة الانطلاق حتى تأكيد العودة، بنقاط LVN للفترة الدقيقة بعد التنظيف: المسافة، زمن الحركة والتوقف، التوقفات المرقّمة، انقطاعات الإشارة، ومن أين إلى أين. المفتوحة تُحدَّث كل 15 دقيقة.</p>

      <form className="space-y-3 rounded-2xl border bg-white p-3 shadow-sm" data-testid="tr-filters" onSubmit={(e) => { e.preventDefault(); apply() }}>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
          <label className={lbl}>من تاريخ<input type="date" value={draft.date_from ?? ''} max={draft.date_to || today} onChange={(e) => set('date_from', e.target.value)} data-testid="tr-f-from" className={inp} /></label>
          <label className={lbl}>إلى تاريخ<input type="date" value={draft.date_to ?? ''} min={draft.date_from || undefined} max={today} onChange={(e) => set('date_to', e.target.value)} data-testid="tr-f-to" className={inp} /></label>
          <label className={lbl}>القاطع
            <select value={draft.sector_id ?? ''} onChange={(e) => set('sector_id', e.target.value ? Number(e.target.value) : null)} data-testid="tr-f-sector" className={inp}>
              <option value="">الكل</option>{(options.data?.sectors ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></label>
          <label className={lbl}>المركبة
            <select value={draft.vehicle_id ?? ''} onChange={(e) => set('vehicle_id', e.target.value || null)} data-testid="tr-f-vehicle" className={inp}>
              <option value="">الكل</option>
              {(options.data?.vehicles ?? []).filter((v) => !draft.sector_id || v.sector_id === draft.sector_id).map((v) => <option key={v.id} value={v.id}>{v.db_number ? `DB ${v.db_number} — ` : ''}{v.name}{v.has_gps ? '' : ' (بلا GPS)'}</option>)}
            </select></label>
          <label className={lbl}>الانطلاقية
            <select value={draft.trip ?? ''} onChange={(e) => set('trip', e.target.value as TripRoutesFilters['trip'])} data-testid="tr-f-trip" className={inp}>
              <option value="">الكل</option><option value="open">مفتوحة الآن</option><option value="returned">عادت</option>
            </select></label>
          <label className={lbl}>حالة المسار
            <select value={draft.status ?? ''} onChange={(e) => set('status', e.target.value as TripRoutesFilters['status'])} data-testid="tr-f-status" className={inp}>
              <option value="">الكل</option>{(Object.keys(STATUS_AR) as TripRouteStatus[]).map((s) => <option key={s} value={s}>{STATUS_AR[s]}</option>)}
            </select></label>
          <label className={lbl}>الترتيب
            <select value={draft.order ?? 'departed_desc'} onChange={(e) => set('order', e.target.value as TripRoutesOrder)} data-testid="tr-f-order" className={inp}>
              {(Object.keys(ORDER_AR) as TripRoutesOrder[]).map((o) => <option key={o} value={o}>{ORDER_AR[o]}</option>)}
            </select></label>
          <label className={lbl}>بحث (DB، اللوحة، السائق)<input value={draft.search ?? ''} onChange={(e) => set('search', e.target.value)} data-testid="tr-f-search" className={inp} placeholder="مثال: 101" /></label>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <PlacePicker label="من (بداية المسار)" testId="tr-f-fromplace" value={draft.from_place ?? null} options={options.data} onChange={(p) => set('from_place', p)} />
          <PlacePicker label="إلى (نهاية المسار)" testId="tr-f-toplace" value={draft.to_place ?? null} options={options.data} onChange={(p) => set('to_place', p)} />
          <PlacePicker label="مرّ بـ (أي نقطة من المسار)" testId="tr-f-viaplace" value={draft.via_place ?? null} options={options.data} onChange={(p) => set('via_place', p)} />
        </div>

        {showMore && (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5" data-testid="tr-more">
            <label className={lbl}>السائق<input value={draft.driver ?? ''} onChange={(e) => set('driver', e.target.value)} data-testid="tr-f-driver" className={inp} /></label>
            <label className={lbl}>الشفت
              <select value={draft.shift ?? ''} onChange={(e) => set('shift', e.target.value)} data-testid="tr-f-shift" className={inp}>
                <option value="">الكل</option>{(options.data?.shifts ?? []).map((s) => <option key={s} value={s}>{SHIFT_AR[s] ?? s}</option>)}
              </select></label>
            <label className={lbl}>انقطاع الإشارة
              <select value={draft.has_gaps == null ? '' : draft.has_gaps ? '1' : '0'} onChange={(e) => set('has_gaps', e.target.value === '' ? null : e.target.value === '1')} data-testid="tr-f-gaps" className={inp}>
                <option value="">الكل</option><option value="1">فيها انقطاع</option><option value="0">بلا انقطاع</option>
              </select></label>
            <label className={lbl}>أدنى عدد توقفات<input type="number" min={0} value={draft.min_stops ?? ''} onChange={(e) => set('min_stops', e.target.value ? Number(e.target.value) : null)} data-testid="tr-f-minstops" className={inp} /></label>
            <label className={lbl}>أدنى مسافة (كم)<input type="number" min={0} step="0.5" value={draft.min_km ?? ''} onChange={(e) => set('min_km', e.target.value ? Number(e.target.value) : null)} data-testid="tr-f-minkm" className={inp} /></label>
            <label className={lbl}>مرّت بمقطع إلى
              <select value={draft.leg_type ?? ''} onChange={(e) => set('leg_type', e.target.value as TripRoutesFilters['leg_type'])} data-testid="tr-f-legtype" className={inp}>
                <option value="">الكل</option>{(Object.keys(DEST_AR) as string[]).map((k) => <option key={k} value={k}>{DEST_AR[k]}</option>)}
              </select></label>
            <label className={lbl}>حالة آخر مقطع
              <select value={draft.leg_state ?? ''} onChange={(e) => set('leg_state', e.target.value as TripRoutesFilters['leg_state'])} data-testid="tr-f-legstate" className={inp}>
                <option value="">الكل</option><option value="none">بلا مقاطع (كراج ← موقع فقط)</option><option value="arrived">آخر مقطع وصل</option><option value="en_route">آخر مقطع في الطريق</option>
              </select></label>
            <label className={lbl}>أدنى عدد مقاطع<input type="number" min={0} value={draft.min_legs ?? ''} onChange={(e) => set('min_legs', e.target.value ? Number(e.target.value) : null)} data-testid="tr-f-minlegs" className={inp} /></label>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white" data-testid="tr-apply">تطبيق الفلاتر</button>
          <button type="button" onClick={reset} className="rounded-xl border px-3 py-2 text-xs font-bold text-slate-700" data-testid="tr-reset">إعادة الضبط</button>
          <button type="button" onClick={() => setShowMore((v) => !v)} className="rounded-xl border px-3 py-2 text-xs font-bold text-slate-700" data-testid="tr-more-toggle">{showMore ? 'إخفاء الفلاتر الإضافية' : 'فلاتر إضافية'}</button>
          {activeCount > 0 && <span className="rounded-full bg-sky-50 px-3 py-1 text-[11px] font-black text-sky-700" data-testid="tr-active-count">{activeCount} فلتر فعّال</span>}
          {live && <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black text-emerald-700" data-testid="tr-live">● تحديث تلقائي</span>}
          {list.isFetching && !list.isLoading && <span className="text-[11px] text-slate-400">يُحدَّث…</span>}
        </div>
      </form>

      {list.isLoading ? <LoadingSpinner /> : list.isError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800" data-testid="tr-error">تعذّر تحميل القائمة: {(list.error as Error).message}</div>
      ) : rows.length === 0 ? <EmptyState title="لا انطلاقيات تطابق الفلاتر" hint="وسّع المدة الزمنية أو أزل فلتر المكان. الانطلاقيات تُسجَّل من الكراج المركزي وتظهر هنا فور انطلاقها." /> : (
        <>
          <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
            <table className="w-full min-w-[1100px] text-xs" data-testid="tr-table">
              <thead><tr className="bg-slate-50 text-[11px] text-slate-500">
                <th className="p-2 text-right">الانطلاق</th><th className="p-2 text-right">المركبة</th><th className="p-2 text-right">السائق / القاطع</th><th className="p-2 text-right">المراحل</th>
                <th className="p-2 text-center">حالة المسار</th><th className="p-2 text-center">المسافة (كم)</th><th className="p-2 text-center">المدة</th><th className="p-2 text-center">حركة / توقف</th>
                <th className="p-2 text-center">توقفات</th><th className="p-2 text-center">انقطاع</th><th className="p-2 text-center">السرعة القصوى</th><th className="p-2 text-right">من ← إلى</th><th className="p-2 text-center">إجراء</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => <Row key={r.departure_id} r={r} pulling={pull.isPending && pull.variables === r.departure_id} onPull={() => pullNow(r.departure_id)} />)}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between rounded-2xl border bg-white px-4 py-2 text-xs" data-testid="tr-pager">
            <span className="text-slate-500">عرض {page * PAGE + 1}–{Math.min((page + 1) * PAGE, data?.total ?? 0)} من {data?.total ?? 0}</span>
            <div className="flex gap-2">
              <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="rounded-lg border px-3 py-1 font-bold disabled:opacity-40" data-testid="tr-prev">السابق</button>
              <span className="px-2 py-1 font-black">{page + 1} / {pages}</span>
              <button type="button" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border px-3 py-1 font-bold disabled:opacity-40" data-testid="tr-next">التالي</button>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function Row({ r, pulling, onPull }: { r: TripRoutesRow; pulling: boolean; onPull: () => void }) {
  const open = !r.returned_at
  const canPull = r.status !== 'no_device' && (open || !r.is_final || r.status === 'failed')
  const stage = r.legs_count === 0 ? (r.site_arrived_at ? 'في موقع العمل' : 'كراج ← موقع العمل') : `${r.legs_count} مرحلة · ${r.last_leg_arrived ? 'وصلت' : 'في الطريق إلى'} ${DEST_AR[r.last_destination ?? ''] ?? r.last_destination ?? ''}`
  return (
    <tr className={`border-t ${r.status === 'no_device' ? 'bg-amber-50/40' : r.status === 'failed' ? 'bg-rose-50/40' : ''}`} data-testid={`tr-row-${r.departure_id}`}>
      <td className="p-2 tabular-nums" dir="ltr">{timeAr(r.departed_at)}<span className="block text-[10px] text-slate-400">{dateAr(r.departed_at)}</span>{r.returned_at ? <span className="block text-[10px] text-emerald-700">عادت {timeAr(r.returned_at)}</span> : <span className="block text-[10px] font-black text-sky-700">مفتوحة</span>}</td>
      <td className="p-2"><b className="tabular-nums" dir="ltr">{r.db_number ? `DB ${r.db_number}` : '—'}</b><span className="block text-[10px] text-slate-500">{r.vehicle_name}</span></td>
      <td className="p-2">{r.driver_name}<span className="block text-[10px] text-slate-400">{r.sector_name ?? '—'} · {SHIFT_AR[r.shift ?? ''] ?? r.shift ?? ''}</span></td>
      <td className="p-2 text-[11px]">{stage}</td>
      <td className="p-2 text-center"><span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${STATUS_TONE[r.status]}`} data-testid={`tr-status-${r.departure_id}`}>{STATUS_AR[r.status]}</span>{r.error_code && <span className="block text-[10px] text-rose-600" dir="ltr">{r.error_code}</span>}</td>
      <td className="p-2 text-center font-black tabular-nums" dir="ltr">{r.points_kept ? km(r.distance_m) : '—'}</td>
      <td className="p-2 text-center tabular-nums">{dur(r.trip_seconds)}</td>
      <td className="p-2 text-center tabular-nums">{r.points_kept ? `${dur(r.moving_seconds)} / ${dur(r.stopped_seconds)}` : '—'}</td>
      <td className="p-2 text-center font-black tabular-nums">{r.points_kept ? r.stops_count : '—'}</td>
      <td className="p-2 text-center tabular-nums">{r.gaps_count > 0 ? <span className="rounded-full bg-amber-50 px-2 py-0.5 font-black text-amber-800">{r.gaps_count} ({dur(r.gap_seconds)})</span> : r.points_kept ? '—' : ''}</td>
      <td className="p-2 text-center tabular-nums" dir="ltr">{r.points_kept ? `${Math.round(r.max_speed_kmh)} km/h` : '—'}</td>
      <td className="max-w-[220px] p-2 text-[10px] leading-4 text-slate-600"><span className="block truncate" title={r.from_address ?? ''}>▲ {r.from_address ?? (r.from_lat != null ? `${r.from_lat.toFixed(4)}, ${r.from_lng?.toFixed(4)}` : '—')}</span><span className="block truncate" title={r.to_address ?? ''}>■ {r.to_address ?? (r.to_lat != null ? `${r.to_lat.toFixed(4)}, ${r.to_lng?.toFixed(4)}` : '—')}</span></td>
      <td className="p-2 text-center">
        <Link to={tripMapHref(r.departure_id)} className="mb-1 inline-block rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-black text-white" data-testid={`tr-map-${r.departure_id}`}>الخريطة</Link>
        {canPull && <button type="button" onClick={onPull} disabled={pulling} className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-bold text-slate-700 disabled:opacity-50" data-testid={`tr-pull-${r.departure_id}`}>{pulling ? 'يسحب…' : 'سحب الآن'}</button>}
        {r.pulled_at && <span className="block text-[10px] text-slate-400">آخر سحب {timeAr(r.pulled_at)}</span>}
      </td>
    </tr>
  )
}

/* ─── اختيار مكان للفلتر: زون / معلم / وجهة محطة / دائرة على الخريطة ─── */
const KIND_AR: Record<TripRoutePlaceKind, string> = { zone: 'زون', landmark: 'معلم (كراج/ورشة/…)', station: 'وجهة المحطة', circle: 'دائرة على الخريطة' }
export function placeLabel(p: TripRoutePlace | null, o?: TripRoutesFilterOptions): string {
  if (!p) return ''
  if (p.kind === 'circle') return p.lat != null && p.lng != null ? `دائرة ${p.radius_m ?? 300} م عند ${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}` : 'انقر على الخريطة لتحديد المركز'
  if (p.kind === 'zone') return o?.zones.find((z) => z.id === p.id)?.name ?? ''
  if (p.kind === 'station') return o?.stations.find((z) => z.id === p.id)?.name ?? ''
  return o?.landmarks.find((z) => z.id === p.id)?.name ?? ''
}
function PlacePicker({ label, testId, value, options, onChange }: { label: string; testId: string; value: TripRoutePlace | null; options?: TripRoutesFilterOptions; onChange: (p: TripRoutePlace | null) => void }) {
  const [mapOpen, setMapOpen] = useState(false)
  const kind = value?.kind ?? ''
  const setKind = (k: string) => {
    if (!k) { onChange(null); setMapOpen(false); return }
    const next: TripRoutePlace = k === 'circle' ? { kind: 'circle', radius_m: 300 } : k === 'landmark' ? { kind: 'landmark', radius_m: 200 } : { kind: k as TripRoutePlaceKind }
    onChange(next); setMapOpen(k === 'circle')
  }
  return (
    <div className="rounded-xl border border-slate-200 p-2" data-testid={testId}>
      <div className="flex flex-wrap items-end gap-2">
        <label className={`${lbl} min-w-[150px]`}>{label}
          <select value={kind} onChange={(e) => setKind(e.target.value)} data-testid={`${testId}-kind`} className={inp}>
            <option value="">أي مكان</option>{(Object.keys(KIND_AR) as TripRoutePlaceKind[]).map((k) => <option key={k} value={k}>{KIND_AR[k]}</option>)}
          </select></label>
        {value && value.kind !== 'circle' && (
          <label className={`${lbl} min-w-[180px] flex-1`}>الاسم
            <select value={value.id ?? ''} onChange={(e) => onChange({ ...value, id: e.target.value || undefined })} data-testid={`${testId}-id`} className={inp}>
              <option value="">— اختر —</option>
              {value.kind === 'zone' && (options?.zones ?? []).map((z) => <option key={z.id} value={z.id}>{z.name}{z.source === 'lvn' ? ' (LVN)' : ''}</option>)}
              {value.kind === 'station' && (options?.stations ?? []).map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
              {value.kind === 'landmark' && (options?.landmarks ?? []).map((z) => <option key={z.id} value={z.id}>{LANDMARK_CAT_AR[z.category] ?? z.category}: {z.name}</option>)}
            </select></label>
        )}
        {value && (value.kind === 'circle' || value.kind === 'landmark') && (
          <label className={`${lbl} w-[110px]`}>نصف القطر (م)<input type="number" min={50} max={5000} step={50} value={value.radius_m ?? ''} onChange={(e) => onChange({ ...value, radius_m: Number(e.target.value) || 300 })} data-testid={`${testId}-radius`} className={inp} /></label>
        )}
        {value?.kind === 'circle' && <button type="button" onClick={() => setMapOpen((v) => !v)} className="rounded-xl border px-3 py-2 text-[11px] font-bold text-slate-700" data-testid={`${testId}-map-toggle`}>{mapOpen ? 'إخفاء الخريطة' : 'الخريطة'}</button>}
      </div>
      {value && <p className="mt-1 text-[10px] text-slate-500" data-testid={`${testId}-label`}>{placeLabel(value, options)}</p>}
      {value?.kind === 'circle' && mapOpen && <CircleMap value={value} onChange={onChange} testId={testId} />}
    </div>
  )
}
function Capture({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))) })
  return null
}
function CircleMap({ value, onChange, testId }: { value: TripRoutePlace; onChange: (p: TripRoutePlace) => void; testId: string }) {
  const zones = useGpsMapGeofences()
  const center: [number, number] = [value.lat ?? 33.3152, value.lng ?? 44.3661]
  useInjectMapThemeStyle()
  const [theme, , toggleTheme] = useMapTheme('light')   // 00388-ج
  return (
    <div className="relative mt-2 h-[300px] overflow-hidden rounded-xl border" data-testid={`${testId}-map`} data-map-theme={theme}>
      <div className="absolute right-2 top-2 z-[1000]"><MapThemeToggle theme={theme} onToggle={toggleTheme} testId={`${testId}-theme`} /></div>
      <MapContainer center={center} zoom={value.lat != null ? 14 : 11} className="h-full w-full">
        <MapTiles theme={theme} />
        <Capture onPick={(lat, lng) => onChange({ ...value, lat, lng })} />
        {(zones.data ?? []).map((z) => <Polygon key={z.id} positions={(z.polygon ?? []).map(zonePoint)} pathOptions={{ color: z.color || '#06b6d4', weight: 1, fillOpacity: 0.06 }} />)}
        {value.lat != null && value.lng != null && <Circle center={[value.lat, value.lng]} radius={value.radius_m ?? 300} pathOptions={{ color: '#e11d48', weight: 2, fillOpacity: 0.15 }} />}
      </MapContainer>
    </div>
  )
}
