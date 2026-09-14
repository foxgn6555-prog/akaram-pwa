import { useEffect, useState } from 'react'
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polygon,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet'
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
function Fit({ rows, landmarks }: { rows: GpsLiveDevice[]; landmarks: GpsMapLandmark[] }) {
  const map = useMap()
  useEffect(() => {
    const points = [
      ...rows.map((row) => [row.latitude, row.longitude] as [number, number]),
      ...landmarks.map((landmark) => [landmark.latitude, landmark.longitude] as [number, number]),
    ]
    if (points.length)
      map.fitBounds(L.latLngBounds(points), {
        padding: [30, 30],
        maxZoom: 16,
      })
  }, [landmarks, map, rows])
  return null
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
  const [layers, setLayers] = useState({ vehicles: true, zones: true, landmarks: true })
  const toggleLayer = (key: keyof typeof layers) =>
    setLayers((current) => ({ ...current, [key]: !current[key] }))
  return (
    <div className="relative overflow-hidden rounded-2xl border">
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
      <MapContainer center={[33.3152, 44.3661]} zoom={11} className="h-[65vh] min-h-[460px] w-full">
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
            <CircleMarker
              key={row.device_id}
              center={[row.latitude, row.longitude]}
              radius={row.departure_id ? 9 : 6}
              pathOptions={{
                color: colors[row.operational_status],
                fillColor: colors[row.operational_status],
                fillOpacity: 0.9,
                weight: row.departure_id ? 4 : 2,
              }}
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
            </CircleMarker>
          ))}
        <Fit rows={rows} landmarks={landmarks} />
      </MapContainer>
    </div>
  )
}
