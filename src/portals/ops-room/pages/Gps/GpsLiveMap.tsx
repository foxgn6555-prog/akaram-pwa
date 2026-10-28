import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MapContainer, Marker, Polygon, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { GpsLiveDevice, GpsMapGeofence, GpsMapLandmark, GpsStopHotspot } from '@sdk/gps-lvn.sdk'
import { useGpsStopHotspotSettings, useGpsStopHotspots } from '@features/gps-lvn/hooks'
import StopHotspotsLayer, { FlyToSpot } from '@components/gps/StopHotspotsLayer'
import StopHotspotsPanel from '@components/gps/StopHotspotsPanel'
import StopHotspotSettingsDialog from '@components/gps/StopHotspotSettingsDialog'
import { clampHotspotWindow } from '@components/gps/stopHotspots'
import { readHotspotHours } from '@components/gps/StopHotspotsPage'
import { landmarkDivIcon } from './LandmarkIcon'
const colors = { moving: '#16a34a', idle: '#2563eb', parked: '#eab308', unknown: '#64748b' }
const landmarkLabels: Record<GpsMapLandmark['category'], string> = {
  landmark: 'معلم عام',
  garage: 'كراج',
  station: 'محطة',
  maintenance: 'صيانة',
  office: 'مقر إداري',
  checkpoint: 'نقطة سيطرة',
  hazard: 'موقع خطورة',
  other: 'أخرى',
}
const labels = {
  moving: 'متحركة',
  idle: 'متوقفة والمحرك يعمل',
  parked: 'متوقفة والمحرك مطفأ',
  unknown: 'غير معروفة',
}
/**
 * 00212 — إطار الخريطة الافتراضي:
 *  1) الزونات أولاً (منطقة العمل الفعلية)، 2) وإلا الآليات/المعالم داخل نطاق العراق فقط.
 *  إحداثيات شاذة (0,0 أو خارج العراق — أجهزة بلا إشارة GPS) كانت توسّع الإطار ليشمل أفريقيا كلها.
 *  3) آخر إطار يختاره المستخدم يُحفظ في sessionStorage ويُستعاد بعد تحديث الصفحة.
 */
const IRAQ = { minLat: 28.5, maxLat: 38.0, minLng: 38.0, maxLng: 49.5 }
export const isPlausiblePoint = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && !(Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01) &&
  lat >= IRAQ.minLat && lat <= IRAQ.maxLat && lng >= IRAQ.minLng && lng <= IRAQ.maxLng
const zonePoint = (pt: GpsMapGeofence['polygon'][number]): [number, number] =>
  Array.isArray(pt) ? [pt[0], pt[1]] : [pt.lat, pt.lng]
export function collectPoints(rows: GpsLiveDevice[], landmarks: GpsMapLandmark[], zones: GpsMapGeofence[] = []) {
  const zonePts = zones.flatMap((z) => (z.polygon ?? []).map(zonePoint)).filter(([a, b]) => isPlausiblePoint(a, b))
  if (zonePts.length) return zonePts
  return [
    ...rows.map((row) => [row.latitude, row.longitude] as [number, number]),
    ...landmarks.map((landmark) => [landmark.latitude, landmark.longitude] as [number, number]),
  ].filter(([a, b]) => isPlausiblePoint(a, b))
}
const VIEW_KEY = 'gps-live-map:view'
type SavedView = { lat: number; lng: number; zoom: number }
export const readSavedView = (): SavedView | null => {
  try {
    const raw = sessionStorage.getItem(VIEW_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as SavedView
    return isPlausiblePoint(v.lat, v.lng) && Number.isFinite(v.zoom) ? v : null
  } catch {
    return null
  }
}
// ملاءمة الإطار مرة واحدة فقط عند أول وصول للبيانات — تحدّثات المزامنة
// اللاحقة لا تحرّك الشاشة؛ المستخدم يستعيدها يدوياً بزر «ملاءمة العرض».
function Fit({
  rows,
  landmarks,
  zones,
  fitSignal,
}: {
  rows: GpsLiveDevice[]
  landmarks: GpsMapLandmark[]
  zones: GpsMapGeofence[]
  fitSignal: number
}) {
  const map = useMap()
  const dataRef = useRef({ rows, landmarks, zones })
  dataRef.current = { rows, landmarks, zones }
  const fittedOnce = useRef(Boolean(readSavedView()))   // إطار محفوظ من قبل ⇒ لا ملاءمة تلقائية
  const fittedWithZones = useRef(false)
  const firstFitAt = useRef(0)
  useEffect(() => {
    const hasZones = zones.some((z) => (z.polygon ?? []).length > 0)
    // الآليات تصل قبل الزونات أحياناً: نسمح بملاءمة ثانية واحدة عند وصول الزونات خلال 15 ثانية من الأولى
    const zoneRefit = fittedOnce.current && hasZones && !fittedWithZones.current && firstFitAt.current > 0 && Date.now() - firstFitAt.current < 15_000
    if (fittedOnce.current && !zoneRefit) return
    const points = collectPoints(rows, landmarks, zones)
    if (!points.length) return
    if (!fittedOnce.current) firstFitAt.current = Date.now()
    fittedOnce.current = true
    if (hasZones) fittedWithZones.current = true
    map.fitBounds(L.latLngBounds(points), {
      padding: [30, 30],
      maxZoom: 16,
    })
  }, [landmarks, map, rows, zones])
  // زر الملاءمة فقط — تحديثات المزامنة لا تحرّك الخريطة أبداً
  useEffect(() => {
    if (!fitSignal) return
    const points = collectPoints(dataRef.current.rows, dataRef.current.landmarks, dataRef.current.zones)
    if (points.length)
      map.fitBounds(L.latLngBounds(points), {
        padding: [30, 30],
        maxZoom: 16,
      })
  }, [fitSignal, map])
  // حفظ الإطار الحالي عند كل تحريك/تكبير من المستخدم
  useEffect(() => {
    const save = () => {
      const c = map.getCenter()
      try {
        sessionStorage.setItem(VIEW_KEY, JSON.stringify({ lat: c.lat, lng: c.lng, zoom: map.getZoom() }))
      } catch {
        /* تخزين غير متاح */
      }
    }
    map.on('moveend', save)
    return () => {
      map.off('moveend', save)
    }
  }, [map])
  return null
}
function InvalidateSize({ dep }: { dep: unknown }) {
  const map = useMap()
  useEffect(() => {
    map.invalidateSize()
  }, [dep, map])
  return null
}
// ذاكرة أيقونات: نفس الأيقونة لكل (لون/اتجاه مقرّب/حجم) — لا إعادة إنشاء
// كل مزامنة (يمنع الوميض ويثبّت الرسم)
const iconCache = new Map<string, L.DivIcon>()
const arrowIcon = (color: string, course: number | null, active: boolean) => {
  const deg = (Math.round((course ?? 0) / 10) * 10) % 360
  const key = `${color}|${deg}|${active}`
  const cached = iconCache.get(key)
  if (cached) return cached
  const size = active ? 30 : 24
  const icon = L.divIcon({
    className: 'gps-arrow-icon',
    html: `<div style="transform:rotate(${deg}deg);line-height:0"><svg width="${size}" height="${size}" viewBox="0 0 24 24"><path d="M12 1.5 L19.5 21 L12 16 L4.5 21 Z" fill="${color}" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round"/></svg></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  })
  iconCache.set(key, icon)
  return icon
}
export default function GpsLiveMap({
  rows,
  zones,
  landmarks,
}: {
  rows: GpsLiveDevice[]
  zones: GpsMapGeofence[]
  landmarks: GpsMapLandmark[]
}) {
  const [tileFailed, setTileFailed] = useState(false)
  const [saved] = useState(readSavedView)   // 00212: استعادة آخر إطار بعد تحديث الصفحة
  const [fitSignal, setFitSignal] = useState(0)
  const [full, setFull] = useState(false)
  const [layers, setLayers] = useState({ vehicles: true, zones: true, landmarks: true, hotspots: false })
  const toggleLayer = (key: keyof typeof layers) =>
    setLayers((current) => ({ ...current, [key]: !current[key] }))
  // 00362 — طبقة بقع التوقف: تُحمَّل فقط عند تشغيلها، وتتحدّث كل دقيقة
  const [hotspotHours, setHotspotHoursState] = useState(readHotspotHours)
  const setHotspotHours = (h: number) => {
    sessionStorage.setItem('stop-hotspots:hours', String(h))
    setHotspotHoursState(h)
  }
  const [selectedSpot, setSelectedSpot] = useState<GpsStopHotspot | null>(null)
  const [hotspotSettingsOpen, setHotspotSettingsOpen] = useState(false)
  const hotspots = useGpsStopHotspots(hotspotHours, layers.hotspots)
  const hotspotSettings = useGpsStopHotspotSettings(layers.hotspots)
  useEffect(() => {
    if (hotspots.data && hotspotHours !== clampHotspotWindow(hotspotHours, hotspots.data.meta.max_days))
      setHotspotHours(clampHotspotWindow(hotspotHours, hotspots.data.meta.max_days))
  }, [hotspots.data, hotspotHours])
  // ملء الشاشة عبر portal إلى body — يهرب من أي ancestor بـ transform/filter
  // كان يكسر position:fixed ويجعل الخريطة لا تملأ النافذة
  const shell = (
    <div className={full ? 'fixed inset-0 z-[2000] bg-white' : 'relative overflow-hidden rounded-2xl border'}>
      <div className="absolute right-3 top-3 z-[1000] max-w-[calc(100%-1.5rem)] rounded-2xl border border-white/60 bg-white/95 p-2 shadow-xl backdrop-blur">
        <div className="flex flex-wrap gap-1.5 text-[10px] font-black">
          <button
            type="button"
            aria-pressed={layers.vehicles}
            onClick={() => toggleLayer('vehicles')}
            className={`rounded-xl px-3 py-2 transition ${layers.vehicles ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-400'}`}
          >
            ● الآليات ({rows.length})
          </button>
          <button
            type="button"
            aria-pressed={layers.zones}
            onClick={() => toggleLayer('zones')}
            className={`rounded-xl px-3 py-2 transition ${layers.zones ? 'bg-violet-700 text-white' : 'bg-slate-100 text-slate-400'}`}
          >
            ▧ الزونات ({zones.length})
          </button>
          <button
            type="button"
            aria-pressed={layers.landmarks}
            onClick={() => toggleLayer('landmarks')}
            className={`rounded-xl px-3 py-2 transition ${layers.landmarks ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-400'}`}
          >
            ◆ المعالم ({landmarks.length})
          </button>
          <button
            type="button"
            aria-pressed={layers.hotspots}
            onClick={() => toggleLayer('hotspots')}
            title="بقع التوقف: أين تتوقف الآليات المربوطة أكثر (24 ساعة / 3 أيام / 7 أيام)"
            className={`rounded-xl px-3 py-2 transition ${layers.hotspots ? 'bg-rose-700 text-white' : 'bg-slate-100 text-slate-400'}`}
            data-testid="live-map-toggle-hotspots"
          >
            ◉ بقع التوقف{hotspots.data ? ` (${hotspots.data.spots.length})` : ''}
          </button>
          <button
            type="button"
            onClick={() => setFitSignal((value) => value + 1)}
            title="إعادة توسيط الخريطة على كل الآليات والمعالم"
            className="rounded-xl bg-cyan-700 px-3 py-2 text-white transition hover:bg-cyan-800"
          >
            ⛶ ملاءمة العرض
          </button>
          <button
            type="button"
            aria-pressed={full}
            onClick={() => setFull((value) => !value)}
            className="rounded-xl bg-slate-950 px-3 py-2 text-white transition hover:bg-slate-800"
          >
            {full ? '✕ إنهاء ملء الشاشة' : '⛶ ملء الشاشة'}
          </button>
        </div>
        {layers.vehicles && (
          <div className="mt-2 flex flex-wrap gap-2 border-t pt-2 text-[9px]">
            <span className="text-emerald-700">● متحركة</span>
            <span className="text-blue-700">● محرك يعمل</span>
            <span className="text-amber-700">● محرك مطفأ</span>
            <span className="text-slate-600">● غير معروفة</span>
          </div>
        )}
      </div>
      {layers.hotspots && (
        <div className="absolute bottom-6 left-3 z-[1000] max-w-[calc(100%-1.5rem)]">
          <StopHotspotsPanel
            data={hotspots.data}
            loading={hotspots.isLoading}
            hours={hotspotHours}
            onHours={setHotspotHours}
            selectedId={selectedSpot?.id ?? null}
            onSelect={setSelectedSpot}
            canEdit={hotspotSettings.data?.can_edit ?? false}
            onOpenSettings={() => setHotspotSettingsOpen(true)}
            compact
          />
        </div>
      )}
      {hotspotSettingsOpen && hotspotSettings.data && (
        <StopHotspotSettingsDialog settings={hotspotSettings.data} onClose={() => setHotspotSettingsOpen(false)} />
      )}
      {tileFailed && (
        <div className="absolute inset-x-16 bottom-3 z-[1000] rounded-xl bg-amber-50 p-2 text-center text-xs font-bold text-amber-900">
          تعذر تحميل خلفية OpenStreetMap؛ تحقق من الاتصال ثم أعد تحميل الصفحة.
        </div>
      )}
      <MapContainer
        center={saved ? [saved.lat, saved.lng] : [33.3152, 44.3661]}
        zoom={saved?.zoom ?? 11}
        className={full ? 'h-full w-full' : 'h-[65vh] min-h-[460px] w-full'}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          eventHandlers={{
            tileerror: () => setTileFailed(true),
            tileload: () => setTileFailed(false),
          }}
        />
        {layers.zones &&
          zones.map((zone) => {
            const positions = zone.polygon.map((p) =>
              Array.isArray(p) ? p : ([p.lat, p.lng] as [number, number]),
            )
            return (
              <Polygon
                key={zone.id}
                positions={positions}
                pathOptions={{ color: zone.color || '#7c3aed', fillOpacity: 0.08, weight: 2 }}
              >
                <Popup>
                  <b>{zone.name}</b>
                  <br />
                  {zone.source === 'lvn' ? 'منطقة مستوردة من LVN' : 'منطقة المنصة'}
                </Popup>
              </Polygon>
            )
          })}
        {layers.landmarks &&
          landmarks.map((landmark) => (
            <Marker
              key={`landmark-${landmark.id}`}
              position={[landmark.latitude, landmark.longitude]}
              icon={landmarkDivIcon(landmark.icon ?? 'pin', landmark.color)}
            >
              <Popup>
                <b>{landmark.name}</b>
                <br />
                معلم تشغيلي · {landmarkLabels[landmark.category]}
                {landmark.notes ? (
                  <>
                    <br />
                    {landmark.notes}
                  </>
                ) : null}
              </Popup>
            </Marker>
          ))}
        {layers.vehicles &&
          rows.map((row) => (
            <Marker
              key={row.device_id}
              position={[row.latitude, row.longitude]}
              icon={arrowIcon(
                colors[row.operational_status],
                row.course,
                Boolean(row.departure_id),
              )}
            >
              <Popup>
                <b>{row.vehicle_name ?? row.device_name}</b>
                <br />
                {row.db_number ? `DB ${row.db_number}` : `LVN ${row.external_id}`}
                <br />
                {labels[row.operational_status]} · {row.speed ?? 0} كم/س
                <br />
                {row.driver_name ?? 'السائق غير محدد'}
                <br />
                {row.address ?? 'العنوان غير متوفر'}
                <br />
                {row.departure_id ? 'ضمن انطلاقة حالية' : 'لا توجد انطلاقة'}
                <br />
                {row.assigned_zone_count === 0
                  ? 'لا يوجد زون مخصص'
                  : row.inside_assigned_zone
                    ? 'داخل الزون'
                    : 'خارج الزون'}
              </Popup>
            </Marker>
          ))}
        {layers.hotspots && (
          <>
            <StopHotspotsLayer spots={hotspots.data?.spots ?? []} hours={hotspotHours} selectedId={selectedSpot?.id ?? null} onSelect={setSelectedSpot} />
            <FlyToSpot spot={selectedSpot} />
          </>
        )}
        <Fit rows={rows} landmarks={landmarks} zones={zones} fitSignal={fitSignal} />
        <InvalidateSize dep={full} />
      </MapContainer>
    </div>
  )
  return full ? createPortal(shell, document.body) : shell
}
