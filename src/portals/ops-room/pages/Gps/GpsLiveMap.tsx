import { useEffect, useState } from 'react'
import { CircleMarker, MapContainer, Polygon, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { GpsLiveDevice, GpsMapGeofence } from '@sdk/gps-lvn.sdk'
const colors = { moving: '#16a34a', idle: '#2563eb', parked: '#eab308', unknown: '#64748b' }
const labels = {
  moving: 'متحركة',
  idle: 'متوقفة والمحرك يعمل',
  parked: 'متوقفة والمحرك مطفأ',
  unknown: 'غير معروفة',
}
function Fit({ rows }: { rows: GpsLiveDevice[] }) {
  const map = useMap()
  useEffect(() => {
    if (rows.length)
      map.fitBounds(L.latLngBounds(rows.map((x) => [x.latitude, x.longitude])), {
        padding: [30, 30],
        maxZoom: 16,
      })
  }, [map, rows])
  return null
}
export default function GpsLiveMap({
  rows,
  zones,
}: {
  rows: GpsLiveDevice[]
  zones: GpsMapGeofence[]
}) {
  const [tileFailed, setTileFailed] = useState(false)
  if (!rows.length)
    return (
      <div className="grid h-96 place-items-center rounded-2xl bg-slate-100 text-sm text-slate-500">
        لا توجد أجهزة بإحداثيات صالحة.
      </div>
    )
  return (
    <div className="relative overflow-hidden rounded-2xl border">
      <div className="absolute right-3 top-3 z-[1000] flex flex-wrap gap-2 rounded-xl bg-white/95 p-2 text-[11px] shadow">
        <span className="text-emerald-700">● متحركة</span>
        <span className="text-blue-700">● محرك يعمل</span>
        <span className="text-amber-700">● محرك مطفأ</span>
        <span className="text-slate-600">● غير معروفة</span>
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
        {zones.map((zone) => {
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
        {rows.map((row) => (
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
        <Fit rows={rows} />
      </MapContainer>
    </div>
  )
}
