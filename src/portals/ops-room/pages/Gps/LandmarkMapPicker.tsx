import { useState } from 'react'
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polygon,
  Popup,
  TileLayer,
  useMapEvents,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type {
  GpsLandmarkIcon,
  GpsLiveDevice,
  GpsMapGeofence,
  GpsMapLandmark,
} from '@sdk/gps-lvn.sdk'
import { landmarkDivIcon } from './LandmarkIcon'

type Point = { lat: number; lng: number }
function Capture({ onChange }: { onChange: (point: Point) => void }) {
  useMapEvents({
    click: (event) =>
      onChange({
        lat: Number(event.latlng.lat.toFixed(7)),
        lng: Number(event.latlng.lng.toFixed(7)),
      }),
  })
  return null
}
export default function LandmarkMapPicker({
  point,
  color,
  icon,
  zones,
  landmarks,
  vehicles,
  onChange,
}: {
  point: Point | null
  color: string
  icon: GpsLandmarkIcon
  zones: GpsMapGeofence[]
  landmarks: GpsMapLandmark[]
  vehicles: GpsLiveDevice[]
  onChange: (point: Point) => void
}) {
  const [tileFailed, setTileFailed] = useState(false)
  return (
    <div className="relative h-full min-h-[520px] overflow-hidden bg-slate-900">
      <div className="absolute right-4 top-4 z-[1000] rounded-2xl bg-slate-950/90 px-4 py-3 text-xs font-black text-white shadow-2xl">
        انقر على موقع المعلم في الخريطة الحية
      </div>
      {tileFailed && (
        <div className="absolute inset-x-20 bottom-5 z-[1000] rounded-xl bg-amber-50 p-2 text-center text-xs font-bold text-amber-900">
          تعذر تحميل خلفية OpenStreetMap.
        </div>
      )}
      <MapContainer
        center={[point?.lat ?? 33.3152, point?.lng ?? 44.3661]}
        zoom={point ? 16 : 11}
        className="h-full min-h-[520px] w-full"
        scrollWheelZoom
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          eventHandlers={{
            tileerror: () => setTileFailed(true),
            tileload: () => setTileFailed(false),
          }}
        />
        {zones.map((zone) => {
          const positions = zone.polygon.map((item) =>
            Array.isArray(item) ? item : ([item.lat, item.lng] as [number, number]),
          )
          return (
            <Polygon
              key={zone.id}
              positions={positions}
              pathOptions={{ color: zone.color, fillOpacity: 0.08, weight: 2 }}
            >
              <Popup>{zone.name}</Popup>
            </Polygon>
          )
        })}
        {landmarks.map((item) => (
          <Marker
            key={item.id}
            position={[item.latitude, item.longitude]}
            icon={landmarkDivIcon(item.icon ?? 'pin', item.color)}
          >
            <Popup>{item.name}</Popup>
          </Marker>
        ))}
        {vehicles.map((vehicle) => (
          <CircleMarker
            key={vehicle.device_id}
            center={[vehicle.latitude, vehicle.longitude]}
            radius={5}
            pathOptions={{ color: '#16a34a', fillOpacity: 0.8 }}
          >
            <Popup>{vehicle.vehicle_name ?? vehicle.device_name}</Popup>
          </CircleMarker>
        ))}
        {point && <Marker position={[point.lat, point.lng]} icon={landmarkDivIcon(icon, color)} />}
        <Capture onChange={onChange} />
      </MapContainer>
    </div>
  )
}
