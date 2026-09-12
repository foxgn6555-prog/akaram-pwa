import { useEffect, useState } from 'react'
import { CircleMarker, MapContainer, Polygon, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

type Point = { lat: number; lng: number }
function Capture({ points, onChange }: { points: Point[]; onChange: (points: Point[]) => void }) {
  useMapEvents({
    click: (event) =>
      onChange([
        ...points,
        { lat: Number(event.latlng.lat.toFixed(7)), lng: Number(event.latlng.lng.toFixed(7)) },
      ]),
  })
  return null
}
function Fit({ points }: { points: Point[] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length >= 2)
      map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), {
        padding: [35, 35],
        maxZoom: 16,
      })
  }, [map, points])
  return null
}
export default function ZoneMapEditor({
  points,
  color,
  onChange,
}: {
  points: Point[]
  color: string
  onChange: (points: Point[]) => void
}) {
  const [tileFailed, setTileFailed] = useState(false)
  return (
    <div className="relative overflow-hidden rounded-2xl border" dir="rtl">
      <div className="absolute right-3 top-3 z-[1000] rounded-xl bg-slate-950/90 px-3 py-2 text-[10px] font-bold text-white shadow">
        انقر على الخريطة لإضافة نقطة · {points.length} نقطة
      </div>
      <div className="absolute bottom-3 right-3 z-[1000] flex gap-2">
        <button
          type="button"
          disabled={!points.length}
          onClick={() => onChange(points.slice(0, -1))}
          className="rounded-lg bg-white px-3 py-2 text-[10px] font-black shadow disabled:opacity-40"
        >
          تراجع عن نقطة
        </button>
        <button
          type="button"
          disabled={!points.length}
          onClick={() => onChange([])}
          className="rounded-lg bg-rose-50 px-3 py-2 text-[10px] font-black text-rose-700 shadow disabled:opacity-40"
        >
          مسح الحدود
        </button>
      </div>
      {tileFailed && (
        <div className="absolute inset-x-12 bottom-14 z-[1000] rounded-xl bg-amber-50 p-2 text-center text-[10px] font-bold text-amber-900">
          تعذر تحميل خلفية الخريطة، ويمكن متابعة إدخال الإحداثيات يدوياً.
        </div>
      )}
      <MapContainer
        center={[33.3152, 44.3661]}
        zoom={11}
        className="h-[360px] w-full"
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
        {points.length >= 3 && (
          <Polygon
            positions={points.map((p) => [p.lat, p.lng])}
            pathOptions={{ color, fillColor: color, fillOpacity: 0.16, weight: 3 }}
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
        <Capture points={points} onChange={onChange} />
        <Fit points={points} />
      </MapContainer>
    </div>
  )
}
