import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MapContainer, Marker, Polygon, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { GpsLiveDevice, GpsMapGeofence, GpsMapLandmark } from '@sdk/gps-lvn.sdk'
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
function collectPoints(rows: GpsLiveDevice[], landmarks: GpsMapLandmark[]) {
  return [
    ...rows.map((row) => [row.latitude, row.longitude] as [number, number]),
    ...landmarks.map((landmark) => [landmark.latitude, landmark.longitude] as [number, number]),
  ]
}
// ملاءمة الإطار مرة واحدة فقط عند أول وصول للبيانات — تحدّثات المزامنة
// اللاحقة لا تحرّك الشاشة؛ المستخدم يستعيدها يدوياً بزر «ملاءمة العرض».
function Fit({
  rows,
  landmarks,
  fitSignal,
}: {
  rows: GpsLiveDevice[]
  landmarks: GpsMapLandmark[]
  fitSignal: number
}) {
  const map = useMap()
  const dataRef = useRef({ rows, landmarks })
  dataRef.current = { rows, landmarks }
  const fittedOnce = useRef(false)
  useEffect(() => {
    if (fittedOnce.current) return
    const points = collectPoints(rows, landmarks)
    if (!points.length) return
    fittedOnce.current = true
    map.fitBounds(L.latLngBounds(points), {
      padding: [30, 30],
      maxZoom: 16,
    })
  }, [landmarks, map, rows])
  // زر الملاءمة فقط — تحديثات المزامنة لا تحرّك الخريطة أبداً
  useEffect(() => {
    if (!fitSignal) return
    const points = collectPoints(dataRef.current.rows, dataRef.current.landmarks)
    if (points.length)
      map.fitBounds(L.latLngBounds(points), {
        padding: [30, 30],
        maxZoom: 16,
      })
  }, [fitSignal, map])
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
  const [fitSignal, setFitSignal] = useState(0)
  const [full, setFull] = useState(false)
  const [layers, setLayers] = useState({ vehicles: true, zones: true, landmarks: true })
  const toggleLayer = (key: keyof typeof layers) =>
    setLayers((current) => ({ ...current, [key]: !current[key] }))
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
      {tileFailed && (
        <div className="absolute inset-x-16 bottom-3 z-[1000] rounded-xl bg-amber-50 p-2 text-center text-xs font-bold text-amber-900">
          تعذر تحميل خلفية OpenStreetMap؛ تحقق من الاتصال ثم أعد تحميل الصفحة.
        </div>
      )}
      <MapContainer
        center={[33.3152, 44.3661]}
        zoom={11}
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
        <Fit rows={rows} landmarks={landmarks} fitSignal={fitSignal} />
        <InvalidateSize dep={full} />
      </MapContainer>
    </div>
  )
  return full ? createPortal(shell, document.body) : shell
}
