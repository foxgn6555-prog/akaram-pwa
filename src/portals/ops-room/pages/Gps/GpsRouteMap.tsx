import { useEffect, useMemo, useState } from 'react'
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type {
  GpsMapGeofence,
  GpsRoutePoint,
  GpsTripShiftContext,
  GpsTripZoneEvent,
} from '@sdk/gps-lvn.sdk'

const statusColor = { moving: '#16a34a', idle: '#2563eb', parked: '#eab308', unknown: '#64748b' }
const statusLabel = {
  moving: 'حركة منتجة',
  idle: 'توقف والمحرك يعمل',
  parked: 'توقف والمحرك مطفأ',
  unknown: 'حالة غير معروفة',
}
const time = (value: string) =>
  new Intl.DateTimeFormat('ar-IQ', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Baghdad',
  }).format(new Date(value))
const distanceKm = (a: GpsRoutePoint, b: GpsRoutePoint) => {
  const r = 6371,
    dLat = ((b.latitude - a.latitude) * Math.PI) / 180,
    dLng = ((b.longitude - a.longitude) * Math.PI) / 180,
    x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((a.latitude * Math.PI) / 180) *
        Math.cos((b.latitude * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2
  return 2 * r * Math.asin(Math.sqrt(x))
}
function FocusPoint({ point }: { point: GpsRoutePoint | null }) {
  const map = useMap()
  useEffect(() => {
    if (point) map.flyTo([point.latitude, point.longitude], 17, { duration: 0.7 })
  }, [map, point])
  return null
}
function FitRoute({ points, enabled }: { points: GpsRoutePoint[]; enabled: boolean }) {
  const map = useMap()
  useEffect(() => {
    if (enabled && points.length)
      map.fitBounds(L.latLngBounds(points.map((point) => [point.latitude, point.longitude])), {
        padding: [25, 25],
        maxZoom: 17,
      })
  }, [enabled, map, points])
  return null
}
const shiftFor = (point: GpsRoutePoint, shifts: GpsTripShiftContext[]) => {
  const at = new Date(point.fix_time).getTime()
  return shifts.find(
    (shift) =>
      at >= new Date(shift.overlap_from).getTime() && at <= new Date(shift.overlap_to).getTime(),
  )
}
const shiftName = (value: GpsTripShiftContext['shift']) =>
  value === 'morning' ? 'صباحي' : value === 'evening' ? 'مسائي' : 'ليلي'

export default function GpsRouteMap({
  points,
  focusAt,
  zones = [],
  shifts = [],
  zoneEvents = [],
  startLabel = 'بداية المسار',
  endLabel = 'نهاية المسار',
}: {
  points: GpsRoutePoint[]
  focusAt?: string | null
  zones?: GpsMapGeofence[]
  shifts?: GpsTripShiftContext[]
  zoneEvents?: GpsTripZoneEvent[]
  startLabel?: string
  endLabel?: string
}) {
  const [tileFailed, setTileFailed] = useState(false)
  const [focused, setFocused] = useState<GpsRoutePoint | null>(null)
  const [visibility, setVisibility] = useState<'all' | 'moving' | 'stopped' | 'gaps'>('all')
  const [colorMode, setColorMode] = useState<'status' | 'speed'>('status')
  useEffect(() => {
    if (!focusAt || !points.length) return
    const target = new Date(focusAt).getTime()
    setFocused(
      points.reduce((closest, point) =>
        Math.abs(new Date(point.fix_time).getTime() - target) <
        Math.abs(new Date(closest.fix_time).getTime() - target)
          ? point
          : closest,
      ),
    )
  }, [focusAt, points])
  const analysis = useMemo(() => {
    const segments: Array<{
      positions: Array<[number, number]>
      speeds: number[]
      status: GpsRoutePoint['operational_status']
    }> = []
    const gaps: Array<{ point: GpsRoutePoint; seconds: number; reason: string; kind: 'gap' }> = []
    const stops: Array<{ point: GpsRoutePoint; seconds: number; reason: string; kind: 'stop' }> = []
    let current: (typeof segments)[number] | null = null,
      stopStart: number | null = null
    points.forEach((point, index) => {
      const previous = points[index - 1]
      const gapSeconds = previous
        ? (new Date(point.fix_time).getTime() - new Date(previous.fix_time).getTime()) / 1000
        : 0
      const jump = previous ? distanceKm(previous, point) : 0
      const impossibleJump = Boolean(previous && gapSeconds > 0 && jump / (gapSeconds / 3600) > 180)
      const split = !previous || gapSeconds > 600 || impossibleJump || jump > 10
      if (split || !current || current.status !== point.operational_status) {
        current = {
          positions: previous && !split ? [[previous.latitude, previous.longitude]] : [],
          speeds: previous && !split ? [previous.speed ?? 0] : [],
          status: point.operational_status,
        }
        segments.push(current)
        if (previous && split)
          gaps.push({
            point,
            seconds: gapSeconds,
            reason: gapSeconds > 600 ? 'انقطاع زمني في قراءات GPS' : 'قفزة مكانية غير منطقية',
            kind: 'gap',
          })
      }
      current.positions.push([point.latitude, point.longitude])
      current.speeds.push(point.speed ?? 0)
      if ((point.speed ?? 0) <= 1 && stopStart === null) stopStart = index
      const isLast = index === points.length - 1
      if (((point.speed ?? 0) > 1 || isLast) && stopStart !== null) {
        const start = points[stopStart]
        if (start) {
          const seconds =
            (new Date(point.fix_time).getTime() - new Date(start.fix_time).getTime()) / 1000
          if (seconds >= 120 && seconds <= 6 * 3600)
            stops.push({ point: start, seconds, reason: 'توقف تشغيلي', kind: 'stop' })
        }
        stopStart = null
      }
    })
    return { segments: segments.filter((segment) => segment.positions.length), gaps, stops }
  }, [points])
  if (!points.length)
    return (
      <div className="grid h-72 place-items-center rounded-2xl bg-slate-100 text-sm text-slate-500">
        لا توجد نقاط GPS محفوظة لهذه النافذة.
      </div>
    )
  const firstPoint = points[0]!
  const lastPoint = points.at(-1)!
  const route = points.map((point) => [point.latitude, point.longitude] as [number, number])
  const visibleSegments = analysis.segments.filter((segment) =>
    visibility === 'all'
      ? true
      : visibility === 'moving'
        ? segment.status === 'moving'
        : visibility === 'stopped'
          ? segment.status === 'idle' || segment.status === 'parked'
          : false,
  )
  const visibleGaps = visibility === 'all' || visibility === 'gaps' ? analysis.gaps : []
  const visibleStops = visibility === 'all' || visibility === 'stopped' ? analysis.stops : []
  const events = [...visibleGaps, ...visibleStops].sort(
    (a, b) => new Date(a.point.fix_time).getTime() - new Date(b.point.fix_time).getTime(),
  )
  const timelineEvents = [
    ...events,
    ...zoneEvents.map((event) => ({
      point: points.reduce((closest, point) =>
        Math.abs(new Date(point.fix_time).getTime() - new Date(event.occurred_at).getTime()) <
        Math.abs(new Date(closest.fix_time).getTime() - new Date(event.occurred_at).getTime())
          ? point
          : closest,
      ),
      seconds: 0,
      reason: `${event.event_type === 'enter' ? 'دخول' : 'خروج'} · ${event.geofence_name}`,
      kind: (event.event_type === 'enter' ? 'zone_enter' : 'zone_exit') as
        'zone_enter' | 'zone_exit',
    })),
  ].sort((a, b) => new Date(a.point.fix_time).getTime() - new Date(b.point.fix_time).getTime())
  const directionStep = Math.max(1, Math.ceil(points.length / 24))
  const directionPoints = points.filter(
    (point, index) => index % directionStep === 0 && (point.speed ?? 0) > 1,
  )
  const focusIndex = Math.max(
    0,
    focused ? points.findIndex((point) => point.fix_time === focused.fix_time) : 0,
  )
  const focusedShift = focused ? shiftFor(focused, shifts) : undefined
  return (
    <div
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
      data-testid="gps-route-map"
      dir="rtl"
    >
      <div className="grid xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="relative min-w-0 overflow-hidden">
          <div className="absolute left-3 top-3 z-[1000] flex gap-2 rounded-xl border border-white/60 bg-white/95 p-2 shadow-xl backdrop-blur">
            <select
              aria-label="مرشح عناصر المسار"
              value={visibility}
              onChange={(event) => setVisibility(event.target.value as typeof visibility)}
              className="h-8 rounded-lg border px-2 text-[10px] font-bold"
            >
              <option value="all">كل المسار</option>
              <option value="moving">الحركة فقط</option>
              <option value="stopped">التوقف فقط</option>
              <option value="gaps">الانقطاعات فقط</option>
            </select>
            <select
              aria-label="نمط تلوين المسار"
              value={colorMode}
              onChange={(event) => setColorMode(event.target.value as typeof colorMode)}
              className="h-8 rounded-lg border px-2 text-[10px] font-bold"
            >
              <option value="status">حسب الحالة</option>
              <option value="speed">خريطة السرعة الحرارية</option>
            </select>
          </div>
          <div className="absolute bottom-3 right-3 z-[1000] flex flex-wrap items-center gap-3 rounded-xl border border-white/60 bg-slate-950/90 px-3 py-2 text-[10px] font-bold text-white shadow-xl backdrop-blur">
            <span>
              <span className="ml-1 text-emerald-300">●</span>
              {analysis.segments.length} مرحلة
            </span>
            <span className="text-blue-300">{analysis.stops.length} توقف</span>
            <span className={analysis.gaps.length ? 'text-orange-300' : 'text-emerald-300'}>
              {analysis.gaps.length ? `${analysis.gaps.length} انقطاع` : 'مسار متصل'}
            </span>
            <span className="text-violet-300">{zones.length} زون</span>
          </div>
          {tileFailed && (
            <div className="absolute inset-x-16 top-3 z-[1000] rounded-xl bg-amber-50 p-2 text-center text-xs font-bold text-amber-900 shadow">
              تعذر تحميل خلفية الخريطة، بينما يبقى المسار محفوظاً وقابلاً للتحقيق.
            </div>
          )}
          <MapContainer center={route[0]} zoom={13} scrollWheelZoom className="h-[480px] w-full">
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              eventHandlers={{
                tileerror: () => setTileFailed(true),
                tileload: () => setTileFailed(false),
              }}
            />
            {zones.map((zone) => (
              <Polygon
                key={zone.id}
                positions={zone.polygon.map((point) =>
                  Array.isArray(point) ? point : [point.lat, point.lng],
                )}
                pathOptions={{
                  color: zone.color,
                  fillColor: zone.color,
                  fillOpacity: 0.08,
                  weight: 2,
                }}
              >
                <Popup>
                  <b>{zone.name}</b>
                  <br />
                  {zone.source === 'lvn' ? 'زون مستورد من LVN' : 'زون تشغيلي من المنصة'}
                </Popup>
              </Polygon>
            ))}
            {zoneEvents.map((event) => (
              <CircleMarker
                key={`zone-event-${event.id}`}
                center={[event.latitude, event.longitude]}
                radius={8}
                pathOptions={{
                  color: '#fff',
                  fillColor: event.event_type === 'enter' ? '#7c3aed' : '#be123c',
                  fillOpacity: 1,
                  weight: 3,
                }}
              >
                <Popup>
                  <b>{event.event_type === 'enter' ? 'دخول الزون' : 'خروج من الزون'}</b>
                  <br />
                  {event.geofence_name}
                  <br />
                  {time(event.occurred_at)}
                </Popup>
              </CircleMarker>
            ))}
            {visibleSegments.map((segment, index) => (
              <Polyline
                key={`${segment.status}-${index}`}
                positions={segment.positions}
                pathOptions={{
                  color:
                    colorMode === 'status'
                      ? statusColor[segment.status]
                      : Math.max(...segment.speeds, 0) >= 60
                        ? '#e11d48'
                        : Math.max(...segment.speeds, 0) >= 30
                          ? '#f59e0b'
                          : '#06b6d4',
                  weight: 6,
                  opacity: 0.88,
                  lineCap: 'round',
                }}
              >
                <Popup>
                  <b>{statusLabel[segment.status]}</b>
                </Popup>
              </Polyline>
            ))}
            {visibility !== 'gaps' &&
              directionPoints.map((point) => (
                <Marker
                  key={`direction-${point.fix_time}`}
                  position={[point.latitude, point.longitude]}
                  icon={L.divIcon({
                    className: 'gps-direction-marker',
                    html: `<span style="display:block;color:#0f172a;font-size:16px;filter:drop-shadow(0 1px 2px white);transform:rotate(${Number(point.course ?? 0)}deg)">▲</span>`,
                    iconSize: [18, 18],
                    iconAnchor: [9, 9],
                  })}
                >
                  <Popup>
                    اتجاه الحركة: {Math.round(point.course ?? 0)}°<br />
                    السرعة: {Math.round(point.speed ?? 0)} كم/س
                  </Popup>
                </Marker>
              ))}
            {visibleStops.map((stop, index) => (
              <CircleMarker
                key={`stop-${stop.point.fix_time}-${index}`}
                center={[stop.point.latitude, stop.point.longitude]}
                radius={7}
                pathOptions={{ color: '#fff', fillColor: '#2563eb', fillOpacity: 1, weight: 3 }}
              >
                <Popup>
                  <b>توقف تشغيلي</b>
                  <br />
                  المدة التقريبية: {Math.round(stop.seconds / 60)} دقيقة
                  <br />
                  بدأ: {time(stop.point.fix_time)}
                  <br />
                  {stop.point.address || 'العنوان غير متوفر'}
                </Popup>
              </CircleMarker>
            ))}
            {visibleGaps.map((gap, index) => (
              <CircleMarker
                key={`gap-${gap.point.fix_time}-${index}`}
                center={[gap.point.latitude, gap.point.longitude]}
                radius={8}
                pathOptions={{ color: '#fff', fillColor: '#f97316', fillOpacity: 1, weight: 3 }}
              >
                <Popup>
                  <b>{gap.reason}</b>
                  <br />
                  المدة: {Math.round(gap.seconds / 60)} دقيقة
                  <br />
                  استؤنفت القراءة: {time(gap.point.fix_time)}
                </Popup>
              </CircleMarker>
            ))}
            {[firstPoint, lastPoint].map((point, index) => (
              <CircleMarker
                key={`${index}-${point.fix_time}`}
                center={[point.latitude, point.longitude]}
                radius={10}
                pathOptions={{
                  color: '#fff',
                  fillColor: index === 0 ? '#0891b2' : '#dc2626',
                  fillOpacity: 1,
                  weight: 4,
                }}
              >
                <Popup>
                  <b>{index === 0 ? startLabel : endLabel}</b>
                  <br />
                  {time(point.fix_time)}
                  <br />
                  {point.address || 'العنوان غير متوفر'}
                </Popup>
              </CircleMarker>
            ))}
            {focused && (
              <CircleMarker
                center={[focused.latitude, focused.longitude]}
                radius={11}
                pathOptions={{
                  color: '#0f172a',
                  fillColor: '#22d3ee',
                  fillOpacity: 0.9,
                  weight: 4,
                }}
              >
                <Popup>
                  <b>النقطة المحددة</b>
                  <br />
                  {time(focused.fix_time)} · {focused.speed ?? 0} كم/س
                  <br />
                  {focusedShift
                    ? `${focusedShift.driver_name} · ${shiftName(focusedShift.shift)} · ${focusedShift.area_name}`
                    : 'لا يوجد شفت تاريخي مطابق'}
                </Popup>
              </CircleMarker>
            )}
            <FitRoute points={points} enabled={!focused} />
            <FocusPoint point={focused} />
          </MapContainer>
        </div>
        <aside className="max-h-[480px] overflow-auto border-r bg-slate-50 p-3">
          <div className="mb-3 rounded-xl bg-slate-950 p-3 text-white">
            <b className="block text-xs">مراحل ومحطات المسار</b>
            <small className="text-[10px] text-slate-400">
              اختيار الحدث يحرك الخريطة إلى أقرب قراءة
            </small>
          </div>
          <button
            onClick={() => setFocused(firstPoint)}
            className="mb-2 w-full rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-right"
          >
            <span className="rounded-full bg-cyan-600 px-2 py-0.5 text-[9px] font-black text-white">
              بداية
            </span>
            <b className="mt-1 block text-[10px]">{startLabel}</b>
            <small className="text-[9px] text-slate-500">{time(firstPoint.fix_time)}</small>
          </button>
          {timelineEvents.map((item, index) => (
            <button
              key={`${item.kind}-${item.point.fix_time}-${index}`}
              onClick={() => setFocused(item.point)}
              className={`mb-2 w-full rounded-xl border bg-white p-3 text-right transition hover:-translate-y-0.5 hover:shadow ${focused?.fix_time === item.point.fix_time ? 'ring-2 ring-cyan-500' : ''}`}
            >
              <span
                className={`mb-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-black ${item.kind === 'gap' ? 'bg-orange-100 text-orange-800' : item.kind === 'stop' ? 'bg-blue-100 text-blue-800' : 'bg-violet-100 text-violet-800'}`}
              >
                {item.kind === 'gap' ? 'انقطاع' : item.kind === 'stop' ? 'توقف' : 'زون'}
              </span>
              <b className="block text-[10px]">{item.reason}</b>
              <small className="block text-[9px] text-slate-500">
                {item.kind === 'zone_enter' || item.kind === 'zone_exit'
                  ? time(item.point.fix_time)
                  : `${Math.round(item.seconds / 60)} دقيقة · ${time(item.point.fix_time)}`}
              </small>
              {item.point.address && (
                <small className="mt-1 block truncate text-[9px] text-slate-400">
                  {item.point.address}
                </small>
              )}
            </button>
          ))}
          <button
            onClick={() => setFocused(lastPoint)}
            className="mb-2 w-full rounded-xl border border-rose-200 bg-rose-50 p-3 text-right"
          >
            <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[9px] font-black text-white">
              نهاية
            </span>
            <b className="mt-1 block text-[10px]">{endLabel}</b>
            <small className="text-[9px] text-slate-500">{time(lastPoint.fix_time)}</small>
          </button>
        </aside>
      </div>
      <div className="border-t bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <b className="text-xs">الشريط الزمني التفاعلي</b>
            <p className="text-[9px] text-slate-500">
              {focused
                ? `${time(focused.fix_time)} · ${statusLabel[focused.operational_status]}`
                : 'اسحب المؤشر لاستعراض الرحلة نقطة بنقطة'}
            </p>
          </div>
          {focusedShift && (
            <span className="rounded-full bg-indigo-100 px-3 py-1 text-[10px] font-black text-indigo-800">
              {focusedShift.driver_name} · {shiftName(focusedShift.shift)} ·{' '}
              {focusedShift.area_name}
            </span>
          )}
        </div>
        <input
          aria-label="الشريط الزمني لمسار GPS"
          type="range"
          min={0}
          max={Math.max(0, points.length - 1)}
          value={focusIndex}
          onChange={(event) => setFocused(points[Number(event.target.value)] ?? firstPoint)}
          className="mt-3 w-full accent-cyan-600"
        />
        <div className="mt-2 flex flex-wrap gap-3 text-[9px] font-bold">
          <span className="text-emerald-700">● حركة منتجة</span>
          <span className="text-blue-700">● توقف والمحرك يعمل</span>
          <span className="text-amber-700">● توقف والمحرك مطفأ</span>
          <span className="text-orange-700">● انقطاع GPS</span>
          <span className="text-violet-700">▧ زون تشغيلي</span>
        </div>
      </div>
    </div>
  )
}
