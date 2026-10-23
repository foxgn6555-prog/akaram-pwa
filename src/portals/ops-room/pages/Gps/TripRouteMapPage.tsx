/**
 * غرفة العمليات — خريطة مسار الانطلاقية (00344).
 * «LVN plus»: الخط ملوّن بالسرعة، أسهم الاتجاه، توقفات مرقّمة بمدّتها، نافذة لكل نقطة (العنوان/الوقت/السرعة)،
 * علامات المراحل لكل مقطع (انطلاق/وصول)، الزونات الملوّنة، تشغيل الزمن (Play)، خريطة حرارية للتوقفات، ومقارنة مسارين.
 * البيانات من trip_route_get (محرّك 00342) — بلا لصق بالطرق: النقاط كما سجّلها الجهاز بعد التنظيف.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { Circle, CircleMarker, MapContainer, Marker, Polygon, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { useGpsMapGeofences, useGpsTripInvestigationSave, useGpsTripInvestigations, usePullTripRouteNow, useTripRoute, useTripRoutesList } from '@features/gps-lvn/hooks'
import { lvnErrorToast } from '@features/gps-lvn/lvn-errors'
import { captureElementPng, downloadTripRouteGpx, downloadTripRouteKml, exportTripRouteExcel, exportTripRoutePdf, printTripRoute, tripTitle } from '@features/gps-lvn/trip-route-export'
import { gpsLvn } from '@sdk/gps-lvn.sdk'
import TripRouteReportSheet from './TripRouteReportSheet'
import { useUiStore } from '@stores/ui.store'
import type { GpsMapGeofence, GpsTripInvestigation, TripRouteDetail, TripRouteLeg, TripRoutePoint, TripRouteStop } from '@sdk/gps-lvn.sdk'
import { STATUS_AR, dateAr, dur, km, timeAr } from './TripRoutesPage'

export type TripRouteExportKind = 'excel' | 'pdf' | 'kml' | 'gpx' | 'print'
const EXPORT_AR: Record<TripRouteExportKind, string> = { excel: 'Excel (ملخص + مراحل + توقفات + نقاط)', pdf: 'PDF بصورة الخريطة', kml: 'KML (Google Earth)', gpx: 'GPX', print: 'طباعة' }

const DEST_AR: Record<string, string> = { work_site: 'موقع العمل', transfer_station: 'المحطة التحويلية', maintenance: 'الصيانة', garage: 'الكراج' }
const zonePoint = (pt: GpsMapGeofence['polygon'][number]): [number, number] => (Array.isArray(pt) ? [pt[0], pt[1]] : [pt.lat, pt.lng])
/** لون المقطع حسب السرعة: ساكن رمادي، بطيء أخضر، متوسط أصفر، سريع برتقالي، مفرط أحمر */
export const speedColor = (kmh: number | null | undefined) => {
  const v = kmh ?? 0
  if (v < 3) return '#94a3b8'
  if (v < 30) return '#16a34a'
  if (v < 60) return '#eab308'
  if (v < 90) return '#f97316'
  return '#dc2626'
}
export const stopRadius = (seconds: number) => Math.min(60, 10 + Math.sqrt(seconds / 60) * 8)
const arrowIcon = (course: number, color: string) => L.divIcon({ className: '', html: `<div style="transform:rotate(${course}deg);color:${color};font-size:16px;line-height:16px;text-shadow:0 0 2px #fff,0 0 2px #fff">➤</div>`, iconSize: [16, 16], iconAnchor: [8, 8] })
const stopIcon = (n: number, compare = false) => L.divIcon({ className: '', html: `<div style="background:${compare ? '#7c3aed' : '#dc2626'};color:#fff;border:2px solid #fff;border-radius:9999px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;box-shadow:0 1px 4px rgba(0,0,0,.4)">${n}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] })
const stageIcon = (label: string, color: string) => L.divIcon({ className: '', html: `<div style="background:${color};color:#fff;border-radius:8px;padding:2px 7px;font-size:11px;font-weight:900;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.4);border:2px solid #fff">${label}</div>`, iconAnchor: [20, 12] })
const vehicleIcon = () => L.divIcon({ className: '', html: `<div style="background:#0ea5e9;border:3px solid #fff;border-radius:9999px;width:20px;height:20px;box-shadow:0 0 0 4px rgba(14,165,233,.35)"></div>`, iconSize: [20, 20], iconAnchor: [10, 10] })
/** يبدّل الاتجاه (course) للعرض: من الشمال باتجاه عقارب الساعة ⇒ دوران الرمز ➤ (يشير شرقاً افتراضياً) */
const arrowRotation = (course: number | null, from: TripRoutePoint | undefined, to: TripRoutePoint) => {
  if (course != null && Number.isFinite(course)) return course - 90
  if (!from) return -90
  const dLng = (to.lng - from.lng) * Math.cos((to.lat * Math.PI) / 180), dLat = to.lat - from.lat
  return (Math.atan2(dLng, dLat) * 180) / Math.PI - 90
}

export function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap()
  const key = points.length ? `${points.length}:${points[0]?.join(',')}:${points[points.length - 1]?.join(',')}` : ''
  useEffect(() => { if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [30, 30] }); else if (points.length === 1 && points[0]) map.setView(points[0], 15) }, [map, key]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}
function FlyTo({ target }: { target: [number, number] | null }) {
  const map = useMap()
  useEffect(() => { if (target) map.flyTo(target, Math.max(map.getZoom(), 16), { duration: 0.6 }) }, [map, target])
  return null
}

type Layers = { speed: boolean; arrows: boolean; stops: boolean; points: boolean; stages: boolean; zones: boolean; heat: boolean; gaps: boolean }
const DEFAULT_LAYERS: Layers = { speed: true, arrows: true, stops: true, points: false, stages: true, zones: true, heat: false, gaps: true }
const LAYER_AR: Record<keyof Layers, string> = { speed: 'تلوين بالسرعة', arrows: 'أسهم الاتجاه', stops: 'التوقفات المرقّمة', points: 'كل النقاط', stages: 'علامات المراحل', zones: 'الزونات', heat: 'حرارة التوقفات', gaps: 'الانقطاعات' }

export default function TripRouteMapPage() {
  const { departureId = '' } = useParams()
  const [sp, setSp] = useSearchParams()
  const compareId = sp.get('compare')
  const route = useTripRoute(departureId)
  const compare = useTripRoute(compareId)
  const zones = useGpsMapGeofences()
  const pull = usePullTripRouteNow()
  const toast = useUiStore((s) => s.addToast)
  const [layers, setLayers] = useState<Layers>(DEFAULT_LAYERS)
  const [full, setFull] = useState(false)
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null)
  const [playIdx, setPlayIdx] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [speedX, setSpeedX] = useState(10)
  const [pickerOpen, setPickerOpen] = useState(false)
  const timer = useRef<number | null>(null)
  const mapBox = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const [mapImage, setMapImage] = useState<string | null>(null)
  const [exporting, setExporting] = useState<TripRouteExportKind | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [invTarget, setInvTarget] = useState<{ type: 'stop' | 'gap'; at: string; title: string } | null>(null)
  const investigations = useGpsTripInvestigations(departureId)
  const invByKey = useMemo(() => new Map((investigations.data ?? []).map((i) => [`${i.event_type}:${new Date(i.event_at).getTime()}`, i])), [investigations.data])
  const d = route.data
  const pts = useMemo(() => d?.points ?? [], [d])
  const latlngs = useMemo(() => pts.map((p) => [p.lat, p.lng] as [number, number]), [pts])
  const cmpPts = useMemo(() => compare.data?.points ?? [], [compare.data])
  const allBounds = useMemo(() => [...latlngs, ...cmpPts.map((p) => [p.lat, p.lng] as [number, number])], [latlngs, cmpPts])
  // تشغيل الزمن: ينتقل نقطة نقطة بوتيرة تتناسب مع الفارق الزمني الحقيقي مقسوماً على سرعة التشغيل
  useEffect(() => {
    if (!playing || playIdx == null) return
    const cur = pts[playIdx], next = pts[playIdx + 1]
    if (!cur || !next) { setPlaying(false); return }
    const realMs = Math.max(0, new Date(next.t).getTime() - new Date(cur.t).getTime())
    const wait = Math.min(2000, Math.max(60, realMs / speedX))
    timer.current = window.setTimeout(() => setPlayIdx(playIdx + 1), wait)
    return () => { if (timer.current) window.clearTimeout(timer.current) }
  }, [playing, playIdx, pts, speedX])
  const arrowEvery = Math.max(1, Math.ceil(pts.length / 60))
  const pullNow = () => pull.mutate(departureId, {
    onSuccess: (r) => toast({ type: 'success', message: `سُحب المسار: ${r.points} نقطة${r.final ? ' (نهائي)' : ''}` }),
    onError: (e) => toast({ type: 'error', message: lvnErrorToast((e as { code?: string }).code ?? (e as Error).message) }),
  })
  const toggle = (k: keyof Layers) => setLayers((l) => ({ ...l, [k]: !l[k] }))
  /** التصدير: Excel بكل النقاط (يُجلب كاملاً)، PDF/طباعة بصورة الخريطة الحالية (بطبقاتها) داخل ورقة التقرير */
  const doExport = async (kind: TripRouteExportKind) => {
    if (!d) return
    setExportOpen(false); setExporting(kind)
    try {
      if (kind === 'excel') { await exportTripRouteExcel(await gpsLvn.tripRoute(departureId, 200000)); }
      else if (kind === 'kml') downloadTripRouteKml(d)
      else if (kind === 'gpx') downloadTripRouteGpx(d)
      else {
        const mapEl = mapBox.current?.querySelector<HTMLElement>('.leaflet-container')
        const png = mapEl ? await captureElementPng(mapEl, 2).catch(() => null) : null
        setMapImage(png)
        await new Promise((r) => window.setTimeout(r, 120))
        const sheet = sheetRef.current
        if (!sheet) throw new Error('REPORT_SHEET_MISSING')
        if (kind === 'pdf') await exportTripRoutePdf(sheet, d)
        else printTripRoute(sheet, `تقرير مسار انطلاقية — ${tripTitle(d.trip)}`)
      }
      toast({ type: 'success', message: kind === 'print' ? 'فُتحت نافذة الطباعة' : 'تم التصدير' })
    } catch (e) {
      const msg = (e as Error).message
      toast({ type: 'error', message: msg === 'POPUP_BLOCKED' ? 'المتصفح منع النافذة المنبثقة — اسمح بها ثم أعد المحاولة' : `تعذّر التصدير: ${msg}` })
    } finally { setExporting(null) }
  }
  const playPoint = playIdx != null ? pts[playIdx] : undefined

  if (route.isLoading) return <LoadingSpinner />
  if (route.isError || !d) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800" data-testid="trm-error">تعذّر تحميل المسار: {(route.error as Error | null)?.message ?? ''} <Link to="/ops-room/trip-routes" className="underline">عودة للقائمة</Link></div>
  const center: [number, number] = latlngs[0] ?? [33.3152, 44.3661]

  return (
    <section dir="rtl" className={full ? 'fixed inset-0 z-[1200] flex flex-col bg-white' : 'space-y-3'} data-testid="trip-route-map-page">
      <ExecPageHeader icon="flow" title={`مسار الانطلاقية · ${dateAr(d.first_fix ?? d.range_from)} ${timeAr(d.first_fix ?? d.range_from)} ← ${timeAr(d.last_fix ?? d.range_to)}`}
        subtitle={<span data-testid="trm-summary">{STATUS_AR[d.status]}{d.is_final ? ' · نهائي' : ' · يُحدَّث'} · {km(d.distance_m)} كم · حركة {dur(d.moving_seconds)} · توقف {dur(d.stopped_seconds)} · {d.stops_count} توقف · {d.gaps_count} انقطاع ({dur(d.gap_seconds)}) · أقصى سرعة {Math.round(d.max_speed_kmh)} · متوسط {Math.round(d.avg_speed_kmh)} km/h · {d.points_kept} نقطة ({d.points_rejected} مرفوضة){d.downsample_step > 1 ? ` · معروض ${d.points_returned} بخطوة ${d.downsample_step}` : ''}</span>}
        actions={
        <div className="flex flex-wrap gap-2 text-[11px] font-black" data-testid="trm-header">
          <Link to="/ops-room/trip-routes" className="rounded-xl bg-white/15 px-3 py-2">القائمة</Link>
          {!(d.is_final && d.status === 'complete') && d.status !== 'no_device' && <button type="button" onClick={pullNow} disabled={pull.isPending} className="rounded-xl bg-sky-500 px-3 py-2 disabled:opacity-50" data-testid="trm-pull">{pull.isPending ? 'يسحب…' : 'سحب الآن'}</button>}
          <button type="button" onClick={() => setPickerOpen((v) => !v)} className="rounded-xl bg-white/15 px-3 py-2" data-testid="trm-compare-toggle">{compareId ? 'تغيير المقارنة' : 'مقارنة بمسار آخر'}</button>
          {compareId && <button type="button" onClick={() => { sp.delete('compare'); setSp(sp) }} className="rounded-xl bg-violet-500 px-3 py-2" data-testid="trm-compare-clear">إلغاء المقارنة</button>}
          <div className="relative">
            <button type="button" onClick={() => setExportOpen((v) => !v)} disabled={exporting !== null || pts.length === 0} className="rounded-xl bg-emerald-500 px-3 py-2 disabled:opacity-50" data-testid="trm-export-toggle">{exporting ? 'يُصدَّر…' : 'تصدير ▾'}</button>
            {exportOpen && (
              <ul className="absolute left-0 top-full z-[1300] mt-1 w-[260px] overflow-hidden rounded-xl border bg-white text-right text-slate-800 shadow-xl" data-testid="trm-export-menu">
                {(Object.keys(EXPORT_AR) as TripRouteExportKind[]).map((k) => <li key={k}><button type="button" onClick={() => void doExport(k)} className="block w-full px-3 py-2 text-right text-[11px] font-bold hover:bg-slate-50" data-testid={`trm-export-${k}`}>{EXPORT_AR[k]}</button></li>)}
              </ul>
            )}
          </div>
          <button type="button" onClick={() => setFull((v) => !v)} className="rounded-xl bg-white/15 px-3 py-2" data-testid="trm-full">{full ? 'خروج من ملء الشاشة' : 'ملء الشاشة'}</button>
        </div>
        } />

      {pickerOpen && <ComparePicker current={departureId} onPick={(id) => { sp.set('compare', id); setSp(sp); setPickerOpen(false) }} />}

      <div className="flex flex-wrap items-center gap-1 rounded-2xl border bg-white px-3 py-2 text-[11px]" data-testid="trm-layers">
        {(Object.keys(LAYER_AR) as (keyof Layers)[]).map((k) => (
          <button key={k} type="button" onClick={() => toggle(k)} className={`rounded-full px-3 py-1 font-bold ${layers[k] ? 'bg-slate-900 text-white' : 'border text-slate-600'}`} data-testid={`trm-layer-${k}`} aria-pressed={layers[k]}>{LAYER_AR[k]}</button>
        ))}
        <span className="mx-2 h-4 border-r" />
        <span className="flex items-center gap-1 text-slate-500">السرعة: <i className="inline-block h-2 w-5 rounded" style={{ background: '#16a34a' }} />&lt;30 <i className="inline-block h-2 w-5 rounded" style={{ background: '#eab308' }} />30–60 <i className="inline-block h-2 w-5 rounded" style={{ background: '#f97316' }} />60–90 <i className="inline-block h-2 w-5 rounded" style={{ background: '#dc2626' }} />&gt;90</span>
      </div>

      <div className={`grid gap-3 ${full ? 'min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_320px]' : 'lg:grid-cols-[1fr_320px]'}`}>
        <div ref={mapBox} className={`relative overflow-hidden rounded-2xl border ${full ? 'h-full min-h-[300px]' : 'h-[560px]'}`} data-testid="trm-map">
          {pts.length === 0 ? <EmptyState title="لا نقاط لهذا المسار بعد" hint={d.status === 'no_device' ? 'المركبة بلا جهاز GPS مربوط.' : 'اضغط «سحب الآن» أو انتظر دورة السحب التلقائية.'} /> : (
            <MapContainer center={center} zoom={13} className="h-full w-full">
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
              <FitBounds points={allBounds} />
              <FlyTo target={flyTarget} />
              {layers.zones && (zones.data ?? []).map((z) => <Polygon key={z.id} positions={(z.polygon ?? []).map(zonePoint)} pathOptions={{ color: z.color || '#06b6d4', weight: 1.5, fillOpacity: 0.08 }}><Popup>{z.name}</Popup></Polygon>)}
              {/* الخط: إمّا ملوّن بالسرعة مقطعاً مقطعاً أو خط واحد */}
              {layers.speed ? pts.slice(1).map((p, i) => {
                const prev = pts[i]
                if (!prev) return null
                return <Polyline key={p.seq} positions={[[prev.lat, prev.lng], [p.lat, p.lng]]} pathOptions={{ color: p.state === 'gap' ? '#64748b' : speedColor(p.speed), weight: p.state === 'gap' ? 2 : 5, dashArray: p.state === 'gap' ? '6 8' : undefined, opacity: 0.9 }} />
              }) : <Polyline positions={latlngs} pathOptions={{ color: '#2563eb', weight: 4 }} />}
              {compare.data && cmpPts.length > 1 && <Polyline positions={cmpPts.map((p) => [p.lat, p.lng] as [number, number])} pathOptions={{ color: '#7c3aed', weight: 4, dashArray: '2 6', opacity: 0.9 }} />}
              {layers.arrows && pts.map((p, i) => (i % arrowEvery === Math.floor(arrowEvery / 2) && p.state === 'moving' ? <Marker key={`a${p.seq}`} position={[p.lat, p.lng]} icon={arrowIcon(arrowRotation(p.course, pts[i - 1], p), speedColor(p.speed))} interactive={false} /> : null))}
              {layers.points && pts.map((p) => (
                <CircleMarker key={`p${p.seq}`} center={[p.lat, p.lng]} radius={3} pathOptions={{ color: speedColor(p.speed), fillOpacity: 1 }}>
                  <Popup><PointPopup p={p} /></Popup>
                </CircleMarker>
              ))}
              {layers.gaps && (d.gaps ?? []).map((g) => <Polyline key={`g${g.seq}`} positions={[[g.from_lat, g.from_lng], [g.to_lat, g.to_lng]]} pathOptions={{ color: '#0f172a', weight: 2, dashArray: '4 10' }}><Popup>انقطاع إشارة {dur(g.seconds)}<br />{timeAr(g.started_at)} ← {timeAr(g.ended_at)}</Popup></Polyline>)}
              {layers.heat && (d.stops ?? []).map((s) => <Circle key={`h${s.seq}`} center={[s.lat, s.lng]} radius={stopRadius(s.duration_seconds)} pathOptions={{ color: 'transparent', fillColor: '#ef4444', fillOpacity: Math.min(0.6, 0.2 + s.duration_seconds / 3600) }} />)}
              {layers.stops && (d.stops ?? []).map((s) => (
                <Marker key={`s${s.seq}`} position={[s.lat, s.lng]} icon={stopIcon(s.seq)}>
                  <Popup><StopPopup s={s} /></Popup>
                </Marker>
              ))}
              {layers.stops && compare.data && (compare.data.stops ?? []).map((s) => <Marker key={`cs${s.seq}`} position={[s.lat, s.lng]} icon={stopIcon(s.seq, true)}><Popup><StopPopup s={s} /></Popup></Marker>)}
              {layers.stages && <StageMarkers d={d} />}
              {playPoint && <Marker position={[playPoint.lat, playPoint.lng]} icon={vehicleIcon()} zIndexOffset={1000}><Popup><PointPopup p={playPoint} /></Popup></Marker>}
            </MapContainer>
          )}
          {pts.length > 1 && (
            <div className="absolute inset-x-3 bottom-3 z-[1000] rounded-xl bg-white/95 px-3 py-2 shadow-lg" data-testid="trm-play">
              <div className="flex items-center gap-2 text-[11px] font-bold">
                <button type="button" onClick={() => { if (playIdx == null || playIdx >= pts.length - 1) setPlayIdx(0); setPlaying((v) => !v) }} className="rounded-lg bg-slate-900 px-3 py-1 text-white" data-testid="trm-play-btn">{playing ? '❚❚ إيقاف' : '▶ تشغيل'}</button>
                <input type="range" min={0} max={pts.length - 1} value={playIdx ?? 0} onChange={(e) => { setPlaying(false); setPlayIdx(Number(e.target.value)) }} className="flex-1" data-testid="trm-play-range" />
                <select value={speedX} onChange={(e) => setSpeedX(Number(e.target.value))} className="rounded-lg border px-1 py-0.5" data-testid="trm-play-speed">{[5, 10, 30, 60, 120].map((x) => <option key={x} value={x}>×{x}</option>)}</select>
                <span className="w-[150px] text-left tabular-nums" dir="ltr" data-testid="trm-play-time">{playPoint ? `${timeAr(playPoint.t)} · ${Math.round(playPoint.speed ?? 0)} km/h` : '—'}</span>
              </div>
            </div>
          )}
        </div>

        <aside className={`space-y-3 overflow-y-auto ${full ? 'min-h-0 p-1' : ''}`} data-testid="trm-side">
          {compare.data && <div className="rounded-2xl border border-violet-200 bg-violet-50 p-3 text-[11px]" data-testid="trm-compare-box"><b className="text-violet-800">المقارنة (بنفسجي):</b> {dateAr(compare.data.first_fix)} · {km(compare.data.distance_m)} كم · {compare.data.stops_count} توقف · حركة {dur(compare.data.moving_seconds)} · توقف {dur(compare.data.stopped_seconds)}<br /><span className="text-violet-700">الفرق: {(((d.distance_m - compare.data.distance_m) / 1000)).toFixed(1)} كم · {Math.round((d.moving_seconds + d.stopped_seconds - compare.data.moving_seconds - compare.data.stopped_seconds) / 60)} دقيقة</span></div>}
          <div className="rounded-2xl border bg-white p-3" data-testid="trm-legs">
            <h2 className="mb-2 text-xs font-black text-slate-800">المراحل ({(d.legs ?? []).length + 1})</h2>
            <ol className="space-y-1 text-[11px]">
              <li className="rounded-lg bg-slate-50 p-2"><b>0 · الكراج ← موقع العمل</b><br />{timeAr(d.first_fix)} · {pts.filter((p) => !p.leg_id).length} نقطة</li>
              {(d.legs ?? []).map((l) => <LegItem key={l.leg_id} l={l} />)}
            </ol>
          </div>
          <div className="rounded-2xl border bg-white p-3" data-testid="trm-stops">
            <h2 className="mb-2 text-xs font-black text-slate-800">التوقفات ({d.stops_count})</h2>
            {(d.stops ?? []).length === 0 ? <p className="text-[11px] text-slate-500">لا توقفات ≥ الحد المعتمد.</p> : (
              <ul className="space-y-1 text-[11px]">
                {(d.stops ?? []).map((s) => (
                  <li key={s.seq} className="flex items-stretch gap-1"><button type="button" onClick={() => setFlyTarget([s.lat, s.lng])} className="flex-1 rounded-lg bg-slate-50 p-2 text-right hover:bg-rose-50" data-testid={`trm-stop-${s.seq}`}>
                    <b className="text-rose-700">#{s.seq}</b> · {dur(s.duration_seconds)} · {timeAr(s.started_at)} ← {timeAr(s.ended_at)}<br /><span className="text-slate-600">{s.address ?? (s.geofence_name ?? `${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}`)}</span>{s.geofence_name && s.address !== s.geofence_name && <span className="text-sky-700"> · {s.geofence_name}</span>}
                  </button><InvButton inv={invByKey.get(`stop:${new Date(s.started_at).getTime()}`)} onClick={() => setInvTarget({ type: 'stop', at: s.started_at, title: `توقف #${s.seq} · ${dur(s.duration_seconds)}` })} testId={`trm-inv-stop-${s.seq}`} /></li>
                ))}
              </ul>
            )}
          </div>
          {(d.gaps ?? []).length > 0 && (
            <div className="rounded-2xl border bg-white p-3" data-testid="trm-gaps">
              <h2 className="mb-2 text-xs font-black text-slate-800">انقطاعات الإشارة ({d.gaps_count})</h2>
              <ul className="space-y-1 text-[11px]">{(d.gaps ?? []).map((g) => <li key={g.seq} className="flex items-stretch gap-1"><button type="button" onClick={() => setFlyTarget([g.from_lat, g.from_lng])} className="flex-1 rounded-lg bg-slate-50 p-2 text-right">{dur(g.seconds)} · {timeAr(g.started_at)} ← {timeAr(g.ended_at)}</button><InvButton inv={invByKey.get(`gap:${new Date(g.started_at).getTime()}`)} onClick={() => setInvTarget({ type: 'gap', at: g.started_at, title: `انقطاع · ${dur(g.seconds)}` })} testId={`trm-inv-gap-${g.seq}`} /></li>)}</ul>
            </div>
          )}
          <div className="rounded-2xl border bg-white p-3" data-testid="trm-investigations">
            <h2 className="mb-2 text-xs font-black text-slate-800">التحقيقات ({(investigations.data ?? []).length})</h2>
            {(investigations.data ?? []).length === 0 ? <p className="text-[11px] text-slate-500">لا تحقيقات — اضغط «تحقيق» بجانب أي توقف أو انقطاع.</p> : (
              <ul className="space-y-1 text-[11px]">{(investigations.data ?? []).map((i) => (
                <li key={i.id}><button type="button" onClick={() => setInvTarget({ type: i.event_type === 'gap' ? 'gap' : 'stop', at: i.event_at, title: `${INV_TYPE_AR[i.event_type] ?? i.event_type} · ${timeAr(i.event_at)}` })} className="w-full rounded-lg bg-slate-50 p-2 text-right hover:bg-amber-50" data-testid={`trm-inv-${i.id}`}>
                  <span className={`rounded-full px-2 py-0.5 font-black ${INV_TONE[i.status]}`}>{INV_STATUS_AR[i.status]}</span> <b>{INV_TYPE_AR[i.event_type] ?? i.event_type}</b> · {timeAr(i.event_at)}<br /><span className="text-slate-700">{i.note}</span><br /><span className="text-[10px] text-slate-400">{i.actor_name} · {dateAr(i.updated_at)} {timeAr(i.updated_at)}</span>
                </button></li>
              ))}</ul>
            )}
          </div>
          <p className="text-[10px] text-slate-400">آخر سحب {d.pulled_at ? `${dateAr(d.pulled_at)} ${timeAr(d.pulled_at)}` : '—'} · عدد السحبات {d.pull_count}{d.error_code ? ` · آخر خطأ ${d.error_code}` : ''}</p>
        </aside>
      </div>
      {invTarget && <InvestigationModal departureId={departureId} target={invTarget} existing={invByKey.get(`${invTarget.type}:${new Date(invTarget.at).getTime()}`)} onClose={() => setInvTarget(null)} />}
      {/* ورقة التقرير خارج الشاشة — تُلتقط للـ PDF وتُطبع */}
      <div aria-hidden className="pointer-events-none fixed left-[-20000px] top-0" data-testid="trm-sheet-host">
        <TripRouteReportSheet ref={sheetRef} d={d} mapImage={mapImage} compare={compare.data ?? null} />
      </div>
    </section>
  )
}

function PointPopup({ p }: { p: TripRoutePoint }) {
  return <div className="text-[11px]" dir="rtl"><b>نقطة #{p.seq}</b> · {p.state === 'stopped' ? 'ساكنة' : p.state === 'gap' ? 'بعد انقطاع' : 'متحركة'}<br />{dateAr(p.t)} {timeAr(p.t)}<br />السرعة {Math.round(p.speed ?? 0)} km/h{p.course != null ? ` · الاتجاه ${Math.round(p.course)}°` : ''}<br />{p.address ?? <span dir="ltr">{p.lat.toFixed(5)}, {p.lng.toFixed(5)}</span>}</div>
}
function StopPopup({ s }: { s: TripRouteStop }) {
  return <div className="text-[11px]" dir="rtl"><b>توقف #{s.seq} · {dur(s.duration_seconds)}</b><br />{timeAr(s.started_at)} ← {timeAr(s.ended_at)}<br />{s.address ?? '—'}{s.geofence_name ? <><br />داخل زون: {s.geofence_name}</> : null}<br /><span className="text-slate-400">المصدر: {s.address_source === 'lvn' ? 'LVN' : s.address_source === 'osm' ? 'OpenStreetMap' : s.address_source === 'zone' ? 'زون المنصة' : '—'}</span></div>
}
function LegItem({ l }: { l: TripRouteLeg }) {
  return <li className="rounded-lg bg-slate-50 p-2"><b>{l.sequence_no} · {DEST_AR[l.origin_type] ?? l.origin_type} ← {DEST_AR[l.destination_type] ?? l.destination_type}</b><br />{timeAr(l.departed_at)} ← {l.arrived_at ? timeAr(l.arrived_at) : 'لم يؤكَّد الوصول'} · {km(l.distance_m)} كم · حركة {dur(l.moving_seconds)} · توقف {dur(l.stopped_seconds)} · {l.stops_count} توقف{l.gaps_count ? ` · ${l.gaps_count} انقطاع` : ''}</li>
}
/** علامات المراحل: بداية المسار، ونهاية كل مقطع (موقع أول نقطة بعد زمن المغادرة / آخر نقطة قبل الوصول) */
function StageMarkers({ d }: { d: TripRouteDetail }) {
  const pts = d.points
  const first = pts[0], last = pts[pts.length - 1]
  const markers: { key: string; pos: [number, number]; label: string; color: string }[] = []
  if (first) markers.push({ key: 'start', pos: [first.lat, first.lng], label: `انطلاق ${timeAr(first.t)}`, color: '#16a34a' })
  for (const l of d.legs ?? []) {
    const legPts = pts.filter((p) => p.leg_id === l.leg_id)
    const a = legPts[0], b = legPts[legPts.length - 1]
    if (a) markers.push({ key: `l${l.sequence_no}s`, pos: [a.lat, a.lng], label: `${l.sequence_no} ↗ ${DEST_AR[l.destination_type] ?? l.destination_type}`, color: '#0284c7' })
    if (b && l.arrived_at) markers.push({ key: `l${l.sequence_no}e`, pos: [b.lat, b.lng], label: `${l.sequence_no} ✓ ${DEST_AR[l.destination_type] ?? ''} ${timeAr(l.arrived_at)}`, color: '#7c3aed' })
  }
  if (last && d.is_final) markers.push({ key: 'end', pos: [last.lat, last.lng], label: `النهاية ${timeAr(last.t)}`, color: '#0f172a' })
  return <>{markers.map((m) => <Marker key={m.key} position={m.pos} icon={stageIcon(m.label, m.color)} zIndexOffset={500} />)}</>
}
/** اختيار مسار للمقارنة: انطلاقيات يوم محدد (افتراضي اليوم) من القائمة */
function ComparePicker({ current, onPick }: { current: string; onPick: (id: string) => void }) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(new Date())
  const [day, setDay] = useState(today)
  const [q, setQ] = useState('')
  const list = useTripRoutesList({ date_from: day, date_to: day, search: q.trim() || undefined }, 100, 0)
  const rows = (list.data?.rows ?? []).filter((r) => r.departure_id !== current && r.points_kept > 0)
  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50 p-3" data-testid="trm-compare-picker">
      <div className="flex flex-wrap items-end gap-2 text-[11px] font-bold text-slate-700">
        <label>اليوم<input type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} className="mt-1 block rounded-xl border px-3 py-2 text-sm" data-testid="trm-cmp-day" /></label>
        <label className="flex-1">بحث (DB/السائق)<input value={q} onChange={(e) => setQ(e.target.value)} className="mt-1 block w-full rounded-xl border px-3 py-2 text-sm" data-testid="trm-cmp-q" /></label>
      </div>
      <ul className="mt-2 max-h-[180px] space-y-1 overflow-y-auto text-[11px]">
        {rows.length === 0 && <li className="text-slate-500">لا مسارات بنقاط في هذا اليوم.</li>}
        {rows.map((r) => <li key={r.departure_id}><button type="button" onClick={() => onPick(r.departure_id)} className="w-full rounded-lg bg-white p-2 text-right hover:bg-violet-100" data-testid={`trm-cmp-${r.departure_id}`}>DB {r.db_number ?? '—'} · {r.driver_name} · {timeAr(r.departed_at)} · {km(r.distance_m)} كم · {r.stops_count} توقف</button></li>)}
      </ul>
    </div>
  )
}

/* ─── التحقيقات (نُقلت من النافذة القديمة 00346): ملاحظة + حالة على توقف/انقطاع، تُحفظ في سجل التدقيق ─── */
const INV_TYPE_AR: Record<string, string> = { stop: 'توقف', gap: 'انقطاع', route: 'مسار', zone_enter: 'دخول زون', zone_exit: 'خروج زون' }
const INV_STATUS_AR: Record<GpsTripInvestigation['status'], string> = { open: 'مفتوح', in_review: 'قيد المراجعة', resolved: 'محلول' }
const INV_TONE: Record<GpsTripInvestigation['status'], string> = { open: 'bg-rose-50 text-rose-700', in_review: 'bg-amber-50 text-amber-800', resolved: 'bg-emerald-50 text-emerald-700' }
function InvButton({ inv, onClick, testId }: { inv?: GpsTripInvestigation; onClick: () => void; testId: string }) {
  return <button type="button" onClick={onClick} className={`rounded-lg border px-2 text-[10px] font-black ${inv ? INV_TONE[inv.status] : 'text-slate-500 hover:bg-amber-50'}`} data-testid={testId} title={inv ? `${INV_STATUS_AR[inv.status]}: ${inv.note}` : 'فتح تحقيق'}>{inv ? INV_STATUS_AR[inv.status] : 'تحقيق'}</button>
}
function InvestigationModal({ departureId, target, existing, onClose }: { departureId: string; target: { type: 'stop' | 'gap'; at: string; title: string }; existing?: GpsTripInvestigation; onClose: () => void }) {
  const [note, setNote] = useState(existing?.note ?? '')
  const [status, setStatus] = useState<GpsTripInvestigation['status']>(existing?.status ?? 'open')
  const save = useGpsTripInvestigationSave()
  return (
    <div className="fixed inset-0 z-[1400] grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" data-testid="trm-inv-modal">
      <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl" dir="rtl">
        <b className="text-sm">{existing ? 'تحديث التحقيق' : 'فتح تحقيق'} — {target.title}</b>
        <p className="text-[11px] text-slate-500">{dateAr(target.at)} {timeAr(target.at)} · تُحفظ العملية في سجل التدقيق.{existing ? ` · أنشأه ${existing.actor_name}` : ''}</p>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="ما الذي يُستفسر عنه؟ (3 أحرف على الأقل)" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" data-testid="trm-inv-note" />
        <select value={status} onChange={(e) => setStatus(e.target.value as GpsTripInvestigation['status'])} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" data-testid="trm-inv-status">
          {(Object.keys(INV_STATUS_AR) as GpsTripInvestigation['status'][]).map((k) => <option key={k} value={k}>{INV_STATUS_AR[k]}</option>)}
        </select>
        <div className="mt-3 flex justify-end gap-2 text-xs font-black">
          <button type="button" onClick={onClose} className="rounded-xl border px-3 py-2">إغلاق</button>
          <button type="button" disabled={save.isPending || note.trim().length < 3} onClick={() => save.mutate({ id: existing?.id, departureId, eventType: target.type, eventAt: target.at, note: note.trim(), status }, { onSuccess: onClose })} className="rounded-xl bg-slate-900 px-3 py-2 text-white disabled:opacity-50" data-testid="trm-inv-save">{save.isPending ? 'يحفظ…' : existing ? 'تحديث' : 'حفظ التحقيق'}</button>
        </div>
      </div>
    </div>
  )
}
