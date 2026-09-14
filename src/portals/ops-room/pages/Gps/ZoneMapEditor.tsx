import { useEffect, useRef, useState } from 'react'
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { GpsLiveDevice, GpsMapGeofence, GpsMapLandmark } from '@sdk/gps-lvn.sdk'
import { landmarkDivIcon } from './LandmarkIcon'

export type ZoneShape =
  'polygon' | 'rectangle' | 'square' | 'circle' | 'triangle' | 'hexagon' | 'corridor'
type Point = { lat: number; lng: number }
const shapeLabels: Record<ZoneShape, string> = {
  polygon: 'مضلع حر',
  rectangle: 'مستطيل',
  square: 'مربع',
  circle: 'دائرة',
  triangle: 'مثلث',
  hexagon: 'سداسي',
  corridor: 'ممر تشغيلي',
}
const fixed = (point: Point): Point => ({
  lat: Number(point.lat.toFixed(7)),
  lng: Number(point.lng.toFixed(7)),
})
const distance = (a: Point, b: Point) => L.latLng(a).distanceTo(L.latLng(b))
function destination(center: Point, radius: number, angle: number): Point {
  const earth = 6378137
  const lat = (center.lat * Math.PI) / 180
  const lng = (center.lng * Math.PI) / 180
  const bearing = (angle * Math.PI) / 180
  const ratio = radius / earth
  const targetLat = Math.asin(
    Math.sin(lat) * Math.cos(ratio) + Math.cos(lat) * Math.sin(ratio) * Math.cos(bearing),
  )
  return fixed({
    lat: (targetLat * 180) / Math.PI,
    lng:
      ((lng +
        Math.atan2(
          Math.sin(bearing) * Math.sin(ratio) * Math.cos(lat),
          Math.cos(ratio) - Math.sin(lat) * Math.sin(targetLat),
        )) *
        180) /
      Math.PI,
  })
}
function regular(center: Point, edge: Point, sides: number) {
  const radius = Math.max(10, distance(center, edge))
  return Array.from({ length: sides }, (_, index) =>
    destination(center, radius, -90 + (360 / sides) * index),
  )
}
function rectangle(a: Point, b: Point, square = false): Point[] {
  if (!square)
    return [
      fixed(a),
      fixed({ lat: a.lat, lng: b.lng }),
      fixed(b),
      fixed({ lat: b.lat, lng: a.lng }),
    ]
  const delta = Math.max(Math.abs(b.lat - a.lat), Math.abs(b.lng - a.lng))
  const lat = b.lat >= a.lat ? a.lat + delta : a.lat - delta
  const lng = b.lng >= a.lng ? a.lng + delta : a.lng - delta
  return [fixed(a), fixed({ lat: a.lat, lng }), fixed({ lat, lng }), fixed({ lat, lng: a.lng })]
}
function corridor(a: Point, b: Point): Point[] {
  const width = Math.max(20, Math.min(150, distance(a, b) * 0.08))
  const bearing = (Math.atan2(b.lng - a.lng, b.lat - a.lat) * 180) / Math.PI
  return [
    destination(a, width, bearing - 90),
    destination(b, width, bearing - 90),
    destination(b, width, bearing + 90),
    destination(a, width, bearing + 90),
  ]
}
function Capture({
  shape,
  points,
  anchor,
  onAnchor,
  onChange,
}: {
  shape: ZoneShape
  points: Point[]
  anchor: Point | null
  onAnchor: (point: Point | null) => void
  onChange: (points: Point[]) => void
}) {
  useMapEvents({
    click: (event) => {
      const point = fixed(event.latlng)
      if (shape === 'polygon') return onChange([...points, point])
      if (!anchor) return onAnchor(point)
      if (shape === 'rectangle') onChange(rectangle(anchor, point))
      if (shape === 'square') onChange(rectangle(anchor, point, true))
      if (shape === 'circle') onChange(regular(anchor, point, 48))
      if (shape === 'triangle') onChange(regular(anchor, point, 3))
      if (shape === 'hexagon') onChange(regular(anchor, point, 6))
      if (shape === 'corridor') onChange(corridor(anchor, point))
      onAnchor(null)
    },
  })
  return null
}
function InitialFit({ points }: { points: Point[] }) {
  const map = useMap()
  const fitted = useRef(false)
  useEffect(() => {
    if (!fitted.current && points.length >= 2) {
      fitted.current = true
      map.fitBounds(L.latLngBounds(points.map((point) => [point.lat, point.lng])), {
        padding: [70, 70],
        maxZoom: 16,
      })
    }
  }, [map, points])
  return null
}
export default function ZoneMapEditor({
  points,
  color,
  shape,
  zones,
  landmarks,
  vehicles,
  onShapeChange,
  onChange,
}: {
  points: Point[]
  color: string
  shape: ZoneShape
  zones: GpsMapGeofence[]
  landmarks: GpsMapLandmark[]
  vehicles: GpsLiveDevice[]
  onShapeChange: (shape: ZoneShape) => void
  onChange: (points: Point[]) => void
}) {
  const [tileFailed, setTileFailed] = useState(false)
  const [anchor, setAnchor] = useState<Point | null>(null)
  const chooseShape = (next: ZoneShape) => {
    setAnchor(null)
    onChange([])
    onShapeChange(next)
  }
  return (
    <div className="relative h-full min-h-[520px] overflow-hidden bg-slate-900" dir="rtl">
      <div className="absolute inset-x-4 top-4 z-[1000] flex flex-wrap items-center gap-2 rounded-2xl border border-white/20 bg-slate-950/90 p-2.5 text-white shadow-2xl backdrop-blur">
        <span className="px-2 text-[11px] font-black text-cyan-300">شكل الزون</span>
        {(Object.keys(shapeLabels) as ZoneShape[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => chooseShape(value)}
            className={`rounded-xl px-3 py-2 text-[10px] font-black transition ${shape === value ? 'bg-cyan-400 text-slate-950 shadow-lg' : 'bg-white/10 hover:bg-white/20'}`}
          >
            {shapeLabels[value]}
          </button>
        ))}
        <span className="mr-auto rounded-xl bg-white/10 px-3 py-2 text-[10px]">
          {shape === 'polygon'
            ? `انقر لإضافة النقاط · ${points.length}`
            : anchor
              ? 'اختر نقطة القياس الثانية'
              : 'اختر نقطة البداية أو المركز'}
        </span>
      </div>
      <div className="absolute bottom-5 right-5 z-[1000] flex gap-2">
        <button
          type="button"
          disabled={!points.length && !anchor}
          onClick={() => {
            setAnchor(null)
            onChange(shape === 'polygon' ? points.slice(0, -1) : [])
          }}
          className="rounded-xl bg-white px-4 py-2.5 text-[11px] font-black shadow-xl disabled:opacity-40"
        >
          تراجع
        </button>
        <button
          type="button"
          disabled={!points.length && !anchor}
          onClick={() => {
            setAnchor(null)
            onChange([])
          }}
          className="rounded-xl bg-rose-600 px-4 py-2.5 text-[11px] font-black text-white shadow-xl disabled:opacity-40"
        >
          مسح الرسم
        </button>
      </div>
      {tileFailed && (
        <div className="absolute inset-x-20 bottom-20 z-[1000] rounded-xl bg-amber-50 p-2 text-center text-xs font-bold text-amber-900">
          تعذر تحميل خلفية OpenStreetMap؛ يمكن متابعة الرسم بعد استعادة الاتصال.
        </div>
      )}
      <MapContainer
        center={[33.3152, 44.3661]}
        zoom={11}
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
        {zones.map((zone) => (
          <Polygon
            key={`existing-${zone.id}`}
            positions={zone.polygon.map((item) =>
              Array.isArray(item) ? item : [item.lat, item.lng],
            )}
            pathOptions={{ color: zone.color, fillOpacity: 0.05, weight: 2, dashArray: '7 6' }}
          >
            <Popup>{zone.name}</Popup>
          </Polygon>
        ))}
        {landmarks.map((landmark) => (
          <Marker
            key={`landmark-${landmark.id}`}
            position={[landmark.latitude, landmark.longitude]}
            icon={landmarkDivIcon(landmark.icon ?? 'pin', landmark.color)}
          >
            <Popup>{landmark.name}</Popup>
          </Marker>
        ))}
        {vehicles.map((vehicle) => (
          <CircleMarker
            key={`vehicle-${vehicle.device_id}`}
            center={[vehicle.latitude, vehicle.longitude]}
            radius={5}
            pathOptions={{ color: '#16a34a', fillColor: '#22c55e', fillOpacity: 0.85, weight: 2 }}
          >
            <Popup>{vehicle.vehicle_name ?? vehicle.device_name}</Popup>
          </CircleMarker>
        ))}
        {points.length >= 3 && (
          <Polygon
            positions={points.map((point) => [point.lat, point.lng])}
            pathOptions={{ color, fillColor: color, fillOpacity: 0.2, weight: 4 }}
          />
        )}
        {anchor && (
          <CircleMarker
            center={[anchor.lat, anchor.lng]}
            radius={8}
            pathOptions={{ color: '#fff', fillColor: color, fillOpacity: 1, weight: 3 }}
          />
        )}
        {shape === 'polygon' && points.length > 1 && (
          <Polyline
            positions={points.map((point) => [point.lat, point.lng])}
            pathOptions={{ color, weight: 3, dashArray: '8 7' }}
          />
        )}
        {points.map((point, index) => (
          <CircleMarker
            key={`${point.lat}-${point.lng}-${index}`}
            center={[point.lat, point.lng]}
            radius={index === 0 ? 7 : 5}
            pathOptions={{
              color: '#fff',
              fillColor: index === 0 ? '#0f172a' : color,
              fillOpacity: 1,
              weight: 2,
            }}
          />
        ))}
        <Capture
          shape={shape}
          points={points}
          anchor={anchor}
          onAnchor={setAnchor}
          onChange={onChange}
        />
        <InitialFit points={points} />
      </MapContainer>
    </div>
  )
}
